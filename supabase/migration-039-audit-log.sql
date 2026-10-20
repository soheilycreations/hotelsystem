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
