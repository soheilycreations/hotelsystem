-- ============================================================================
-- Migration 015 — Credit Accounts: settle a bill/booking "on credit" against
--                  a named account instead of cash/card/bank, track what
--                  each account owes, and record repayments.
-- Safe to run on a LIVE database. Run this in the Supabase SQL Editor.
-- Run AFTER migrations 001 through 014.
-- ============================================================================

-- 1. Credit as a payment method ------------------------------------------------
alter type payment_method add value if not exists 'credit';

-- 2. Credit accounts table -------------------------------------------------------
create table if not exists public.credit_accounts (
  id         uuid primary key default gen_random_uuid(),
  name       varchar(160) not null,
  notes      text,
  created_by uuid references public.staff_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_credit_accounts_name on public.credit_accounts (name);

drop trigger if exists trg_touch_credit_accounts on public.credit_accounts;
create trigger trg_touch_credit_accounts
  before update on public.credit_accounts
  for each row execute function public.tg_set_updated_at();

-- 3. Link bills/bookings to the credit account they were settled against --------
alter table public.restaurant_orders add column if not exists credit_account_id uuid references public.credit_accounts (id);
alter table public.bookings          add column if not exists credit_account_id uuid references public.credit_accounts (id);

create index if not exists idx_orders_credit_account   on public.restaurant_orders (credit_account_id);
create index if not exists idx_bookings_credit_account on public.bookings (credit_account_id);

-- 4. Repayments — when an account pays back what it owes ------------------------
create table if not exists public.credit_repayments (
  id                uuid primary key default gen_random_uuid(),
  credit_account_id uuid not null references public.credit_accounts (id) on delete restrict,
  amount            numeric(14,2) not null check (amount > 0),
  payment_method    payment_method not null default 'cash', -- cash | bank_transfer (how the repayment itself arrived)
  date              date not null default current_date,
  description       text,
  logged_by         uuid references public.staff_profiles (id),
  created_at        timestamptz not null default now()
);

create index if not exists idx_credit_repayments_account on public.credit_repayments (credit_account_id);
create index if not exists idx_credit_repayments_date    on public.credit_repayments (date);

-- 5. RLS ---------------------------------------------------------------------------
alter table public.credit_accounts   enable row level security;
alter table public.credit_repayments enable row level security;

drop policy if exists "staff read credit accounts" on public.credit_accounts;
create policy "staff read credit accounts" on public.credit_accounts
  for select using (public.get_my_role() is not null);

drop policy if exists "pms write credit accounts" on public.credit_accounts;
create policy "pms write credit accounts" on public.credit_accounts
  for all using (public.get_my_role() in ('admin','manager','receptionist','cashier'))
  with check (public.get_my_role() in ('admin','manager','receptionist','cashier'));

drop policy if exists "staff read credit repayments" on public.credit_repayments;
create policy "staff read credit repayments" on public.credit_repayments
  for select using (public.get_my_role() is not null);

drop policy if exists "mgmt write credit repayments" on public.credit_repayments;
create policy "mgmt write credit repayments" on public.credit_repayments
  for all using (public.get_my_role() in ('admin','manager'))
  with check (public.get_my_role() in ('admin','manager'));

-- 6. Realtime ------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.credit_accounts;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.credit_repayments;
exception when duplicate_object then null;
end $$;
