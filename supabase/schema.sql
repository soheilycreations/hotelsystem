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
create type payment_method    as enum ('cash', 'card', 'bank_transfer', 'complimentary', 'credit', 'owner_paid');
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
create sequence public.restaurant_orders_order_number_seq;

create table public.restaurant_orders (
  id               uuid primary key default gen_random_uuid(),
  -- Assigned lazily by rpc_ensure_order_number() the first time a bill is
  -- printed or the order settled — never at insert time — so a table
  -- opened and abandoned never burns a number and leaves a gap.
  order_number     int unique,
  channel_type     channel_type not null,
  table_id         uuid references public.restaurant_tables (id) on delete set null,
  booking_id       uuid references public.bookings (id) on delete set null,
  customer_phone   varchar(40),
  delivery_address text,
  event_name       varchar(160), -- banquet function name, e.g. "Kamal's Wedding"
  business_date    date not null default ((now() at time zone 'Asia/Colombo')::date), -- editable at settle time so late-night bills post to the right day; must be Colombo-aware, not the DB's own (UTC) current_date, or anything opened 00:00-05:29 Colombo time lands on the wrong day
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

alter sequence public.restaurant_orders_order_number_seq owned by public.restaurant_orders.order_number;

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

-- 3.10a Store module: central store-room stock ledger, separate from the
-- kitchen/restaurant Inventory above but linkable to it so issuing stock to
-- the kitchen can top up an inventory_items row in the same transaction.
create table public.store_items (
  id                       uuid primary key default gen_random_uuid(),
  name                     varchar(140) not null unique,
  unit                     varchar(20) not null default 'pcs',
  reorder_level            numeric(14,3) not null default 0,
  current_stock            numeric(14,3) not null default 0,
  linked_inventory_item_id uuid references public.inventory_items (id) on delete set null,
  created_at               timestamptz not null default now()
);

create table public.store_daily_snapshots (
  id            uuid primary key default gen_random_uuid(),
  store_item_id uuid not null references public.store_items (id) on delete cascade,
  date          date not null default ((now() at time zone 'Asia/Colombo')::date),
  opening_stock numeric(14,3) not null default 0,
  stock_in      numeric(14,3) not null default 0,
  stock_out     numeric(14,3) not null default 0,
  closing_stock numeric(14,3) not null default 0,
  unique (store_item_id, date)
);
create index if not exists store_daily_snapshots_date_idx on public.store_daily_snapshots (date);
create index if not exists store_daily_snapshots_item_date_idx on public.store_daily_snapshots (store_item_id, date);

create table public.store_transactions (
  id                uuid primary key default gen_random_uuid(),
  store_item_id     uuid not null references public.store_items (id) on delete cascade,
  type              text not null check (type in ('IN', 'OUT')),
  quantity          numeric(14,3) not null check (quantity > 0),
  reason            text,
  issued_to_kitchen boolean not null default false,
  created_by        uuid references public.staff_profiles (id),
  created_at        timestamptz not null default now()
);
create index if not exists store_transactions_item_idx on public.store_transactions (store_item_id);
create index if not exists store_transactions_created_at_idx on public.store_transactions (created_at);

-- 3.10b Extra folio charges (overtime, minibar, laundry...)
create table public.booking_charges (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  description varchar(160) not null,
  amount      numeric(12,2) not null check (amount > 0),
  created_by  uuid references public.staff_profiles (id),
  created_at  timestamptz not null default now()
);
create index idx_booking_charges_booking on public.booking_charges (booking_id);

-- 3.10c Advance payments — money a guest pays up front, before checkout.
-- Kept separate from total_folio_amount: revenue is still recognised in
-- full at checkout, but the cash itself is counted on the day it was
-- actually received (see migration-036 for the full rationale).
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
create index idx_booking_advance_payments_booking on public.booking_advance_payments (booking_id);
create index idx_booking_advance_payments_date on public.booking_advance_payments (date);

-- 3.10d Cashier float ("petty cash") — the restaurant cashier's starting
-- cash for the day, entered once at shift-open. Its own tiny table, NOT a
-- cash_movements row, since the float is the same fixed amount handed
-- over shift to shift, not new money — feeding it into the accumulating
-- Cash Book/Daily Summary ledgers would make the running balance grow by
-- the float amount every single day, which is wrong. Used only by the
-- Simple Report (finance/simple-report).
create table public.cashier_float (
  id         uuid primary key default gen_random_uuid(),
  date       date not null unique default ((now() at time zone 'Asia/Colombo')::date),
  amount     numeric(12,2) not null default 0 check (amount >= 0),
  set_by     uuid references public.staff_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_cashier_float_date on public.cashier_float (date);

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
  date        date not null default ((now() at time zone 'Asia/Colombo')::date),
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
  date        date not null default ((now() at time zone 'Asia/Colombo')::date),
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
  date              date not null default ((now() at time zone 'Asia/Colombo')::date),
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
  date              date not null default ((now() at time zone 'Asia/Colombo')::date),
  description       text,
  created_by        uuid references public.staff_profiles (id),
  created_at        timestamptz not null default now()
);

-- 3.11g Purchasing — a supplier bill's items top up inventory stock and
-- post one matching expense, all via rpc_record_purchase (see section 6b).
create table public.purchases (
  id            uuid primary key default gen_random_uuid(),
  supplier_name varchar(140),
  purchase_date date not null default ((now() at time zone 'Asia/Colombo')::date),
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
-- 6b. RPC — lazily assign a bill number
--     Called the first time a bill is printed or an order is settled, never
--     at insert time, so an opened-then-abandoned order never burns a
--     number. Row-locked so a double-click can't hand out two numbers.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_ensure_order_number(p_order_id uuid)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_role   staff_role;
  v_number int;
begin
  v_role := public.get_my_role();
  if v_role is null then
    raise exception 'Not authorized.';
  end if;

  select order_number into v_number
  from public.restaurant_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_number is null then
    v_number := nextval('public.restaurant_orders_order_number_seq');
    update public.restaurant_orders set order_number = v_number where id = p_order_id;
  end if;

  return v_number;
end;
$$;

grant execute on function public.rpc_ensure_order_number(uuid) to authenticated;

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
            (case when new.quantity_in_stock <= 0 then 'critical' else 'warning' end)::log_severity,
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
  p_payment_method payment_method default 'cash',
  p_date           date default ((now() at time zone 'Asia/Colombo')::date), -- lets a bill be entered against a past date, e.g. yesterday's delivery
  p_division       expense_division default 'restaurant' -- which P&L this purchase's expense counts against
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

  insert into public.purchases (supplier_name, notes, total_amount, created_by, purchase_date)
  values (
    nullif(trim(coalesce(p_supplier_name, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    v_total,
    auth.uid(),
    coalesce(p_date, (now() at time zone 'Asia/Colombo')::date)
  )
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
    coalesce(p_date, (now() at time zone 'Asia/Colombo')::date),
    trim('Stock purchase' || case when nullif(trim(coalesce(p_supplier_name, '')), '') is not null
      then ' — ' || trim(p_supplier_name) else '' end),
    p_payment_method,
    coalesce(p_division, 'restaurant'),
    auth.uid()
  )
  returning id into v_expense_id;

  update public.purchases set expense_id = v_expense_id where id = v_purchase_id;

  return v_purchase_id;
end $$;

grant execute on function public.rpc_record_purchase(text, text, jsonb, payment_method, date, expense_division) to authenticated;

-- ---------------------------------------------------------------------------
-- 7a. STORE MODULE FUNCTIONS
-- ---------------------------------------------------------------------------
create or replace function public.get_or_create_store_snapshot(
  p_store_item_id uuid,
  p_date          date default ((now() at time zone 'Asia/Colombo')::date)
)
returns public.store_daily_snapshots
language plpgsql
security definer set search_path = public
as $$
declare
  v_snapshot store_daily_snapshots;
  v_opening  numeric;
begin
  select * into v_snapshot from store_daily_snapshots where store_item_id = p_store_item_id and date = p_date;
  if found then
    return v_snapshot;
  end if;

  select closing_stock into v_opening
  from store_daily_snapshots
  where store_item_id = p_store_item_id and date < p_date
  order by date desc
  limit 1;

  if v_opening is null then
    select current_stock into v_opening from store_items where id = p_store_item_id;
    v_opening := coalesce(v_opening, 0);
  end if;

  insert into store_daily_snapshots (store_item_id, date, opening_stock, stock_in, stock_out, closing_stock)
  values (p_store_item_id, p_date, v_opening, 0, 0, v_opening)
  on conflict (store_item_id, date) do nothing
  returning * into v_snapshot;

  if not found then
    select * into v_snapshot from store_daily_snapshots where store_item_id = p_store_item_id and date = p_date;
  end if;

  return v_snapshot;
end;
$$;

create or replace function public.ensure_today_store_snapshots()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.get_or_create_store_snapshot(id, (now() at time zone 'Asia/Colombo')::date) from store_items;
end;
$$;

create or replace function public.rpc_record_store_transaction(
  p_store_item_id uuid,
  p_type          text,
  p_quantity      numeric,
  p_reason        text default null
)
returns public.store_transactions
language plpgsql
security definer set search_path = public
as $$
declare
  v_role     staff_role;
  v_snapshot store_daily_snapshots;
  v_tx       store_transactions;
  v_in       numeric;
  v_out      numeric;
  v_closing  numeric;
  v_today    date := (now() at time zone 'Asia/Colombo')::date;
begin
  v_role := public.get_my_role();
  if v_role is null or v_role not in ('admin', 'manager', 'kitchen_staff') then
    raise exception 'Not authorized to record store stock movements.';
  end if;

  if p_type not in ('IN', 'OUT') then
    raise exception 'type must be IN or OUT';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be greater than 0';
  end if;

  v_snapshot := public.get_or_create_store_snapshot(p_store_item_id, v_today);

  v_in  := v_snapshot.stock_in  + (case when p_type = 'IN'  then p_quantity else 0 end);
  v_out := v_snapshot.stock_out + (case when p_type = 'OUT' then p_quantity else 0 end);
  v_closing := v_snapshot.opening_stock + v_in - v_out;

  if v_closing < 0 then
    raise exception 'Not enough stock in the store for this.';
  end if;

  update store_daily_snapshots
  set stock_in = v_in, stock_out = v_out, closing_stock = v_closing
  where id = v_snapshot.id;

  update store_items set current_stock = v_closing where id = p_store_item_id;

  insert into store_transactions (store_item_id, type, quantity, reason, created_by)
  values (p_store_item_id, p_type, p_quantity, p_reason, auth.uid())
  returning * into v_tx;

  return v_tx;
end;
$$;

-- Issues stock from the store to the kitchen: records the store-side OUT
-- AND (if this store item is linked to a kitchen inventory item) tops up
-- that inventory item's stock — both inside this one function call, so the
-- store and the kitchen's stock can never disagree about an issue that only
-- half-happened.
create or replace function public.rpc_issue_store_to_kitchen(
  p_store_item_id uuid,
  p_quantity      numeric,
  p_note          text default null
)
returns public.store_transactions
language plpgsql
security definer set search_path = public
as $$
declare
  v_role   staff_role;
  v_item   store_items;
  v_tx     store_transactions;
  v_reason text;
begin
  v_role := public.get_my_role();
  if v_role is null or v_role not in ('admin', 'manager', 'kitchen_staff') then
    raise exception 'Not authorized to issue store stock.';
  end if;

  select * into v_item from store_items where id = p_store_item_id;
  if not found then
    raise exception 'Store item not found.';
  end if;

  v_reason := trim('Issued to Kitchen' || case
    when nullif(trim(coalesce(p_note, '')), '') is not null then ' — ' || trim(p_note)
    else '' end);

  v_tx := public.rpc_record_store_transaction(p_store_item_id, 'OUT', p_quantity, v_reason);
  update store_transactions set issued_to_kitchen = true where id = v_tx.id;
  select * into v_tx from store_transactions where id = v_tx.id;

  if v_item.linked_inventory_item_id is not null then
    update inventory_items
    set quantity_in_stock = quantity_in_stock + p_quantity,
        updated_at = now()
    where id = v_item.linked_inventory_item_id;
  end if;

  return v_tx;
end;
$$;

grant execute on function public.get_or_create_store_snapshot(uuid, date) to authenticated;
grant execute on function public.ensure_today_store_snapshots() to authenticated;
grant execute on function public.rpc_record_store_transaction(uuid, text, numeric, text) to authenticated;
grant execute on function public.rpc_issue_store_to_kitchen(uuid, numeric, text) to authenticated;

create or replace view public.v_store_today_inventory as
select
  si.id,
  si.name,
  si.unit,
  si.reorder_level,
  si.linked_inventory_item_id,
  coalesce(ds.opening_stock, si.current_stock)  as opening_stock,
  coalesce(ds.stock_in, 0)                      as stock_in,
  coalesce(ds.stock_out, 0)                     as stock_out,
  coalesce(ds.closing_stock, si.current_stock)  as current_balance,
  (coalesce(ds.closing_stock, si.current_stock) <= si.reorder_level) as low_stock
from store_items si
left join store_daily_snapshots ds
  on ds.store_item_id = si.id and ds.date = (now() at time zone 'Asia/Colombo')::date;

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
alter table public.booking_advance_payments enable row level security;
alter table public.cashier_float          enable row level security;
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
create policy "staff read advance payments" on public.booking_advance_payments for select using (public.get_my_role() is not null);
create policy "pms write advance payments"  on public.booking_advance_payments for insert with check (public.get_my_role() in ('admin','manager','receptionist'));
create policy "pms delete advance payments" on public.booking_advance_payments for delete using (public.get_my_role() in ('admin','manager','receptionist'));
create policy "staff read cashier float" on public.cashier_float for select using (public.get_my_role() is not null);
create policy "cashier write float"      on public.cashier_float for insert with check (public.get_my_role() in ('admin','manager','cashier'));
create policy "cashier update float"     on public.cashier_float for update using (public.get_my_role() in ('admin','manager','cashier')) with check (public.get_my_role() in ('admin','manager','cashier'));

-- 9.5 Finance: admin/manager only
create policy "finance read expenses" on public.expenses for select using (public.get_my_role() in ('admin','manager'));
create policy "finance write expenses" on public.expenses for insert with check (public.get_my_role() in ('admin','manager'));
create policy "finance update expenses" on public.expenses for update using (public.get_my_role() in ('admin','manager')) with check (public.get_my_role() in ('admin','manager'));
create policy "admin delete expenses" on public.expenses for delete using (public.get_my_role() = 'admin');

-- 9.6 System logs: management reads, triggers (security definer) write
create policy "mgmt read logs"        on public.system_logs for select using (public.get_my_role() in ('admin','manager','kitchen_staff'));

-- 9.7 Purchases: any signed-in staff reads; writes only via
-- rpc_record_purchase (security definer, does its own admin/manager check)
create policy "staff read purchases" on public.purchases for select using (public.get_my_role() is not null);
create policy "staff read purchase items" on public.purchase_items for select using (public.get_my_role() is not null);

-- 9.8 Store module: any signed-in staff reads; store_items is writable
-- directly (add/edit item), snapshots/transactions only via the security
-- definer functions above.
create policy "staff read store items" on public.store_items for select using (public.get_my_role() is not null);
create policy "kitchen write store items" on public.store_items for all
  using (public.get_my_role() in ('admin','manager','kitchen_staff'))
  with check (public.get_my_role() in ('admin','manager','kitchen_staff'));
create policy "staff read store snapshots" on public.store_daily_snapshots for select using (public.get_my_role() is not null);
create policy "staff read store transactions" on public.store_transactions for select using (public.get_my_role() is not null);

-- ---------------------------------------------------------------------------
-- 10. REALTIME PUBLICATION (live sync for the UI)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.bookings;
alter publication supabase_realtime add table public.booking_charges;
alter publication supabase_realtime add table public.booking_advance_payments;
alter publication supabase_realtime add table public.cashier_float;
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
alter publication supabase_realtime add table public.store_items;
alter publication supabase_realtime add table public.store_daily_snapshots;
alter publication supabase_realtime add table public.store_transactions;

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


-- ============================================================================
-- RELEASE 1 (go-live 2026-10) — migrations 038–044, folded in for fresh installs
-- Existing databases: run the migration files instead, in order.
-- ============================================================================

-- ---- migration-038-pms-room-integrity.sql ----
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

-- ---- migration-039-audit-log.sql ----
-- ============================================================================
-- Migration 039 — audit log, logged-in user stamping, settled-record guard
-- ----------------------------------------------------------------------------
-- 1. audit_log: who / when / table / row / action / old value / new value /
--    reason, filled by triggers on every money and stock table. Append-only;
--    admins and managers can read it, nobody can write it directly.
-- 2. The "created by" column of each money table is stamped with the
--    logged-in user (auth.uid()) on insert — whatever the client sends.
--    Staff therefore need their own logins for the trail to mean anything.
-- 3. Settled records are protected in the database: a settled bill and its
--    items, a checked-out stay and its charges can only be changed by an
--    ADMIN who has first given a reason (rpc_set_audit_reason, valid for 10
--    minutes). Changes made by the system's own triggers are exempt, and so
--    is updating only the delivery status of a settled delivery order.
-- Safe to re-run.
-- ============================================================================

-- 1 -------------------------------------------------------------------------
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  user_id    uuid,
  user_name  text,
  table_name text not null,
  row_id     text,
  action     text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data   jsonb,
  new_data   jsonb,
  changed    text[],
  reason     text
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_row_idx on public.audit_log (table_name, row_id);

alter table public.audit_log enable row level security;
drop policy if exists "mgmt read audit log" on public.audit_log;
create policy "mgmt read audit log" on public.audit_log for select
  using (public.get_my_role() in ('admin', 'manager'));
revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;

create or replace function public.tg_audit_log_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;
drop trigger if exists trg_audit_log_append_only on public.audit_log;
create trigger trg_audit_log_append_only
before update or delete on public.audit_log
for each row execute function public.tg_audit_log_append_only();

-- reasons: one current reason per user, valid for 10 minutes
create table if not exists public.audit_reasons (
  user_id uuid primary key,
  reason  text not null,
  set_at  timestamptz not null default now()
);
alter table public.audit_reasons enable row level security; -- no policies: only via the RPC below

create or replace function public.rpc_set_audit_reason(p_reason text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null or public.get_my_role() is null then
    raise exception 'Not authorized.';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Give a reason for this change (at least a few words).';
  end if;
  insert into public.audit_reasons (user_id, reason, set_at)
  values (auth.uid(), trim(p_reason), now())
  on conflict (user_id) do update set reason = excluded.reason, set_at = excluded.set_at;
end $$;
grant execute on function public.rpc_set_audit_reason(text) to authenticated;

create or replace function public.current_audit_reason()
returns text
language sql
stable
security definer set search_path = public
as $$
  select reason from public.audit_reasons
  where user_id = auth.uid() and set_at > now() - interval '10 minutes';
$$;

create or replace function public.tg_audit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_changed text[];
begin
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_changed
    from jsonb_object_keys(v_new) k
    where k <> 'updated_at' and v_new -> k is distinct from v_old -> k;
    if v_changed is null then
      return null; -- nothing but updated_at changed
    end if;
  end if;

  insert into public.audit_log (user_id, user_name, table_name, row_id, action, old_data, new_data, changed, reason)
  values (
    auth.uid(),
    (select full_name from public.staff_profiles where id = auth.uid()),
    tg_table_name,
    coalesce(v_new ->> 'id', v_old ->> 'id'),
    tg_op,
    v_old,
    v_new,
    v_changed,
    public.current_audit_reason()
  );
  return null;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'restaurant_orders', 'order_items', 'bookings', 'booking_charges', 'booking_advance_payments',
    'expenses', 'cash_movements', 'cashier_float', 'credit_accounts', 'credit_repayments',
    'credit_adjustments', 'inventory_items', 'store_items', 'store_transactions', 'purchases',
    'purchase_items', 'hotel_settings', 'room_rate_plans', 'menu_items'
  ] loop
    -- some tables (e.g. store_*) are missing on databases where an earlier
    -- migration was never applied — skip them instead of failing
    if to_regclass(format('public.%I', t)) is null then
      raise notice 'audit: table public.% not found — skipped', t;
      continue;
    end if;
    execute format('drop trigger if exists trg_z_audit on public.%I', t);
    execute format('create trigger trg_z_audit after insert or update or delete on public.%I '
                   'for each row execute function public.tg_audit()', t);
  end loop;
end $$;

-- 2 -------------------------------------------------------------------------
-- Stamp the logged-in user into the table's "created by" column on insert.
-- TG_ARGV[0] = column name. Skipped when there is no logged-in user
-- (service role / SQL editor), so scripts keep working.
create or replace function public.tg_stamp_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is not null then
    new := jsonb_populate_record(new, jsonb_build_object(tg_argv[0], auth.uid()));
  end if;
  return new;
end $$;

do $$
declare
  r record;
begin
  for r in select * from (values
    ('restaurant_orders', 'created_by'), ('bookings', 'created_by'), ('booking_charges', 'created_by'),
    ('booking_advance_payments', 'received_by'), ('expenses', 'logged_by'), ('cash_movements', 'logged_by'),
    ('cashier_float', 'set_by'), ('credit_accounts', 'created_by'), ('credit_repayments', 'logged_by'),
    ('credit_adjustments', 'created_by'), ('purchases', 'created_by'), ('store_transactions', 'created_by')
  ) v(tbl, col) loop
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = r.tbl and column_name = r.col) then
      raise notice 'stamp user: public.%.% not found — skipped', r.tbl, r.col;
      continue;
    end if;
    execute format('drop trigger if exists trg_0_stamp_user on public.%I', r.tbl);
    execute format('create trigger trg_0_stamp_user before insert on public.%I '
                   'for each row execute function public.tg_stamp_user(%L)', r.tbl, r.col);
  end loop;
end $$;

-- cashier_float is upserted daily: the person who last set it is who counts
do $$
begin
  if to_regclass('public.cashier_float') is not null then
    drop trigger if exists trg_0_stamp_user_upd on public.cashier_float;
    create trigger trg_0_stamp_user_upd before update on public.cashier_float
    for each row execute function public.tg_stamp_user('set_by');
  end if;
end $$;

-- 3 -------------------------------------------------------------------------
create or replace function public.assert_settled_edit_allowed(p_what text)
returns void
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if public.get_my_role() is distinct from 'admin' then
    raise exception '% can only be changed by an admin (Settings → Settled records).', p_what
      using errcode = '42501';
  end if;
  if public.current_audit_reason() is null then
    raise exception 'Give a reason before changing % (Settings → Settled records).', lower(p_what)
      using errcode = '42501';
  end if;
end $$;

create or replace function public.tg_guard_settled()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_locked boolean := false;
  v_what text;
  v_ref uuid;
begin
  -- changes made by the system's own triggers (folio posting, totals
  -- recalculation, housekeeping…) are part of an action already checked
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  -- maintenance scripts run without a logged-in user (SQL editor)
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'restaurant_orders' then
    v_what := 'A settled bill';
    v_locked := old.order_status = 'completed';
    if v_locked and tg_op = 'UPDATE'
       and (to_jsonb(new) - 'delivery_status' - 'updated_at') = (to_jsonb(old) - 'delivery_status' - 'updated_at') then
      return new; -- delivery status of a settled delivery order may still move on
    end if;
  elsif tg_table_name = 'order_items' then
    v_what := 'A settled bill';
    v_ref := coalesce(new.order_id, old.order_id);
    select o.order_status = 'completed' into v_locked from public.restaurant_orders o where o.id = v_ref;
    if v_locked and tg_op = 'UPDATE'
       and (to_jsonb(new) - 'kot_printed_at') = (to_jsonb(old) - 'kot_printed_at') then
      return new; -- reprinting a ticket
    end if;
  elsif tg_table_name = 'bookings' then
    v_what := 'A checked-out stay';
    v_locked := old.status = 'checked_out';
  elsif tg_table_name = 'booking_charges' then
    v_what := 'A checked-out stay';
    v_ref := coalesce(new.booking_id, old.booking_id);
    select b.status = 'checked_out' into v_locked from public.bookings b where b.id = v_ref;
  end if;

  if coalesce(v_locked, false) then
    perform public.assert_settled_edit_allowed(v_what);
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_0_guard_settled on public.restaurant_orders;
create trigger trg_0_guard_settled before update or delete on public.restaurant_orders
for each row execute function public.tg_guard_settled();
drop trigger if exists trg_0_guard_settled on public.order_items;
create trigger trg_0_guard_settled before insert or update or delete on public.order_items
for each row execute function public.tg_guard_settled();
drop trigger if exists trg_0_guard_settled on public.bookings;
create trigger trg_0_guard_settled before update or delete on public.bookings
for each row execute function public.tg_guard_settled();
drop trigger if exists trg_0_guard_settled on public.booking_charges;
create trigger trg_0_guard_settled before insert or update or delete on public.booking_charges
for each row execute function public.tg_guard_settled();

-- ---- migration-040-shared-revenue.sql ----
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

-- ---- migration-041-bill-number-at-settle.sql ----
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

-- ---- migration-042-open-orders-and-folio.sql ----
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

-- ---- migration-043-backfill-flag-and-rls.sql ----
-- ============================================================================
-- Migration 043 — backfill switched off, RLS tightened, store RLS fixed
-- ----------------------------------------------------------------------------
-- 1. hotel_settings.backfill_enabled (default OFF): while off, the database
--    refuses any backdated "historical" sale, whatever the app does. The
--    /backfill page is admin-only and 404 for everyone else (middleware).
-- 2. RLS review — cashier can open orders and settle bills, but cannot:
--    edit settled records (guard trigger, migration 039), delete expenses,
--    change settings, menu, rooms or tables setup, delete credit accounts,
--    delete advance payments, or see staff accounts.
-- 3. store_items / store_daily_snapshots / store_transactions: RLS was never
--    enabled in schema.sql (only in migration 034) — enable it everywhere.
-- Safe to re-run.
-- ============================================================================

-- 1 -------------------------------------------------------------------------
alter table public.hotel_settings add column if not exists backfill_enabled boolean not null default false;
update public.hotel_settings set backfill_enabled = false;

create or replace function public.tg_block_backfill()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.is_historical
     and (tg_op = 'INSERT' or old.is_historical is distinct from true)
     and not coalesce((select backfill_enabled from public.hotel_settings where id = 1), false) then
    raise exception 'Backfill is switched off — backdated sales are not allowed. An admin can switch it on in Settings.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_0_block_backfill on public.restaurant_orders;
create trigger trg_0_block_backfill
before insert or update of is_historical on public.restaurant_orders
for each row execute function public.tg_block_backfill();

-- backdated stays: a booking can't be CREATED already checked out unless
-- backfill is on (normal stays are checked out via an update)
create or replace function public.tg_block_backfill_booking()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'checked_out'
     and not coalesce((select backfill_enabled from public.hotel_settings where id = 1), false) then
    raise exception 'Backfill is switched off — backdated stays are not allowed. An admin can switch it on in Settings.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_0_block_backfill on public.bookings;
create trigger trg_0_block_backfill
before insert on public.bookings
for each row execute function public.tg_block_backfill_booking();

-- only an admin may flip the switch (managers can still edit other settings)
create or replace function public.tg_backfill_flag_admin_only()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.backfill_enabled is distinct from old.backfill_enabled
     and auth.uid() is not null
     and public.get_my_role() is distinct from 'admin' then
    raise exception 'Only an admin can switch Backfill on or off.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_backfill_flag_admin_only on public.hotel_settings;
create trigger trg_backfill_flag_admin_only
before update of backfill_enabled on public.hotel_settings
for each row execute function public.tg_backfill_flag_admin_only();

-- 2 -------------------------------------------------------------------------
-- restaurant tables: cashiers update status; only management adds/removes
drop policy if exists "pos write tables" on public.restaurant_tables;
drop policy if exists "pos update tables" on public.restaurant_tables;
drop policy if exists "mgmt insert tables" on public.restaurant_tables;
drop policy if exists "mgmt delete tables" on public.restaurant_tables;
create policy "pos update tables" on public.restaurant_tables for update
  using (public.get_my_role() in ('admin', 'manager', 'cashier'))
  with check (public.get_my_role() in ('admin', 'manager', 'cashier'));
create policy "mgmt insert tables" on public.restaurant_tables for insert
  with check (public.get_my_role() in ('admin', 'manager'));
create policy "mgmt delete tables" on public.restaurant_tables for delete
  using (public.get_my_role() in ('admin', 'manager'));

-- orders: explicit WITH CHECK so settling (active → completed) is allowed,
-- while changes to settled bills are stopped by the 039 guard trigger
drop policy if exists "pos update orders" on public.restaurant_orders;
create policy "pos update orders" on public.restaurant_orders for update
  using (public.get_my_role() in ('admin', 'manager', 'cashier', 'kitchen_staff'))
  with check (public.get_my_role() in ('admin', 'manager', 'cashier', 'kitchen_staff'));
-- (no delete policy on orders: nobody deletes them directly; the empty-order
-- purge runs as security definer, voiding uses order_status = cancelled)

-- credit accounts: front desk/cashier may create and rename; only
-- management may delete
drop policy if exists "pms write credit accounts" on public.credit_accounts;
drop policy if exists "staff create credit accounts" on public.credit_accounts;
drop policy if exists "staff update credit accounts" on public.credit_accounts;
drop policy if exists "mgmt delete credit accounts" on public.credit_accounts;
create policy "staff create credit accounts" on public.credit_accounts for insert
  with check (public.get_my_role() in ('admin', 'manager', 'receptionist', 'cashier'));
create policy "staff update credit accounts" on public.credit_accounts for update
  using (public.get_my_role() in ('admin', 'manager', 'receptionist', 'cashier'))
  with check (public.get_my_role() in ('admin', 'manager', 'receptionist', 'cashier'));
create policy "mgmt delete credit accounts" on public.credit_accounts for delete
  using (public.get_my_role() in ('admin', 'manager'));

-- advance payments are money received: only management may delete one
drop policy if exists "pms delete advance payments" on public.booking_advance_payments;
create policy "pms delete advance payments" on public.booking_advance_payments for delete
  using (public.get_my_role() in ('admin', 'manager'));

-- 3 -------------------------------------------------------------------------
-- (skipped where the store tables don't exist — migration 034 never applied)
do $$
declare
  t text;
begin
  foreach t in array array['store_items', 'store_daily_snapshots', 'store_transactions'] loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('alter table public.%I enable row level security', t);
    else
      raise notice 'public.% not found — skipped', t;
    end if;
  end loop;
end $$;

-- ---- migration-044-stock-movements-opening.sql ----
-- ============================================================================
-- Migration 044 — stock movement history + opening stock count
-- ----------------------------------------------------------------------------
-- 1. stock_movements: one row per change of inventory_items.quantity_in_stock
--    (delta + resulting quantity + who + why), written by trigger so every
--    path is covered:
--      opening     rpc_record_opening_stock (go-live count / stock take)
--      sale        recipe deduction when a bill is settled
--      purchase    supplier bill (rpc_record_purchase) in the same transaction
--      adjustment  anything else (manual +/- on the Inventory screen)
-- 2. rpc_record_opening_stock(items, note): sets each item to the COUNTED
--    quantity (absolute, >= 0) in one transaction; optional unit cost.
-- Read-only for staff; rows are only written by the trigger.
-- Safe to re-run.
-- ============================================================================

create table if not exists public.stock_movements (
  id                bigint generated always as identity primary key,
  inventory_item_id uuid not null references public.inventory_items (id) on delete cascade,
  movement_type     text not null check (movement_type in ('opening', 'sale', 'purchase', 'adjustment')),
  quantity          numeric(14,3) not null,           -- signed change
  quantity_after    numeric(14,3) not null,
  note              text,
  created_by        uuid references public.staff_profiles (id) default auth.uid(),
  created_at        timestamptz not null default now()
);
create index if not exists stock_movements_item_idx on public.stock_movements (inventory_item_id, created_at desc);

alter table public.stock_movements enable row level security;
drop policy if exists "staff read stock movements" on public.stock_movements;
create policy "staff read stock movements" on public.stock_movements for select
  using (public.get_my_role() is not null);
revoke insert, update, delete, truncate on public.stock_movements from anon, authenticated;

create or replace function public.tg_stock_movement()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_kind text := nullif(current_setting('app.stock_movement', true), '');
  v_note text := nullif(current_setting('app.stock_movement_note', true), '');
begin
  if new.quantity_in_stock is not distinct from old.quantity_in_stock then
    return null;
  end if;
  if v_kind is null then
    if pg_trigger_depth() > 1 then
      v_kind := 'sale'; -- recipe deduction fired by settling a bill
    else
      v_kind := 'adjustment';
      -- a purchase line inserted in this same transaction = supplier bill
      -- (dynamic so a database without purchase_items doesn't fail here)
      if to_regclass('public.purchase_items') is not null then
        execute 'select case when exists (select 1 from public.purchase_items
                                          where inventory_item_id = $1 and created_at = now())
                             then ''purchase'' else ''adjustment'' end'
          into v_kind using new.id;
      end if;
    end if;
  end if;

  insert into public.stock_movements (inventory_item_id, movement_type, quantity, quantity_after, note, created_by)
  values (new.id, v_kind, new.quantity_in_stock - old.quantity_in_stock, new.quantity_in_stock, v_note,
          (select id from public.staff_profiles where id = auth.uid()));
  return null;
end $$;

drop trigger if exists trg_d_stock_movement on public.inventory_items;
create trigger trg_d_stock_movement
after update of quantity_in_stock on public.inventory_items
for each row execute function public.tg_stock_movement();

create or replace function public.rpc_record_opening_stock(p_items jsonb, p_note text default null)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  v_count int := 0;
begin
  if public.get_my_role() not in ('admin', 'manager') then
    raise exception 'Only an admin or manager can record an opening stock count.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Enter at least one counted item.';
  end if;

  perform set_config('app.stock_movement', 'opening', true);
  perform set_config('app.stock_movement_note',
                     coalesce(nullif(trim(p_note), ''), 'Opening stock count'), true);

  for r in
    select (x ->> 'inventory_item_id')::uuid as item_id,
           (x ->> 'quantity')::numeric as qty,
           nullif(x ->> 'unit_cost', '')::numeric as unit_cost
    from jsonb_array_elements(p_items) x
  loop
    if r.qty is null or r.qty < 0 then
      raise exception 'Counted quantity must be zero or more.';
    end if;
    if r.unit_cost is not null and r.unit_cost < 0 then
      raise exception 'Unit cost must be zero or more.';
    end if;
    update public.inventory_items
    set quantity_in_stock = round(r.qty, 3),
        unit_cost = coalesce(r.unit_cost, unit_cost)
    where id = r.item_id;
    if not found then
      raise exception 'Inventory item % not found.', r.item_id;
    end if;
    v_count := v_count + 1;
  end loop;

  perform set_config('app.stock_movement', '', true);
  perform set_config('app.stock_movement_note', '', true);
  return v_count;
end $$;

grant execute on function public.rpc_record_opening_stock(jsonb, text) to authenticated;
