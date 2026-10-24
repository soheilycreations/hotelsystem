-- ============================================================================
-- MENU REBUILD — undo: restore the menu from menu_backup_20261024
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor. ONE transaction, same convention as the
-- other scripts: v_commit := false (default) does everything, checks it,
-- then raises an error containing the report — which rolls it all back.
-- Set v_commit := true to really restore.
--
--   1. Saves the CURRENT menu (categories, items, recipe links) into a new
--      schema menu_pre_restore_<time> first.
--   2. Categories, items and recipe links go back exactly to the backup
--      (same ids, names, prices, availability, printer, recipes).
--      Columns added later (migration 045) are reset: position 0, no
--      description, not archived.
--   3. Items added by the rebuild: deleted if never sold; if they were sold
--      (past bills point at them) they are archived instead — nothing that a
--      bill refers to is deleted. Categories added by the rebuild are
--      removed once empty.
--   4. Verifies categories, items and recipe links match the backup's
--      fingerprints; any mismatch aborts and rolls back.
-- ============================================================================
do $$
declare
  -- ======================== EDIT THIS SETTING ==============================
  v_commit boolean := false;   -- false = dry run (rolls back), true = really restore
  -- =========================================================================
  c_backup constant text := 'menu_backup_20261024';
  v_snap text := 'menu_pre_restore_' || to_char(now() at time zone 'Asia/Colombo', 'YYYYMMDD_HH24MISS');
  r record;
  t text;
  v_cols text;
  v_set text;
  v_md5 text;
  v_n int;
  v_deleted int := 0;
  v_archived int := 0;
  v_cats_removed int := 0;
  v_report text := '';
