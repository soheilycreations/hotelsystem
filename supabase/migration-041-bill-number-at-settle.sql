-- ============================================================================
-- Migration 041 — bill numbers issued at settle time, per day
-- ----------------------------------------------------------------------------
-- Bill number = #YYYYMMDD-NNN where YYYYMMDD is the Colombo date the bill was
-- SETTLED and NNN restarts at 001 every day.
--   * restaurant_orders.order_number now holds the per-day NNN (unique per
--     business_date instead of globally); business_date is stamped with the
--     Colombo settle date, settled_at/settled_by with the real time and the
--     logged-in user — all by trigger, so no client can skip or backdate it.
--   * Open orders carry no number (their uuid is the internal id); printing
--     before settlement produces a PRE-BILL.
--   * A bill reopened and settled again keeps its original number and date.
--   * Backfill (is_historical) rows keep the business_date they were given.
-- Existing settled bills keep their old numbers. Safe to re-run.
-- ============================================================================

create table if not exists public.bill_counters (
  bill_date date primary key,
  last_no   int  not null default 0
);
alter table public.bill_counters enable row level security; -- no policies: written only by the trigger below

-- per-day uniqueness instead of global
alter table public.restaurant_orders drop constraint if exists restaurant_orders_order_number_key;
create unique index if not exists restaurant_orders_bill_number_uidx
  on public.restaurant_orders (business_date, order_number) where order_number is not null;

-- open orders that got a number from an early print give it back; they get
-- a proper per-day number when settled
update public.restaurant_orders set order_number = null
where order_status = 'active' and order_number is not null;

-- continue each existing day from its highest number
insert into public.bill_counters (bill_date, last_no)
select business_date, max(order_number)
from public.restaurant_orders
where order_number is not null
group by business_date
on conflict (bill_date) do update set last_no = greatest(public.bill_counters.last_no, excluded.last_no);

create or replace function public.tg_bill_number_at_settle()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.order_status <> 'completed' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.order_status = 'completed' then
    return new; -- already settled; edits to settled bills are governed elsewhere
  end if;

  new.settled_by := coalesce(auth.uid(), new.settled_by);

  if new.order_number is not null then
    -- reopened and settled again: keep its number and date
    new.settled_at := coalesce(new.settled_at, now());
    return new;
  end if;

  if new.is_historical then
    new.settled_at := coalesce(new.settled_at, now());
  else
    new.settled_at := now();
    new.business_date := (now() at time zone 'Asia/Colombo')::date;
  end if;

  insert into public.bill_counters as c (bill_date, last_no)
  values (new.business_date, 1)
  on conflict (bill_date) do update set last_no = c.last_no + 1
  returning c.last_no into new.order_number;

  return new;
end $$;

drop trigger if exists trg_0_bill_number_at_settle on public.restaurant_orders;
create trigger trg_0_bill_number_at_settle
before insert or update of order_status on public.restaurant_orders
for each row execute function public.tg_bill_number_at_settle();

-- Printing no longer reserves a number. Kept for old clients: returns the
-- number if the bill is settled, else null.
create or replace function public.rpc_ensure_order_number(p_order_id uuid)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_number int;
begin
  if public.get_my_role() is null then
    raise exception 'Not authorized.';
  end if;
  select order_number into v_number from public.restaurant_orders where id = p_order_id;
  if not found then
    raise exception 'Order not found.';
  end if;
  return v_number;
end;
$$;
grant execute on function public.rpc_ensure_order_number(uuid) to authenticated;
