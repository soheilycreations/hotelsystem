-- ============================================================================
-- MENU REBUILD — step 2: export the current menu for the review (READ-ONLY)
-- ----------------------------------------------------------------------------
-- One SELECT, changes nothing. Run in the Supabase SQL editor, then use the
-- "Download CSV" button and save it as data/current_menu_export.csv.
-- One row per menu item, with what the matcher needs to pick which of
-- several duplicates to keep: recipe lines and units sold (sales before the
-- 20 Oct reset come from archive_20261020, after it from public).
-- ============================================================================
with sold as (
  select menu_item_id, sum(quantity) as qty, max(created_at) as last_sold
  from (
    select menu_item_id, quantity, created_at from archive_20261020.order_items where menu_item_id is not null
    union all
    select menu_item_id, quantity, created_at from public.order_items where menu_item_id is not null
  ) s
  group by menu_item_id
),
recipe as (
  select menu_item_id, count(*) as lines
  from public.menu_recipe_ingredients
  group by menu_item_id
)
select c.name                    as category,
       c.sort_order              as category_sort,
       c.station::text           as category_station,
       c.id                      as category_id,
       i.id                      as item_id,
       i.name                    as item_name,
       i.selling_price           as price,
       i.other_cost,
       i.service_chargeable,
       i.is_available,
       i.station::text           as item_station,
       coalesce(r.lines, 0)      as recipe_lines,
       coalesce(s.qty, 0)        as sold_qty,
       s.last_sold,
       i.created_at
from public.menu_items i
join public.menu_categories c on c.id = i.category_id
left join recipe r on r.menu_item_id = i.id
left join sold s on s.menu_item_id = i.id
order by c.sort_order, c.name, i.name;
