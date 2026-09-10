-- ============================================================================
-- Migration 027 — Hotel logo/QR uploads + Google review QR on bills
-- Safe to run on a LIVE database. Run this in the Supabase SQL Editor.
--
-- hotel_settings.logo_url already existed but was a paste-a-URL field only
-- — this adds a real "hotel-assets" Storage bucket so both the logo and a
-- new Google-review QR code can be uploaded as files from Hotel Profile,
-- same pattern as menu item photos (migration 018).
-- ============================================================================

alter table public.hotel_settings add column if not exists review_qr_url text;

insert into storage.buckets (id, name, public)
values ('hotel-assets', 'hotel-assets', true)
on conflict (id) do nothing;

drop policy if exists "hotel assets public read" on storage.objects;
create policy "hotel assets public read" on storage.objects
  for select using (bucket_id = 'hotel-assets');

drop policy if exists "hotel assets admin write" on storage.objects;
create policy "hotel assets admin write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'hotel-assets' and public.get_my_role() in ('admin', 'manager'));

drop policy if exists "hotel assets admin update" on storage.objects;
create policy "hotel assets admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'hotel-assets' and public.get_my_role() in ('admin', 'manager'));

drop policy if exists "hotel assets admin delete" on storage.objects;
create policy "hotel assets admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'hotel-assets' and public.get_my_role() in ('admin', 'manager'));
