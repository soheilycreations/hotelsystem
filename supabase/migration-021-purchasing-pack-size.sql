-- ============================================================================
-- Migration 021 — Purchasing: buy in a different unit than stock is tracked in
-- Safe to run on a LIVE database. Run this in the Supabase SQL Editor.
--
-- Bug: buying "10" of an item tracked in grams (e.g. Chicken, stored in
-- grams) added only 10 grams to stock — the qty typed had no unit of its
-- own, it was always interpreted as the item's storage unit. A hotel buys
-- 10 KG of chicken, not 10 grams.
--
-- Fix: each purchase line now carries a pack_size — how many of the
-- item's storage unit (grams/ml/units) one purchased unit equals (e.g.
-- 1000 for "kg" on a grams-tracked item). Stock added = quantity ×
-- pack_size; the per-storage-unit cost saved back to inventory_items is
-- unit_price ÷ pack_size, so Recipe Costing (which prices recipes in the
-- storage unit) keeps working correctly regardless of what unit the bill
-- was purchased in.
-- ============================================================================

alter table public.purchase_items
  add column if not exists pack_size numeric(12,4) not null default 1 check (pack_size > 0);

create or replace function public.rpc_record_purchase(
  p_supplier_name  text,
  p_notes          text,
  p_items          jsonb, -- [{"inventory_item_id","quantity","unit_price","pack_size"}, ...]
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

    insert into public.purchase_items (purchase_id, inventory_item_id, quantity, unit_price, pack_size)
    values (
      v_purchase_id,
      (v_item->>'inventory_item_id')::uuid,
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
