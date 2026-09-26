-- The restaurant cashier's starting "petty cash" / float for the day —
-- entered once when the shift opens, used only by the new Simple Report
-- (a plain cash-reconciliation statement: float + revenue - card - credit
-- - cash expenses = cash that should be in the drawer). Deliberately its
-- own tiny table, NOT a cash_movements row — the float is the same fixed
-- amount handed over shift to shift, not new money, so it must never feed
-- the accumulating Cash Book / Daily Summary ledgers (that would make the
-- running balance grow every day by the float amount, which is wrong).
create table public.cashier_float (
  id         uuid primary key default gen_random_uuid(),
  date       date not null unique default ((now() at time zone 'Asia/Colombo')::date),
  amount     numeric(12,2) not null default 0 check (amount >= 0),
  set_by     uuid references public.staff_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cashier_float_date_idx on public.cashier_float (date);

alter table public.cashier_float enable row level security;

create policy "staff read cashier float" on public.cashier_float for select
  using (public.get_my_role() is not null);
create policy "cashier write float" on public.cashier_float for insert
  with check (public.get_my_role() in ('admin', 'manager', 'cashier'));
create policy "cashier update float" on public.cashier_float for update
  using (public.get_my_role() in ('admin', 'manager', 'cashier'))
  with check (public.get_my_role() in ('admin', 'manager', 'cashier'));

alter publication supabase_realtime add table public.cashier_float;
