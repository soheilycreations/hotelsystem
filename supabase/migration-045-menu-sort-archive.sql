-- ============================================================================
-- Migration 045 — menu item order, description and "archived" flag
-- ----------------------------------------------------------------------------
-- For the 2026 menu rebuild. Independent of migrations 038–044 (Release 1):
-- safe to run before or after them, and safe to re-run.
--
--   sort_order   position of the item inside its category (POS, menu admin,
--                recipes). Ties fall back to the name.
--   description  optional text shown under the item in the menu admin.
--   is_archived  retired item (duplicate, typo, old takeaway copy, no longer
--                sold). Hidden from the POS, the menu admin and the recipes
--                page unless "Show archived" is ticked; never deleted, so
--                past bills and recipe links keep working.
--                is_available stays what it was: a temporary "not on the POS
--                right now" switch (e.g. price still to be decided).
-- ============================================================================
alter table public.menu_items add column if not exists sort_order  int     not null default 0;
alter table public.menu_items add column if not exists description text;
alter table public.menu_items add column if not exists is_archived boolean not null default false;

create index if not exists idx_menu_items_category_sort
  on public.menu_items (category_id, sort_order, name);
