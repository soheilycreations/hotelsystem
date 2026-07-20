-- ============================================================================
-- Migration 003 — 10% service charge on POS sales + category cleanup
-- Safe to run on a LIVE database. Run this in the Supabase SQL Editor.
-- Do NOT re-run the full schema.sql. Run AFTER migrations 001 and 002.
-- ============================================================================

-- 1. Configurable service charge rate (default 10%) ---------------------------
alter table public.hotel_settings
  add column if not exists service_charge_rate numeric(5,2) not null default 10
    check (service_charge_rate >= 0 and service_charge_rate <= 100);

-- 2. Order totals now carry a breakdown ---------------------------------------
alter table public.restaurant_orders
  add column if not exists subtotal       numeric(14,2) not null default 0,
  add column if not exists service_charge numeric(14,2) not null default 0;

-- Backfill past orders: keep their totals exactly as they were (no retroactive SC)
update public.restaurant_orders
  set subtotal = total_amount, service_charge = 0
  where subtotal = 0 and total_amount > 0;

-- 3. Recalculator now applies the service charge ------------------------------
create or replace function public.tg_recalc_order_total()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_order_id uuid := coalesce(new.order_id, old.order_id);
  v_subtotal numeric(14,2);
  v_rate     numeric(5,2);
  v_sc       numeric(14,2);
begin
  select coalesce(sum(oi.line_total), 0) into v_subtotal
  from public.order_items oi where oi.order_id = v_order_id;

  select coalesce(hs.service_charge_rate, 0) into v_rate
  from public.hotel_settings hs where hs.id = 1;

  v_sc := round(v_subtotal * coalesce(v_rate, 0) / 100.0, 2);

  update public.restaurant_orders o
  set subtotal       = v_subtotal,
      service_charge = v_sc,
      total_amount   = v_subtotal + v_sc
  where o.id = v_order_id;

  return coalesce(new, old);
end $$;
-- (the existing trg_recalc_total trigger keeps pointing at this function)

-- 4. Categories: base price is now optional (pricing lives in rate plans) -----
alter table public.room_types alter column base_price set default 0;
