-- ============================================================================
-- Migration 007 — Business date for bills (so a late-settled bill posts to
--                  the correct day) + per-menu-item service charge control
-- Safe to run on a LIVE database. Run this in the Supabase SQL Editor.
-- Run AFTER migrations 001 through 006.
-- ============================================================================

-- 1. Business date on orders — defaults to the day the order was opened, but
--    is editable on the Billing screen so a bill settled the morning after
--    (e.g. a banquet function that ran past midnight) posts to the right day
--    in reports instead of defaulting to "today".
alter table public.restaurant_orders add column if not exists business_date date;

update public.restaurant_orders
set business_date = created_at::date
where business_date is null;

alter table public.restaurant_orders alter column business_date set default current_date;
alter table public.restaurant_orders alter column business_date set not null;

create index if not exists idx_orders_business_date on public.restaurant_orders (business_date);

-- 2. Menu items can opt out of service charge individually — not just custom
--    banquet lines. Lets you add a non-food category (merchandise, corkage,
--    equipment rental, etc.) that never attracts service charge.
alter table public.menu_items
  add column if not exists service_chargeable boolean not null default true;
