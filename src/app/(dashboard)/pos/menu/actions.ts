"use server";

import { revalidatePath } from "next/cache";
import { createClient, getSessionProfile } from "@/lib/supabase/server";

interface ActionResult {
  ok: boolean;
  error?: string;
}

const MENU_ROLES = ["admin", "manager"];

async function assertMenuRole() {
  const profile = await getSessionProfile();
  if (!profile || !MENU_ROLES.includes(profile.role)) {
    throw new Error("Not authorized to manage the menu.");
  }
  return profile;
}

function revalidateMenu(): void {
  revalidatePath("/pos/menu");
  revalidatePath("/pos/active");
  revalidatePath("/inventory/recipes");
}

function parseMenuForm(formData: FormData):
  | {
      ok: true;
      name: string;
      categoryId: string;
      price: number;
      otherCost: number;
      serviceChargeable: boolean;
    }
  | { ok: false; error: string } {
  const name = String(formData.get("name") ?? "").trim();
  const categoryId = String(formData.get("category_id") ?? "");
  const price = Number(formData.get("selling_price") ?? 0);
  const otherCost = Number(formData.get("other_cost") ?? 0);
  const serviceChargeable = formData.get("service_chargeable") === "on";

  if (!name) return { ok: false, error: "Item name is required." };
  if (!categoryId) return { ok: false, error: "Pick a category." };
  if (!Number.isFinite(price) || price <= 0)
    return { ok: false, error: "Selling price must be greater than zero." };
  if (!Number.isFinite(otherCost) || otherCost < 0)
    return { ok: false, error: "Other costs can't be negative." };
  return { ok: true, name, categoryId, price, otherCost, serviceChargeable };
}

export async function createMenuItem(formData: FormData): Promise<ActionResult> {
  try {
    await assertMenuRole();
    const parsed = parseMenuForm(formData);
    if (!parsed.ok) return parsed;

    const supabase = await createClient();
    const { error } = await supabase.from("menu_items").insert({
      name: parsed.name,
      category_id: parsed.categoryId,
      selling_price: parsed.price,
      other_cost: parsed.otherCost,
      service_chargeable: parsed.serviceChargeable,
      is_available: true,
    });
    if (error) return { ok: false, error: error.message };

    revalidateMenu();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function updateMenuItem(
  menuItemId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    await assertMenuRole();
    const parsed = parseMenuForm(formData);
    if (!parsed.ok) return parsed;

    const supabase = await createClient();
    // Existing bill lines keep their unit_price + service-charge snapshot —
    // edits here only affect items added to bills from now on.
    const { error } = await supabase
      .from("menu_items")
      .update({
        name: parsed.name,
        category_id: parsed.categoryId,
        selling_price: parsed.price,
        other_cost: parsed.otherCost,
        service_chargeable: parsed.serviceChargeable,
      })
      .eq("id", menuItemId);
    if (error) return { ok: false, error: error.message };

    revalidateMenu();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function toggleMenuItemAvailability(
  menuItemId: string,
  isAvailable: boolean
): Promise<ActionResult> {
  try {
    await assertMenuRole();
    const supabase = await createClient();
    const { error } = await supabase
      .from("menu_items")
      .update({ is_available: isAvailable })
      .eq("id", menuItemId);
    if (error) return { ok: false, error: error.message };

    revalidateMenu();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteMenuItem(menuItemId: string): Promise<ActionResult> {
  try {
    await assertMenuRole();
    const supabase = await createClient();
    // order_items.menu_item_id is ON DELETE RESTRICT — an item that was ever
    // sold can't be removed, only hidden. Recipe links cascade automatically.
    const { error } = await supabase.from("menu_items").delete().eq("id", menuItemId);
    if (error) {
      if (error.code === "23503") {
        return {
          ok: false,
          error:
            "This item has past orders and can't be deleted — switch it off instead so it's hidden from the POS.",
        };
      }
      return { ok: false, error: error.message };
    }

    revalidateMenu();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function createMenuCategory(formData: FormData): Promise<ActionResult> {
  try {
    await assertMenuRole();
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { ok: false, error: "Category name is required." };

    const supabase = await createClient();
    const { count } = await supabase
      .from("menu_categories")
      .select("id", { count: "exact", head: true });

    const { error } = await supabase.from("menu_categories").insert({
      name,
      sort_order: (count ?? 0) + 1,
    });
    if (error)
      return {
        ok: false,
        error: error.code === "23505" ? "A category with that name already exists." : error.message,
      };

    revalidateMenu();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function renameMenuCategory(
  categoryId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    await assertMenuRole();
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { ok: false, error: "Category name is required." };

    const supabase = await createClient();
    const { error } = await supabase
      .from("menu_categories")
      .update({ name })
      .eq("id", categoryId);
    if (error)
      return {
        ok: false,
        error: error.code === "23505" ? "A category with that name already exists." : error.message,
      };

    revalidateMenu();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteMenuCategory(categoryId: string): Promise<ActionResult> {
  try {
    await assertMenuRole();
    const supabase = await createClient();

    const { count } = await supabase
      .from("menu_items")
      .select("id", { count: "exact", head: true })
      .eq("category_id", categoryId);
    if ((count ?? 0) > 0)
      return {
        ok: false,
        error: `Cannot delete — ${count} menu item(s) still use this category. Move them first.`,
      };

    const { error } = await supabase.from("menu_categories").delete().eq("id", categoryId);
    if (error) return { ok: false, error: error.message };

    revalidateMenu();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
