-- ============================================================================
-- Migration 016 — Manual credit account adjustments (admin only) — for
--                  recording old/untracked bills against an account without
--                  hunting down and retagging individual historical orders.
-- Safe to run on a LIVE database. Run this in the Supabase SQL Editor.
-- Run AFTER migrations 001 through 015.
-- ============================================================================

create table if not exists public.credit_adjustments (
  id                uuid primary key default gen_random_uuid(),
  credit_account_id uuid not null references public.credit_accounts (id) on delete restrict,
  amount            numeric(14,2) not null check (amount > 0),
  date              date not null default current_date,
  description       text,
  created_by        uuid references public.staff_profiles (id),
  created_at        timestamptz not null default now()
);

create index if not exists idx_credit_adjustments_account on public.credit_adjustments (credit_account_id);
create index if not exists idx_credit_adjustments_date    on public.credit_adjustments (date);

alter table public.credit_adjustments enable row level security;

drop policy if exists "staff read credit adjustments" on public.credit_adjustments;
create policy "staff read credit adjustments" on public.credit_adjustments
  for select using (public.get_my_role() is not null);

-- Admin only — this directly changes what a customer owes, without a real
-- bill behind it, so it's more sensitive than a normal credit sale.
drop policy if exists "admin write credit adjustments" on public.credit_adjustments;
create policy "admin write credit adjustments" on public.credit_adjustments
  for all using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

do $$ begin
  alter publication supabase_realtime add table public.credit_adjustments;
exception when duplicate_object then null;
end $$;
