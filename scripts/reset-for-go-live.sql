-- ============================================================================
-- PHASE 3 — reset transactional data for go-live (2026-10-21)
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor. Everything happens in ONE transaction.
--
-- DRY RUN (default, v_commit := false): does the whole reset, then raises an
-- error whose text is the full report. Raising the error is what guarantees
-- Postgres rolls back every change, so nothing is saved. The editor shows
-- the report as a red error box — that is expected for a dry run.
--
-- REAL RUN: set v_commit := true, run again. The final grid shows row counts
-- per table and the carried-forward credit balances.
--
-- Safety checks (refuses to run, nothing changed):
--   * archive_20261020 must exist and every public table must be identical
--     (row count + md5) to what was archived — i.e. nobody used the system
--     since the archive. If not: re-run phase1-archive (rename the old one).
--   * any public table not classified below → refuse (unknown data).
--   * v_keep_inhouse ids must be currently checked_in, and no two of them
--     on the same room.
--
-- Keeps:   staff, roles, settings (service charge, logo, QR), rooms, room
--          types, rate plans, tables, menu, categories, recipes, inventory &
--          store item definitions, expense categories, credit account names,
--          guest registry.
-- Carries forward: pending bookings arriving >= 2026-10-21 + their advances;
--          events on/after 2026-10-21 not cancelled; the in-house bookings
--          you list in v_keep_inhouse with charges, advances and open
--          room-service orders; each credit account's balance as ONE opening
--          entry dated 2026-10-20.
-- Clears:  everything else transactional (orders, KOTs, bills, folios,
--          expenses, cash book, floats, purchases, store movements,
--          activity feed). Bill counter restarts at 1.
-- Zeroes:  inventory_items.quantity_in_stock, store_items.current_stock.
-- Sets:    all rooms vacant (carried in-house rooms occupied), all tables
--          vacant, a Rs 0 cashier float for 2026-10-21 (enter the counted
--          cash tomorrow on Finance → Simple Report).
-- ============================================================================
do $$
declare
  -- ======================== EDIT THESE TWO SETTINGS ========================
  v_commit        boolean := false;      -- false = dry run (rolls back), true = really reset
  v_keep_inhouse  uuid[]  := '{}';       -- booking_ids from report section A to carry forward,
                                         -- e.g. '{b1c2..., 7f3e...}'  (empty = clear all in-house)
  -- =========================================================================
  c_archive  constant text := 'archive_20261020';
  c_golive   constant date := '2026-10-21';
  c_cf_date  constant date := '2026-10-20';
  c_cf_text  constant text := 'Opening balance carried forward (2026-10-20)';
  v_golive_ts timestamptz := (c_golive::timestamp at time zone 'Asia/Colombo');

  c_master text[] := array['staff_profiles','room_types','room_rate_plans','rooms','restaurant_tables',
    'menu_categories','menu_items','menu_recipe_ingredients','inventory_items','store_items',
    'expense_categories','hotel_settings','credit_accounts','guests'];
  c_trans  text[] := array['bookings','booking_charges','booking_advance_payments','restaurant_orders',
    'order_items','expenses','cash_movements','cashier_float','credit_repayments','credit_adjustments',
    'purchases','purchase_items','store_transactions','store_daily_snapshots','event_bookings','system_logs',
    -- Release 1 tables (present only after migrations 039–044 are deployed)
    'bill_counters','audit_log','audit_reasons','stock_movements'];
  -- tables whose user triggers must not fire while we rewrite them
  c_quiet  text[] := array['bookings','booking_charges','booking_advance_payments','restaurant_orders',
    'order_items','event_bookings','inventory_items','store_items','rooms','restaurant_tables'];

  r record;
  t text;
  v_n bigint;
  v_md5 text;
  v_bad text := '';
  v_report text := '';
  v_cols text;
  v_cf_total numeric(14,2) := 0;
