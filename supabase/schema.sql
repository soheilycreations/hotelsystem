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
create type stay_type       as enum ('overnight', 'short_stay');
create type rate_plan_kind  as enum ('per_night', 'block');
create type table_status      as enum ('vacant', 'occupied', 'reserved', 'billed');
create type channel_type      as enum ('dine_in', 'room_service', 'takeaway', 'delivery', 'banquet');
create type kitchen_station   as enum ('kitchen', 'bar'); -- which printer a menu category's KOT/BOT goes to
create type order_status      as enum ('active', 'completed', 'cancelled');
create type delivery_status   as enum ('pending', 'cooking', 'dispatched', 'delivered');
create type payment_method    as enum ('cash', 'card', 'bank_transfer', 'complimentary', 'credit');
create type expense_division  as enum ('restaurant', 'room');
create type cash_direction    as enum ('in', 'out');
create type inventory_unit    as enum ('grams', 'ml', 'units');
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

-- 3.1b Credit accounts — settle a bill "on credit" against a named account.
-- Defined early since bookings/restaurant_orders reference it.
create table public.credit_accounts (
  id         uuid primary key default gen_random_uuid(),
  name       varchar(160) not null,
  notes      text,
  created_by uuid references public.staff_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3.2 Room types
create table public.room_types (
  id            uuid primary key default gen_random_uuid(),
  name          varchar(80) not null unique,
  base_price    numeric(12,2) not null default 0 check (base_price >= 0),
  max_occupancy int not null check (max_occupancy > 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 3.3 Rooms
create table public.room_rate_plans (
  id             uuid primary key default gen_random_uuid(),
  room_type_id   uuid not null references public.room_types (id) on delete cascade,
  name           varchar(80) not null,
  kind           rate_plan_kind not null,
  price          numeric(12,2) not null check (price >= 0),
  duration_hours int,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (room_type_id, name),
  constraint chk_plan_duration check (
    (kind = 'per_night' and duration_hours is null)
    or (kind = 'block' and duration_hours is not null and duration_hours > 0)
  )
);

create table public.rooms (
  id          uuid primary key default gen_random_uuid(),
  room_number varchar(20) not null unique,
  type_id     uuid not null references public.room_types (id) on delete restrict,
  status      room_status not null default 'vacant',
  floor_zone  varchar(60),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 3.3b Guest registry — a growing directory of everyone who has ever
-- stayed, keyed by NIC/passport number. createBooking upserts into this on
-- every check-in (on conflict id_number), so the check-in form can look up
-- "has this guest stayed before, what room/price" without any separate
-- data entry.
create table public.guests (
  id             uuid primary key default gen_random_uuid(),
  full_name      varchar(160) not null,
  id_number      varchar(40) unique, -- dedup key; null allowed (unique ignores nulls)
  contact_number varchar(40),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_guests_id_number on public.guests (id_number);

-- 3.4 Bookings
create table public.bookings (
  id                     uuid primary key default gen_random_uuid(),
  room_id                uuid references public.rooms (id) on delete set null,
  guest_name             varchar(160) not null,
  guest_id_number        varchar(40), -- NIC/passport, recorded at check-in
  contact_number         varchar(40),
  second_guest_name      varchar(160), -- optional 2nd occupant on the same room
  second_guest_id_number varchar(40),
  check_in_date          timestamptz not null,
  check_out_date         timestamptz not null,
  total_folio_amount     numeric(14,2) not null default 0 check (total_folio_amount >= 0),
  stay_type              stay_type not null default 'overnight',
  duration_hours         int check (duration_hours is null or duration_hours > 0),
  rate_plan_id           uuid references public.room_rate_plans (id) on delete set null,
  rate_plan_name         varchar(120),
  rate_plan_price        numeric(12,2),
  price_overridden       boolean not null default false, -- true when staff typed a custom price at check-in
  actual_check_in        timestamptz,
  actual_check_out       timestamptz,
  status                 booking_status not null default 'pending',
  payment_method         payment_method, -- set at checkout
  credit_account_id      uuid references public.credit_accounts (id), -- set when payment_method = 'credit'
  created_by             uuid references public.staff_profiles (id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
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
create table public.menu_categories (
  id         uuid primary key default gen_random_uuid(),
  name       varchar(60) not null unique,
  sort_order int not null default 0,
  station    kitchen_station not null default 'kitchen',
  created_at timestamptz not null default now()
);

create table public.menu_items (
  id            uuid primary key default gen_random_uuid(),
  name          varchar(140) not null,
  category_id   uuid not null references public.menu_categories (id) on delete restrict,
  selling_price numeric(12,2) not null check (selling_price >= 0),
  other_cost    numeric(12,2) not null default 0 check (other_cost >= 0), -- packaging/gas/misc, not stock-tracked
  service_chargeable boolean not null default true, -- false for items that should never attract service charge
  is_available  boolean not null default true,
  image_url     text, -- public URL in the 'menu-images' storage bucket, see section 11
  station       kitchen_station, -- null = use the category's station; set = override it for this item
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
  event_name       varchar(160), -- banquet function name, e.g. "Kamal's Wedding"
  business_date    date not null default current_date, -- editable at settle time so late-night bills post to the right day
  is_historical    boolean not null default false, -- true for Backfill-created entries — kept out of the real Banquet channel-mix bucket

  subtotal         numeric(14,2) not null default 0 check (subtotal >= 0),
  service_charge   numeric(14,2) not null default 0 check (service_charge >= 0),
  total_amount     numeric(14,2) not null default 0 check (total_amount >= 0),
  order_status     order_status not null default 'active',
  payment_method   payment_method, -- set at settle time
  settled_at       timestamptz, -- stamped only at settle time (updated_at touches on every edit)
  settled_by       uuid references public.staff_profiles (id), -- cashier who settled it, may differ from created_by
  service_charge_waived boolean not null default false, -- per-bill SC override
  credit_account_id uuid references public.credit_accounts (id), -- set when payment_method = 'credit'
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
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.restaurant_orders (id) on delete cascade,
  menu_item_id       uuid references public.menu_items (id) on delete restrict, -- null for custom lines
  quantity           int not null check (quantity > 0),
  unit_price         numeric(12,2) not null check (unit_price >= 0),
  line_total         numeric(14,2) generated always as (quantity * unit_price) stored,
  kot_printed_at     timestamptz, -- null = not yet on a KOT; set when the kitchen ticket prints
  is_custom          boolean not null default false, -- free-text line (e.g. "AC Charge"), not a menu item
  custom_description varchar(200),
  service_chargeable boolean not null default true, -- false for pass-through/external lines
  created_at         timestamptz not null default now(),
  constraint chk_order_item_shape check (
    (is_custom = false and menu_item_id is not null and custom_description is null)
    or
    (is_custom = true and menu_item_id is null and custom_description is not null)
  )
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

-- 3.10a Extra folio charges (overtime, minibar, laundry...)
create table public.booking_charges (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  description varchar(160) not null,
  amount      numeric(12,2) not null check (amount > 0),
  created_by  uuid references public.staff_profiles (id),
  created_at  timestamptz not null default now()
);
create index idx_booking_charges_booking on public.booking_charges (booking_id);

create or replace function public.tg_apply_booking_charge()
returns trigger
language plpgsql
security definer
as $$
begin
  if tg_op = 'INSERT' then
    update public.bookings
      set total_folio_amount = total_folio_amount + new.amount
      where id = new.booking_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.bookings
      set total_folio_amount = greatest(0, total_folio_amount - old.amount)
      where id = old.booking_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger trg_booking_charge_folio
  after insert or delete on public.booking_charges
  for each row execute function public.tg_apply_booking_charge();

-- 3.10b Hotel profile (single-row settings)
create table public.hotel_settings (
  id              int primary key default 1 check (id = 1),
  hotel_name      varchar(120) not null default 'Soheily PMS',
  address         text,
  phone_primary   varchar(40),
  phone_secondary varchar(40),
  logo_url        text,
  review_qr_url   text, -- Google-review QR code image, printed on every bill
  service_charge_rate numeric(5,2) not null default 10 check (service_charge_rate >= 0 and service_charge_rate <= 100),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 3.10c Expense categories (editable)
create table public.expense_categories (
  id         uuid primary key default gen_random_uuid(),
  name       varchar(60) not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- 3.11 Expenses ledger
create table public.expenses (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.expense_categories (id) on delete restrict,
  amount      numeric(14,2) not null check (amount > 0),
  date        date not null default current_date,
  description text,
  payment_method payment_method not null default 'cash',
  division    expense_division not null default 'restaurant', -- which P&L this expense counts against
  logged_by   uuid references public.staff_profiles (id),
  created_at  timestamptz not null default now()
);

-- 3.11b Cash movements — bank deposits, owner withdrawals, float top-ups,
-- and any other cash-in-hand adjustment that isn't revenue or an expense.
create table public.cash_movements (
  id          uuid primary key default gen_random_uuid(),
  direction   cash_direction not null,
  category    varchar(60) not null, -- e.g. 'Bank Deposit', 'Owner Withdrawal', 'Float Top-up'
  description text,
  amount      numeric(14,2) not null check (amount > 0),
  date        date not null default current_date,
  logged_by   uuid references public.staff_profiles (id),
  created_at  timestamptz not null default now()
);

-- 3.11c Event bookings — future functions/banquets shown on the Calendar
create table public.event_bookings (
  id             uuid primary key default gen_random_uuid(),
  event_name     varchar(160) not null,
  description    text,
  pax            int check (pax is null or pax > 0),
  event_date     date not null,
  event_time     time,
  contact_name   varchar(120),
  contact_number varchar(40),
  status         varchar(20) not null default 'confirmed', -- tentative | confirmed | cancelled
  created_by     uuid references public.staff_profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 3.11e Credit repayments — when an account pays back what it owes
create table public.credit_repayments (
  id                uuid primary key default gen_random_uuid(),
  credit_account_id uuid not null references public.credit_accounts (id) on delete restrict,
  amount            numeric(14,2) not null check (amount > 0),
  payment_method    payment_method not null default 'cash',
  date              date not null default current_date,
  description       text,
  logged_by         uuid references public.staff_profiles (id),
  created_at        timestamptz not null default now()
);

-- 3.11f Credit adjustments — manual charge to an account (admin only), for
-- old bills that can't be individually retagged.
create table public.credit_adjustments (
  id                uuid primary key default gen_random_uuid(),
  credit_account_id uuid not null references public.credit_accounts (id) on delete restrict,
  amount            numeric(14,2) not null check (amount > 0),
  date              date not null default current_date,
  description       text,
  created_by        uuid references public.staff_profiles (id),
  created_at        timestamptz not null default now()
);

-- 3.11g Purchasing — a supplier bill's items top up inventory stock and
-- post one matching expense, all via rpc_record_purchase (see section 6b).
create table public.purchases (
  id            uuid primary key default gen_random_uuid(),
  supplier_name varchar(140),
  purchase_date date not null default current_date,
  notes         text,
  total_amount  numeric(14,2) not null default 0,
  expense_id    uuid references public.expenses (id) on delete set null,
  created_by    uuid references public.staff_profiles (id),
  created_at    timestamptz not null default now()
);

create table public.purchase_items (
  id                uuid primary key default gen_random_uuid(),
  purchase_id       uuid not null references public.purchases (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete restrict,
  quantity          numeric(14,3) not null check (quantity > 0),
  unit_price        numeric(12,4) not null check (unit_price >= 0),
  -- how many of the item's storage unit (grams/ml/units) one purchased unit
  -- equals — e.g. 1000 for "kg" on an item tracked in grams. Stock added is
  -- quantity × pack_size; see rpc_record_purchase.
  pack_size         numeric(12,4) not null default 1 check (pack_size > 0),
  line_total        numeric(14,2) generated always as (quantity * unit_price) stored,
  created_at        timestamptz not null default now()
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
create index idx_orders_business_date      on public.restaurant_orders (business_date);
create index idx_orders_table              on public.restaurant_orders (table_id) where table_id is not null;
create index idx_orders_booking            on public.restaurant_orders (booking_id) where booking_id is not null;
create index idx_orders_created_at         on public.restaurant_orders (created_at desc);
create index idx_order_items_order         on public.order_items (order_id);
create index idx_order_items_menu          on public.order_items (menu_item_id);
create index idx_rate_plans_type            on public.room_rate_plans (room_type_id);
create index idx_order_items_kot_pending   on public.order_items (order_id) where kot_printed_at is null;
create index idx_menu_items_category      on public.menu_items (category_id);
create index idx_expenses_category        on public.expenses (category_id);
create index idx_recipe_menu               on public.menu_recipe_ingredients (menu_item_id);
create index idx_recipe_inventory          on public.menu_recipe_ingredients (inventory_item_id);
create index idx_inventory_low_stock       on public.inventory_items (quantity_in_stock, reorder_level);
create index idx_expenses_date             on public.expenses (date desc);
create index idx_cash_movements_date       on public.cash_movements (date);
create index idx_event_bookings_date       on public.event_bookings (event_date);
create index idx_credit_accounts_name      on public.credit_accounts (name);
create index idx_orders_credit_account     on public.restaurant_orders (credit_account_id);
create index idx_bookings_credit_account   on public.bookings (credit_account_id);
create index idx_credit_repayments_account on public.credit_repayments (credit_account_id);
create index idx_credit_repayments_date    on public.credit_repayments (date);
create index idx_credit_adjustments_account on public.credit_adjustments (credit_account_id);
create index idx_credit_adjustments_date    on public.credit_adjustments (date);
create index idx_logs_event                on public.system_logs (event_type, created_at desc);

-- updated_at triggers
create trigger trg_touch_staff      before update on public.staff_profiles      for each row execute function public.tg_set_updated_at();
create trigger trg_touch_room_types before update on public.room_types          for each row execute function public.tg_set_updated_at();
create trigger trg_touch_rooms      before update on public.rooms               for each row execute function public.tg_set_updated_at();
create trigger trg_touch_bookings   before update on public.bookings            for each row execute function public.tg_set_updated_at();
create trigger trg_touch_guests     before update on public.guests               for each row execute function public.tg_set_updated_at();
create trigger trg_touch_hotel      before update on public.hotel_settings      for each row execute function public.tg_set_updated_at();
create trigger trg_touch_events     before update on public.event_bookings      for each row execute function public.tg_set_updated_at();
create trigger trg_touch_credit_accounts before update on public.credit_accounts for each row execute function public.tg_set_updated_at();
create trigger trg_touch_rate_plans before update on public.room_rate_plans     for each row execute function public.tg_set_updated_at();
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
-- 7b. RPC — record a supplier purchase (bill items -> stock + one expense)
--     Called once per bill from the app; everything below happens in a
--     single transaction so stock and the expense it posts can't drift
--     apart from a half-applied purchase.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_record_purchase(
  p_supplier_name  text,
  p_notes          text,
  p_items          jsonb, -- [{"inventory_item_id"?,"new_item_name"?,"new_item_unit"?,"quantity","unit_price","pack_size"}, ...]
  p_payment_method payment_method default 'cash'
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_role              staff_role;
  v_purchase_id       uuid;
  v_total             numeric(14,2);
  v_expense_category  uuid;
  v_expense_id        uuid;
  v_item              jsonb;
  v_pack_size         numeric;
  v_inventory_item_id uuid;
  v_new_name          text;
  v_new_unit          text;
begin
  v_role := public.get_my_role();
  if v_role is null or v_role not in ('admin', 'manager') then
    raise exception 'Not authorized to record purchases.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'A purchase needs at least one item.';
  end if;

  select coalesce(sum((i->>'quantity')::numeric * (i->>'unit_price')::numeric), 0)
  into v_total
  from jsonb_array_elements(p_items) as i;

  if v_total <= 0 then
    raise exception 'Purchase total must be greater than zero.';
  end if;

  select id into v_expense_category from public.expense_categories where name = 'Purchasing' limit 1;
  if v_expense_category is null then
    raise exception 'No "Purchasing" expense category found — add one under Finance > Expenses first.';
  end if;

  insert into public.purchases (supplier_name, notes, total_amount, created_by)
  values (nullif(trim(coalesce(p_supplier_name, '')), ''), nullif(trim(coalesce(p_notes, '')), ''), v_total, auth.uid())
  returning id into v_purchase_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_pack_size := coalesce(nullif(v_item->>'pack_size', '')::numeric, 1);
    if v_pack_size <= 0 then
      v_pack_size := 1;
    end if;

    v_inventory_item_id := nullif(v_item->>'inventory_item_id', '')::uuid;

    if v_inventory_item_id is null then
      v_new_name := nullif(trim(coalesce(v_item->>'new_item_name', '')), '');
      v_new_unit := nullif(v_item->>'new_item_unit', '');
      if v_new_name is null or v_new_unit is null then
        raise exception 'Every line needs either an existing item or a name + unit for a new one.';
      end if;

      insert into public.inventory_items (name, unit, quantity_in_stock, unit_cost, reorder_level)
      values (v_new_name, v_new_unit::inventory_unit, 0, 0, 0)
      on conflict (name) do update set name = excluded.name
      returning id into v_inventory_item_id;
    end if;

    insert into public.purchase_items (purchase_id, inventory_item_id, quantity, unit_price, pack_size)
    values (
      v_purchase_id,
      v_inventory_item_id,
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_price')::numeric,
      v_pack_size
    );

    -- Stock goes up by quantity × pack_size (converted into the item's own
    -- storage unit); unit_cost is normalised back to a per-storage-unit
    -- price so Recipe Costing's math doesn't need to know what unit this
    -- particular bill was purchased in.
    update public.inventory_items
    set quantity_in_stock = quantity_in_stock + (v_item->>'quantity')::numeric * v_pack_size,
        unit_cost = (v_item->>'unit_price')::numeric / v_pack_size
    where id = v_inventory_item_id;
  end loop;

  insert into public.expenses (category_id, amount, date, description, payment_method, division, logged_by)
  values (
    v_expense_category,
    v_total,
    current_date,
    trim('Stock purchase' || case when nullif(trim(coalesce(p_supplier_name, '')), '') is not null
      then ' — ' || trim(p_supplier_name) else '' end),
    p_payment_method,
    'restaurant',
    auth.uid()
  )
  returning id into v_expense_id;

  update public.purchases set expense_id = v_expense_id where id = v_purchase_id;

  return v_purchase_id;
end $$;

grant execute on function public.rpc_record_purchase(text, text, jsonb, payment_method) to authenticated;

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
  v_subtotal numeric(14,2);
  v_sc_base  numeric(14,2);
  v_rate     numeric(5,2);
  v_sc       numeric(14,2);
  v_waived   boolean;
  v_channel  channel_type;
begin
  select coalesce(sum(oi.line_total), 0) into v_subtotal
  from public.order_items oi where oi.order_id = v_order_id;

  -- Service charge applies only to food/beverage (service_chargeable) lines —
  -- custom/external pass-through lines like "AC Charge" are excluded.
  select coalesce(sum(oi.line_total) filter (where oi.service_chargeable), 0) into v_sc_base
  from public.order_items oi where oi.order_id = v_order_id;

  select coalesce(hs.service_charge_rate, 0) into v_rate
  from public.hotel_settings hs where hs.id = 1;

  select o.service_charge_waived, o.channel_type into v_waived, v_channel
  from public.restaurant_orders o where o.id = v_order_id;

  -- No service charge on takeaway/delivery — there's no table service to
  -- charge for, whatever the hotel's dine-in rate is set to.
  v_sc := case when coalesce(v_waived, false) then 0
               when v_channel in ('takeaway', 'delivery') then 0
               else round(v_sc_base * coalesce(v_rate, 0) / 100.0, 2)
          end;

  update public.restaurant_orders o
  set subtotal       = v_subtotal,
      service_charge = v_sc,
      total_amount   = v_subtotal + v_sc
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
alter table public.guests                 enable row level security;
alter table public.restaurant_tables      enable row level security;
alter table public.menu_items             enable row level security;
alter table public.restaurant_orders      enable row level security;
alter table public.order_items            enable row level security;
alter table public.inventory_items        enable row level security;
alter table public.menu_recipe_ingredients enable row level security;
alter table public.menu_categories         enable row level security;
alter table public.expense_categories      enable row level security;
alter table public.cash_movements          enable row level security;
alter table public.event_bookings          enable row level security;
alter table public.credit_accounts         enable row level security;
alter table public.credit_repayments       enable row level security;
alter table public.credit_adjustments      enable row level security;
alter table public.hotel_settings         enable row level security;
alter table public.room_rate_plans        enable row level security;
alter table public.booking_charges        enable row level security;
alter table public.expenses               enable row level security;
alter table public.system_logs            enable row level security;
alter table public.purchases              enable row level security;
alter table public.purchase_items         enable row level security;

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
create policy "staff read guests"     on public.guests     for select using (public.get_my_role() is not null);
create policy "pms write guests"      on public.guests     for all    using (public.get_my_role() in ('admin','manager','receptionist')) with check (public.get_my_role() in ('admin','manager','receptionist'));

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
create policy "staff read categories" on public.menu_categories        for select using (public.get_my_role() is not null);
create policy "mgmt write categories" on public.menu_categories        for all    using (public.get_my_role() in ('admin','manager')) with check (public.get_my_role() in ('admin','manager'));
create policy "staff read expense categories" on public.expense_categories for select using (public.get_my_role() is not null);
create policy "mgmt write expense categories" on public.expense_categories for all    using (public.get_my_role() in ('admin','manager')) with check (public.get_my_role() in ('admin','manager'));
create policy "staff read cash movements" on public.cash_movements for select using (public.get_my_role() is not null);
create policy "mgmt write cash movements" on public.cash_movements for all    using (public.get_my_role() in ('admin','manager')) with check (public.get_my_role() in ('admin','manager'));
create policy "staff read event bookings" on public.event_bookings for select using (public.get_my_role() is not null);
create policy "pms write event bookings"  on public.event_bookings for all    using (public.get_my_role() in ('admin','manager','receptionist')) with check (public.get_my_role() in ('admin','manager','receptionist'));
create policy "staff read credit accounts" on public.credit_accounts for select using (public.get_my_role() is not null);
create policy "pms write credit accounts"  on public.credit_accounts for all    using (public.get_my_role() in ('admin','manager','receptionist','cashier')) with check (public.get_my_role() in ('admin','manager','receptionist','cashier'));
create policy "staff read credit repayments" on public.credit_repayments for select using (public.get_my_role() is not null);
create policy "mgmt write credit repayments" on public.credit_repayments for all    using (public.get_my_role() in ('admin','manager')) with check (public.get_my_role() in ('admin','manager'));
create policy "staff read credit adjustments" on public.credit_adjustments for select using (public.get_my_role() is not null);
create policy "admin write credit adjustments" on public.credit_adjustments for all    using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');
create policy "staff read recipes"    on public.menu_recipe_ingredients for select using (public.get_my_role() is not null);
create policy "mgmt write recipes"    on public.menu_recipe_ingredients for all    using (public.get_my_role() in ('admin','manager')) with check (public.get_my_role() in ('admin','manager'));
create policy "staff read hotel"      on public.hotel_settings    for select using (public.get_my_role() is not null);
create policy "mgmt write hotel"      on public.hotel_settings    for update using (public.get_my_role() in ('admin','manager')) with check (public.get_my_role() in ('admin','manager'));
create policy "staff read rate plans" on public.room_rate_plans   for select using (public.get_my_role() is not null);
create policy "mgmt write rate plans" on public.room_rate_plans   for all    using (public.get_my_role() in ('admin','manager')) with check (public.get_my_role() in ('admin','manager'));
create policy "staff read charges"    on public.booking_charges   for select using (public.get_my_role() is not null);
create policy "pms write charges"     on public.booking_charges   for all    using (public.get_my_role() in ('admin','manager','receptionist')) with check (public.get_my_role() in ('admin','manager','receptionist'));

-- 9.5 Finance: admin/manager only
create policy "finance read expenses" on public.expenses for select using (public.get_my_role() in ('admin','manager'));
create policy "finance write expenses" on public.expenses for insert with check (public.get_my_role() in ('admin','manager'));
create policy "admin delete expenses" on public.expenses for delete using (public.get_my_role() = 'admin');

-- 9.6 System logs: management reads, triggers (security definer) write
create policy "mgmt read logs"        on public.system_logs for select using (public.get_my_role() in ('admin','manager','kitchen_staff'));

-- 9.7 Purchases: any signed-in staff reads; writes only via
-- rpc_record_purchase (security definer, does its own admin/manager check)
create policy "staff read purchases" on public.purchases for select using (public.get_my_role() is not null);
create policy "staff read purchase items" on public.purchase_items for select using (public.get_my_role() is not null);

-- ---------------------------------------------------------------------------
-- 10. REALTIME PUBLICATION (live sync for the UI)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.bookings;
alter publication supabase_realtime add table public.booking_charges;
alter publication supabase_realtime add table public.room_rate_plans;
alter publication supabase_realtime add table public.hotel_settings;
alter publication supabase_realtime add table public.restaurant_tables;
alter publication supabase_realtime add table public.restaurant_orders;
alter publication supabase_realtime add table public.order_items;
alter publication supabase_realtime add table public.menu_categories;
alter publication supabase_realtime add table public.expense_categories;
alter publication supabase_realtime add table public.cash_movements;
alter publication supabase_realtime add table public.event_bookings;
alter publication supabase_realtime add table public.credit_accounts;
alter publication supabase_realtime add table public.credit_repayments;
alter publication supabase_realtime add table public.credit_adjustments;
alter publication supabase_realtime add table public.inventory_items;
alter publication supabase_realtime add table public.system_logs;
alter publication supabase_realtime add table public.purchases;
alter publication supabase_realtime add table public.purchase_items;

commit;

-- ============================================================================
-- 11. SEED DATA (optional — run after schema)
-- ============================================================================
begin;

insert into public.room_types (name, base_price, max_occupancy) values
  ('Standard Double', 12500.00, 2),
  ('Deluxe Sea View', 18500.00, 3),
  ('Family Suite',    27500.00, 5);

insert into public.room_rate_plans (room_type_id, name, kind, price, duration_hours)
select rt.id,
       p.name,
       p.kind::rate_plan_kind,
       round(rt.base_price * p.factor, 2),
       p.duration_hours
from public.room_types rt
cross join (values
  ('AC — Full Night',     'per_night', 1.00::numeric, null::int),
  ('Non-AC — Full Night', 'per_night', 0.80::numeric, null::int),
  ('Day Use — 12h',       'block',     0.60::numeric, 12),
  ('Short Stay — 3h',     'block',     0.30::numeric, 3)
) as p(name, kind, factor, duration_hours)
on conflict do nothing;

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

insert into public.menu_categories (name, sort_order, station) values
  ('Appetizers', 1, 'kitchen'), ('Mains', 2, 'kitchen'), ('Drinks', 3, 'bar'), ('Desserts', 4, 'kitchen');

insert into public.menu_items (name, category_id, selling_price)
select v.name, mc.id, v.selling_price
from (values
  ('Devilled Chicken',       'Mains',       1850.00),
  ('Chicken Fried Rice',     'Mains',       1450.00),
  ('Egg Hoppers (3pc)',      'Appetizers',   650.00),
  ('Fresh Lime Juice',       'Drinks',       450.00),
  ('Watalappan',             'Desserts',     550.00)
) as v(name, category_name, selling_price)
join public.menu_categories mc on mc.name = v.category_name;

insert into public.hotel_settings (id) values (1) on conflict (id) do nothing;

insert into public.expense_categories (name, sort_order) values
  ('Utilities', 1), ('Purchasing', 2), ('Salary', 3),
  ('Maintenance', 4), ('Marketing', 5), ('Function Cost', 6);

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

-- ---------------------------------------------------------------------------
-- 11. STORAGE — public bucket for paperless PDF bills (WhatsApp links)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('bills', 'bills', true)
on conflict (id) do nothing;

drop policy if exists "staff upload bills" on storage.objects;
create policy "staff upload bills" on storage.objects
  for insert to authenticated with check (bucket_id = 'bills');

drop policy if exists "staff update bills" on storage.objects;
create policy "staff update bills" on storage.objects
  for update to authenticated using (bucket_id = 'bills');

drop policy if exists "public read bills" on storage.objects;
create policy "public read bills" on storage.objects
  for select using (bucket_id = 'bills');

-- Public bucket for menu item photos (POS terminal + menu manager)
insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;

drop policy if exists "menu images public read" on storage.objects;
create policy "menu images public read" on storage.objects
  for select using (bucket_id = 'menu-images');

drop policy if exists "menu images admin write" on storage.objects;
create policy "menu images admin write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'menu-images' and public.get_my_role() in ('admin', 'manager'));

drop policy if exists "menu images admin update" on storage.objects;
create policy "menu images admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'menu-images' and public.get_my_role() in ('admin', 'manager'));

drop policy if exists "menu images admin delete" on storage.objects;
create policy "menu images admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'menu-images' and public.get_my_role() in ('admin', 'manager'));

-- Public bucket for hotel logo + Google-review QR (Hotel Profile uploads)
insert into storage.buckets (id, name, public)
values ('hotel-assets', 'hotel-assets', true)
on conflict (id) do nothing;

drop policy if exists "hotel assets public read" on storage.objects;
create policy "hotel assets public read" on storage.objects
  for select using (bucket_id = 'hotel-assets');

drop policy if exists "hotel assets admin write" on storage.objects;
create policy "hotel assets admin write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'hotel-assets' and public.get_my_role() in ('admin', 'manager'));

drop policy if exists "hotel assets admin update" on storage.objects;
create policy "hotel assets admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'hotel-assets' and public.get_my_role() in ('admin', 'manager'));

drop policy if exists "hotel assets admin delete" on storage.objects;
create policy "hotel assets admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'hotel-assets' and public.get_my_role() in ('admin', 'manager'));
