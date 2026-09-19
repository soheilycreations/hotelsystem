-- ============================================================================
-- Store module — a central store-room stock ledger, separate from the
-- kitchen/restaurant Inventory (recipe costing) tables, but wired to them
-- so "Issue to Kitchen" happens in the SAME Postgres transaction as the
-- kitchen's stock top-up. One database, one function call — never two
-- separate apps writing to two separate databases, so the two sides can
-- never go out of sync from a crash mid-way.
-- ============================================================================

create table public.store_items (
  id                       uuid primary key default gen_random_uuid(),
  name                     varchar(140) not null unique,
  unit                     varchar(20) not null default 'pcs',
  reorder_level            numeric(14,3) not null default 0,
  current_stock            numeric(14,3) not null default 0,
  -- Which kitchen/restaurant inventory item this store item tops up when
  -- issued to the kitchen. Optional — leave blank for store items that never
  -- go to the kitchen (cleaning supplies, stationery, etc.).
  linked_inventory_item_id uuid references public.inventory_items (id) on delete set null,
  created_at               timestamptz not null default now()
);

create table public.store_daily_snapshots (
  id            uuid primary key default gen_random_uuid(),
  store_item_id uuid not null references public.store_items (id) on delete cascade,
  date          date not null default ((now() at time zone 'Asia/Colombo')::date),
  opening_stock numeric(14,3) not null default 0,
  stock_in      numeric(14,3) not null default 0,
  stock_out     numeric(14,3) not null default 0,
  closing_stock numeric(14,3) not null default 0,
  unique (store_item_id, date)
);

create index if not exists store_daily_snapshots_date_idx on public.store_daily_snapshots (date);
create index if not exists store_daily_snapshots_item_date_idx on public.store_daily_snapshots (store_item_id, date);

create table public.store_transactions (
  id                uuid primary key default gen_random_uuid(),
  store_item_id     uuid not null references public.store_items (id) on delete cascade,
  type              text not null check (type in ('IN', 'OUT')),
  quantity          numeric(14,3) not null check (quantity > 0),
  reason            text,
  issued_to_kitchen boolean not null default false,
  created_by        uuid references public.staff_profiles (id),
  created_at        timestamptz not null default now()
);

create index if not exists store_transactions_item_idx on public.store_transactions (store_item_id);
create index if not exists store_transactions_created_at_idx on public.store_transactions (created_at);

-- ----------------------------------------------------------------------------
-- Business logic
-- ----------------------------------------------------------------------------

-- Returns (and lazily creates) the snapshot row for a store item on a given
-- date, rolling forward the previous day's closing balance as the new
-- opening balance — same rollover behaviour as the standalone Store app had,
-- but date math is pinned to Asia/Colombo so it can't land on the wrong day.
create or replace function public.get_or_create_store_snapshot(
  p_store_item_id uuid,
  p_date          date default ((now() at time zone 'Asia/Colombo')::date)
)
returns public.store_daily_snapshots
language plpgsql
security definer set search_path = public
as $$
declare
  v_snapshot store_daily_snapshots;
  v_opening  numeric;
begin
  select * into v_snapshot from store_daily_snapshots where store_item_id = p_store_item_id and date = p_date;
  if found then
    return v_snapshot;
  end if;

  select closing_stock into v_opening
  from store_daily_snapshots
  where store_item_id = p_store_item_id and date < p_date
  order by date desc
  limit 1;

  if v_opening is null then
    select current_stock into v_opening from store_items where id = p_store_item_id;
    v_opening := coalesce(v_opening, 0);
  end if;

  insert into store_daily_snapshots (store_item_id, date, opening_stock, stock_in, stock_out, closing_stock)
  values (p_store_item_id, p_date, v_opening, 0, 0, v_opening)
  on conflict (store_item_id, date) do nothing
  returning * into v_snapshot;

  if not found then
    select * into v_snapshot from store_daily_snapshots where store_item_id = p_store_item_id and date = p_date;
  end if;

  return v_snapshot;
end;
$$;

-- Ensures every store item has a snapshot row for today — call on dashboard
-- load so the opening-balance rollover happens even on a day with no
-- transactions yet.
create or replace function public.ensure_today_store_snapshots()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.get_or_create_store_snapshot(id, (now() at time zone 'Asia/Colombo')::date) from store_items;
end;
$$;

-- Records a plain IN/OUT store movement (goods received, wastage, issued to
-- housekeeping/front office, manual correction, ...). This is the only path
-- that's allowed to change store_items.current_stock.
create or replace function public.rpc_record_store_transaction(
  p_store_item_id uuid,
  p_type          text,
  p_quantity      numeric,
  p_reason        text default null
)
returns public.store_transactions
language plpgsql
security definer set search_path = public
as $$
declare
  v_role     staff_role;
  v_snapshot store_daily_snapshots;
  v_tx       store_transactions;
  v_in       numeric;
  v_out      numeric;
  v_closing  numeric;
  v_today    date := (now() at time zone 'Asia/Colombo')::date;
