-- ============================================================================
-- Migration 020 — Purchasing (supplier bill entry -> stock top-up + expense)
-- Safe to run on a LIVE database. Run this in the Supabase SQL Editor.
--
-- Adds purchases/purchase_items and a single atomic RPC,
-- rpc_record_purchase, that a supplier-bill entry screen calls once per
-- bill: it inserts the purchase + its line items, tops up each
-- inventory_item's quantity_in_stock and unit_cost, and posts one matching
-- expense (category "Purchasing") for the bill total — all in one
-- transaction, so stock and the expense ledger can never drift apart from
-- a half-applied purchase.
-- ============================================================================

create table if not exists public.purchases (
  id            uuid primary key default gen_random_uuid(),
  supplier_name varchar(140),
  purchase_date date not null default current_date,
  notes         text,
  total_amount  numeric(14,2) not null default 0,
  expense_id    uuid references public.expenses (id) on delete set null,
  created_by    uuid references public.staff_profiles (id),
  created_at    timestamptz not null default now()
);

create table if not exists public.purchase_items (
  id                uuid primary key default gen_random_uuid(),
  purchase_id       uuid not null references public.purchases (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete restrict,
  quantity          numeric(14,3) not null check (quantity > 0),
  unit_price        numeric(12,4) not null check (unit_price >= 0),
  line_total        numeric(14,2) generated always as (quantity * unit_price) stored,
  created_at        timestamptz not null default now()
);

create index if not exists idx_purchase_items_purchase on public.purchase_items (purchase_id);
create index if not exists idx_purchase_items_inventory on public.purchase_items (inventory_item_id);

alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

drop policy if exists "staff read purchases" on public.purchases;
create policy "staff read purchases" on public.purchases
  for select using (public.get_my_role() is not null);

drop policy if exists "staff read purchase items" on public.purchase_items;
create policy "staff read purchase items" on public.purchase_items
  for select using (public.get_my_role() is not null);

-- No direct insert/update/delete policies — rows are only ever written by
-- rpc_record_purchase (SECURITY DEFINER), which does its own role check,
-- so stock and the expense it posts can never separate from a bypassed
-- direct write.

do $$ begin
  alter publication supabase_realtime add table public.purchases;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.purchase_items;
exception when duplicate_object then null;
end $$;

create or replace function public.rpc_record_purchase(
  p_supplier_name  text,
  p_notes          text,
  p_items          jsonb, -- [{"inventory_item_id": "...", "quantity": 10, "unit_price": 250}, ...]
  p_payment_method payment_method default 'cash'
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_role              staff_role;
  v_purchase_id       uuid;
  v_total             numeric(14,2);
  v_expense_category  uuid;
  v_expense_id        uuid;
  v_item              jsonb;
begin
  v_role := public.get_my_role();
  if v_role is null or v_role not in ('admin', 'manager') then
    raise exception 'Not authorized to record purchases.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'A purchase needs at least one item.';
  end if;

  select coalesce(sum((i->>'quantity')::numeric * (i->>'unit_price')::numeric), 0)
  into v_total
  from jsonb_array_elements(p_items) as i;

  if v_total <= 0 then
    raise exception 'Purchase total must be greater than zero.';
  end if;

  select id into v_expense_category from public.expense_categories where name = 'Purchasing' limit 1;
  if v_expense_category is null then
    raise exception 'No "Purchasing" expense category found — add one under Finance > Expenses first.';
  end if;

  insert into public.purchases (supplier_name, notes, total_amount, created_by)
  values (nullif(trim(coalesce(p_supplier_name, '')), ''), nullif(trim(coalesce(p_notes, '')), ''), v_total, auth.uid())
  returning id into v_purchase_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.purchase_items (purchase_id, inventory_item_id, quantity, unit_price)
    values (
      v_purchase_id,
      (v_item->>'inventory_item_id')::uuid,
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_price')::numeric
    );

    -- Stock goes up by what was bought; unit_cost tracks the latest price
    -- paid (used by Recipe Costing) rather than a running average.
    update public.inventory_items
    set quantity_in_stock = quantity_in_stock + (v_item->>'quantity')::numeric,
        unit_cost = (v_item->>'unit_price')::numeric
    where id = (v_item->>'inventory_item_id')::uuid;
  end loop;

  insert into public.expenses (category_id, amount, date, description, payment_method, division, logged_by)
  values (
    v_expense_category,
    v_total,
    current_date,
    trim('Stock purchase' || case when nullif(trim(coalesce(p_supplier_name, '')), '') is not null
      then ' — ' || trim(p_supplier_name) else '' end),
    p_payment_method,
    'restaurant',
    auth.uid()
  )
  returning id into v_expense_id;

  update public.purchases set expense_id = v_expense_id where id = v_purchase_id;

  return v_purchase_id;
end $$;

grant execute on function public.rpc_record_purchase(text, text, jsonb, payment_method) to authenticated;
