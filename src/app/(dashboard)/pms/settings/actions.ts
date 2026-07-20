"use server";

import { revalidatePath } from "next/cache";
import { createClient, getSessionProfile } from "@/lib/supabase/server";

interface ActionResult {
  ok: boolean;
  error?: string;
}

const SETUP_ROLES = ["admin", "manager"];

async function assertSetupRole() {
  const profile = await getSessionProfile();
  if (!profile || !SETUP_ROLES.includes(profile.role)) {
    throw new Error("Not authorized for room setup.");
  }
  return profile;
}

function revalidateRooms(): void {
  revalidatePath("/pms/settings");
  revalidatePath("/pms/rooms");
  revalidatePath("/pms/reserve");
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Room types
// ---------------------------------------------------------------------------

function parseTypeForm(formData: FormData):
  | { ok: true; name: string; basePrice: number; maxOccupancy: number }
  | { ok: false; error: string } {
  const name = String(formData.get("name") ?? "").trim();
  const basePrice = Number(formData.get("base_price") ?? 0);
  const maxOccupancy = Number(formData.get("max_occupancy") ?? 0);

  if (!name) return { ok: false, error: "Category name is required." };
  if (!Number.isFinite(basePrice) || basePrice <= 0)
    return { ok: false, error: "Nightly rate must be greater than zero." };
  if (!Number.isInteger(maxOccupancy) || maxOccupancy < 1)
    return { ok: false, error: "Max occupancy must be at least 1." };
  return { ok: true, name, basePrice, maxOccupancy };
}

export async function createRoomType(formData: FormData): Promise<ActionResult> {
  try {
    await assertSetupRole();
    const parsed = parseTypeForm(formData);
    if (!parsed.ok) return parsed;

    const supabase = await createClient();
    const { error } = await supabase.from("room_types").insert({
      name: parsed.name,
      base_price: parsed.basePrice,
      max_occupancy: parsed.maxOccupancy,
    });
    if (error)
      return {
        ok: false,
        error: error.code === "23505" ? "A category with that name already exists." : error.message,
      };

    revalidateRooms();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function updateRoomType(
  roomTypeId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    await assertSetupRole();
    const parsed = parseTypeForm(formData);
    if (!parsed.ok) return parsed;

    const supabase = await createClient();
    // Rate changes only affect NEW bookings — existing folios keep their totals.
    const { error } = await supabase
      .from("room_types")
      .update({
        name: parsed.name,
        base_price: parsed.basePrice,
        max_occupancy: parsed.maxOccupancy,
      })
      .eq("id", roomTypeId);
    if (error)
      return {
        ok: false,
        error: error.code === "23505" ? "A category with that name already exists." : error.message,
      };

    revalidateRooms();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteRoomType(roomTypeId: string): Promise<ActionResult> {
  try {
    await assertSetupRole();
    const supabase = await createClient();

    const { count } = await supabase
      .from("rooms")
      .select("id", { count: "exact", head: true })
      .eq("type_id", roomTypeId);
    if ((count ?? 0) > 0)
      return {
        ok: false,
        error: `Cannot delete — ${count} room(s) still use this category. Reassign them first.`,
      };

    const { error } = await supabase.from("room_types").delete().eq("id", roomTypeId);
    if (error) return { ok: false, error: error.message };

    revalidateRooms();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------------------------------------------------------------------------
// Rate plans
// ---------------------------------------------------------------------------

function parsePlanForm(formData: FormData):
  | {
      ok: true;
      roomTypeId: string;
      name: string;
      kind: "per_night" | "block";
      price: number;
      durationHours: number | null;
    }
  | { ok: false; error: string } {
  const roomTypeId = String(formData.get("room_type_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "") as "per_night" | "block";
  const price = Number(formData.get("price") ?? 0);
  const durationHours = Number(formData.get("duration_hours") ?? 0);

  if (!roomTypeId) return { ok: false, error: "Pick a room category." };
  if (!name) return { ok: false, error: "Plan name is required (e.g. AC — Full Night)." };
  if (kind !== "per_night" && kind !== "block")
    return { ok: false, error: "Pick a plan type." };
  if (!Number.isFinite(price) || price <= 0)
    return { ok: false, error: "Price must be greater than zero." };
  if (kind === "block" && (!Number.isInteger(durationHours) || durationHours < 1))
    return { ok: false, error: "Time-block plans need a duration in hours." };

  return {
    ok: true,
    roomTypeId,
    name,
    kind,
    price,
    durationHours: kind === "block" ? durationHours : null,
  };
}

export async function createRatePlan(formData: FormData): Promise<ActionResult> {
  try {
    await assertSetupRole();
    const parsed = parsePlanForm(formData);
    if (!parsed.ok) return parsed;

    const supabase = await createClient();
    const { error } = await supabase.from("room_rate_plans").insert({
      room_type_id: parsed.roomTypeId,
      name: parsed.name,
      kind: parsed.kind,
      price: parsed.price,
      duration_hours: parsed.durationHours,
      is_active: true,
    });
    if (error)
      return {
        ok: false,
        error:
          error.code === "23505"
            ? "That category already has a plan with this name."
            : error.message,
      };

    revalidateRooms();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function updateRatePlan(planId: string, formData: FormData): Promise<ActionResult> {
  try {
    await assertSetupRole();
    const parsed = parsePlanForm(formData);
    if (!parsed.ok) return parsed;

    const supabase = await createClient();
    // Price/name edits only affect NEW bookings — existing bookings carry a snapshot.
    const { error } = await supabase
      .from("room_rate_plans")
      .update({
        room_type_id: parsed.roomTypeId,
        name: parsed.name,
        kind: parsed.kind,
        price: parsed.price,
        duration_hours: parsed.durationHours,
      })
      .eq("id", planId);
    if (error)
      return {
        ok: false,
        error:
          error.code === "23505"
            ? "That category already has a plan with this name."
            : error.message,
      };

    revalidateRooms();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function toggleRatePlan(planId: string, isActive: boolean): Promise<ActionResult> {
  try {
    await assertSetupRole();
    const supabase = await createClient();
    const { error } = await supabase
      .from("room_rate_plans")
      .update({ is_active: isActive })
      .eq("id", planId);
    if (error) return { ok: false, error: error.message };
    revalidateRooms();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteRatePlan(planId: string): Promise<ActionResult> {
  try {
    await assertSetupRole();
    const supabase = await createClient();
    // Past bookings keep their snapshot (rate_plan_id becomes null on delete).
    const { error } = await supabase.from("room_rate_plans").delete().eq("id", planId);
    if (error) return { ok: false, error: error.message };
    revalidateRooms();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

function parseRoomForm(formData: FormData):
  | { ok: true; roomNumber: string; typeId: string; floorZone: string | null }
  | { ok: false; error: string } {
  const roomNumber = String(formData.get("room_number") ?? "").trim();
  const typeId = String(formData.get("type_id") ?? "");
  const floorZone = String(formData.get("floor_zone") ?? "").trim();

  if (!roomNumber) return { ok: false, error: "Room number is required." };
  if (!typeId) return { ok: false, error: "Pick a room category." };
  return { ok: true, roomNumber, typeId, floorZone: floorZone || null };
}

export async function createRoom(formData: FormData): Promise<ActionResult> {
  try {
    await assertSetupRole();
    const parsed = parseRoomForm(formData);
    if (!parsed.ok) return parsed;

    const supabase = await createClient();
    const { error } = await supabase.from("rooms").insert({
      room_number: parsed.roomNumber,
      type_id: parsed.typeId,
      floor_zone: parsed.floorZone,
      status: "vacant",
    });
    if (error)
      return {
        ok: false,
        error: error.code === "23505" ? "That room number already exists." : error.message,
      };

    revalidateRooms();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function updateRoom(roomId: string, formData: FormData): Promise<ActionResult> {
  try {
    await assertSetupRole();
    const parsed = parseRoomForm(formData);
    if (!parsed.ok) return parsed;

    const supabase = await createClient();
    const { error } = await supabase
      .from("rooms")
      .update({
        room_number: parsed.roomNumber,
        type_id: parsed.typeId,
        floor_zone: parsed.floorZone,
      })
      .eq("id", roomId);
    if (error)
      return {
        ok: false,
        error: error.code === "23505" ? "That room number already exists." : error.message,
      };

    revalidateRooms();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteRoom(roomId: string): Promise<ActionResult> {
  try {
    await assertSetupRole();
    const supabase = await createClient();

    const { data: room } = await supabase
      .from("rooms")
      .select("status")
      .eq("id", roomId)
      .single();
    if (!room) return { ok: false, error: "Room not found." };
    if (room.status === "occupied")
      return { ok: false, error: "Cannot delete an occupied room — check the guest out first." };

    const { count } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomId)
      .in("status", ["pending", "checked_in"]);
    if ((count ?? 0) > 0)
      return {
        ok: false,
        error: "Cannot delete — this room has pending or in-house bookings. Cancel or check them out first.",
      };

    // Historical bookings keep their records (room_id becomes null on delete).
    const { error } = await supabase.from("rooms").delete().eq("id", roomId);
    if (error) return { ok: false, error: error.message };

    revalidateRooms();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
