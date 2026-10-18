-- ============================================================================
-- Migration 040 — ONE definition of revenue for every page
-- ----------------------------------------------------------------------------
-- Dashboard, Daily Summary, Reports/P&L all read these two functions (via
-- src/lib/finance/revenue.ts), so the same date range gives the same numbers
-- everywhere. Dates are Asia/Colombo calendar days.
--
-- Restaurant revenue  settled bills (order_status completed), not
--                     complimentary, on business_date — which migration 041
--                     stamps with the Colombo date of settled_at. Includes
--                     room service and "charge to room" bills.
-- Room revenue        checked-out stays, not complimentary, on the Colombo
--                     date of actual_check_out: folio total minus the
--                     restaurant bills that were posted onto that folio
--                     (already counted as restaurant revenue above).
-- Advance payments    are deposits, NOT revenue when received — the stay
--                     is recognised in full at checkout.
-- Expenses            expenses_total = everything logged;
--                     expenses_operating = paid from hotel money, i.e.
--                     excluding bank_transfer / owner_paid (owner's own
--                     funds) — net profit = revenue - expenses_operating.
--
-- SECURITY INVOKER: callers see exactly what their RLS already allows.
-- ============================================================================

create or replace function public.fn_finance_daily(p_from date, p_to date)
returns table (
  day                         date,
  restaurant_revenue          numeric(14,2),
  room_revenue                numeric(14,2),
  total_revenue               numeric(14,2),
  expenses_total              numeric(14,2),
  expenses_operating          numeric(14,2),
  expenses_operating_room     numeric(14,2),
  expenses_operating_restaurant numeric(14,2),
  bills                       int,
  checkouts                   int
)
language sql
stable
security invoker
set search_path = public
as $$
  with days as (
    select d::date as day from generate_series(p_from, p_to, interval '1 day') d
  ),
  pos as (
    select o.business_date as day, sum(o.total_amount) as amt, count(*) as n
    from restaurant_orders o
    where o.order_status = 'completed'
      and o.payment_method is distinct from 'complimentary'
      and o.business_date between p_from and p_to
    group by 1
  ),
  stays as (
    select (b.actual_check_out at time zone 'Asia/Colombo')::date as day,
           sum(greatest(0, b.total_folio_amount - coalesce(posted.amt, 0))) as amt,
           count(*) as n
    from bookings b
    left join lateral (
      select sum(o.total_amount) as amt
      from restaurant_orders o
      where o.booking_id = b.id and o.order_status = 'completed'
    ) posted on true
    where b.status = 'checked_out'
      and b.payment_method is distinct from 'complimentary'
      and b.actual_check_out >= (p_from::timestamp at time zone 'Asia/Colombo')
      and b.actual_check_out <  ((p_to + 1)::timestamp at time zone 'Asia/Colombo')
    group by 1
  ),
  exp as (
    select e.date as day,
           sum(e.amount) as total,
           sum(e.amount) filter (where e.payment_method not in ('bank_transfer', 'owner_paid')) as op,
           sum(e.amount) filter (where e.payment_method not in ('bank_transfer', 'owner_paid') and e.division = 'room') as op_room,
           sum(e.amount) filter (where e.payment_method not in ('bank_transfer', 'owner_paid') and e.division <> 'room') as op_rest
    from expenses e
    where e.date between p_from and p_to
    group by 1
  )
  select d.day,
         coalesce(pos.amt, 0)::numeric(14,2),
         coalesce(stays.amt, 0)::numeric(14,2),
         (coalesce(pos.amt, 0) + coalesce(stays.amt, 0))::numeric(14,2),
         coalesce(exp.total, 0)::numeric(14,2),
         coalesce(exp.op, 0)::numeric(14,2),
         coalesce(exp.op_room, 0)::numeric(14,2),
         coalesce(exp.op_rest, 0)::numeric(14,2),
         coalesce(pos.n, 0)::int,
         coalesce(stays.n, 0)::int
  from days d
  left join pos   on pos.day = d.day
  left join stays on stays.day = d.day
  left join exp   on exp.day = d.day
  order by d.day;
$$;

-- Restaurant revenue split by channel (historical backfill kept separate),
-- same filter as restaurant_revenue above — the channels always add up to it.
create or replace function public.fn_finance_channels(p_from date, p_to date)
returns table (bucket text, revenue numeric(14,2), bills int)
language sql
stable
security invoker
set search_path = public
as $$
  select case when o.is_historical then 'historical' else o.channel_type::text end,
         sum(o.total_amount)::numeric(14,2),
         count(*)::int
  from restaurant_orders o
  where o.order_status = 'completed'
    and o.payment_method is distinct from 'complimentary'
    and o.business_date between p_from and p_to
  group by 1;
$$;

grant execute on function public.fn_finance_daily(date, date) to authenticated;
grant execute on function public.fn_finance_channels(date, date) to authenticated;
