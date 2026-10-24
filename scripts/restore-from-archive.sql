-- ============================================================================
-- RESTORE public tables from archive_20261020 (undo the go-live reset)
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor. ONE transaction. Same dry-run convention as
-- reset-for-go-live.sql: with v_commit := false it does the whole restore,
-- checks it, then raises an error containing the report — which rolls
-- everything back. Set v_commit := true to really restore.
--
-- What it does:
--   1. Checks the archive is intact (md5 vs _manifest).
--   2. Saves the CURRENT public data into a new schema pre_restore_<timestamp>
--      first, so data entered after go-live is never lost by restoring.
--   3. Empties the restored tables (TRUNCATE … CASCADE — any other table
--      that references them is emptied too and listed in the report; its
--      rows are in the pre_restore_ snapshot).
--   4. Copies rows back from the archive with user triggers off (so folio,
--      stock and order-total triggers don't double-apply). Columns added
--      after the archive (e.g. by release-1 migrations) take their defaults;
--      generated columns are recomputed.
--   5. Resets every sequence owned by a restored column to max(column),
--      e.g. the bill-number counter.
--   6. Verifies each table matches the archive row-for-row (md5 over the
--      shared columns); any mismatch aborts and rolls back.
--
-- v_include_master := false restores only TRANSACTIONAL tables and keeps
-- today's master data (menu, rooms, rates, users, settings as they are now).
-- ============================================================================
do $$
declare
  -- ======================== EDIT THESE SETTINGS ============================
  v_commit         boolean := false;   -- false = dry run (rolls back), true = really restore
  v_include_master boolean := true;    -- false = transactional tables only
  -- =========================================================================
  c_archive constant text := 'archive_20261020';
  c_master text[] := array['staff_profiles','room_types','room_rate_plans','rooms','restaurant_tables',
    'menu_categories','menu_items','menu_recipe_ingredients','inventory_items','store_items',
    'expense_categories','hotel_settings','credit_accounts','guests'];
  v_snap text := 'pre_restore_' || to_char(now() at time zone 'Asia/Colombo', 'YYYYMMDD_HH24MISS');
  v_set text[];
  v_done text[] := '{}';
  v_before jsonb := '{}';
  r record;
  t text;
  v_n bigint;
  v_m bigint;
  v_md5 text;
  v_cols text;
  v_all_cols text;
  v_progress boolean;
  v_bad text := '';
  v_report text := '';
begin
  if not exists (select 1 from pg_namespace where nspname = c_archive) then
    raise exception 'REFUSED: schema % not found.', c_archive;
  end if;

  -- 1. archive intact?
  for r in select * from archive_20261020._manifest order by table_name loop
    if to_regclass(format('%I.%I', c_archive, r.table_name)) is null then
      v_bad := v_bad || format(E'\n  %s: missing from archive', r.table_name); continue;
    end if;
    execute format('select md5(coalesce(string_agg(t::text, E''\n'' order by t::text), '''')) from %I.%I t',
                   c_archive, r.table_name) into v_md5;
    if v_md5 <> r.md5 then v_bad := v_bad || format(E'\n  %s: archive copy damaged', r.table_name); end if;
  end loop;
  if v_bad <> '' then raise exception E'REFUSED — archive check failed:%', v_bad; end if;

  -- tables to restore: archived, still present in public, filtered by mode
  select array_agg(m.table_name order by m.table_name) into v_set
  from archive_20261020._manifest m
  where to_regclass(format('public.%I', m.table_name)) is not null
    and (v_include_master or not (m.table_name = any (c_master)));

  for r in select table_name from archive_20261020._manifest
           where to_regclass(format('public.%I', table_name)) is null loop
    v_report := v_report || format(E'\n  SKIPPED %s: no longer exists in public', r.table_name);
  end loop;

  -- 2. snapshot current state
  execute format('create schema %I', v_snap);
  execute format('revoke all on schema %I from public, anon, authenticated', v_snap);
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' loop
    execute format('create table %I.%I as table public.%I', v_snap, r.relname, r.relname);
    execute format('alter table %I.%I enable row level security', v_snap, r.relname);
    execute format('select count(*) from public.%I', r.relname) into v_n;
    v_before := v_before || jsonb_build_object(r.relname, v_n);
  end loop;

  -- 3. empty + quiet the target tables
  foreach t in array v_set loop
    execute format('alter table public.%I disable trigger user', t);
  end loop;
  execute 'truncate table ' || (select string_agg(format('public.%I', x), ', ') from unnest(v_set) x) || ' cascade';

  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not (c.relname = any (v_set)) loop
    execute format('select count(*) from public.%I', r.relname) into v_n;
    if v_n = 0 and (v_before ->> r.relname)::bigint > 0 then
      v_report := v_report || format(E'\n  EMPTIED BY CASCADE %s (%s rows, saved in %s)',
                                     r.relname, v_before ->> r.relname, v_snap);
    end if;
  end loop;

  -- 4. copy back in foreign-key order (parents before children)
  loop
    v_progress := false;
    foreach t in array v_set loop
      continue when t = any (v_done);
      if exists (
        select 1 from pg_constraint k
        join pg_class ch on ch.oid = k.conrelid  join pg_namespace chn on chn.oid = ch.relnamespace
        join pg_class pa on pa.oid = k.confrelid join pg_namespace pan on pan.oid = pa.relnamespace
        where k.contype = 'f' and chn.nspname = 'public' and pan.nspname = 'public'
          and ch.relname = t and pa.relname <> t
          and pa.relname = any (v_set) and not (pa.relname = any (v_done))) then
        continue;
      end if;
      select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position) into v_cols
      from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = t and c.is_generated = 'NEVER'
        and exists (select 1 from information_schema.columns a
                    where a.table_schema = c_archive and a.table_name = t and a.column_name = c.column_name);
      execute format('insert into public.%I (%s) select %s from %I.%I', t, v_cols, v_cols, c_archive, t);
      v_done := v_done || t;
      v_progress := true;
    end loop;
    exit when cardinality(v_done) = cardinality(v_set);
    if not v_progress then
      raise exception 'Could not order tables by foreign keys (cycle?): %',
        (select string_agg(x, ', ') from unnest(v_set) x where not (x = any (v_done)));
    end if;
  end loop;

  foreach t in array v_set loop
    execute format('alter table public.%I enable trigger user', t);
  end loop;

  -- 5. sequences owned by restored columns → max(column)
  for r in
    select s.relname as seq, tb.relname as tbl, a.attname as col
    from pg_class s
    join pg_depend d on d.objid = s.oid and d.deptype = 'a'
    join pg_class tb on tb.oid = d.refobjid
    join pg_namespace n on n.oid = tb.relnamespace
    join pg_attribute a on a.attrelid = tb.oid and a.attnum = d.refobjsubid
    where s.relkind = 'S' and n.nspname = 'public' and tb.relname = any (v_set)
  loop
    execute format('select max(%I)::bigint from public.%I', r.col, r.tbl) into v_n;
    if v_n is null then
      perform setval(format('public.%I', r.seq)::regclass, 1, false);
    else
      perform setval(format('public.%I', r.seq)::regclass, v_n, true);
    end if;
    v_report := v_report || format(E'\n  sequence %s → next value %s', r.seq, coalesce(v_n + 1, 1));
  end loop;

  -- 6. verify row-for-row over the columns both sides share
  foreach t in array v_set loop
    select string_agg(format('%I', c.column_name), ', ' order by c.column_name) into v_all_cols
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = t
      and exists (select 1 from information_schema.columns a
                  where a.table_schema = c_archive and a.table_name = t and a.column_name = c.column_name);
    execute format('select count(*), md5(coalesce(string_agg(x::text, E''\n'' order by x::text), '''')) '
                   'from (select %s from public.%I) x', v_all_cols, t) into v_n, v_md5;
    execute format('select count(*) from %I.%I', c_archive, t) into v_m;
    execute format('select case when md5(coalesce(string_agg(x::text, E''\n'' order by x::text), '''')) = %L '
                   'then 1 else 0 end from (select %s from %I.%I) x', v_md5, v_all_cols, c_archive, t) into v_m;
    if v_m <> 1 then
      raise exception 'ABORTED: % does not match the archive after restore — rolled back, nothing changed.', t;
    end if;
    v_report := v_report || format(E'\n  %-26s %6s → %s rows  OK', t, v_before ->> t, v_n);
  end loop;

  v_report := format(E'\n=== RESTORE (%s tables, master included: %s) — current data saved in schema %s ===',
                     cardinality(v_set), v_include_master, v_snap) || v_report;

  if not v_commit then
    raise exception E'DRY RUN OK — everything above was rolled back, NOTHING changed.%', v_report
      using hint = 'To really restore, set v_commit := true at the top and run again.';
  end if;
  raise notice '%', v_report;
end $$;

-- Reached only when v_commit = true.
select m.table_name, m.row_count as archived_rows,
       (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', m.table_name),
                                            false, true, '')))[1]::text as public_rows_now
from archive_20261020._manifest m
order by 1;