begin
  v_role := public.get_my_role();
  if v_role is null or v_role not in ('admin', 'manager', 'kitchen_staff') then
    raise exception 'Not authorized to record store stock movements.';
  end if;

  if p_type not in ('IN', 'OUT') then
    raise exception 'type must be IN or OUT';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be greater than 0';
  end if;

  v_snapshot := public.get_or_create_store_snapshot(p_store_item_id, v_today);

  v_in  := v_snapshot.stock_in  + (case when p_type = 'IN'  then p_quantity else 0 end);
  v_out := v_snapshot.stock_out + (case when p_type = 'OUT' then p_quantity else 0 end);
  v_closing := v_snapshot.opening_stock + v_in - v_out;

  if v_closing < 0 then
    raise exception 'Not enough stock in the store for this.';
  end if;

  update store_daily_snapshots
  set stock_in = v_in, stock_out = v_out, closing_stock = v_closing
  where id = v_snapshot.id;

  update store_items set current_stock = v_closing where id = p_store_item_id;

  insert into store_transactions (store_item_id, type, quantity, reason, created_by)
  values (p_store_item_id, p_type, p_quantity, p_reason, auth.uid())
  returning * into v_tx;

  return v_tx;
end;
$$;

-- Issues stock from the store to the kitchen: records the store-side OUT
-- AND (if this store item is linked to a kitchen inventory item) tops up
-- that inventory item's stock — both inside this one function call, so the
-- store and the kitchen's stock can never disagree about an issue that only
-- half-happened.
create or replace function public.rpc_issue_store_to_kitchen(
  p_store_item_id uuid,
  p_quantity      numeric,
  p_note          text default null
)
returns public.store_transactions
language plpgsql
security definer set search_path = public
as $$
declare
  v_role   staff_role;
  v_item   store_items;
  v_tx     store_transactions;
  v_reason text;
begin
  v_role := public.get_my_role();
  if v_role is null or v_role not in ('admin', 'manager', 'kitchen_staff') then
    raise exception 'Not authorized to issue store stock.';
  end if;

  select * into v_item from store_items where id = p_store_item_id;
  if not found then
    raise exception 'Store item not found.';
  end if;

  v_reason := trim('Issued to Kitchen' || case
    when nullif(trim(coalesce(p_note, '')), '') is not null then ' — ' || trim(p_note)
    else '' end);

  v_tx := public.rpc_record_store_transaction(p_store_item_id, 'OUT', p_quantity, v_reason);
  update store_transactions set issued_to_kitchen = true where id = v_tx.id;
  select * into v_tx from store_transactions where id = v_tx.id;

  if v_item.linked_inventory_item_id is not null then
    update inventory_items
    set quantity_in_stock = quantity_in_stock + p_quantity,
        updated_at = now()
    where id = v_item.linked_inventory_item_id;
  end if;

  return v_tx;
end;
$$;

grant execute on function public.get_or_create_store_snapshot(uuid, date) to authenticated;
grant execute on function public.ensure_today_store_snapshots() to authenticated;
grant execute on function public.rpc_record_store_transaction(uuid, text, numeric, text) to authenticated;
grant execute on function public.rpc_issue_store_to_kitchen(uuid, numeric, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Today's dashboard view
-- ----------------------------------------------------------------------------
create or replace view public.v_store_today_inventory as
select
  si.id,
  si.name,
  si.unit,
  si.reorder_level,
  si.linked_inventory_item_id,
  coalesce(ds.opening_stock, si.current_stock)  as opening_stock,
  coalesce(ds.stock_in, 0)                      as stock_in,
  coalesce(ds.stock_out, 0)                     as stock_out,
  coalesce(ds.closing_stock, si.current_stock)  as current_balance,
  (coalesce(ds.closing_stock, si.current_stock) <= si.reorder_level) as low_stock
from store_items si
left join store_daily_snapshots ds
  on ds.store_item_id = si.id and ds.date = (now() at time zone 'Asia/Colombo')::date;

-- ----------------------------------------------------------------------------
-- Row Level Security — matches the existing Inventory pattern: everyone
-- signed in can read, only admin/manager/kitchen_staff can write, and
-- writes to snapshots/transactions only ever happen via the SECURITY
-- DEFINER functions above (no direct insert/update policy needed for them).
-- ----------------------------------------------------------------------------
alter table public.store_items enable row level security;
alter table public.store_daily_snapshots enable row level security;
alter table public.store_transactions enable row level security;

create policy "staff read store items" on public.store_items for select using (public.get_my_role() is not null);
create policy "kitchen write store items" on public.store_items for all
  using (public.get_my_role() in ('admin', 'manager', 'kitchen_staff'))
  with check (public.get_my_role() in ('admin', 'manager', 'kitchen_staff'));

create policy "staff read store snapshots" on public.store_daily_snapshots for select using (public.get_my_role() is not null);
create policy "staff read store transactions" on public.store_transactions for select using (public.get_my_role() is not null);

alter publication supabase_realtime add table public.store_items;
alter publication supabase_realtime add table public.store_daily_snapshots;
alter publication supabase_realtime add table public.store_transactions;
