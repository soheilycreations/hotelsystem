"use server";

import { revalidatePath } from "next/cache";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import type { StoreTransactionType } from "@/lib/types";

interface ActionResult {
  ok: boolean;
  error?: string;
}

const STORE_ROLES = ["admin", "manager", "kitchen_staff"];

async function assertRole(roles: string[]) {
  const profile = await getSessionProfile();
  if (!profile || !roles.includes(profile.role)) {
    throw new Error("Not authorized for this store operation.");
  }
  return profile;
}

function paths() {
  revalidatePath("/inventory/store");
  revalidatePath("/inventory");
}

export async function createStoreItem(formData: FormData): Promise<ActionResult> {
  try {
    await assertRole(STORE_ROLES);
    const supabase = await createClient();

    const name = String(formData.get("name") ?? "").trim();
    const unit = String(formData.get("unit") ?? "").trim() || "pcs";
    const reorderLevel = Number(formData.get("reorder_level") ?? 0);
    const openingStock = Number(formData.get("current_stock") ?? 0);
    const linkedId = String(formData.get("linked_inventory_item_id") ?? "").trim();

    if (!name) return { ok: false, error: "Item name is required." };
    if (reorderLevel < 0 || openingStock < 0) return { ok: false, error: "Values cannot be negative." };

    const { error } = await supabase.from("store_items").insert({
      name,
      unit,
      reorder_level: reorderLevel,
      current_stock: openingStock,
      linked_inventory_item_id: linkedId || null,
    });
    if (error) return { ok: false, error: error.message };

    paths();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function updateStoreItem(storeItemId: string, formData: FormData): Promise<ActionResult> {
  try {
    await assertRole(STORE_ROLES);
    const supabase = await createClient();

    const name = String(formData.get("name") ?? "").trim();
    const unit = String(formData.get("unit") ?? "").trim() || "pcs";
    const reorderLevel = Number(formData.get("reorder_level") ?? 0);
    const linkedId = String(formData.get("linked_inventory_item_id") ?? "").trim();

    if (!name) return { ok: false, error: "Item name is required." };
    if (reorderLevel < 0) return { ok: false, error: "Values cannot be negative." };

    // Stock is changed only via Stock In / Stock Out / Issue to Kitchen — this
    // only updates the descriptive fields and the kitchen link.
    const { error } = await supabase
      .from("store_items")
      .update({ name, unit, reorder_level: reorderLevel, linked_inventory_item_id: linkedId || null })
      .eq("id", storeItemId);
    if (error) return { ok: false, error: error.message };

    paths();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function recordStoreTransaction(
  storeItemId: string,
  type: StoreTransactionType,
  quantity: number,
  reason: string
): Promise<ActionResult> {
  try {
    await assertRole(STORE_ROLES);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { ok: false, error: "Enter a quantity greater than zero." };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("rpc_record_store_transaction", {
      p_store_item_id: storeItemId,
      p_type: type,
      p_quantity: quantity,
      p_reason: reason.trim() || null,
    });
    if (error) return { ok: false, error: error.message };

    paths();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Issues stock from the store to the kitchen — decrements the store item
 * and, if it's linked to a kitchen inventory item, tops that item's stock
 * up in the same database transaction. */
export async function issueStoreToKitchen(
  storeItemId: string,
  quantity: number,
  note: string
): Promise<ActionResult> {
  try {
    await assertRole(STORE_ROLES);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { ok: false, error: "Enter a quantity greater than zero." };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("rpc_issue_store_to_kitchen", {
      p_store_item_id: storeItemId,
      p_quantity: quantity,
      p_note: note.trim() || null,
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath("/inventory/store");
    revalidatePath("/inventory");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
