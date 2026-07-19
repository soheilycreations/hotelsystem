"use server";

import { revalidatePath } from "next/cache";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import type { MenuCategory } from "@/lib/types";

interface ActionResult {
  ok: boolean;
  error?: string;
}

const MENU_ROLES = ["admin", "manager"];
const CATEGORIES: MenuCategory[] = ["appetizers", "mains", "drinks", "desserts"];

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
  | { ok: true; name: string; category: MenuCategory; price: number }
  | { ok: false; error: string } {
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "") as MenuCategory;
  const price = Number(formData.get("selling_price") ?? 0);

  if (!name) return { ok: false, error: "Item name is required." };
  if (!CATEGORIES.includes(category)) return { ok: false, error: "Pick a valid category." };
  if (!Number.isFinite(price) || price <= 0)
    return { ok: false, error: "Selling price must be greater than zero." };
  return { ok: true, name, category, price };
}

export async function createMenuItem(formData: FormData): Promise<ActionResult> {
  try {
    await assertMenuRole();
    const parsed = parseMenuForm(formData);
    if (!parsed.ok) return parsed;

    const supabase = await createClient();
    const { error } = await supabase.from("menu_items").insert({
      name: parsed.name,
      category: parsed.category,
      selling_price: parsed.price,
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
    // Existing bill lines keep their unit_price snapshot — price edits only
    // affect items added from now on.
    const { error } = await supabase
      .from("menu_items")
      .update({ name: parsed.name, category: parsed.category, selling_price: parsed.price })
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
