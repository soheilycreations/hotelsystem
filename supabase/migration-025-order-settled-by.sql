-- ============================================================================
-- Migration 025 — Track which staff member settled a bill (cashier)
-- Safe to run on a LIVE database. Run this in the Supabase SQL Editor.
--
-- restaurant_orders.created_by is whoever opened the order (took the
-- table/order), not necessarily who collected payment. This adds a
-- separate settled_by column, stamped by settleOrder at settle time —
-- backs the "cashier" name on the new Bills page.
-- ============================================================================

alter table public.restaurant_orders
  add column if not exists settled_by uuid references public.staff_profiles (id);
