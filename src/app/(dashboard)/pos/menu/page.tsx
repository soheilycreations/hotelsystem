import { createClient } from "@/lib/supabase/server";
import type { MenuItem, MenuRecipeIngredient } from "@/lib/types";
import { LiveRefresher } from "../../live-refresher";
import { MenuManager } from "./menu-manager";

export const dynamic = "force-dynamic";

export type MenuItemWithRecipeCount = MenuItem & {
  menu_recipe_ingredients: Pick<MenuRecipeIngredient, "id">[];
};

export default async function MenuPage() {
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("menu_items")
    .select("*, menu_recipe_ingredients(id)")
    .order("category")
    .order("name");

  return (
    <div className="space-y-6">
      <LiveRefresher tables={["menu_items"]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Menu Items</h1>
        <p className="text-sm text-muted-foreground">
          Add and edit dishes, change prices, and toggle availability — the POS updates instantly.
        </p>
      </div>
      <MenuManager items={(items as MenuItemWithRecipeCount[] | null) ?? []} />
    </div>
  );
}
