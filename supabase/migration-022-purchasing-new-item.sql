-- ============================================================================
-- Migration 022 — Purchasing: add a brand-new inventory item inline
-- Safe to run on a LIVE database. Run this in the Supabase SQL Editor.
--
-- Lets a purchase line either reference an existing inventory item OR
-- create one on the spot (name + unit) — the new item is inserted inside
-- the same transaction as the purchase, then stocked up like any other
-- line, so a never-before-bought ingredient doesn't need a separate trip
-- to the Inventory page first.
-- ============================================================================

create or replace function public.rpc_record_purchase(
  p_supplier_name  text,
  p_notes          text,
  p_items          jsonb, -- [{"inventory_item_id"?, "new_item_name"?, "new_item_unit"?, "quantity","unit_price","pack_size"}, ...]
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
  v_pack_size         numeric;
  v_inventory_item_id uuid;
  v_new_name          text;
  v_new_unit          text;
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
    v_pack_size := coalesce(nullif(v_item->>'pack_size', '')::numeric, 1);
    if v_pack_size <= 0 then
      v_pack_size := 1;
    end if;

    v_inventory_item_id := nullif(v_item->>'inventory_item_id', '')::uuid;

    if v_inventory_item_id is null then
      v_new_name := nullif(trim(coalesce(v_item->>'new_item_name', '')), '');
      v_new_unit := nullif(v_item->>'new_item_unit', '');
      if v_new_name is null or v_new_unit is null then
        raise exception 'Every line needs either an existing item or a name + unit for a new one.';
      end if;

      insert into public.inventory_items (name, unit, quantity_in_stock, unit_cost, reorder_level)
      values (v_new_name, v_new_unit::inventory_unit, 0, 0, 0)
      on conflict (name) do update set name = excluded.name
      returning id into v_inventory_item_id;
    end if;

    insert into public.purchase_items (purchase_id, inventory_item_id, quantity, unit_price, pack_size)
    values (
      v_purchase_id,
      v_inventory_item_id,
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_price')::numeric,
      v_pack_size
    );

    -- Stock goes up by quantity × pack_size (converted into the item's own
    -- storage unit); unit_cost is normalised back to a per-storage-unit
    -- price so Recipe Costing's math doesn't need to know what unit this
    -- particular bill was purchased in.
    update public.inventory_items
    set quantity_in_stock = quantity_in_stock + (v_item->>'quantity')::numeric * v_pack_size,
        unit_cost = (v_item->>'unit_price')::numeric / v_pack_size
    where id = v_inventory_item_id;
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
