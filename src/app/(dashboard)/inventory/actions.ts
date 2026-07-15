"use server";

import { revalidatePath } from "next/cache";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import type { InventoryUnit } from "@/lib/types";

interface ActionResult {
  ok: boolean;
  error?: string;
}

const STOCK_ROLES = ["admin", "manager", "kitchen_staff"];
const RECIPE_ROLES = ["admin", "manager"];

async function assertRole(roles: string[]) {
  const profile = await getSessionProfile();
  if (!profile || !roles.includes(profile.role)) {
    throw new Error("Not authorized for this inventory operation.");
  }
  return profile;
}

/** Positive = goods received (GRN), negative = wastage/manual correction. */
export async function adjustStock(
  inventoryItemId: string,
  delta: number,
  reason: string
): Promise<ActionResult> {
  try {
    await assertRole(STOCK_ROLES);
    if (!Number.isFinite(delta) || delta === 0)
      return { ok: false, error: "Enter a non-zero adjustment amount." };

    const supabase = await createClient();
    const { data: item } = await supabase
      .from("inventory_items")
      .select("id, name, quantity_in_stock")
      .eq("id", inventoryItemId)
      .single();
    if (!item) return { ok: false, error: "Inventory item not found." };

    const next = Number(item.quantity_in_stock) + delta;
    if (next < 0)
      return { ok: false, error: `Stock cannot go negative (current: ${item.quantity_in_stock}).` };

    const { error } = await supabase
      .from("inventory_items")
      .update({ quantity_in_stock: next })
      .eq("id", inventoryItemId);
    if (error) return { ok: false, error: error.message };

    await supabase.from("system_logs").insert({
      event_type: "stock_adjustment",
      severity: "info",
      message: `${delta > 0 ? "+" : ""}${delta} ${item.name} — ${reason || "manual adjustment"}`,
      ref_table: "inventory_items",
      ref_id: inventoryItemId,
    });

    revalidatePath("/inventory");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function createInventoryItem(formData: FormData): Promise<ActionResult> {
  try {
    await assertRole(RECIPE_ROLES);
    const supabase = await createClient();

    const name = String(formData.get("name") ?? "").trim();
    const unit = String(formData.get("unit") ?? "") as InventoryUnit;
    const quantity = Number(formData.get("quantity_in_stock") ?? 0);
    const unitCost = Number(formData.get("unit_cost") ?? 0);
    const reorderLevel = Number(formData.get("reorder_level") ?? 0);

    if (!name) return { ok: false, error: "Item name is required." };
    if (!["grams", "ml", "units"].includes(unit))
      return { ok: false, error: "Pick a valid unit." };
    if (quantity < 0 || unitCost < 0 || reorderLevel < 0)
      return { ok: false, error: "Values cannot be negative." };

    const { error } = await supabase.from("inventory_items").insert({
      name,
      unit,
      quantity_in_stock: quantity,
      unit_cost: unitCost,
      reorder_level: reorderLevel,
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath("/inventory");
    revalidatePath("/inventory/recipes");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function addRecipeIngredient(
  menuItemId: string,
  inventoryItemId: string,
  quantityNeeded: number
): Promise<ActionResult> {
  try {
    await assertRole(RECIPE_ROLES);
    if (!Number.isFinite(quantityNeeded) || quantityNeeded <= 0)
      return { ok: false, error: "Quantity needed must be greater than zero." };

    const supabase = await createClient();
    const { error } = await supabase.from("menu_recipe_ingredients").upsert(
      {
        menu_item_id: menuItemId,
        inventory_item_id: inventoryItemId,
        quantity_needed: quantityNeeded,
      },
      { onConflict: "menu_item_id,inventory_item_id" }
    );
    if (error) return { ok: false, error: error.message };

    revalidatePath("/inventory/recipes");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function removeRecipeIngredient(recipeIngredientId: string): Promise<ActionResult> {
  try {
    await assertRole(RECIPE_ROLES);
    const supabase = await createClient();
    const { error } = await supabase
      .from("menu_recipe_ingredients")
      .delete()
      .eq("id", recipeIngredientId);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/inventory/recipes");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
