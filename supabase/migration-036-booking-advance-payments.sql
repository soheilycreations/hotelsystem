-- Records money a guest pays UP FRONT while still staying (before checkout)
-- — e.g. "advance payment" collected at check-in or partway through a long
-- stay. Kept as its own append-only ledger, separate from
-- bookings.total_folio_amount, so:
--   - the full folio is still recognised as Room revenue on checkout day
--     (standard "recognise revenue when the stay completes" accounting —
--     unchanged from today), while
--   - the CASH itself is counted on the day it actually changed hands, via
--     whatever method it was paid in — not re-counted again at checkout.
-- Checkout then only needs to collect the BALANCE (folio minus whatever was
-- already paid as an advance), and the Cash Book / Daily Summary net the
-- advance out of the checkout-day amount so nothing is double-counted.
create table public.booking_advance_payments (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references public.bookings (id) on delete cascade,
  amount         numeric(12,2) not null check (amount > 0),
  payment_method payment_method not null default 'cash',
  date           date not null default ((now() at time zone 'Asia/Colombo')::date),
  notes          text,
  received_by    uuid references public.staff_profiles (id),
  created_at     timestamptz not null default now()
);

create index if not exists booking_advance_payments_booking_idx on public.booking_advance_payments (booking_id);
create index if not exists booking_advance_payments_date_idx on public.booking_advance_payments (date);

alter table public.booking_advance_payments enable row level security;

create policy "staff read advance payments" on public.booking_advance_payments for select
  using (public.get_my_role() is not null);
create policy "pms write advance payments" on public.booking_advance_payments for insert
  with check (public.get_my_role() in ('admin', 'manager', 'receptionist'));
create policy "pms delete advance payments" on public.booking_advance_payments for delete
  using (public.get_my_role() in ('admin', 'manager', 'receptionist'));

alter publication supabase_realtime add table public.booking_advance_payments;
