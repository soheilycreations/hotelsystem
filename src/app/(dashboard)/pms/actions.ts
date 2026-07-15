"use server";

import { revalidatePath } from "next/cache";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import type { BookingStatus, RoomStatus } from "@/lib/types";

interface ActionResult {
  ok: boolean;
  error?: string;
}

const PMS_ROLES = ["admin", "manager", "receptionist"];

async function assertPmsRole() {
  const profile = await getSessionProfile();
  if (!profile || !PMS_ROLES.includes(profile.role)) {
    throw new Error("Not authorized for PMS operations.");
  }
  return profile;
}

export async function setRoomStatus(roomId: string, status: RoomStatus): Promise<ActionResult> {
  try {
    await assertPmsRole();
    const supabase = await createClient();
    const { error } = await supabase.from("rooms").update({ status }).eq("id", roomId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/pms/rooms");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function createBooking(formData: FormData): Promise<ActionResult> {
  try {
    const profile = await assertPmsRole();
    const supabase = await createClient();

    const roomId = String(formData.get("room_id") ?? "");
    const guestName = String(formData.get("guest_name") ?? "").trim();
    const contact = String(formData.get("contact_number") ?? "").trim();
    const checkIn = String(formData.get("check_in_date") ?? "");
    const checkOut = String(formData.get("check_out_date") ?? "");
    const checkInNow = formData.get("check_in_now") === "on";

    if (!roomId || !guestName || !checkIn || !checkOut) {
      return { ok: false, error: "Room, guest name and both dates are required." };
    }
    if (new Date(checkOut) <= new Date(checkIn)) {
      return { ok: false, error: "Check-out must be after check-in." };
    }

    // Nightly rate × nights → opening folio amount
    const { data: room } = await supabase
      .from("rooms")
      .select("id, status, room_types(base_price)")
      .eq("id", roomId)
      .single();

    if (!room) return { ok: false, error: "Room not found." };
    if (checkInNow && room.status !== "vacant") {
      return { ok: false, error: "That room is not vacant — pick another for immediate check-in." };
    }

    const nights = Math.max(
      1,
      Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000)
    );
    const roomTypes = room.room_types as unknown as { base_price: number } | null;
    const basePrice = Number(roomTypes?.base_price ?? 0);

    const { data: booking, error } = await supabase
      .from("bookings")
      .insert({
        room_id: roomId,
        guest_name: guestName,
        contact_number: contact || null,
        check_in_date: new Date(checkIn).toISOString(),
        check_out_date: new Date(checkOut).toISOString(),
        total_folio_amount: basePrice * nights,
        status: "pending",
        created_by: profile.id,
      })
      .select("id")
      .single();

    if (error || !booking) return { ok: false, error: error?.message ?? "Insert failed." };

    if (checkInNow) {
      // Trigger A's sibling flips the room to occupied on this status change
      const { error: e2 } = await supabase
        .from("bookings")
        .update({ status: "checked_in" })
        .eq("id", booking.id);
      if (e2) return { ok: false, error: e2.message };
    }

    revalidatePath("/pms/reserve");
    revalidatePath("/pms/rooms");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function setBookingStatus(
  bookingId: string,
  status: BookingStatus
): Promise<ActionResult> {
  try {
    await assertPmsRole();
    const supabase = await createClient();
    // Room status flips automatically via Trigger A (housekeeping automator)
    const { error } = await supabase
      .from("bookings")
      .update({ status })
      .eq("id", bookingId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/pms/reserve");
    revalidatePath("/pms/rooms");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
