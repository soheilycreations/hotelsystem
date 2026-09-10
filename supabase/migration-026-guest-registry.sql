-- ============================================================================
-- Migration 026 — Guest registry, second guest, custom check-in price
-- Safe to run on a LIVE database. Run this in the Supabase SQL Editor.
--
-- 1. A standalone `guests` table — a growing directory of everyone who has
--    ever stayed, keyed by NIC/passport number. Populated automatically by
--    createBooking (upsert on id_number) — no separate data entry needed.
--    Lets the check-in form show "this guest stayed before" history by ID
--    number.
-- 2. bookings.second_guest_name / second_guest_id_number — an optional
--    second occupant on the same room/booking.
-- 3. bookings.price_overridden — set true when staff typed a custom total
--    at check-in instead of using the rate plan's computed price, so
--    reports can tell a negotiated rate apart from the standard one.
-- ============================================================================

create table if not exists public.guests (
  id             uuid primary key default gen_random_uuid(),
  full_name      varchar(160) not null,
  id_number      varchar(40) unique, -- NIC/passport — the dedup key; null allowed (unique ignores nulls)
  contact_number varchar(40),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_guests_id_number on public.guests (id_number);

alter table public.guests enable row level security;
create policy "staff read guests" on public.guests for select using (public.get_my_role() is not null);
create policy "pms write guests"  on public.guests for all    using (public.get_my_role() in ('admin','manager','receptionist')) with check (public.get_my_role() in ('admin','manager','receptionist'));

create trigger trg_touch_guests before update on public.guests for each row execute function public.tg_set_updated_at();

alter table public.bookings
  add column if not exists second_guest_name varchar(160),
  add column if not exists second_guest_id_number varchar(40),
  add column if not exists price_overridden boolean not null default false;
