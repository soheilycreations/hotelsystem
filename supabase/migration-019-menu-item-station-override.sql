-- ============================================================================
-- Migration 019 — Per-item KOT/BOT station override
-- Safe to run on a LIVE database. Run this in the Supabase SQL Editor.
-- Kitchen/bar routing was category-only (every item in "Drinks" always
-- printed to the bar, no exceptions). Adds an optional per-item override —
-- null means "use the category's station" (unchanged default behaviour),
-- set means "always print this specific item's KOT/BOT to this station
-- regardless of its category".
-- ============================================================================

alter table public.menu_items add column if not exists station public.kitchen_station;