begin
  -- ------------------------------------------------------------ safety checks
  if not exists (select 1 from pg_namespace where nspname = c_archive) then
    raise exception 'REFUSED: schema % does not exist. Run scripts/phase1-archive.sql first.', c_archive;
  end if;

  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' order by 1 loop
    if not (r.relname = any (c_master || c_trans)) then
      v_bad := v_bad || format(E'\n  %s: not classified (unknown table — refusing to guess)', r.relname);
      continue;
    end if;
    select m.md5 into v_md5 from archive_20261020._manifest m where m.table_name = r.relname;
    if v_md5 is null then
      v_bad := v_bad || format(E'\n  %s: not in archive', r.relname);
      continue;
    end if;
    execute format('select count(*), md5(coalesce(string_agg(t::text, E''\n'' order by t::text), '''')) from public.%I t',
                   r.relname) into v_n, v_md5;
    if v_md5 is distinct from (select m.md5 from archive_20261020._manifest m where m.table_name = r.relname) then
      v_bad := v_bad || format(E'\n  %s: changed since archive (now %s rows, archived %s)', r.relname, v_n,
                               (select m.row_count from archive_20261020._manifest m where m.table_name = r.relname));
    end if;
    execute format('select md5(coalesce(string_agg(t::text, E''\n'' order by t::text), '''')) from %I.%I t',
                   c_archive, r.relname) into v_md5;
    if v_md5 is distinct from (select m.md5 from archive_20261020._manifest m where m.table_name = r.relname) then
      v_bad := v_bad || format(E'\n  %s: ARCHIVE COPY DAMAGED', r.relname);
    end if;
  end loop;
  if v_bad <> '' then
    raise exception E'REFUSED — archive check failed, nothing was changed:%', v_bad;
  end if;

  if exists (select 1 from unnest(v_keep_inhouse) k(id)
             where not exists (select 1 from public.bookings b where b.id = k.id and b.status = 'checked_in')) then
    raise exception 'REFUSED: v_keep_inhouse contains an id that is not a checked-in booking: %',
      (select string_agg(k.id::text, ', ') from unnest(v_keep_inhouse) k(id)
       where not exists (select 1 from public.bookings b where b.id = k.id and b.status = 'checked_in'));
  end if;
  if exists (select room_id from public.bookings where id = any (v_keep_inhouse) and room_id is not null
             group by room_id having count(*) > 1) then
    raise exception 'REFUSED: two carried-forward in-house bookings share one room — keep only one per room.';
  end if;

  -- ------------------------------------------------ stash what carries forward
  create temp table cf_bookings on commit drop as
    select * from public.bookings
    where (status = 'pending' and check_in_date >= v_golive_ts)
       or id = any (v_keep_inhouse);
  create temp table cf_charges  on commit drop as
    select * from public.booking_charges where booking_id in (select id from cf_bookings);
  create temp table cf_advances on commit drop as
    select * from public.booking_advance_payments where booking_id in (select id from cf_bookings);
  create temp table cf_orders   on commit drop as
    select * from public.restaurant_orders
    where order_status = 'active' and booking_id = any (v_keep_inhouse);
  update cf_orders set order_number = null;   -- bill numbers restart; number is re-issued at print/settle
  create temp table cf_items    on commit drop as
    select * from public.order_items where order_id in (select id from cf_orders);
  create temp table cf_events   on commit drop as
    select * from public.event_bookings where event_date >= c_golive and status <> 'cancelled';
  create temp table cf_credit   on commit drop as
    select a.id, a.name,
           coalesce((select sum(total_folio_amount) from public.bookings
                     where payment_method = 'credit' and credit_account_id = a.id), 0)
         + coalesce((select sum(total_amount) from public.restaurant_orders
                     where payment_method = 'credit' and credit_account_id = a.id), 0)
         + coalesce((select sum(amount) from public.credit_adjustments where credit_account_id = a.id), 0)
         - coalesce((select sum(amount) from public.credit_repayments where credit_account_id = a.id), 0)
           as balance
    from public.credit_accounts a;

  -- -------------------------------------------------------------- the reset
  foreach t in array c_quiet loop
    execute format('alter table public.%I disable trigger user', t);
  end loop;

  execute 'truncate table ' ||
          (select string_agg(format('public.%I', x), ', ') from unnest(c_trans) x
           where to_regclass(format('public.%I', x)) is not null) ||
          ' restart identity';   -- also restarts the bill-number sequence / per-day counters

  -- re-insert carried-forward rows (generated columns are recomputed)
  for r in select * from (values ('bookings','cf_bookings', 1), ('booking_charges','cf_charges', 2),
                                 ('booking_advance_payments','cf_advances', 3), ('restaurant_orders','cf_orders', 4),
                                 ('order_items','cf_items', 5), ('event_bookings','cf_events', 6)) v(dst, src, ord)
           order by ord loop
    select string_agg(format('%I', column_name), ', ' order by ordinal_position) into v_cols
    from information_schema.columns
    where table_schema = 'public' and table_name = r.dst and is_generated = 'NEVER';
    execute format('insert into public.%I (%s) select %s from %I', r.dst, v_cols, v_cols, r.src);
  end loop;

  update public.rooms set status = 'vacant';
  update public.rooms set status = 'occupied'
    where id in (select room_id from cf_bookings where status = 'checked_in');
  update public.restaurant_tables set current_status = 'vacant';
  update public.inventory_items set quantity_in_stock = 0;
  update public.store_items set current_stock = 0;

  insert into public.credit_adjustments (credit_account_id, amount, date, description)
    select id, balance, c_cf_date, c_cf_text from cf_credit where balance > 0;
  insert into public.credit_repayments (credit_account_id, amount, payment_method, date, description)
    select id, -balance, 'bank_transfer', c_cf_date, c_cf_text || ' — customer in credit'
    from cf_credit where balance < 0;   -- bank_transfer so it never shows as cash in the drawer

  insert into public.cashier_float (date, amount) values (c_golive, 0);

  insert into public.system_logs (event_type, severity, message)
    values ('GO_LIVE_RESET', 'info',
            format('Transactional data reset for go-live %s. Previous data archived in schema %s.', c_golive, c_archive));

  foreach t in array c_quiet loop
    execute format('alter table public.%I enable trigger user', t);
  end loop;

  -- ------------------------------------------------------------- self-check
  -- credit balances after reset must equal the balances before, per account
  if exists (
    select 1 from cf_credit c
    where c.balance is distinct from
        coalesce((select sum(total_folio_amount) from public.bookings
                  where payment_method = 'credit' and credit_account_id = c.id), 0)
      + coalesce((select sum(total_amount) from public.restaurant_orders
                  where payment_method = 'credit' and credit_account_id = c.id), 0)
      + coalesce((select sum(amount) from public.credit_adjustments where credit_account_id = c.id), 0)
      - coalesce((select sum(amount) from public.credit_repayments where credit_account_id = c.id), 0)) then
    raise exception 'ABORTED: credit balances do not match after reset — rolled back, nothing changed.';
  end if;
  -- carried-forward folios must be untouched
  if exists (select 1 from cf_bookings c join public.bookings b using (id)
             where b.total_folio_amount <> c.total_folio_amount) then
    raise exception 'ABORTED: a carried-forward folio total changed — rolled back, nothing changed.';
  end if;

  -- ----------------------------------------------------------------- report
  v_report := E'\n=== ROW COUNTS AFTER RESET (archived → now) ===';
  for r in select m.table_name, m.row_count from archive_20261020._manifest m order by 1 loop
    execute format('select count(*) from public.%I', r.table_name) into v_n;
    v_report := v_report || format(E'\n  %-26s %6s → %s', r.table_name, r.row_count, v_n);
  end loop;

  v_report := v_report || E'\n=== CARRIED FORWARD BOOKINGS ===';
  for r in select b.guest_name, b.status, rm.room_number, b.check_in_date, b.total_folio_amount,
                  coalesce((select sum(amount) from cf_advances a where a.booking_id = b.id), 0) as adv
           from cf_bookings b left join public.rooms rm on rm.id = b.room_id order by b.check_in_date loop
    v_report := v_report || format(E'\n  %s | room %s | %s | arrival %s | folio %s | advances %s',
      r.status, coalesce(r.room_number, '-'), r.guest_name,
      to_char(r.check_in_date at time zone 'Asia/Colombo', 'YYYY-MM-DD HH24:MI'), r.total_folio_amount, r.adv);
  end loop;
  v_report := v_report || format(E'\n  open room-service orders carried: %s',
                                 (select count(*) from cf_orders));
  v_report := v_report || format(E'\n  events carried: %s', (select count(*) from cf_events));

  v_report := v_report || E'\n=== CREDIT ACCOUNTS (before = after) ===';
  for r in select name, balance from cf_credit order by name loop
    v_report := v_report || format(E'\n  %-30s Rs %s', r.name, r.balance);
    v_cf_total := v_cf_total + r.balance;
  end loop;
  v_report := v_report || format(E'\n  %-30s Rs %s', 'TOTAL', v_cf_total);

  v_report := v_report || format(E'\n=== ROOMS === %s',
    (select string_agg(room_number || '=' || status, ', ' order by room_number) from public.rooms));
  v_report := v_report || format(E'\n=== KEPT SETTINGS === service charge %s%%, logo %s, review QR %s',
    (select service_charge_rate from public.hotel_settings where id = 1),
    (select case when logo_url is null then 'MISSING' else 'set' end from public.hotel_settings where id = 1),
    (select case when review_qr_url is null then 'MISSING' else 'set' end from public.hotel_settings where id = 1));
  v_report := v_report || format(E'\n=== NEXT BILL NUMBER === %s',
    case when to_regclass('public.bill_counters') is not null   -- release 1: per-day numbers
         then '#' || to_char(c_golive, 'YYYYMMDD') || '-001 (first bill settled on ' || c_golive || ')'
         else (select coalesce(last_value + 1, 1)::text
               from pg_sequences where schemaname = 'public' and sequencename = 'restaurant_orders_order_number_seq')
    end);

  if not v_commit then
    raise exception E'DRY RUN OK — everything above was rolled back, NOTHING changed.%', v_report
      using hint = 'Review the report. To really reset, set v_commit := true at the top and run again.';
  end if;

  raise notice '%', v_report;
end $$;

-- Reached only when v_commit = true (a dry run stops at the error above).
select 'rows' as kind, m.table_name as item, m.row_count::text as archived,
       (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', m.table_name),
                                            false, true, '')))[1]::text as now
from archive_20261020._manifest m
union all
select 'credit', a.name, c.balance::text,
       ( coalesce((select sum(total_amount) from public.restaurant_orders
                   where payment_method = 'credit' and credit_account_id = a.id), 0)
       + coalesce((select sum(total_folio_amount) from public.bookings
                   where payment_method = 'credit' and credit_account_id = a.id), 0)
       + coalesce((select sum(amount) from public.credit_adjustments where credit_account_id = a.id), 0)
       - coalesce((select sum(amount) from public.credit_repayments where credit_account_id = a.id), 0))::text
from public.credit_accounts a join archive_20261020._credit_balances c on c.credit_account_id = a.id
order by 1 desc, 2;
