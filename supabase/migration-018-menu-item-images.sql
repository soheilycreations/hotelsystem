-- ============================================================================
-- Migration 018 — Menu item photos
-- Safe to run on a LIVE database. Run this in the Supabase SQL Editor.
-- Adds a photo per menu item (POS terminal + menu manager show it) via a
-- public Supabase Storage bucket.
-- ============================================================================

alter table public.menu_items add column if not exists image_url text;

insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;

-- Public bucket already serves GET requests through Supabase's public CDN
-- endpoint regardless of RLS, but an explicit read policy is still needed
-- for the JS client's authenticated download/list calls.
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
