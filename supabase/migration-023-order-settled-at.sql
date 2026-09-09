-- ============================================================================
-- Migration 023 — Track exactly when a bill was settled
-- Safe to run on a LIVE database. Run this in the Supabase SQL Editor.
--
-- restaurant_orders.updated_at touches on every edit (KOT prints, item
-- adds, etc.), so it can't be used to report "settled time" accurately.
-- This adds a dedicated settled_at column, stamped only at settle time —
-- backs the new bill-by-bill report on the Daily Summary page.
-- ============================================================================

alter table public.restaurant_orders
  add column if not exists settled_at timestamptz;
