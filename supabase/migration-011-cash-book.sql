-- ============================================================================
-- Migration 011 — Cash Book: payment method on bills/bookings/expenses, plus
--                  a cash-movements ledger for bank deposits, owner
--                  withdrawals, and other cash-in-hand adjustments that
--                  aren't revenue or a business expense.
-- Safe to run on a LIVE database. Run this in the Supabase SQL Editor.
-- Run AFTER migrations 001 through 010.
-- ============================================================================

-- 1. Payment method -------------------------------------------------------------
do $$ begin
  create type payment_method as enum ('cash', 'card', 'bank_transfer');
exception when duplicate_object then null;
end $$;

alter table public.restaurant_orders add column if not exists payment_method payment_method;
alter table public.bookings          add column if not exists payment_method payment_method;
alter table public.expenses          add column if not exists payment_method payment_method not null default 'cash';

-- Existing settled/checked-out rows: assume cash (safest default for a
-- cash-first hotel) since there's no way to know retroactively.
update public.restaurant_orders set payment_method = 'cash' where payment_method is null and order_status = 'completed';
update public.bookings          set payment_method = 'cash' where payment_method is null and status = 'checked_out';

-- 2. Cash movements — bank deposits, owner withdrawals, float top-ups, etc. ----
do $$ begin
  create type cash_direction as enum ('in', 'out');
exception when duplicate_object then null;
end $$;

create table if not exists public.cash_movements (
  id          uuid primary key default gen_random_uuid(),
  direction   cash_direction not null,
  category    varchar(60) not null, -- e.g. 'Bank Deposit', 'Owner Withdrawal', 'Float Top-up'
  description text,
  amount      numeric(14,2) not null check (amount > 0),
  date        date not null default current_date,
  logged_by   uuid references public.staff_profiles (id),
  created_at  timestamptz not null default now()
);

create index if not exists idx_cash_movements_date on public.cash_movements (date);

alter table public.cash_movements enable row level security;

drop policy if exists "staff read cash movements" on public.cash_movements;
create policy "staff read cash movements" on public.cash_movements
  for select using (public.get_my_role() is not null);

-- Cash-in-hand movements are sensitive (bank deposits, owner draws) — admin
-- and manager only, unlike expenses which cashiers can also log.
drop policy if exists "mgmt write cash movements" on public.cash_movements;
create policy "mgmt write cash movements" on public.cash_movements
  for all using (public.get_my_role() in ('admin','manager'))
  with check (public.get_my_role() in ('admin','manager'));

do $$ begin
  alter publication supabase_realtime add table public.cash_movements;
exception when duplicate_object then null;
end $$;
