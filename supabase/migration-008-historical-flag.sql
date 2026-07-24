-- ============================================================================
-- Migration 008 — Distinguish backfilled historical sales from real Banquet
--                  orders in channel-mix reporting
-- Safe to run on a LIVE database. Run this in the Supabase SQL Editor.
-- Run AFTER migrations 001 through 007.
-- ============================================================================

-- Historical POS sales (from Backfill) are stored as channel_type = 'banquet'
-- since that's the only channel with no required companion field (table,
-- booking, or address). Without this flag they silently pollute the real
-- Banquet channel's revenue in the mix charts. This flag lets reporting
-- pages show them as a separate "Historical Entries" bucket instead.
alter table public.restaurant_orders
  add column if not exists is_historical boolean not null default false;
