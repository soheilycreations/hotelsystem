import { createClient } from "@/lib/supabase/server";
import type { InventoryItem, MenuCategoryRow, MenuItem, MenuRecipeIngredient } from "@/lib/types";
import { LiveRefresher } from "../../live-refresher";
import { RecipeManager } from "./recipe-manager";

export const dynamic = "force-dynamic";

export type MenuItemWithRecipe = Omit<MenuItem, "menu_recipe_ingredients"> & {
  menu_recipe_ingredients: MenuRecipeIngredient[];
};

export default async function RecipesPage() {
  const supabase = await createClient();

  const [{ data: categories }, { data: menuItems }, { data: inventory }] = await Promise.all([
    supabase.from("menu_categories").select("*").order("sort_order"),
    supabase
      .from("menu_items")
      .select("*, menu_categories(*), menu_recipe_ingredients(*, inventory_items(*))")
      .order("name"),
    supabase.from("inventory_items").select("*").order("name"),
  ]);

  return (
    <div className="space-y-6">
      <LiveRefresher tables={["menu_recipe_ingredients", "inventory_items", "menu_items"]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Recipes & Costing</h1>
        <p className="text-sm text-muted-foreground">
          Define recipe ingredients per dish — food cost, margin, and profit update live from
          inventory unit costs. Add a flat &ldquo;other cost&rdquo; for packaging, gas, or misc.
        </p>
      </div>
      <RecipeManager
        menuItems={(menuItems as MenuItemWithRecipe[] | null) ?? []}
        inventory={(inventory as InventoryItem[] | null) ?? []}
        categories={(categories as MenuCategoryRow[] | null) ?? []}
      />
    </div>
  );
}
