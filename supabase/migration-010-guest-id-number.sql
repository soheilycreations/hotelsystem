-- ============================================================================
-- Migration 010 — Record the guest's ID/NIC number when a room is given
-- Safe to run on a LIVE database. Run this in the Supabase SQL Editor.
-- Run AFTER migrations 001 through 009.
-- ============================================================================

alter table public.bookings
  add column if not exists guest_id_number varchar(40);
