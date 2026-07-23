-- ============================================================================
-- Migration 006 — Banquet Hall channel + custom (free-text) bill lines +
--                  service charge only on food/beverage lines + Function Cost
--                  expense category
-- Safe to run on a LIVE database. Run this in the Supabase SQL Editor.
-- Run AFTER migrations 001 through 005.
-- ============================================================================

-- 1. New channel: Banquet ------------------------------------------------------
alter type channel_type add value if not exists 'banquet';

-- 2. New expense category: Function Cost --------------------------------------
alter type expense_category add value if not exists 'function_cost';

-- 3. Banquet function name on the order ---------------------------------------
alter table public.restaurant_orders
  add column if not exists event_name varchar(160);

-- 4. Custom (free-text) bill lines on order_items ------------------------------
-- menu_item_id becomes optional: a custom line (e.g. "AC Charge") has no menu
-- item at all, just a typed description + amount.
alter table public.order_items
  alter column menu_item_id drop not null;

alter table public.order_items
  add column if not exists is_custom          boolean not null default false,
  add column if not exists custom_description varchar(200),
  add column if not exists service_chargeable boolean not null default true;

do $$ begin
  alter table public.order_items
    add constraint chk_order_item_shape check (
      (is_custom = false and menu_item_id is not null and custom_description is null)
      or
      (is_custom = true and menu_item_id is null and custom_description is not null)
    );
exception when duplicate_object then null;
end $$;

-- 5. Service charge now applies ONLY to service_chargeable lines (food &
--    beverage) — custom/external lines like "AC Charge" are excluded, since
--    they're pass-through costs, not restaurant sales.
create or replace function public.tg_recalc_order_total()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_order_id  uuid := coalesce(new.order_id, old.order_id);
  v_subtotal  numeric(14,2);
  v_sc_base   numeric(14,2);
  v_rate      numeric(5,2);
  v_sc        numeric(14,2);
begin
  select coalesce(sum(oi.line_total), 0) into v_subtotal
  from public.order_items oi where oi.order_id = v_order_id;

  select coalesce(sum(oi.line_total) filter (where oi.service_chargeable), 0) into v_sc_base
  from public.order_items oi where oi.order_id = v_order_id;

  select coalesce(hs.service_charge_rate, 0) into v_rate
  from public.hotel_settings hs where hs.id = 1;

  v_sc := round(v_sc_base * coalesce(v_rate, 0) / 100.0, 2);

  update public.restaurant_orders o
  set subtotal       = v_subtotal,
      service_charge = v_sc,
      total_amount   = v_subtotal + v_sc
  where o.id = v_order_id;

  return coalesce(new, old);
end $$;
