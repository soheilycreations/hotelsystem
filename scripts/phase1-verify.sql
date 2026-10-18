-- ============================================================================
-- PHASE 1.7 — verify archive_20261018 against the live public tables
-- ----------------------------------------------------------------------------
-- Read-only. Run in the Supabase SQL editor after phase1-archive.sql.
-- One row per table:
--   manifest_rows / archive_rows / public_rows  — row counts
--   archive_intact  — archive copy is byte-identical to what was fingerprinted
--   public_same     — live table is still identical to the archive
--   status          — OK | CHANGED SINCE ARCHIVE | ARCHIVE DAMAGED | MISSING
-- Every row must say OK before running the reset. CHANGED means someone used
-- the system after the archive was taken — the reset will refuse; re-archive.
-- ============================================================================
create or replace function pg_temp.fp(p_schema text, p_table text, out n bigint, out h text)
language plpgsql as $$
begin
  if to_regclass(format('%I.%I', p_schema, p_table)) is null then
    n := null; h := null; return;
  end if;
  execute format('select count(*), md5(coalesce(string_agg(t::text, E''\n'' order by t::text), '''')) from %I.%I t',
                 p_schema, p_table) into n, h;
end $$;

with live as (
  select c.relname as table_name
  from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relkind = 'r'
),
names as (
  select table_name from archive_20261018._manifest
  union
  select table_name from live
),
cmp as (
  select nm.table_name, m.row_count as manifest_rows, m.md5 as manifest_md5,
         (pg_temp.fp('archive_20261018', nm.table_name)).*,
         (pg_temp.fp('public', nm.table_name)) as pub
  from names nm
  left join archive_20261018._manifest m using (table_name)
)
select table_name,
       manifest_rows,
       n           as archive_rows,
       (pub).n     as public_rows,
       h = manifest_md5        as archive_intact,
       (pub).h = manifest_md5  as public_same,
       case
         when manifest_rows is null then 'MISSING FROM ARCHIVE (new table?)'
         when n is null             then 'MISSING: archive table dropped'
         when (pub).n is null       then 'MISSING: public table dropped'
         when h <> manifest_md5     then 'ARCHIVE DAMAGED'
         when (pub).h <> manifest_md5 then 'CHANGED SINCE ARCHIVE'
         else 'OK'
       end as status
from cmp
order by (case when manifest_rows is not null and n is not null and (pub).n is not null
               and h = manifest_md5 and (pub).h = manifest_md5 then 1 else 0 end), table_name;
