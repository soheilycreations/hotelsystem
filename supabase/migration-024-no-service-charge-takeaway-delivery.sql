-- ============================================================================
-- Migration 024 — No service charge on Takeaway / Delivery
-- Safe to run on a LIVE database. Run this in the Supabase SQL Editor.
--
-- Service charge only makes sense where there's table service to charge
-- for. tg_recalc_order_total() now zeroes it out for takeaway/delivery
-- orders regardless of the hotel's dine-in service_charge_rate.
-- ============================================================================

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
  v_channel  channel_type;
begin
  select coalesce(sum(oi.line_total), 0) into v_subtotal
  from public.order_items oi where oi.order_id = v_order_id;

  -- Service charge applies only to food/beverage (service_chargeable) lines —
  -- custom/external pass-through lines like "AC Charge" are excluded.
  select coalesce(sum(oi.line_total) filter (where oi.service_chargeable), 0) into v_sc_base
  from public.order_items oi where oi.order_id = v_order_id;

  select coalesce(hs.service_charge_rate, 0) into v_rate
  from public.hotel_settings hs where hs.id = 1;

  select o.service_charge_waived, o.channel_type into v_waived, v_channel
  from public.restaurant_orders o where o.id = v_order_id;

  -- No service charge on takeaway/delivery — there's no table service to
  -- charge for, whatever the hotel's dine-in rate is set to.
  v_sc := case when coalesce(v_waived, false) then 0
               when v_channel in ('takeaway', 'delivery') then 0
               else round(v_sc_base * coalesce(v_rate, 0) / 100.0, 2)
          end;

  update public.restaurant_orders o
  set subtotal       = v_subtotal,
      service_charge = v_sc,
      total_amount   = v_subtotal + v_sc
  where o.id = v_order_id;

  return coalesce(new, old);
end $$;

-- Backfill: strip service charge off any existing takeaway/delivery orders
-- that already carry one (from before this fix) — active bills only, since
-- a settled bill's total shouldn't silently change after the fact.
update public.restaurant_orders
set service_charge = 0,
    total_amount = subtotal
where channel_type in ('takeaway', 'delivery')
  and service_charge <> 0
  and order_status = 'active';
