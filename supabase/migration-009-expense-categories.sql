-- ============================================================================
-- Migration 009 — Editable expense categories (enum → table, like menu
--                  categories) so they can be added/renamed/deleted from the
--                  app instead of being fixed.
-- Safe to run on a LIVE database, and safe to re-run if it fails partway.
-- Run this in the Supabase SQL Editor, AFTER migrations 001 through 008.
-- ============================================================================

-- 1. Real, editable categories table ------------------------------------------
create table if not exists public.expense_categories (
  id         uuid primary key default gen_random_uuid(),
  name       varchar(60) not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.expense_categories (name, sort_order) values
  ('Utilities', 1), ('Purchasing', 2), ('Salary', 3),
  ('Maintenance', 4), ('Marketing', 5), ('Function Cost', 6)
on conflict (name) do nothing;

-- 2. Add the FK column, backfill from the old enum column, then swap over ----
alter table public.expenses add column if not exists category_id uuid;

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'expenses' and column_name = 'category'
  ) then
    update public.expenses ex
    set category_id = ec.id
    from public.expense_categories ec
    where ex.category_id is null
      and lower(replace(ec.name, ' ', '_')) = ex.category::text;
  end if;
end $$;

do $$ begin
  alter table public.expenses
    add constraint fk_expenses_category
    foreign key (category_id) references public.expense_categories (id) on delete restrict;
exception when duplicate_object then null;
end $$;

alter table public.expenses alter column category_id set not null;
alter table public.expenses drop column if exists category;

do $$ begin
  drop type if exists expense_category;
exception when dependent_objects_still_exist then null;
end $$;

create index if not exists idx_expenses_category on public.expenses (category_id);

-- 3. RLS -----------------------------------------------------------------------
alter table public.expense_categories enable row level security;

drop policy if exists "staff read expense categories" on public.expense_categories;
create policy "staff read expense categories" on public.expense_categories
  for select using (public.get_my_role() is not null);

drop policy if exists "mgmt write expense categories" on public.expense_categories;
create policy "mgmt write expense categories" on public.expense_categories
  for all using (public.get_my_role() in ('admin','manager'))
  with check (public.get_my_role() in ('admin','manager'));

-- 4. Realtime --------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.expense_categories;
exception when duplicate_object then null;
end $$;
