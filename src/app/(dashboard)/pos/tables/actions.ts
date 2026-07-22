"use server";

import { revalidatePath } from "next/cache";
import { createClient, getSessionProfile } from "@/lib/supabase/server";

interface ActionResult {
  ok: boolean;
  error?: string;
}

const TABLE_ROLES = ["admin", "manager"];

async function assertTableRole() {
  const profile = await getSessionProfile();
  if (!profile || !TABLE_ROLES.includes(profile.role)) {
    throw new Error("Not authorized to manage restaurant tables.");
  }
  return profile;
}

function revalidateTables(): void {
  revalidatePath("/pos/tables");
  revalidatePath("/pos/active");
}

function parseTableForm(formData: FormData):
  | { ok: true; tableNumber: string; capacity: number; floorZone: string | null }
  | { ok: false; error: string } {
  const tableNumber = String(formData.get("table_number") ?? "").trim();
  const capacity = Number(formData.get("capacity") ?? 0);
  const floorZone = String(formData.get("floor_zone") ?? "").trim();

  if (!tableNumber) return { ok: false, error: "Table number is required." };
  if (!Number.isInteger(capacity) || capacity < 1)
    return { ok: false, error: "Seating capacity must be at least 1." };
  return { ok: true, tableNumber, capacity, floorZone: floorZone || null };
}

export async function createTable(formData: FormData): Promise<ActionResult> {
  try {
    await assertTableRole();
    const parsed = parseTableForm(formData);
    if (!parsed.ok) return parsed;

    const supabase = await createClient();
    const { error } = await supabase.from("restaurant_tables").insert({
      table_number: parsed.tableNumber,
      capacity: parsed.capacity,
      floor_zone: parsed.floorZone,
      current_status: "vacant",
    });
    if (error)
      return {
        ok: false,
        error: error.code === "23505" ? "That table number already exists." : error.message,
      };

    revalidateTables();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function updateTable(tableId: string, formData: FormData): Promise<ActionResult> {
  try {
    await assertTableRole();
    const parsed = parseTableForm(formData);
    if (!parsed.ok) return parsed;

    const supabase = await createClient();
    const { error } = await supabase
      .from("restaurant_tables")
      .update({
        table_number: parsed.tableNumber,
        capacity: parsed.capacity,
        floor_zone: parsed.floorZone,
      })
      .eq("id", tableId);
    if (error)
      return {
        ok: false,
        error: error.code === "23505" ? "That table number already exists." : error.message,
      };

    revalidateTables();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteTable(tableId: string): Promise<ActionResult> {
  try {
    await assertTableRole();
    const supabase = await createClient();

    const { data: table } = await supabase
      .from("restaurant_tables")
      .select("current_status")
      .eq("id", tableId)
      .single();
    if (!table) return { ok: false, error: "Table not found." };
    if (table.current_status === "occupied")
      return { ok: false, error: "Cannot delete — this table is occupied. Settle its bill first." };

    const { count } = await supabase
      .from("restaurant_orders")
      .select("id", { count: "exact", head: true })
      .eq("table_id", tableId)
      .eq("order_status", "active");
    if ((count ?? 0) > 0)
      return { ok: false, error: "Cannot delete — this table has an active order." };

    // Past orders keep their record (table_id becomes null on delete).
    const { error } = await supabase.from("restaurant_tables").delete().eq("id", tableId);
    if (error) return { ok: false, error: error.message };

    revalidateTables();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
