-- ============================================================================
-- PHASE 3 (prep) — pre-reset report. READ-ONLY.
-- ----------------------------------------------------------------------------
-- Shows what the reset will carry forward vs clear, so you can decide and
-- record any cash before it happens. One grid, sorted by section:
--
--   A_inhouse   every booking currently "checked_in" with folio, charges,
--               advances, open room-service, balance due and a SUGGESTION:
--                 LIKELY IN-HOUSE   planned checkout is today or later
--                 STALE?            planned checkout already passed
--                 DUPLICATE ROOM    another checked-in booking on the same room
--               → To carry a guest forward, copy their booking_id into
--                 v_keep_inhouse at the top of reset-for-go-live.sql.
--                 Everyone NOT listed there is cleared (record any cash
--                 already collected for them before the reset).
--   B_future    pending bookings arriving 2026-10-19 or later — CARRIED
--               FORWARD automatically, with their advance payments.
--   C_noshow    pending bookings with arrival before 2026-10-19 — CLEARED
--               (any advance paid on them is listed so you can refund/handle).
--   D_events    functions on/after 2026-10-19, not cancelled — CARRIED FORWARD.
--   E_credit    credit-account balances (same formula as the Credit
--               Accounts page) — re-created as one opening entry each.
--   F_open      open (active) orders that will be CLEARED, by channel —
--               except open room-service orders of carried-forward guests.
-- ============================================================================
with
golive as (select ('2026-10-19'::date)::timestamp at time zone 'Asia/Colombo' as ts),
inh as (
  select b.*, r.room_number,
         coalesce((select sum(amount) from public.booking_charges c where c.booking_id = b.id), 0) as charges,
         coalesce((select sum(amount) from public.booking_advance_payments a where a.booking_id = b.id), 0) as advances,
         coalesce((select sum(total_amount) from public.restaurant_orders o
                   where o.booking_id = b.id and o.order_status = 'active'), 0) as open_rs,
         count(*) over (partition by b.room_id) as on_room
  from public.bookings b left join public.rooms r on r.id = b.room_id
  where b.status = 'checked_in'
),
bal as (
  select a.name,
         coalesce((select sum(total_folio_amount) from public.bookings
                   where payment_method = 'credit' and credit_account_id = a.id), 0)
       + coalesce((select sum(total_amount) from public.restaurant_orders
                   where payment_method = 'credit' and credit_account_id = a.id), 0)
       + coalesce((select sum(amount) from public.credit_adjustments where credit_account_id = a.id), 0)
       - coalesce((select sum(amount) from public.credit_repayments where credit_account_id = a.id), 0) as balance
  from public.credit_accounts a
)
select 'A_inhouse' as section,
       room_number as room, guest_name as name, id::text as booking_id,
       to_char(check_in_date at time zone 'Asia/Colombo', 'YYYY-MM-DD HH24:MI') || ' → ' ||
       to_char(check_out_date at time zone 'Asia/Colombo', 'YYYY-MM-DD HH24:MI') as dates,
       total_folio_amount as folio_total, advances as paid_in_advance,
       open_rs as open_room_service, total_folio_amount + open_rs - advances as balance_due,
       case when on_room > 1 then 'DUPLICATE ROOM — '
            else '' end ||
       case when check_out_date < now() then 'STALE? overdue by ' ||
                 extract(day from now() - check_out_date)::int || 'd ' ||
                 extract(hour from now() - check_out_date)::int || 'h'
            else 'LIKELY IN-HOUSE' end as note
from inh

union all
select 'B_future', r.room_number, b.guest_name, b.id::text,
       to_char(b.check_in_date at time zone 'Asia/Colombo', 'YYYY-MM-DD HH24:MI') || ' → ' ||
       to_char(b.check_out_date at time zone 'Asia/Colombo', 'YYYY-MM-DD HH24:MI'),
       b.total_folio_amount,
       coalesce((select sum(amount) from public.booking_advance_payments a where a.booking_id = b.id), 0),
       null, null, 'CARRIED FORWARD'
from public.bookings b left join public.rooms r on r.id = b.room_id, golive g
where b.status = 'pending' and b.check_in_date >= g.ts

union all
select 'C_noshow', r.room_number, b.guest_name, b.id::text,
       to_char(b.check_in_date at time zone 'Asia/Colombo', 'YYYY-MM-DD HH24:MI') || ' → ' ||
       to_char(b.check_out_date at time zone 'Asia/Colombo', 'YYYY-MM-DD HH24:MI'),
       b.total_folio_amount,
       coalesce((select sum(amount) from public.booking_advance_payments a where a.booking_id = b.id), 0),
       null, null, 'CLEARED (arrival before go-live, never checked in)'
from public.bookings b left join public.rooms r on r.id = b.room_id, golive g
where b.status = 'pending' and b.check_in_date < g.ts

union all
select 'D_events', null, e.event_name, e.id::text,
       e.event_date::text || coalesce(' ' || e.event_time::text, ''),
       null, null, null, null,
       'CARRIED FORWARD — ' || e.status || coalesce(', pax ' || e.pax, '')
from public.event_bookings e
where e.event_date >= '2026-10-19' and e.status <> 'cancelled'

union all
select 'E_credit', null, name, null, null, null, null, null, balance,
       case when balance > 0 then 'opening adjustment Rs ' || balance
            when balance < 0 then 'customer in CREDIT — opening repayment Rs ' || -balance
            else 'zero — nothing to carry' end
from bal
union all
select 'E_credit', null, 'TOTAL OUTSTANDING', null, null, null, null, null, sum(balance), null from bal

union all
select 'F_open', null, o.channel_type::text, null,
       min(o.business_date)::text || ' … ' || max(o.business_date)::text,
       null, null, null, sum(o.total_amount),
       count(*) || ' open order(s) — CLEARED unless room-service of a carried-forward guest'
from public.restaurant_orders o
where o.order_status = 'active'
group by o.channel_type

order by 1, 2 nulls last, 3;
