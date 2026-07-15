-- ============================================================================
-- HOTEL PMS + RESTAURANT POS + INVENTORY + LEDGER — SUPABASE SCHEMA
-- Run this whole file in the Supabase SQL Editor (single transaction).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. EXTENSIONS
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. ENUM TYPES
-- ---------------------------------------------------------------------------
create type staff_role        as enum ('admin', 'manager', 'receptionist', 'cashier', 'kitchen_staff');
create type room_status       as enum ('vacant', 'occupied', 'dirty', 'maintenance');
create type booking_status    as enum ('pending', 'checked_in', 'checked_out', 'cancelled');
create type table_status      as enum ('vacant', 'occupied', 'reserved', 'billed');
create type channel_type      as enum ('dine_in', 'room_service', 'takeaway', 'delivery');
create type order_status      as enum ('active', 'completed', 'cancelled');
create type delivery_status   as enum ('pending', 'cooking', 'dispatched', 'delivered');
create type menu_category     as enum ('appetizers', 'mains', 'drinks', 'desserts');
create type inventory_unit    as enum ('grams', 'ml', 'units');
create type expense_category  as enum ('utilities', 'purchasing', 'salary', 'maintenance', 'marketing');
create type log_severity      as enum ('info', 'warning', 'critical');

-- ---------------------------------------------------------------------------
-- 2. SHARED updated_at AUTOMATION
-- ---------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 3. TABLES
-- ---------------------------------------------------------------------------

-- 3.1 Staff profiles (1:1 with auth.users)
create table public.staff_profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   varchar(120) not null,
  role        staff_role   not null default 'receptionist',
  is_active   boolean      not null default true,
  created_at  timestamptz  not null default now(),
  updated_at  timestamptz  not null default now()
);

