-- ============================================================================
-- Migration 038 — room status integrity, double-booking guard, room board
-- ----------------------------------------------------------------------------
-- 1. Check-in → room OCCUPIED also when a booking is INSERTED as checked_in
--    (Trigger A only fired on UPDATE).
-- 2. A room with an in-house guest can't be flipped to vacant/dirty by hand
--    ("Mark cleaned" while the guest is still staying is what left every
--    room showing Vacant). Check the guest out instead.
-- 3. Double booking is rejected in the database: a pending/checked-in
--    booking can't overlap another on the same room, and a room can't hold
--    two checked-in guests. An in-house guest past their checkout date still
--    blocks the room until they are actually checked out.
-- 4. rpc_room_board(): one server-side source for the room grid and the
--    dashboard occupancy card (status, type, in-house guest, overdue).
-- 5. One-time sync: rooms with an in-house guest are set to occupied.
-- Safe to re-run.
-- ============================================================================

-- 1 -------------------------------------------------------------------------
create or replace function public.tg_housekeeping_automator()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.room_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'checked_in' then
      update public.rooms set status = 'occupied' where id = new.room_id;
    end if;
    return new;
  end if;

  if new.status = 'checked_out' and old.status is distinct from 'checked_out' then
    -- leave the room occupied if another guest is still checked in on it
    -- (legacy double bookings) — checkout itself must never fail
    update public.rooms set status = 'dirty'
    where id = new.room_id
      and not exists (select 1 from public.bookings o
                      where o.room_id = new.room_id and o.status = 'checked_in' and o.id <> new.id);
    insert into public.system_logs (event_type, severity, message, ref_table, ref_id)
    values ('HOUSEKEEPING', 'info',
            format('Guest "%s" checked out — room flagged dirty for housekeeping.', new.guest_name),
            'rooms', new.room_id);

  elsif new.status = 'checked_in' and old.status is distinct from 'checked_in' then
    update public.rooms set status = 'occupied' where id = new.room_id;

  elsif new.status = 'cancelled' and old.status = 'checked_in' then
    update public.rooms set status = 'vacant'
    where id = new.room_id
      and not exists (select 1 from public.bookings o
                      where o.room_id = new.room_id and o.status = 'checked_in' and o.id <> new.id);

  elsif new.status = 'checked_in' and new.room_id is distinct from old.room_id then
    -- room move while in house
    update public.rooms set status = 'occupied' where id = new.room_id;
    if old.room_id is not null then
      update public.rooms set status = 'dirty' where id = old.room_id;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_a_housekeeping on public.bookings;
create trigger trg_a_housekeeping
after insert or update of status, room_id on public.bookings
for each row execute function public.tg_housekeeping_automator();

-- 2 -------------------------------------------------------------------------
create or replace function public.tg_room_status_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_guest text;
begin
  if new.status is distinct from 'occupied' and new.status is distinct from old.status then
    select guest_name into v_guest
    from public.bookings
    where room_id = new.id and status = 'checked_in'
    limit 1;
    if found then
      raise exception 'Room % has an in-house guest (%). Check the guest out first — the room then flips to dirty automatically.',
        new.room_number, v_guest
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_room_status_guard on public.rooms;
create trigger trg_room_status_guard
before update of status on public.rooms
for each row execute function public.tg_room_status_guard();

-- 3 -------------------------------------------------------------------------
create or replace function public.tg_booking_overlap_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_new_end timestamptz;
  v_hit record;
begin
  if new.room_id is null or new.status not in ('pending', 'checked_in') then
    return new;
  end if;
  -- only re-check when something that matters changed
  if tg_op = 'UPDATE'
     and new.room_id is not distinct from old.room_id
     and new.check_in_date = old.check_in_date
     and new.check_out_date = old.check_out_date
     and new.status = old.status then
    return new;
  end if;

  -- serialise bookings per room so two receptionists can't race
  perform pg_advisory_xact_lock(hashtext('room-booking:' || new.room_id::text));

  -- a checked-in guest occupies the room until actually checked out
  v_new_end := case when new.status = 'checked_in'
                    then greatest(new.check_out_date, now()) else new.check_out_date end;

  select b.guest_name, b.status, b.check_in_date, b.check_out_date, r.room_number
    into v_hit
  from public.bookings b
  join public.rooms r on r.id = b.room_id
  where b.room_id = new.room_id
    and b.id <> new.id
    and b.status in ('pending', 'checked_in')
    and (
      (new.status = 'checked_in' and b.status = 'checked_in')
      or tstzrange(b.check_in_date,
                   case when b.status = 'checked_in' then greatest(b.check_out_date, now())
                        else b.check_out_date end, '[)')
         && tstzrange(new.check_in_date, v_new_end, '[)')
    )
  order by b.check_in_date
  limit 1;

  if found then
    raise exception 'Room % is already taken by % (%, % → %). Pick another room or other dates.',
      v_hit.room_number, v_hit.guest_name,
      case when v_hit.status = 'checked_in' then 'in house' else 'reserved' end,
      to_char(v_hit.check_in_date at time zone 'Asia/Colombo', 'DD Mon HH24:MI'),
      to_char(v_hit.check_out_date at time zone 'Asia/Colombo', 'DD Mon HH24:MI')
      using errcode = '23P01';
  end if;
  return new;
end $$;

drop trigger if exists trg_booking_overlap_guard on public.bookings;
create trigger trg_booking_overlap_guard
before insert or update of room_id, check_in_date, check_out_date, status on public.bookings
for each row execute function public.tg_booking_overlap_guard();

-- 4 -------------------------------------------------------------------------
create or replace function public.rpc_room_board()
returns table (
  room_id         uuid,
  room_number     text,
  floor_zone      text,
  room_type_id    uuid,
  room_type       text,
  max_occupancy   int,
  status          room_status,
  booking_id      uuid,
  guest_name      text,
  check_in_date   timestamptz,
  check_out_date  timestamptz,
  stay_type       stay_type,
  overdue_minutes int
)
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if public.get_my_role() is null then
    raise exception 'Not authorized.';
  end if;
  return query
  select r.id, r.room_number::text, r.floor_zone::text, t.id, t.name::text, t.max_occupancy,
         r.status, b.id, b.guest_name::text, b.check_in_date, b.check_out_date, b.stay_type,
         case when b.id is not null and now() > b.check_out_date
              then (extract(epoch from now() - b.check_out_date) / 60)::int end
  from public.rooms r
  join public.room_types t on t.id = r.type_id
  left join lateral (
    select * from public.bookings x
    where x.room_id = r.id and x.status = 'checked_in'
    order by x.actual_check_in desc nulls last
    limit 1
  ) b on true
  order by r.room_number;
end $$;

grant execute on function public.rpc_room_board() to authenticated;

-- 5 -------------------------------------------------------------------------
update public.rooms r set status = 'occupied'
where r.status <> 'occupied'
  and exists (select 1 from public.bookings b where b.room_id = r.id and b.status = 'checked_in');
