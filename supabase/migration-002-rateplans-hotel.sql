-- ============================================================================
-- Migration 002 — Rate Plans (AC/Non-AC/hourly blocks) + short-stay countdown
--                 + booking extra charges + hotel profile settings
-- Safe to run on a LIVE database. Run this in the Supabase SQL Editor.
-- Do NOT re-run the full schema.sql.
-- ============================================================================

-- 1. Enums -------------------------------------------------------------------
do $$ begin
  create type stay_type as enum ('overnight', 'short_stay');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type rate_plan_kind as enum ('per_night', 'block');
exception when duplicate_object then null;
end $$;

-- 2. Rate plans per room category ---------------------------------------------
create table if not exists public.room_rate_plans (
  id             uuid primary key default gen_random_uuid(),
  room_type_id   uuid not null references public.room_types (id) on delete cascade,
  name           varchar(80) not null,
  kind           rate_plan_kind not null,
  price          numeric(12,2) not null check (price >= 0),
  duration_hours int,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (room_type_id, name),
  constraint chk_plan_duration check (
    (kind = 'per_night' and duration_hours is null)
    or (kind = 'block' and duration_hours is not null and duration_hours > 0)
  )
);

create index if not exists idx_rate_plans_type on public.room_rate_plans (room_type_id);

drop trigger if exists trg_touch_rate_plans on public.room_rate_plans;
create trigger trg_touch_rate_plans
  before update on public.room_rate_plans
  for each row execute function public.tg_set_updated_at();

-- Seed a default "Full Night" plan for every existing category so current
-- pricing keeps working the moment the app updates.
insert into public.room_rate_plans (room_type_id, name, kind, price)
select rt.id, 'Full Night', 'per_night', rt.base_price
from public.room_types rt
on conflict (room_type_id, name) do nothing;

-- 3. Booking columns ----------------------------------------------------------
alter table public.bookings
  add column if not exists stay_type       stay_type not null default 'overnight',
  add column if not exists duration_hours  int check (duration_hours is null or duration_hours > 0),
  add column if not exists rate_plan_id    uuid references public.room_rate_plans (id) on delete set null,
  add column if not exists rate_plan_name  varchar(120),
  add column if not exists rate_plan_price numeric(12,2);

-- 4. Extra charges on a folio (overtime, minibar, laundry…) -------------------
create table if not exists public.booking_charges (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  description varchar(160) not null,
  amount      numeric(12,2) not null check (amount > 0),
  created_by  uuid references public.staff_profiles (id),
  created_at  timestamptz not null default now()
);

create index if not exists idx_booking_charges_booking on public.booking_charges (booking_id);

-- Trigger: keep bookings.total_folio_amount in sync with charges
create or replace function public.tg_apply_booking_charge()
returns trigger
language plpgsql
security definer
as $$
begin
  if tg_op = 'INSERT' then
    update public.bookings
      set total_folio_amount = total_folio_amount + new.amount
      where id = new.booking_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.bookings
      set total_folio_amount = greatest(0, total_folio_amount - old.amount)
      where id = old.booking_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_booking_charge_folio on public.booking_charges;
create trigger trg_booking_charge_folio
  after insert or delete on public.booking_charges
  for each row execute function public.tg_apply_booking_charge();

-- 5. Hotel profile (single-row settings) --------------------------------------
create table if not exists public.hotel_settings (
  id              int primary key default 1 check (id = 1),
  hotel_name      varchar(120) not null default 'Soheily PMS',
  address         text,
  phone_primary   varchar(40),
  phone_secondary varchar(40),
  logo_url        text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

insert into public.hotel_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists trg_touch_hotel_settings on public.hotel_settings;
create trigger trg_touch_hotel_settings
  before update on public.hotel_settings
  for each row execute function public.tg_set_updated_at();

-- 6. RLS ----------------------------------------------------------------------
alter table public.room_rate_plans enable row level security;
alter table public.booking_charges enable row level security;
alter table public.hotel_settings  enable row level security;

drop policy if exists "staff read rate plans" on public.room_rate_plans;
create policy "staff read rate plans" on public.room_rate_plans
  for select using (public.get_my_role() is not null);

drop policy if exists "mgmt write rate plans" on public.room_rate_plans;
create policy "mgmt write rate plans" on public.room_rate_plans
  for all using (public.get_my_role() in ('admin','manager'))
  with check (public.get_my_role() in ('admin','manager'));

drop policy if exists "staff read booking charges" on public.booking_charges;
create policy "staff read booking charges" on public.booking_charges
  for select using (public.get_my_role() is not null);

drop policy if exists "pms write booking charges" on public.booking_charges;
create policy "pms write booking charges" on public.booking_charges
  for all using (public.get_my_role() in ('admin','manager','receptionist'))
  with check (public.get_my_role() in ('admin','manager','receptionist'));

drop policy if exists "staff read hotel settings" on public.hotel_settings;
create policy "staff read hotel settings" on public.hotel_settings
  for select using (public.get_my_role() is not null);

drop policy if exists "mgmt write hotel settings" on public.hotel_settings;
create policy "mgmt write hotel settings" on public.hotel_settings
  for update using (public.get_my_role() in ('admin','manager'))
  with check (public.get_my_role() in ('admin','manager'));

-- 7. Realtime -----------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.room_rate_plans;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.booking_charges;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.hotel_settings;
exception when duplicate_object then null;
end $$;