-- 3.2 Room types
create table public.room_types (
  id            uuid primary key default gen_random_uuid(),
  name          varchar(80) not null unique,
  base_price    numeric(12,2) not null check (base_price >= 0),
  max_occupancy int not null check (max_occupancy > 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 3.3 Rooms
create table public.rooms (
  id          uuid primary key default gen_random_uuid(),
  room_number varchar(20) not null unique,
  type_id     uuid not null references public.room_types (id) on delete restrict,
  status      room_status not null default 'vacant',
  floor_zone  varchar(60),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 3.4 Bookings
create table public.bookings (
  id                 uuid primary key default gen_random_uuid(),
  room_id            uuid references public.rooms (id) on delete set null,
  guest_name         varchar(160) not null,
  contact_number     varchar(40),
  check_in_date      timestamptz not null,
  check_out_date     timestamptz not null,
  total_folio_amount numeric(14,2) not null default 0 check (total_folio_amount >= 0),
  status             booking_status not null default 'pending',
  created_by         uuid references public.staff_profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint chk_booking_dates check (check_out_date > check_in_date)
);

-- 3.5 Restaurant tables
create table public.restaurant_tables (
  id             uuid primary key default gen_random_uuid(),
  table_number   varchar(20) not null unique,
  capacity       int not null check (capacity > 0),
  current_status table_status not null default 'vacant',
  floor_zone     varchar(60),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 3.6 Menu items
create table public.menu_items (
  id            uuid primary key default gen_random_uuid(),
  name          varchar(140) not null,
  category      menu_category not null,
  selling_price numeric(12,2) not null check (selling_price >= 0),
  is_available  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 3.7 Restaurant orders (multi-channel)
create table public.restaurant_orders (
  id               uuid primary key default gen_random_uuid(),
  order_number     serial unique,
  channel_type     channel_type not null,
  table_id         uuid references public.restaurant_tables (id) on delete set null,
  booking_id       uuid references public.bookings (id) on delete set null,
  customer_phone   varchar(40),
  delivery_address text,
  total_amount     numeric(14,2) not null default 0 check (total_amount >= 0),
  order_status     order_status not null default 'active',
  delivery_status  delivery_status,
  created_by       uuid references public.staff_profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- channel integrity guards
  constraint chk_dine_in_table   check (channel_type <> 'dine_in'      or table_id is not null),
  constraint chk_room_service    check (channel_type <> 'room_service' or booking_id is not null),
  constraint chk_delivery_fields check (channel_type <> 'delivery'     or delivery_address is not null)
);

-- 3.8 Order line items
create table public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.restaurant_orders (id) on delete cascade,
  menu_item_id uuid not null references public.menu_items (id) on delete restrict,
  quantity     int not null check (quantity > 0),
  unit_price   numeric(12,2) not null check (unit_price >= 0),
  line_total   numeric(14,2) generated always as (quantity * unit_price) stored,
  created_at   timestamptz not null default now()
);

-- 3.9 Inventory items
create table public.inventory_items (
  id                uuid primary key default gen_random_uuid(),
  name              varchar(140) not null unique,
  quantity_in_stock numeric(14,3) not null default 0,
  unit              inventory_unit not null,
  unit_cost         numeric(12,4) not null default 0 check (unit_cost >= 0),
  reorder_level     numeric(14,3) not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 3.10 Recipe map: menu item -> ingredients
create table public.menu_recipe_ingredients (
  id                uuid primary key default gen_random_uuid(),
  menu_item_id      uuid not null references public.menu_items (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete restrict,
  quantity_needed   numeric(14,3) not null check (quantity_needed > 0),
  created_at        timestamptz not null default now(),
  unique (menu_item_id, inventory_item_id)
);

-- 3.11 Expenses ledger
create table public.expenses (
  id          uuid primary key default gen_random_uuid(),
  category    expense_category not null,
  amount      numeric(14,2) not null check (amount > 0),
  date        date not null default current_date,
  description text,
  logged_by   uuid references public.staff_profiles (id),
  created_at  timestamptz not null default now()
);

-- 3.12 System logs (low-stock alerts + audit hooks)
create table public.system_logs (
  id         uuid primary key default gen_random_uuid(),
  event_type varchar(60) not null,          -- e.g. 'LOW_STOCK', 'FOLIO_POST'
  severity   log_severity not null default 'info',
  message    text not null,
  ref_table  varchar(60),
  ref_id     uuid,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. INDEXES (hot query paths)
-- ---------------------------------------------------------------------------
create index idx_rooms_status              on public.rooms (status);
create index idx_rooms_type                on public.rooms (type_id);
create index idx_bookings_status           on public.bookings (status);
create index idx_bookings_room             on public.bookings (room_id);
create index idx_bookings_dates            on public.bookings (check_in_date, check_out_date);
create index idx_tables_status             on public.restaurant_tables (current_status);
create index idx_orders_status             on public.restaurant_orders (order_status);
create index idx_orders_channel            on public.restaurant_orders (channel_type);
create index idx_orders_table              on public.restaurant_orders (table_id) where table_id is not null;
create index idx_orders_booking            on public.restaurant_orders (booking_id) where booking_id is not null;
create index idx_orders_created_at         on public.restaurant_orders (created_at desc);
create index idx_order_items_order         on public.order_items (order_id);
create index idx_order_items_menu          on public.order_items (menu_item_id);
create index idx_recipe_menu               on public.menu_recipe_ingredients (menu_item_id);
create index idx_recipe_inventory          on public.menu_recipe_ingredients (inventory_item_id);
create index idx_inventory_low_stock       on public.inventory_items (quantity_in_stock, reorder_level);
create index idx_expenses_date             on public.expenses (date desc);
create index idx_expenses_category         on public.expenses (category);
create index idx_logs_event                on public.system_logs (event_type, created_at desc);

-- updated_at triggers
create trigger trg_touch_staff      before update on public.staff_profiles      for each row execute function public.tg_set_updated_at();
create trigger trg_touch_room_types before update on public.room_types          for each row execute function public.tg_set_updated_at();
create trigger trg_touch_rooms      before update on public.rooms               for each row execute function public.tg_set_updated_at();
create trigger trg_touch_bookings   before update on public.bookings            for each row execute function public.tg_set_updated_at();
create trigger trg_touch_tables     before update on public.restaurant_tables   for each row execute function public.tg_set_updated_at();
create trigger trg_touch_menu       before update on public.menu_items          for each row execute function public.tg_set_updated_at();
create trigger trg_touch_orders     before update on public.restaurant_orders   for each row execute function public.tg_set_updated_at();
create trigger trg_touch_inventory  before update on public.inventory_items     for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. TRIGGER A — HOUSEKEEPING AUTOMATOR
--    booking checked_out  ->  room flips to 'dirty'
--    booking checked_in   ->  room flips to 'occupied' (bonus symmetry)
-- ---------------------------------------------------------------------------
create or replace function public.tg_housekeeping_automator()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.room_id is null then
    return new;
  end if;

  if new.status = 'checked_out' and old.status is distinct from 'checked_out' then
    update public.rooms set status = 'dirty' where id = new.room_id;
    insert into public.system_logs (event_type, severity, message, ref_table, ref_id)
    values ('HOUSEKEEPING', 'info',
            format('Guest "%s" checked out — room flagged dirty for housekeeping.', new.guest_name),
            'rooms', new.room_id);

  elsif new.status = 'checked_in' and old.status is distinct from 'checked_in' then
    update public.rooms set status = 'occupied' where id = new.room_id;

  elsif new.status = 'cancelled' and old.status = 'checked_in' then
    update public.rooms set status = 'vacant' where id = new.room_id;
  end if;

  return new;
end $$;

create trigger trg_a_housekeeping
after update of status on public.bookings
for each row execute function public.tg_housekeeping_automator();

-- ---------------------------------------------------------------------------
-- 6. TRIGGER B — REAL-TIME RECIPE STOCK DEDUCTOR
--    order completed -> deduct (quantity_needed × item quantity) per ingredient
--    Single set-based UPDATE (no row loops) for performance.
-- ---------------------------------------------------------------------------
create or replace function public.tg_recipe_stock_deductor()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.order_status = 'completed' and old.order_status is distinct from 'completed' then
    update public.inventory_items inv
    set quantity_in_stock = inv.quantity_in_stock - usage.total_used
    from (
      select mri.inventory_item_id,
             sum(mri.quantity_needed * oi.quantity) as total_used
      from public.order_items oi
      join public.menu_recipe_ingredients mri on mri.menu_item_id = oi.menu_item_id
      where oi.order_id = new.id
      group by mri.inventory_item_id
    ) as usage
    where inv.id = usage.inventory_item_id;

    -- Post room-service order onto the guest folio
    if new.booking_id is not null then
      update public.bookings
      set total_folio_amount = total_folio_amount + new.total_amount
      where id = new.booking_id;

      insert into public.system_logs (event_type, severity, message, ref_table, ref_id)
      values ('FOLIO_POST', 'info',
              format('Order #%s (Rs. %s) posted to guest folio.', new.order_number, new.total_amount),
              'bookings', new.booking_id);
    end if;

    -- Free the table when a dine-in order settles
    if new.table_id is not null then
      update public.restaurant_tables set current_status = 'vacant' where id = new.table_id;
    end if;
  end if;

  return new;
end $$;

create trigger trg_b_stock_deduct
after update of order_status on public.restaurant_orders
for each row execute function public.tg_recipe_stock_deductor();

-- ---------------------------------------------------------------------------
-- 7. TRIGGER C — LOW STOCK ALERT HOOK
--    Fires when stock crosses below reorder_level (edge-triggered, no spam).
-- ---------------------------------------------------------------------------
create or replace function public.tg_low_stock_alert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.quantity_in_stock < new.reorder_level
     and (old.quantity_in_stock is null or old.quantity_in_stock >= old.reorder_level) then
    insert into public.system_logs (event_type, severity, message, ref_table, ref_id)
    values ('LOW_STOCK',
            case when new.quantity_in_stock <= 0 then 'critical' else 'warning' end,
            format('"%s" is low: %s %s remaining (reorder level %s %s).',
                   new.name, new.quantity_in_stock, new.unit, new.reorder_level, new.unit),
            'inventory_items', new.id);
  end if;
  return new;
end $$;

create trigger trg_c_low_stock
after update of quantity_in_stock on public.inventory_items
for each row execute function public.tg_low_stock_alert();

-- ---------------------------------------------------------------------------
-- 8. ORDER TOTAL RECALCULATOR (keeps restaurant_orders.total_amount honest)
-- ---------------------------------------------------------------------------
create or replace function public.tg_recalc_order_total()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_order_id uuid := coalesce(new.order_id, old.order_id);
begin
  update public.restaurant_orders o
  set total_amount = coalesce((
    select sum(oi.line_total) from public.order_items oi where oi.order_id = v_order_id
  ), 0)
  where o.id = v_order_id;
  return coalesce(new, old);
end $$;

create trigger trg_recalc_total
after insert or update or delete on public.order_items
for each row execute function public.tg_recalc_order_total();

-- ---------------------------------------------------------------------------
-- 9. ROW-LEVEL SECURITY (granular RBAC)
-- ---------------------------------------------------------------------------
alter table public.staff_profiles         enable row level security;
alter table public.room_types             enable row level security;
alter table public.rooms                  enable row level security;
alter table public.bookings               enable row level security;
alter table public.restaurant_tables      enable row level security;
alter table public.menu_items             enable row level security;
alter table public.restaurant_orders      enable row level security;
alter table public.order_items            enable row level security;
alter table public.inventory_items        enable row level security;
alter table public.menu_recipe_ingredients enable row level security;
alter table public.expenses               enable row level security;
alter table public.system_logs            enable row level security;

-- Role helper (stable → cached per statement)
create or replace function public.get_my_role()
returns staff_role
language sql stable security definer set search_path = public
as $$
  select role from public.staff_profiles where id = auth.uid() and is_active = true;
$$;

-- 9.1 staff_profiles: everyone reads own row; admin manages all
create policy "read own profile"      on public.staff_profiles for select using (id = auth.uid() or public.get_my_role() in ('admin','manager'));
create policy "admin manages staff"   on public.staff_profiles for all    using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');

-- 9.2 PMS: admin/manager/receptionist write; all active staff read
create policy "staff read rooms"      on public.rooms      for select using (public.get_my_role() is not null);
create policy "pms write rooms"       on public.rooms      for all    using (public.get_my_role() in ('admin','manager','receptionist')) with check (public.get_my_role() in ('admin','manager','receptionist'));
create policy "staff read room types" on public.room_types for select using (public.get_my_role() is not null);
create policy "mgmt write room types" on public.room_types for all    using (public.get_my_role() in ('admin','manager')) with check (public.get_my_role() in ('admin','manager'));
create policy "staff read bookings"   on public.bookings   for select using (public.get_my_role() is not null);
create policy "pms write bookings"    on public.bookings   for all    using (public.get_my_role() in ('admin','manager','receptionist')) with check (public.get_my_role() in ('admin','manager','receptionist'));

-- 9.3 POS: admin/manager/cashier write; kitchen reads orders
create policy "staff read tables"     on public.restaurant_tables for select using (public.get_my_role() is not null);
create policy "pos write tables"      on public.restaurant_tables for all    using (public.get_my_role() in ('admin','manager','cashier')) with check (public.get_my_role() in ('admin','manager','cashier'));
create policy "staff read menu"       on public.menu_items        for select using (public.get_my_role() is not null);
create policy "mgmt write menu"       on public.menu_items        for all    using (public.get_my_role() in ('admin','manager')) with check (public.get_my_role() in ('admin','manager'));
create policy "staff read orders"     on public.restaurant_orders for select using (public.get_my_role() is not null);
create policy "pos write orders"      on public.restaurant_orders for insert with check (public.get_my_role() in ('admin','manager','cashier'));
create policy "pos update orders"     on public.restaurant_orders for update using (public.get_my_role() in ('admin','manager','cashier','kitchen_staff'));
create policy "staff read items"      on public.order_items       for select using (public.get_my_role() is not null);
create policy "pos write items"       on public.order_items       for all    using (public.get_my_role() in ('admin','manager','cashier')) with check (public.get_my_role() in ('admin','manager','cashier'));

-- 9.4 Inventory: admin/manager/kitchen write
create policy "staff read inventory"  on public.inventory_items        for select using (public.get_my_role() is not null);
create policy "kitchen write inv"     on public.inventory_items        for all    using (public.get_my_role() in ('admin','manager','kitchen_staff')) with check (public.get_my_role() in ('admin','manager','kitchen_staff'));
create policy "staff read recipes"    on public.menu_recipe_ingredients for select using (public.get_my_role() is not null);
create policy "mgmt write recipes"    on public.menu_recipe_ingredients for all    using (public.get_my_role() in ('admin','manager')) with check (public.get_my_role() in ('admin','manager'));

-- 9.5 Finance: admin/manager only
create policy "finance read expenses" on public.expenses for select using (public.get_my_role() in ('admin','manager'));
create policy "finance write expenses" on public.expenses for insert with check (public.get_my_role() in ('admin','manager'));
create policy "admin delete expenses" on public.expenses for delete using (public.get_my_role() = 'admin');

-- 9.6 System logs: management reads, triggers (security definer) write
create policy "mgmt read logs"        on public.system_logs for select using (public.get_my_role() in ('admin','manager','kitchen_staff'));

-- ---------------------------------------------------------------------------
-- 10. REALTIME PUBLICATION (live sync for the UI)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.bookings;
alter publication supabase_realtime add table public.restaurant_tables;
alter publication supabase_realtime add table public.restaurant_orders;
alter publication supabase_realtime add table public.order_items;
alter publication supabase_realtime add table public.inventory_items;
alter publication supabase_realtime add table public.system_logs;

commit;

-- ============================================================================
-- 11. SEED DATA (optional — run after schema)
-- ============================================================================
begin;

insert into public.room_types (name, base_price, max_occupancy) values
  ('Standard Double', 12500.00, 2),
  ('Deluxe Sea View', 18500.00, 3),
  ('Family Suite',    27500.00, 5);

insert into public.rooms (room_number, type_id, status, floor_zone)
select r.room_number, rt.id, 'vacant', r.floor_zone
from (values
  ('101','Standard Double','Ground Wing'), ('102','Standard Double','Ground Wing'),
  ('103','Deluxe Sea View','Ground Wing'), ('201','Deluxe Sea View','Upper Wing'),
  ('202','Deluxe Sea View','Upper Wing'),  ('203','Family Suite','Upper Wing'),
  ('301','Family Suite','Pool Wing'),      ('302','Standard Double','Pool Wing')
) as r(room_number, type_name, floor_zone)
join public.room_types rt on rt.name = r.type_name;

insert into public.restaurant_tables (table_number, capacity, current_status, floor_zone) values
  ('T1', 2, 'vacant', 'Indoor'), ('T2', 4, 'vacant', 'Indoor'),
  ('T3', 4, 'vacant', 'Indoor'), ('T4', 6, 'vacant', 'Garden'),
  ('T5', 6, 'vacant', 'Garden'), ('T6', 8, 'vacant', 'Rooftop');

insert into public.inventory_items (name, quantity_in_stock, unit, unit_cost, reorder_level) values
  ('Basmati Rice',        25000, 'grams', 0.55,  5000),
  ('Chicken (boneless)',  12000, 'grams', 1.95,  3000),
  ('Coconut Milk',         8000, 'ml',    0.42,  2000),
  ('Red Chilli Powder',    1500, 'grams', 2.80,   400),
  ('Cooking Oil',         10000, 'ml',    0.68,  2500),
  ('Eggs',                  180, 'units', 55.00,    48),
  ('Lime',                  120, 'units', 30.00,    30),
  ('Sugar',                6000, 'grams', 0.32,  1500);

insert into public.menu_items (name, category, selling_price) values
  ('Devilled Chicken',       'mains',      1850.00),
  ('Chicken Fried Rice',     'mains',      1450.00),
  ('Egg Hoppers (3pc)',      'appetizers',  650.00),
  ('Fresh Lime Juice',       'drinks',      450.00),
  ('Watalappan',             'desserts',    550.00);

insert into public.menu_recipe_ingredients (menu_item_id, inventory_item_id, quantity_needed)
select m.id, i.id, r.qty
from (values
  ('Devilled Chicken',   'Chicken (boneless)', 250::numeric),
  ('Devilled Chicken',   'Red Chilli Powder',   15),
  ('Devilled Chicken',   'Cooking Oil',         40),
  ('Chicken Fried Rice', 'Basmati Rice',       300),
  ('Chicken Fried Rice', 'Chicken (boneless)', 120),
  ('Chicken Fried Rice', 'Eggs',                 1),
  ('Chicken Fried Rice', 'Cooking Oil',         35),
  ('Egg Hoppers (3pc)',  'Eggs',                 3),
  ('Egg Hoppers (3pc)',  'Coconut Milk',       150),
  ('Fresh Lime Juice',   'Lime',                 2),
  ('Fresh Lime Juice',   'Sugar',               25),
  ('Watalappan',         'Coconut Milk',       200),
  ('Watalappan',         'Eggs',                 2),
  ('Watalappan',         'Sugar',               60)
) as r(menu_name, inv_name, qty)
join public.menu_items m on m.name = r.menu_name
join public.inventory_items i on i.name = r.inv_name;

commit;

-- ============================================================================
-- 12. FIRST ADMIN — after creating the auth user in Supabase Dashboard:
-- insert into public.staff_profiles (id, full_name, role)
-- values ('<auth-user-uuid>', 'Ishara', 'admin');
-- ============================================================================
