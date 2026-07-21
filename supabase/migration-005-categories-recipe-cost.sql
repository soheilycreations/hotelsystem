-- ============================================================================
-- Migration 005 — Editable menu categories + recipe "other costs" + cleanup
-- Safe to run on a LIVE database. Run this in the Supabase SQL Editor.
-- Run AFTER migrations 001, 002, 003 and 004.
-- ============================================================================

-- 1. Menu categories become a real, editable table -----------------------------
create table if not exists public.menu_categories (
  id         uuid primary key default gen_random_uuid(),
  name       varchar(60) not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.menu_categories (name, sort_order) values
  ('Appetizers', 1), ('Mains', 2), ('Drinks', 3), ('Desserts', 4)
on conflict (name) do nothing;

alter table public.menu_items add column if not exists category_id uuid;

update public.menu_items mi
set category_id = mc.id
from public.menu_categories mc
where mi.category_id is null and lower(mc.name) = mi.category::text;

alter table public.menu_items
  add constraint if not exists fk_menu_items_category
  foreign key (category_id) references public.menu_categories (id) on delete restrict;

alter table public.menu_items alter column category_id set not null;
alter table public.menu_items drop column if exists category;

do $$ begin
  drop type if exists menu_category;
exception when dependent_objects_still_exist then null;
end $$;

alter table public.menu_categories enable row level security;
drop policy if exists "staff read menu categories" on public.menu_categories;
create policy "staff read menu categories" on public.menu_categories
  for select using (public.get_my_role() is not null);
drop policy if exists "mgmt write menu categories" on public.menu_categories;
create policy "mgmt write menu categories" on public.menu_categories
  for all using (public.get_my_role() in ('admin','manager'))
  with check (public.get_my_role() in ('admin','manager'));

do $$ begin
  alter publication supabase_realtime add table public.menu_categories;
exception when duplicate_object then null;
end $$;

-- 2. Recipe "other costs" — a flat, non-inventory cost per dish (packaging, gas…)
alter table public.menu_items
  add column if not exists other_cost numeric(12,2) not null default 0 check (other_cost >= 0);
