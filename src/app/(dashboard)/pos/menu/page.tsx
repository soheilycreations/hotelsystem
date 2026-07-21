import { createClient } from "@/lib/supabase/server";
import type { MenuCategoryRow, MenuItem, MenuRecipeIngredient } from "@/lib/types";
import { LiveRefresher } from "../../live-refresher";
import { MenuManager } from "./menu-manager";

export const dynamic = "force-dynamic";

export type MenuItemWithRecipeCount = MenuItem & {
  menu_recipe_ingredients: Pick<MenuRecipeIngredient, "id">[];
};

export default async function MenuPage() {
  const supabase = await createClient();

  const [{ data: categories }, { data: items }] = await Promise.all([
    supabase.from("menu_categories").select("*").order("sort_order"),
    supabase
      .from("menu_items")
      .select("*, menu_categories(*), menu_recipe_ingredients(id)")
      .order("name"),
  ]);

  return (
    <div className="space-y-6">
      <LiveRefresher tables={["menu_items", "menu_categories"]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Menu Items</h1>
        <p className="text-sm text-muted-foreground">
          Add and edit dishes, change prices, manage categories, and toggle availability — the
          POS updates instantly.
        </p>
      </div>
      <MenuManager
        items={(items as MenuItemWithRecipeCount[] | null) ?? []}
        categories={(categories as MenuCategoryRow[] | null) ?? []}
      />
    </div>
  );
}
