-- ============================================================================
-- Clear ALL inventory stock — clean slate
-- ⚠️ IRREVERSIBLE. This also removes every recipe's ingredient list (since
-- recipes point at inventory items) — after this runs, NO menu item will
-- deduct stock on sale until you rebuild recipes from Recipe Costing.
-- Menu items, categories, and prices are NOT touched — only ingredients.
-- ============================================================================

-- 1. See what's about to be deleted (run this first, just to look)
select
  (select count(*) from public.inventory_items)        as inventory_items_count,
  (select count(*) from public.menu_recipe_ingredients) as recipe_links_count;

-- 2. Clear recipe ingredient links first (they reference inventory items)
delete from public.menu_recipe_ingredients;

-- 3. Clear all inventory items
delete from public.inventory_items;
