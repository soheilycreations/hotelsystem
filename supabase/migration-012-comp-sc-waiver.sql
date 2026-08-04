-- ============================================================================
-- Migration 012 — Complimentary bills (excluded from revenue) + per-bill
--                  service charge waiver
-- Safe to run on a LIVE database. Run this in the Supabase SQL Editor.
-- Run AFTER migrations 001 through 011.
-- ============================================================================

-- 1. Complimentary payment method — settled/checked-out but no money changed
--    hands, so it must NOT count as revenue anywhere.
alter type payment_method add value if not exists 'complimentary';

-- 2. Per-bill service charge waiver ---------------------------------------------
alter table public.restaurant_orders
  add column if not exists service_charge_waived boolean not null default false;

-- Recalc trigger now respects the waiver — service charge is forced to 0
-- regardless of line items when a bill is marked "no service charge".
create or replace function public.tg_recalc_order_total()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_order_id uuid := coalesce(new.order_id, old.order_id);
  v_subtotal numeric(14,2);
  v_sc_base  numeric(14,2);
  v_rate     numeric(5,2);
  v_sc       numeric(14,2);
  v_waived   boolean;
begin
  select coalesce(sum(oi.line_total), 0) into v_subtotal
  from public.order_items oi where oi.order_id = v_order_id;

  select coalesce(sum(oi.line_total) filter (where oi.service_chargeable), 0) into v_sc_base
  from public.order_items oi where oi.order_id = v_order_id;

  select coalesce(hs.service_charge_rate, 0) into v_rate
  from public.hotel_settings hs where hs.id = 1;

  select o.service_charge_waived into v_waived
  from public.restaurant_orders o where o.id = v_order_id;

  v_sc := case when coalesce(v_waived, false) then 0
               else round(v_sc_base * coalesce(v_rate, 0) / 100.0, 2)
          end;

  update public.restaurant_orders o
  set subtotal       = v_subtotal,
      service_charge  = v_sc,
      total_amount    = v_subtotal + v_sc
  where o.id = v_order_id;

  return coalesce(new, old);
end $$;
