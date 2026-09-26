-- Move a room-service bill that was charged to the WRONG room onto the
-- right guest's folio.
--
-- Trigger B posts a room-service order's total onto bookings.total_folio_amount
-- the moment it settles, keyed on restaurant_orders.booking_id. Re-pointing
-- booking_id alone would leave the money on the wrong folio, so this RPC does
-- both halves in one transaction:
--   - completed order: take the amount OFF the old folio, put it ON the new one
--   - still-active order: just re-point it (nothing has been posted yet)
-- Both guests must still be in house (pending / checked_in) — once a guest has
-- checked out their folio has been paid and recognised as revenue, so moving
-- money off it here would silently rewrite a closed bill.
create or replace function public.rpc_move_room_service_order(
  p_order_id uuid,
  p_target_booking_id uuid
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_role        staff_role;
  v_order       record;
  v_from        record;
  v_to          record;
begin
  v_role := public.get_my_role();
  if v_role is null or v_role not in ('admin', 'manager', 'receptionist') then
    raise exception 'Not authorized to move room-service bills.';
  end if;

  select id, booking_id, channel_type, order_status, order_number, total_amount
    into v_order
  from public.restaurant_orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'Order not found.';
  end if;
  if v_order.channel_type <> 'room_service' or v_order.booking_id is null then
    raise exception 'Only room-service orders can be moved to another room.';
  end if;
  if v_order.order_status not in ('active', 'completed') then
    raise exception 'This order is % — nothing to move.', v_order.order_status;
  end if;
  if v_order.booking_id = p_target_booking_id then
    raise exception 'The order is already on that room.';
  end if;

  -- Lock both bookings in a stable order so two concurrent moves can't deadlock.
  perform 1 from public.bookings
  where id in (v_order.booking_id, p_target_booking_id)
  order by id
  for update;

  select b.id, b.status, b.guest_name, r.room_number
    into v_from
  from public.bookings b left join public.rooms r on r.id = b.room_id
  where b.id = v_order.booking_id;

  select b.id, b.status, b.guest_name, r.room_number
    into v_to
  from public.bookings b left join public.rooms r on r.id = b.room_id
  where b.id = p_target_booking_id;
  if v_to.id is null then
    raise exception 'Target booking not found.';
  end if;

  if v_from.status not in ('pending', 'checked_in') then
    raise exception 'Room % has already checked out — its bill is closed and can''t be changed here.',
      coalesce(v_from.room_number, '?');
  end if;
  if v_to.status not in ('pending', 'checked_in') then
    raise exception 'Room % is not in house — pick a pending or checked-in guest.',
      coalesce(v_to.room_number, '?');
  end if;

  if v_order.order_status = 'completed' then
    update public.bookings
    set total_folio_amount = greatest(0, total_folio_amount - v_order.total_amount)
    where id = v_from.id;

    update public.bookings
    set total_folio_amount = total_folio_amount + v_order.total_amount
    where id = v_to.id;
  end if;

  -- Only booking_id changes — Trigger B fires on order_status, so it won't
  -- re-deduct stock or re-post the folio.
  update public.restaurant_orders
  set booking_id = v_to.id
  where id = v_order.id;

  insert into public.system_logs (event_type, severity, message, ref_table, ref_id)
  values ('FOLIO_MOVE', 'warning',
          format('Room-service order #%s (Rs. %s) moved from room %s (%s) to room %s (%s).',
                 coalesce(v_order.order_number::text, '—'), v_order.total_amount,
                 coalesce(v_from.room_number, '?'), v_from.guest_name,
                 coalesce(v_to.room_number, '?'), v_to.guest_name),
          'restaurant_orders', v_order.id);
end;
$$;

grant execute on function public.rpc_move_room_service_order(uuid, uuid) to authenticated;
