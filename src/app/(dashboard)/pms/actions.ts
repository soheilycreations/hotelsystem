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
    const ratePlanId = String(formData.get("rate_plan_id") ?? "");
    const guestName = String(formData.get("guest_name") ?? "").trim();
    const contact = String(formData.get("contact_number") ?? "").trim();
    const checkIn = String(formData.get("check_in_date") ?? "");
    const checkOut = String(formData.get("check_out_date") ?? "");
    const checkInNow = formData.get("check_in_now") === "on";

    if (!roomId || !guestName) return { ok: false, error: "Room and guest name are required." };
    if (!ratePlanId) return { ok: false, error: "Pick a rate plan for this stay." };

    const { data: room } = await supabase
      .from("rooms")
      .select("id, status, type_id")
      .eq("id", roomId)
      .single();
    if (!room) return { ok: false, error: "Room not found." };
    if (checkInNow && room.status !== "vacant") {
      return { ok: false, error: "That room is not vacant — pick another for immediate check-in." };
    }

    const { data: plan } = await supabase
      .from("room_rate_plans")
      .select("*")
      .eq("id", ratePlanId)
      .single();
    if (!plan) return { ok: false, error: "Rate plan not found." };
    if (plan.room_type_id !== room.type_id)
      return { ok: false, error: "That rate plan belongs to a different room category." };
    if (!plan.is_active) return { ok: false, error: "That rate plan is switched off." };

    const price = Number(plan.price);
    let checkInIso: string;
    let checkOutIso: string;
    let folio: number;
    let stayType: "overnight" | "short_stay";
    let durationHours: number | null;

    if (plan.kind === "block") {
      // Time-block stay: the window is a placeholder from "now" until the
      // guest actually checks in — setBookingStatus re-anchors it then.
      stayType = "short_stay";
      durationHours = Number(plan.duration_hours);
      const start = new Date();
      checkInIso = start.toISOString();
      checkOutIso = new Date(start.getTime() + durationHours * 3_600_000).toISOString();
      folio = price;
    } else {
      stayType = "overnight";
      durationHours = null;
      if (!checkIn || !checkOut) return { ok: false, error: "Both dates are required." };
      if (new Date(checkOut) <= new Date(checkIn))
        return { ok: false, error: "Check-out must be after check-in." };
      const nights = Math.max(
        1,
        Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000)
      );
      checkInIso = new Date(checkIn).toISOString();
      checkOutIso = new Date(checkOut).toISOString();
      folio = price * nights;
    }

    const { data: booking, error } = await supabase
      .from("bookings")
      .insert({
        room_id: roomId,
        guest_name: guestName,
        contact_number: contact || null,
        check_in_date: checkInIso,
        check_out_date: checkOutIso,
        total_folio_amount: folio,
        stay_type: stayType,
        duration_hours: durationHours,
        rate_plan_id: plan.id,
        rate_plan_name: plan.name,
        rate_plan_price: price,
        status: "pending",
        created_by: profile.id,
      })
      .select("id")
      .single();

    if (error || !booking) return { ok: false, error: error?.message ?? "Insert failed." };

    if (checkInNow) {
      const result = await setBookingStatus(booking.id, "checked_in");
      if (!result.ok) return result;
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

    // Don't let a guest walk out with an unsettled room-service bill — those
    // only post to the folio when the order completes (Trigger B).
    if (status === "checked_out") {
      const { data: openRs } = await supabase
        .from("restaurant_orders")
        .select("order_number")
        .eq("booking_id", bookingId)
        .eq("order_status", "active");
      if (openRs && openRs.length > 0) {
        const nums = openRs.map((o) => `#${o.order_number}`).join(", ");
        return {
          ok: false,
          error: `Settle room-service bill${openRs.length > 1 ? "s" : ""} ${nums} first (Billing screen) — then check out.`,
        };
      }
    }

    // For a time-block stay the countdown starts at the ACTUAL check-in moment,
    // so re-anchor the window when the guest walks in.
    if (status === "checked_in") {
      const { data: b } = await supabase
        .from("bookings")
        .select("stay_type, duration_hours")
        .eq("id", bookingId)
        .single();
      if (b?.stay_type === "short_stay" && b.duration_hours) {
        const now = new Date();
        const end = new Date(now.getTime() + Number(b.duration_hours) * 3_600_000);
        const { error } = await supabase
          .from("bookings")
          .update({
            status,
            check_in_date: now.toISOString(),
            check_out_date: end.toISOString(),
            actual_check_in: now.toISOString(),
          })
          .eq("id", bookingId);
        if (error) return { ok: false, error: error.message };
        revalidatePath("/pms/reserve");
        revalidatePath("/pms/rooms");
        return { ok: true };
      }
    }

    // Room status flips automatically via Trigger A (housekeeping automator)
    const patch: Record<string, unknown> = { status };
    if (status === "checked_in") patch.actual_check_in = new Date().toISOString();
    if (status === "checked_out") patch.actual_check_out = new Date().toISOString();
    const { error } = await supabase
      .from("bookings")
      .update(patch)
      .eq("id", bookingId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/pms/reserve");
    revalidatePath("/pms/rooms");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Extend a running time-block stay — pushes the deadline and tops up the folio proportionally. */
export async function extendShortStay(
  bookingId: string,
  extraHours: number
): Promise<ActionResult> {
  try {
    const profile = await assertPmsRole();
    if (!Number.isInteger(extraHours) || extraHours < 1)
      return { ok: false, error: "Extension must be at least 1 hour." };

    const supabase = await createClient();
    const { data: b } = await supabase
      .from("bookings")
      .select("id, status, stay_type, duration_hours, check_out_date, rate_plan_price, guest_name")
      .eq("id", bookingId)
      .single();
    if (!b) return { ok: false, error: "Booking not found." };
    if (b.stay_type !== "short_stay" || !b.duration_hours)
      return { ok: false, error: "Only time-block stays can be extended." };
    if (b.status !== "checked_in")
      return { ok: false, error: "Only in-house stays can be extended." };

    const perHour = Number(b.rate_plan_price ?? 0) / Number(b.duration_hours);
    const topUp = Math.round(perHour * extraHours * 100) / 100;
    const newEnd = new Date(
      new Date(b.check_out_date).getTime() + extraHours * 3_600_000
    ).toISOString();

    // Push the deadline first…
    const { error: e1 } = await supabase
      .from("bookings")
      .update({
        check_out_date: newEnd,
        duration_hours: Number(b.duration_hours) + extraHours,
      })
      .eq("id", bookingId);
    if (e1) return { ok: false, error: e1.message };

    // …then the charge — the booking_charges trigger tops up the folio.
    if (topUp > 0) {
      const { error: e2 } = await supabase.from("booking_charges").insert({
        booking_id: bookingId,
        description: `Extended stay +${extraHours}h`,
        amount: topUp,
        created_by: profile.id,
      });
      if (e2) return { ok: false, error: e2.message };
    }

    revalidatePath("/pms/reserve");
    revalidatePath("/pms/rooms");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Add a custom charge (overtime, minibar, laundry…) — the trigger updates the folio. */
export async function addBookingCharge(
  bookingId: string,
  amount: number,
  description: string
): Promise<ActionResult> {
  try {
    const profile = await assertPmsRole();
    if (!Number.isFinite(amount) || amount <= 0)
      return { ok: false, error: "Charge amount must be greater than zero." };
    const desc = description.trim();
    if (!desc) return { ok: false, error: "Describe the charge (e.g. Overtime 1h)." };

    const supabase = await createClient();
    const { data: b } = await supabase
      .from("bookings")
      .select("id, status")
      .eq("id", bookingId)
      .single();
    if (!b) return { ok: false, error: "Booking not found." };
    if (b.status !== "checked_in" && b.status !== "pending")
      return { ok: false, error: "Charges can only be added to open bookings." };

    const { error } = await supabase.from("booking_charges").insert({
      booking_id: bookingId,
      description: desc,
      amount: Math.round(amount * 100) / 100,
      created_by: profile.id,
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath("/pms/reserve");
    revalidatePath("/pms/rooms");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
