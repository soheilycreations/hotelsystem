-- ============================================================================
-- Run this in the OLD Supabase project's SQL Editor (the one with the real
-- menu items and rooms — "Hotel POS" / fpjjgouzxdsgmlnvqkht).
-- It does NOT change anything — it just builds a block of INSERT statements
-- as text. Copy the single "sql_to_copy" result cell and run it in the NEW
-- project's SQL Editor to bring the menu and room list over (original IDs
-- are kept, so menu items land in the right category and rooms in the
-- right room type). Booking/order history is deliberately left out —
-- rooms are inserted as 'vacant' regardless of their old status.
-- ============================================================================

select string_agg(stmt, E'\n' order by ord) as sql_to_copy
from (
  select 1 as ord, format(
    'insert into public.menu_categories (id, name, sort_order, station) values (%L, %L, %L, %L) on conflict (id) do nothing;',
    id, name, sort_order, station
  ) as stmt
  from public.menu_categories

  union all

  select 2, format(
    'insert into public.menu_items (id, name, category_id, selling_price, other_cost, service_chargeable, is_available) values (%L, %L, %L, %L, %L, %L, %L) on conflict (id) do nothing;',
    id, name, category_id, selling_price, other_cost, service_chargeable, is_available
  )
  from public.menu_items

  union all

  select 3, format(
    'insert into public.room_types (id, name, base_price, max_occupancy) values (%L, %L, %L, %L) on conflict (id) do nothing;',
    id, name, base_price, max_occupancy
  )
  from public.room_types

  union all

  select 4, format(
    'insert into public.room_rate_plans (id, room_type_id, name, kind, price, duration_hours, is_active) values (%L, %L, %L, %L, %L, %L, %L) on conflict (id) do nothing;',
    id, room_type_id, name, kind, price, duration_hours, is_active
  )
  from public.room_rate_plans

  union all

  select 5, format(
    'insert into public.rooms (id, room_number, type_id, status, floor_zone) values (%L, %L, %L, %L, %L) on conflict (id) do nothing;',
    id, room_number, type_id, 'vacant', floor_zone
  )
  from public.rooms
) x;
