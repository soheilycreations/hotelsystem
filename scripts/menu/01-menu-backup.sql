-- ============================================================================
-- MENU REBUILD — step 1: backup the current menu (no existing data changes)
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor. Creates schema menu_backup_<YYYYMMDD>
-- (Colombo date) with full copies of:
--   menu_categories, menu_items, menu_recipe_ingredients
-- plus _manifest (row count + md5 per table). It only ADDS a schema; nothing
-- in public is touched. Locked from the API (no grants, RLS on).
-- Refuses if today's backup schema already exists.
-- The result grid shows the schema name — note it for the restore script.
-- ============================================================================
do $$
declare
  v_schema text := 'menu_backup_' || to_char(now() at time zone 'Asia/Colombo', 'YYYYMMDD');
  t text;
  v_n bigint;
  v_md5 text;
begin
  if exists (select 1 from pg_namespace where nspname = v_schema) then
    raise exception '% already exists — not overwriting. Rename it first: alter schema % rename to %_old;',
      v_schema, v_schema, v_schema;
  end if;

  execute format('create schema %I', v_schema);
  execute format('revoke all on schema %I from public, anon, authenticated', v_schema);
  execute format('create table %I._manifest (table_name text primary key, row_count bigint not null, '
                 'md5 text not null, backed_up_at timestamptz not null default now())', v_schema);

  foreach t in array array['menu_categories', 'menu_items', 'menu_recipe_ingredients'] loop
    execute format('create table %I.%I as table public.%I', v_schema, t, t);
    execute format('select count(*), md5(coalesce(string_agg(x::text, E''\n'' order by x::text), '''')) '
                   'from public.%I x', t) into v_n, v_md5;
    execute format('insert into %I._manifest (table_name, row_count, md5) values (%L, %s, %L)',
                   v_schema, t, v_n, v_md5);
  end loop;

  for t in select tablename from pg_tables where schemaname = v_schema loop
    execute format('revoke all on %I.%I from public, anon, authenticated', v_schema, t);
    execute format('alter table %I.%I enable row level security', v_schema, t);
  end loop;
end $$;

-- Result: which backup schema was created and what is in it
select n.nspname as backup_schema,
       (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.menu_categories', n.nspname), false, true, '')))[1]::text as categories,
       (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.menu_items', n.nspname), false, true, '')))[1]::text as items,
       (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.menu_recipe_ingredients', n.nspname), false, true, '')))[1]::text as recipe_lines
from pg_namespace n
where n.nspname = 'menu_backup_' || to_char(now() at time zone 'Asia/Colombo', 'YYYYMMDD');
