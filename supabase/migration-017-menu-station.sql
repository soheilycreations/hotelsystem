-- ============================================================================
-- Migration 017 — Kitchen/bar station routing for menu categories
-- Safe to run on a LIVE database. Run this in the Supabase SQL Editor.
-- Adds a 'station' column to menu_categories so a table's KOT (kitchen
-- ticket) and BOT (bar ticket) can be sent and printed separately instead
-- of one combined ticket.
-- ============================================================================

do $$ begin
  create type public.kitchen_station as enum ('kitchen', 'bar');
exception when duplicate_object then null;
end $$;

alter table public.menu_categories
  add column if not exists station public.kitchen_station not null default 'kitchen';

update public.menu_categories
set station = 'bar'
where station = 'kitchen' and (name ilike '%drink%' or name ilike '%beverage%' or name ilike '%bar%');
