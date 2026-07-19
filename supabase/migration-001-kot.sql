-- ============================================================================
-- Migration 001 — KOT (Kitchen Order Ticket) tracking
-- Safe to run on a LIVE database. Run this in the Supabase SQL Editor.
-- Do NOT re-run the full schema.sql — this file only adds what's new.
-- ============================================================================

-- Track when each order line was sent to the kitchen.
-- NULL  = not yet on any KOT (will print on the next "Send KOT")
-- value = already printed on a KOT at that time
alter table public.order_items
  add column if not exists kot_printed_at timestamptz;

-- Fast lookup of pending-KOT lines per order
create index if not exists idx_order_items_kot_pending
  on public.order_items (order_id)
  where kot_printed_at is null;

-- Backfill: treat every existing line as already sent, so old open orders
-- don't suddenly show "pending KOT" warnings.
update public.order_items set kot_printed_at = created_at where kot_printed_at is null;
