-- ===========================================================================
-- Migration 038 — Checkout guard for open room-service bills
--                 + whole-rupee service charge on open bills
--
-- BEFORE RUNNING: take a Supabase backup (Dashboard → Database → Backups).
-- Idempotent: safe to run more than once. Additive only — no data is
-- changed by running this file; it only adds a trigger and replaces one
-- trigger function. A commented ROLLBACK section is at the bottom.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Checkout guard
--    Room-service bills post to the guest folio only when they are settled
--    (Trigger B). Checking a guest out while one is still open would let the
--    guest leave without paying for it. The app already refuses this
--    (setBookingStatus); this enforces the same rule in the database so no
--    other path can bypass it.
--
--    Only fires on an UPDATE that changes status to 'checked_out'. Inserts
--    (Backfill of past stays) and "Undo checkout" (checked_out → checked_in)
--    are not affected. A booking with an abandoned open order must have that
--    order cancelled first (POS → Cancel order).
-- ---------------------------------------------------------------------------
create or replace function public.tg_block_checkout_with_open_room_service()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_open int;
begin
  if new.status = 'checked_out' and old.status is distinct from 'checked_out' then
    select count(*) into v_open
    from public.restaurant_orders
    where booking_id = new.id
      and order_status = 'active';

    if v_open > 0 then
      -- Same text the app shows, so the EN/Sinhala translation covers it.
      raise exception using
        errcode = 'P0001',
        message = 'This guest has an unsettled room-service bill. Settle or cancel the room-service bill first, then check out.',
        hint    = 'මෙම අමුත්තාගේ ගෙවා නැති room-service බිලක් තිබේ. පළමුව එම බිල ගෙවන්න හෝ අවලංගු කරන්න, පසුව check out කරන්න.';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_block_checkout_open_room_service on public.bookings;
create trigger trg_block_checkout_open_room_service
before update of status on public.bookings
for each row execute function public.tg_block_checkout_with_open_room_service();


-- ---------------------------------------------------------------------------
-- 2. Whole-rupee service charge — open bills only
--    Same function as migration 024, with one change: while a bill is still
--    OPEN (order_status = 'active') the service charge is rounded to whole
--    rupees, half up (e.g. 155.50 → 156, 155.49 → 155). Cash can't be paid
--    in cents.
--
--    Settled (completed) bills keep the old 2-decimal rule, so a correction
--    made through Settled Records never changes a past bill's rounding.
--    Existing bills are not recalculated by running this file — the
--    function only runs when a bill's items change.
-- ---------------------------------------------------------------------------
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
  v_status   order_status;
begin
  select coalesce(sum(oi.line_total), 0) into v_subtotal
  from public.order_items oi where oi.order_id = v_order_id;

  -- Service charge applies only to food/beverage (service_chargeable) lines —
  -- custom/external pass-through lines like "AC Charge" are excluded.
  select coalesce(sum(oi.line_total) filter (where oi.service_chargeable), 0) into v_sc_base
  from public.order_items oi where oi.order_id = v_order_id;

  select coalesce(hs.service_charge_rate, 0) into v_rate
  from public.hotel_settings hs where hs.id = 1;

  select o.service_charge_waived, o.channel_type, o.order_status
  into v_waived, v_channel, v_status
  from public.restaurant_orders o where o.id = v_order_id;

  -- No service charge on takeaway/delivery — there's no table service to
  -- charge for, whatever the hotel's dine-in rate is set to.
  v_sc := case when coalesce(v_waived, false) then 0
               when v_channel in ('takeaway', 'delivery') then 0
               when v_status = 'active' then round(v_sc_base * coalesce(v_rate, 0) / 100.0, 0)
               else round(v_sc_base * coalesce(v_rate, 0) / 100.0, 2)
          end;

  update public.restaurant_orders o
  set subtotal       = v_subtotal,
      service_charge = v_sc,
      total_amount   = v_subtotal + v_sc
  where o.id = v_order_id;

  return coalesce(new, old);
end $$;
-- (trigger trg_recalc_total already points at this function — unchanged)


-- ===========================================================================
-- ROLLBACK (run only if you need to undo this migration)
-- ---------------------------------------------------------------------------
-- -- 1. Remove the checkout guard
-- drop trigger if exists trg_block_checkout_open_room_service on public.bookings;
-- drop function if exists public.tg_block_checkout_with_open_room_service();
--
-- -- 2. Restore the 2-decimal service charge (exact body from migration 024)
-- create or replace function public.tg_recalc_order_total()
-- returns trigger
-- language plpgsql
-- security definer set search_path = public
-- as $$
-- declare
--   v_order_id uuid := coalesce(new.order_id, old.order_id);
--   v_subtotal numeric(14,2);
--   v_sc_base  numeric(14,2);
--   v_rate     numeric(5,2);
--   v_sc       numeric(14,2);
--   v_waived   boolean;
--   v_channel  channel_type;
-- begin
--   select coalesce(sum(oi.line_total), 0) into v_subtotal
--   from public.order_items oi where oi.order_id = v_order_id;
--   select coalesce(sum(oi.line_total) filter (where oi.service_chargeable), 0) into v_sc_base
--   from public.order_items oi where oi.order_id = v_order_id;
--   select coalesce(hs.service_charge_rate, 0) into v_rate
--   from public.hotel_settings hs where hs.id = 1;
--   select o.service_charge_waived, o.channel_type into v_waived, v_channel
--   from public.restaurant_orders o where o.id = v_order_id;
--   v_sc := case when coalesce(v_waived, false) then 0
--                when v_channel in ('takeaway', 'delivery') then 0
--                else round(v_sc_base * coalesce(v_rate, 0) / 100.0, 2)
--           end;
--   update public.restaurant_orders o
--   set subtotal       = v_subtotal,
--       service_charge = v_sc,
--       total_amount   = v_subtotal + v_sc
--   where o.id = v_order_id;
--   return coalesce(new, old);
-- end $$;
-- ===========================================================================
