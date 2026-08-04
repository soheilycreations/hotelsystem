-- ============================================================================
-- Migration 013 — Event bookings (future functions/banquets) for the Calendar
-- Safe to run on a LIVE database. Run this in the Supabase SQL Editor.
-- Run AFTER migrations 001 through 012.
-- ============================================================================

create table if not exists public.event_bookings (
  id             uuid primary key default gen_random_uuid(),
  event_name     varchar(160) not null,
  description    text,
  pax            int check (pax is null or pax > 0),
  event_date     date not null,
  event_time     time,
  contact_name   varchar(120),
  contact_number varchar(40),
  status         varchar(20) not null default 'confirmed', -- tentative | confirmed | cancelled
  created_by     uuid references public.staff_profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_event_bookings_date on public.event_bookings (event_date);

drop trigger if exists trg_touch_event_bookings on public.event_bookings;
create trigger trg_touch_event_bookings
  before update on public.event_bookings
  for each row execute function public.tg_set_updated_at();

alter table public.event_bookings enable row level security;

drop policy if exists "staff read event bookings" on public.event_bookings;
create policy "staff read event bookings" on public.event_bookings
  for select using (public.get_my_role() is not null);

drop policy if exists "pms write event bookings" on public.event_bookings;
create policy "pms write event bookings" on public.event_bookings
  for all using (public.get_my_role() in ('admin','manager','receptionist'))
  with check (public.get_my_role() in ('admin','manager','receptionist'));

do $$ begin
  alter publication supabase_realtime add table public.event_bookings;
exception when duplicate_object then null;
end $$;
