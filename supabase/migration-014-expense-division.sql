-- ============================================================================
-- Migration 014 — Expense allocation (Room vs Restaurant) so the P&L can
--                  split into a Room P&L and a Restaurant P&L.
-- Safe to run on a LIVE database. Run this in the Supabase SQL Editor.
-- Run AFTER migrations 001 through 013.
-- ============================================================================

do $$ begin
  create type expense_division as enum ('restaurant', 'room');
exception when duplicate_object then null;
end $$;

-- Default 'restaurant' — matches how expenses were being logged before this
-- feature existed (kitchen/purchasing/utilities etc. were all implicitly
-- restaurant-side costs), so nothing already logged needs re-tagging unless
-- it was actually a room-side cost.
alter table public.expenses
  add column if not exists division expense_division not null default 'restaurant';
