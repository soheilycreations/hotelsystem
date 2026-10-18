-- ============================================================================
-- Migration 043 — backfill switched off, RLS tightened, store RLS fixed
-- ----------------------------------------------------------------------------
-- 1. hotel_settings.backfill_enabled (default OFF): while off, the database
--    refuses any backdated "historical" sale, whatever the app does. The
--    /backfill page is admin-only and 404 for everyone else (middleware).
-- 2. RLS review — cashier can open orders and settle bills, but cannot:
--    edit settled records (guard trigger, migration 039), delete expenses,
--    change settings, menu, rooms or tables setup, delete credit accounts,
--    delete advance payments, or see staff accounts.
-- 3. store_items / store_daily_snapshots / store_transactions: RLS was never
--    enabled in schema.sql (only in migration 034) — enable it everywhere.
-- Safe to re-run.
-- ============================================================================

-- 1 -------------------------------------------------------------------------
alter table public.hotel_settings add column if not exists backfill_enabled boolean not null default false;
update public.hotel_settings set backfill_enabled = false;

create or replace function public.tg_block_backfill()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.is_historical
     and (tg_op = 'INSERT' or old.is_historical is distinct from true)
     and not coalesce((select backfill_enabled from public.hotel_settings where id = 1), false) then
    raise exception 'Backfill is switched off — backdated sales are not allowed. An admin can switch it on in Settings.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_0_block_backfill on public.restaurant_orders;
create trigger trg_0_block_backfill
before insert or update of is_historical on public.restaurant_orders
for each row execute function public.tg_block_backfill();

-- backdated stays: a booking can't be CREATED already checked out unless
-- backfill is on (normal stays are checked out via an update)
create or replace function public.tg_block_backfill_booking()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'checked_out'
     and not coalesce((select backfill_enabled from public.hotel_settings where id = 1), false) then
    raise exception 'Backfill is switched off — backdated stays are not allowed. An admin can switch it on in Settings.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_0_block_backfill on public.bookings;
create trigger trg_0_block_backfill
before insert on public.bookings
for each row execute function public.tg_block_backfill_booking();

-- only an admin may flip the switch (managers can still edit other settings)
create or replace function public.tg_backfill_flag_admin_only()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.backfill_enabled is distinct from old.backfill_enabled
     and auth.uid() is not null
     and public.get_my_role() is distinct from 'admin' then
    raise exception 'Only an admin can switch Backfill on or off.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_backfill_flag_admin_only on public.hotel_settings;
create trigger trg_backfill_flag_admin_only
before update of backfill_enabled on public.hotel_settings
for each row execute function public.tg_backfill_flag_admin_only();

-- 2 -------------------------------------------------------------------------
-- restaurant tables: cashiers update status; only management adds/removes
drop policy if exists "pos write tables" on public.restaurant_tables;
drop policy if exists "pos update tables" on public.restaurant_tables;
drop policy if exists "mgmt insert tables" on public.restaurant_tables;
drop policy if exists "mgmt delete tables" on public.restaurant_tables;
create policy "pos update tables" on public.restaurant_tables for update
  using (public.get_my_role() in ('admin', 'manager', 'cashier'))
  with check (public.get_my_role() in ('admin', 'manager', 'cashier'));
create policy "mgmt insert tables" on public.restaurant_tables for insert
  with check (public.get_my_role() in ('admin', 'manager'));
create policy "mgmt delete tables" on public.restaurant_tables for delete
  using (public.get_my_role() in ('admin', 'manager'));

-- orders: explicit WITH CHECK so settling (active → completed) is allowed,
-- while changes to settled bills are stopped by the 039 guard trigger
drop policy if exists "pos update orders" on public.restaurant_orders;
create policy "pos update orders" on public.restaurant_orders for update
  using (public.get_my_role() in ('admin', 'manager', 'cashier', 'kitchen_staff'))
  with check (public.get_my_role() in ('admin', 'manager', 'cashier', 'kitchen_staff'));
-- (no delete policy on orders: nobody deletes them directly; the empty-order
-- purge runs as security definer, voiding uses order_status = cancelled)

-- credit accounts: front desk/cashier may create and rename; only
-- management may delete
drop policy if exists "pms write credit accounts" on public.credit_accounts;
drop policy if exists "staff create credit accounts" on public.credit_accounts;
drop policy if exists "staff update credit accounts" on public.credit_accounts;
drop policy if exists "mgmt delete credit accounts" on public.credit_accounts;
create policy "staff create credit accounts" on public.credit_accounts for insert
  with check (public.get_my_role() in ('admin', 'manager', 'receptionist', 'cashier'));
create policy "staff update credit accounts" on public.credit_accounts for update
  using (public.get_my_role() in ('admin', 'manager', 'receptionist', 'cashier'))
  with check (public.get_my_role() in ('admin', 'manager', 'receptionist', 'cashier'));
create policy "mgmt delete credit accounts" on public.credit_accounts for delete
  using (public.get_my_role() in ('admin', 'manager'));

-- advance payments are money received: only management may delete one
drop policy if exists "pms delete advance payments" on public.booking_advance_payments;
create policy "pms delete advance payments" on public.booking_advance_payments for delete
  using (public.get_my_role() in ('admin', 'manager'));

-- 3 -------------------------------------------------------------------------
alter table public.store_items           enable row level security;
alter table public.store_daily_snapshots enable row level security;
alter table public.store_transactions    enable row level security;
