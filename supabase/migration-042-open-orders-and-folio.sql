-- ============================================================================
-- Migration 042 — open-order hygiene + room charges always go to the folio
-- ----------------------------------------------------------------------------
-- 1. Table colour follows the items: a dine-in table is occupied only while
--    an open order on it has at least one item; removing the last item (or
--    voiding/settling) makes it vacant again.
-- 2. rpc_purge_empty_orders(): deletes OPEN orders with no items (Rs 0) that
--    are older than N minutes and frees their tables. The POS, billing and
--    dashboard pages call it on load, so abandoned empty orders disappear.
-- 3. Any order linked to a guest booking (room service, or "charge to room"
--    from dine-in/takeaway) is settled onto the guest FOLIO: payment method
--    and credit account are cleared (the guest pays at checkout), and the
--    guest must still be checked in.
-- Safe to re-run.
-- ============================================================================

-- 1 -------------------------------------------------------------------------
create or replace function public.tg_table_follows_items()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_order_id uuid := coalesce(new.order_id, old.order_id);
  v_table uuid;
begin
  select table_id into v_table
  from public.restaurant_orders
  where id = v_order_id and order_status = 'active' and table_id is not null;
  if v_table is null then
    return null;
  end if;

  if exists (select 1 from public.restaurant_orders o
             where o.table_id = v_table and o.order_status = 'active'
               and exists (select 1 from public.order_items i where i.order_id = o.id)) then
    update public.restaurant_tables set current_status = 'occupied'
    where id = v_table and current_status = 'vacant';
  else
    update public.restaurant_tables set current_status = 'vacant'
    where id = v_table and current_status <> 'vacant';
  end if;
  return null;
end $$;

drop trigger if exists trg_table_follows_items on public.order_items;
create trigger trg_table_follows_items
after insert or delete on public.order_items
for each row execute function public.tg_table_follows_items();

-- 2 -------------------------------------------------------------------------
create or replace function public.rpc_purge_empty_orders(p_min_age_minutes int default 15)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_deleted int;
begin
  if public.get_my_role() is null then
    raise exception 'Not authorized.';
  end if;

  with gone as (
    delete from public.restaurant_orders o
    where o.order_status = 'active'
      and o.created_at < now() - make_interval(mins => greatest(p_min_age_minutes, 0))
      and not exists (select 1 from public.order_items i where i.order_id = o.id)
    returning o.table_id
  ),
  freed as (
    update public.restaurant_tables t set current_status = 'vacant'
    where t.id in (select table_id from gone where table_id is not null)
      and t.current_status <> 'vacant'
      and not exists (select 1 from public.restaurant_orders o
                      where o.table_id = t.id and o.order_status = 'active'
                        and exists (select 1 from public.order_items i where i.order_id = o.id))
    returning 1
  )
  select count(*) into v_deleted from gone;

  return v_deleted;
end $$;

grant execute on function public.rpc_purge_empty_orders(int) to authenticated;

-- 3 -------------------------------------------------------------------------
create or replace function public.tg_folio_orders()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_status booking_status;
begin
  if new.booking_id is null or new.order_status <> 'completed' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.order_status = 'completed' then
    return new;
  end if;

  select status into v_status from public.bookings where id = new.booking_id;
  if v_status is distinct from 'checked_in' then
    raise exception 'This guest is no longer checked in — settle the bill with a payment method instead of charging it to the room.'
      using errcode = 'P0001';
  end if;

  -- the folio carries it; the guest pays at checkout
  new.payment_method := null;
  new.credit_account_id := null;
  return new;
end $$;

drop trigger if exists trg_0b_folio_orders on public.restaurant_orders;
create trigger trg_0b_folio_orders
before insert or update of order_status on public.restaurant_orders
for each row execute function public.tg_folio_orders();
