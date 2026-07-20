-- ============================================================================
-- Migration 004 — Actual check-in/checkout time tracking + PDF bill storage
-- Safe to run on a LIVE database. Run this in the Supabase SQL Editor.
-- Run AFTER migrations 001, 002 and 003.
-- ============================================================================

-- 1. Actual arrival/departure timestamps (booking window stays separate) ------
alter table public.bookings
  add column if not exists actual_check_in  timestamptz,
  add column if not exists actual_check_out timestamptz;

-- 2. Storage bucket for paperless PDF bills (public read → WhatsApp links) ----
insert into storage.buckets (id, name, public)
values ('bills', 'bills', true)
on conflict (id) do nothing;

drop policy if exists "staff upload bills" on storage.objects;
create policy "staff upload bills" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bills');

drop policy if exists "staff update bills" on storage.objects;
create policy "staff update bills" on storage.objects
  for update to authenticated
  using (bucket_id = 'bills');

drop policy if exists "public read bills" on storage.objects;
create policy "public read bills" on storage.objects
  for select
  using (bucket_id = 'bills');