begin
  if not exists (select 1 from pg_namespace where nspname = c_backup) then
    raise exception 'REFUSED: % not found.', c_backup;
  end if;
  for r in execute format('select table_name, md5 from %I._manifest', c_backup) loop
    execute format('select md5(coalesce(string_agg(x::text, E''\n'' order by x::text), '''')) from %I.%I x',
                   c_backup, r.table_name) into v_md5;
    if v_md5 <> r.md5 then
      raise exception 'REFUSED: backup copy of % is damaged.', r.table_name;
    end if;
  end loop;

  -- 1. snapshot what is there now
  execute format('create schema %I', v_snap);
  execute format('revoke all on schema %I from public, anon, authenticated', v_snap);
  foreach t in array array['menu_categories', 'menu_items', 'menu_recipe_ingredients'] loop
    execute format('create table %I.%I as table public.%I', v_snap, t, t);
    execute format('alter table %I.%I enable row level security', v_snap, t);
  end loop;

  -- 2a. categories: move names of rebuild-only categories out of the way
  --     (names are unique), then put the backup rows back by id
  execute format('update public.menu_categories c set name = left(c.name, 40) || '' ~'' || left(c.id::text, 8) '
                 'where not exists (select 1 from %I.menu_categories b where b.id = c.id)', c_backup);
  select string_agg(format('%I', column_name), ', ' order by ordinal_position),
         string_agg(format('%I = excluded.%I', column_name, column_name), ', ' order by ordinal_position)
           filter (where column_name <> 'id')
    into v_cols, v_set
  from information_schema.columns where table_schema = c_backup and table_name = 'menu_categories';
  execute format('insert into public.menu_categories (%s) select %s from %I.menu_categories '
                 'on conflict (id) do update set %s', v_cols, v_cols, c_backup, v_set);

  -- 2b. items: backup rows back by id; migration-045 columns reset.
  --     The updated_at trigger is paused so restored rows keep the backup's
  --     own timestamps (otherwise they could never match the backup).
  if exists (select 1 from pg_trigger where tgrelid = 'public.menu_items'::regclass and tgname = 'trg_touch_menu') then
    alter table public.menu_items disable trigger trg_touch_menu;
  end if;
  select string_agg(format('%I', column_name), ', ' order by ordinal_position),
         string_agg(format('%I = excluded.%I', column_name, column_name), ', ' order by ordinal_position)
           filter (where column_name <> 'id')
    into v_cols, v_set
  from information_schema.columns where table_schema = c_backup and table_name = 'menu_items';
  execute format('insert into public.menu_items (%s) select %s from %I.menu_items '
                 'on conflict (id) do update set %s', v_cols, v_cols, c_backup, v_set);
  if exists (select 1 from information_schema.columns where table_schema = 'public'
             and table_name = 'menu_items' and column_name = 'is_archived') then
    execute format('update public.menu_items i set sort_order = 0, description = null, is_archived = false '
                   'where exists (select 1 from %I.menu_items b where b.id = i.id)', c_backup);
  end if;

  if exists (select 1 from pg_trigger where tgrelid = 'public.menu_items'::regclass and tgname = 'trg_touch_menu') then
    alter table public.menu_items enable trigger trg_touch_menu;
  end if;

  -- 2c. recipe links: exactly the backup's
  execute format('delete from public.menu_recipe_ingredients x '
                 'where not exists (select 1 from %I.menu_recipe_ingredients b where b.id = x.id)', c_backup);
  select string_agg(format('%I', column_name), ', ' order by ordinal_position),
         string_agg(format('%I = excluded.%I', column_name, column_name), ', ' order by ordinal_position)
           filter (where column_name <> 'id')
    into v_cols, v_set
  from information_schema.columns where table_schema = c_backup and table_name = 'menu_recipe_ingredients';
  execute format('insert into public.menu_recipe_ingredients (%s) select %s from %I.menu_recipe_ingredients '
                 'on conflict (id) do update set %s', v_cols, v_cols, c_backup, v_set);

  -- 3. items the rebuild added: delete if never sold, else archive
  for r in execute format('select i.id from public.menu_items i '
                          'where not exists (select 1 from %I.menu_items b where b.id = i.id)', c_backup) loop
    if exists (select 1 from public.order_items oi where oi.menu_item_id = r.id) then
      execute 'update public.menu_items set is_available = false' ||
              case when exists (select 1 from information_schema.columns where table_schema = 'public'
                                and table_name = 'menu_items' and column_name = 'is_archived')
                   then ', is_archived = true' else '' end ||
              ' where id = $1' using r.id;
      v_archived := v_archived + 1;
    else
      delete from public.menu_items where id = r.id;
      v_deleted := v_deleted + 1;
    end if;
  end loop;
  -- categories the rebuild added, now empty
  execute format('with gone as (delete from public.menu_categories c '
                 'where not exists (select 1 from %I.menu_categories b where b.id = c.id) '
                 'and not exists (select 1 from public.menu_items i where i.category_id = c.id) returning 1) '
                 'select count(*) from gone', c_backup) into v_cats_removed;

  -- 4. verify against the backup fingerprints (backup columns, backup rows)
  for r in execute format('select table_name, row_count, md5 from %I._manifest', c_backup) loop
    select string_agg(format('%I', column_name), ', ' order by ordinal_position) into v_cols
    from information_schema.columns where table_schema = c_backup and table_name = r.table_name;
    execute format('select count(*), md5(coalesce(string_agg(x::text, E''\n'' order by x::text), '''')) '
                   'from (select %s from public.%I p where exists (select 1 from %I.%I b where b.id = p.id)) x',
                   v_cols, r.table_name, c_backup, r.table_name) into v_n, v_md5;
    if v_md5 <> r.md5 then
      raise exception 'ABORTED: % does not match the backup after restore — rolled back, nothing changed.', r.table_name;
    end if;
    v_report := v_report || format(E'\n  %-24s %s rows  OK', r.table_name, v_n);
  end loop;
  execute format('select count(*) from public.menu_recipe_ingredients x '
                 'where not exists (select 1 from %I.menu_recipe_ingredients b where b.id = x.id)', c_backup) into v_n;
  if v_n <> 0 then
    raise exception 'ABORTED: % recipe links not in the backup remain — rolled back.', v_n;
  end if;

  v_report := format(E'\n=== MENU RESTORED FROM %s — current menu saved in schema %s ===', c_backup, v_snap)
              || v_report
              || format(E'\n  items added by the rebuild: %s deleted (never sold), %s archived (sold, kept for past bills)',
                        v_deleted, v_archived)
              || format(E'\n  categories added by the rebuild removed: %s', v_cats_removed);

  if not v_commit then
    raise exception E'DRY RUN OK — everything above was rolled back, NOTHING changed.%', v_report
      using hint = 'To really restore, set v_commit := true at the top and run again.';
  end if;
  raise notice '%', v_report;
end $$;

-- Reached only when v_commit = true
select c.sort_order, c.name as category, count(i.id) as items,
       count(i.id) filter (where i.is_available) as on_pos
from public.menu_categories c left join public.menu_items i on i.category_id = c.id
group by c.id, c.sort_order, c.name
order by c.sort_order, c.name;
