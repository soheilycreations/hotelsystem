-- ============================================================================
-- Migration 044 — stock movement history + opening stock count
-- ----------------------------------------------------------------------------
-- 1. stock_movements: one row per change of inventory_items.quantity_in_stock
--    (delta + resulting quantity + who + why), written by trigger so every
--    path is covered:
--      opening     rpc_record_opening_stock (go-live count / stock take)
--      sale        recipe deduction when a bill is settled
--      purchase    supplier bill (rpc_record_purchase) in the same transaction
--      adjustment  anything else (manual +/- on the Inventory screen)
-- 2. rpc_record_opening_stock(items, note): sets each item to the COUNTED
--    quantity (absolute, >= 0) in one transaction; optional unit cost.
-- Read-only for staff; rows are only written by the trigger.
-- Safe to re-run.
-- ============================================================================

create table if not exists public.stock_movements (
  id                bigint generated always as identity primary key,
  inventory_item_id uuid not null references public.inventory_items (id) on delete cascade,
  movement_type     text not null check (movement_type in ('opening', 'sale', 'purchase', 'adjustment')),
  quantity          numeric(14,3) not null,           -- signed change
  quantity_after    numeric(14,3) not null,
  note              text,
  created_by        uuid references public.staff_profiles (id) default auth.uid(),
  created_at        timestamptz not null default now()
);
create index if not exists stock_movements_item_idx on public.stock_movements (inventory_item_id, created_at desc);

alter table public.stock_movements enable row level security;
drop policy if exists "staff read stock movements" on public.stock_movements;
create policy "staff read stock movements" on public.stock_movements for select
  using (public.get_my_role() is not null);
revoke insert, update, delete, truncate on public.stock_movements from anon, authenticated;

create or replace function public.tg_stock_movement()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_kind text := nullif(current_setting('app.stock_movement', true), '');
  v_note text := nullif(current_setting('app.stock_movement_note', true), '');
begin
  if new.quantity_in_stock is not distinct from old.quantity_in_stock then
    return null;
  end if;
  if v_kind is null then
    if pg_trigger_depth() > 1 then
      v_kind := 'sale'; -- recipe deduction fired by settling a bill
    else
      v_kind := 'adjustment';
      -- a purchase line inserted in this same transaction = supplier bill
      -- (dynamic so a database without purchase_items doesn't fail here)
      if to_regclass('public.purchase_items') is not null then
        execute 'select case when exists (select 1 from public.purchase_items
                                          where inventory_item_id = $1 and created_at = now())
                             then ''purchase'' else ''adjustment'' end'
          into v_kind using new.id;
      end if;
    end if;
  end if;

  insert into public.stock_movements (inventory_item_id, movement_type, quantity, quantity_after, note, created_by)
  values (new.id, v_kind, new.quantity_in_stock - old.quantity_in_stock, new.quantity_in_stock, v_note,
          (select id from public.staff_profiles where id = auth.uid()));
  return null;
end $$;

drop trigger if exists trg_d_stock_movement on public.inventory_items;
create trigger trg_d_stock_movement
after update of quantity_in_stock on public.inventory_items
for each row execute function public.tg_stock_movement();

create or replace function public.rpc_record_opening_stock(p_items jsonb, p_note text default null)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  v_count int := 0;
begin
  if public.get_my_role() not in ('admin', 'manager') then
    raise exception 'Only an admin or manager can record an opening stock count.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Enter at least one counted item.';
  end if;

  perform set_config('app.stock_movement', 'opening', true);
  perform set_config('app.stock_movement_note',
                     coalesce(nullif(trim(p_note), ''), 'Opening stock count'), true);

  for r in
    select (x ->> 'inventory_item_id')::uuid as item_id,
           (x ->> 'quantity')::numeric as qty,
           nullif(x ->> 'unit_cost', '')::numeric as unit_cost
    from jsonb_array_elements(p_items) x
  loop
    if r.qty is null or r.qty < 0 then
      raise exception 'Counted quantity must be zero or more.';
    end if;
    if r.unit_cost is not null and r.unit_cost < 0 then
      raise exception 'Unit cost must be zero or more.';
    end if;
    update public.inventory_items
    set quantity_in_stock = round(r.qty, 3),
        unit_cost = coalesce(r.unit_cost, unit_cost)
    where id = r.item_id;
    if not found then
      raise exception 'Inventory item % not found.', r.item_id;
    end if;
    v_count := v_count + 1;
  end loop;

  perform set_config('app.stock_movement', '', true);
  perform set_config('app.stock_movement_note', '', true);
  return v_count;
end $$;

grant execute on function public.rpc_record_opening_stock(jsonb, text) to authenticated;
