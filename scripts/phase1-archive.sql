-- ============================================================================
-- PHASE 1.2 — in-database archive  →  schema archive_20261020
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor AFTER the local backup has finished and
-- while nobody is using the system (POS/reception closed for the night).
--
-- * Copies EVERY public table (master + transactional) into archive_20261020
--   from ONE consistent snapshot (repeatable read), plus storage object
--   metadata, sequence values and per-account credit balances.
-- * Writes archive_20261020._manifest: row count + md5 fingerprint of each
--   table at copy time. verify / reset / restore all check against it.
-- * Locks the schema down: no usage for anon/authenticated/public, RLS on
--   with no policies. Do NOT add it to "Exposed schemas" in API settings.
-- * Creates nothing in public and changes no existing data.
-- * Refuses to run if archive_20261020 already exists (never overwrites).
-- ============================================================================
begin isolation level repeatable read;

do $$
declare
  r record;
  v_n bigint;
  v_md5 text;
begin
  if exists (select 1 from pg_namespace where nspname = 'archive_20261020') then
    raise exception 'archive_20261020 already exists — not overwriting it. If a previous attempt is incomplete, '
                    'rename it first: alter schema archive_20261020 rename to archive_20261020_attempt1;';
  end if;

  create schema archive_20261020;
  revoke all on schema archive_20261020 from public, anon, authenticated;
  comment on schema archive_20261020 is
    'Pre go-live snapshot taken 2026-10-20. Read-only archive. Never expose through the API.';

  create table archive_20261020._manifest (
    table_name  text primary key,
    row_count   bigint not null,
    md5         text not null,
    archived_at timestamptz not null default now()
  );

  for r in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  loop
    execute format('create table archive_20261020.%I as table public.%I', r.relname, r.relname);
    -- fingerprint the source rows (same snapshot as the copy)
    execute format(
      'select count(*), md5(coalesce(string_agg(t::text, E''\n'' order by t::text), '''')) from public.%I t',
      r.relname) into v_n, v_md5;
    insert into archive_20261020._manifest (table_name, row_count, md5) values (r.relname, v_n, v_md5);
  end loop;

  -- storage object metadata (the files themselves are in the local backup)
  create table archive_20261020._storage_objects as
    select bucket_id, name, created_at, metadata from storage.objects;

  -- sequence positions (bill number counter)
  create table archive_20261020._sequences as
    select schemaname, sequencename, last_value from pg_sequences where schemaname = 'public';

  -- credit balances, same formula as the Credit Accounts page:
  -- credit stays + credit bills + adjustments - repayments
  create table archive_20261020._credit_balances as
    select a.id as credit_account_id, a.name,
           coalesce(b.s, 0) as stays, coalesce(o.s, 0) as bills,
           coalesce(ad.s, 0) as adjustments, coalesce(rp.s, 0) as repayments,
           coalesce(b.s, 0) + coalesce(o.s, 0) + coalesce(ad.s, 0) - coalesce(rp.s, 0) as balance
    from public.credit_accounts a
    left join (select credit_account_id, sum(total_folio_amount) s from public.bookings
               where payment_method = 'credit' and credit_account_id is not null group by 1) b on b.credit_account_id = a.id
    left join (select credit_account_id, sum(total_amount) s from public.restaurant_orders
               where payment_method = 'credit' and credit_account_id is not null group by 1) o on o.credit_account_id = a.id
    left join (select credit_account_id, sum(amount) s from public.credit_adjustments group by 1) ad on ad.credit_account_id = a.id
    left join (select credit_account_id, sum(amount) s from public.credit_repayments group by 1) rp on rp.credit_account_id = a.id;

  -- lock every archive table: no grants, RLS on with no policies
  for r in select tablename from pg_tables where schemaname = 'archive_20261020' loop
    execute format('revoke all on archive_20261020.%I from public, anon, authenticated', r.tablename);
    execute format('alter table archive_20261020.%I enable row level security', r.tablename);
  end loop;
end $$;

commit;

-- Result: what was archived
select table_name, row_count, archived_at
from archive_20261020._manifest
order by table_name;
