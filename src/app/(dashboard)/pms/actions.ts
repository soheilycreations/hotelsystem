"use server";

import { revalidatePath } from "next/cache";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import type { BookingStatus, GuestStayHistory, PaymentMethod, RoomStatus } from "@/lib/types";
import { formatOrderNumber } from "@/lib/utils";

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

/** Upserts into the guest registry, keyed by id_number — only when an ID
 * number is actually given, since that's the only reliable dedup key.
 * Never blocks the booking if this fails; it's a nice-to-have directory,
 * not the source of truth for the stay itself. */
async function upsertGuest(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fullName: string,
  idNumber: string | null,
  contactNumber: string | null
): Promise<void> {
  if (!idNumber) return;
  await supabase
    .from("guests")
    .upsert(
      { full_name: fullName, id_number: idNumber, contact_number: contactNumber },
      { onConflict: "id_number" }
    );
}

export async function createBooking(formData: FormData): Promise<ActionResult> {
  try {
    const profile = await assertPmsRole();
    const supabase = await createClient();

    const roomId = String(formData.get("room_id") ?? "");
    const ratePlanId = String(formData.get("rate_plan_id") ?? "");
    const guestName = String(formData.get("guest_name") ?? "").trim();
    const guestIdNumber = String(formData.get("guest_id_number") ?? "").trim();
    const contact = String(formData.get("contact_number") ?? "").trim();
    const secondGuestName = String(formData.get("second_guest_name") ?? "").trim();
    const secondGuestIdNumber = String(formData.get("second_guest_id_number") ?? "").trim();
    const checkIn = String(formData.get("check_in_date") ?? "");
    const checkOut = String(formData.get("check_out_date") ?? "");
    const checkInNow = formData.get("check_in_now") === "on";
    const customPriceRaw = String(formData.get("custom_price") ?? "").trim();

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

    // A custom price overrides the plan-computed total for this one stay —
    // the plan itself (rate_plan_id/name) is still recorded so reports can
    // see what category it nominally was, priceOverridden just flags that
    // the number was hand-typed rather than derived from the plan.
    let priceOverridden = false;
    if (customPriceRaw !== "") {
      const customPrice = Number(customPriceRaw);
      if (!Number.isFinite(customPrice) || customPrice < 0)
        return { ok: false, error: "Custom price must be a valid, non-negative amount." };
      folio = customPrice;
      priceOverridden = true;
    }

    const { data: booking, error } = await supabase
      .from("bookings")
      .insert({
        room_id: roomId,
        guest_name: guestName,
        guest_id_number: guestIdNumber || null,
        contact_number: contact || null,
        second_guest_name: secondGuestName || null,
        second_guest_id_number: secondGuestIdNumber || null,
        check_in_date: checkInIso,
        check_out_date: checkOutIso,
        total_folio_amount: folio,
        stay_type: stayType,
        duration_hours: durationHours,
        rate_plan_id: plan.id,
        rate_plan_name: plan.name,
        rate_plan_price: price,
        price_overridden: priceOverridden,
        status: "pending",
        created_by: profile.id,
      })
      .select("id")
      .single();

    if (error || !booking) return { ok: false, error: error?.message ?? "Insert failed." };

    await upsertGuest(supabase, guestName, guestIdNumber || null, contact || null);
    if (secondGuestName) {
      await upsertGuest(supabase, secondGuestName, secondGuestIdNumber || null, null);
    }

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

/** Looks up a guest's past stays by NIC/passport number, for the check-in
 * form's "has this guest stayed before?" panel. Matches either the primary
 * or second-guest ID field on any past booking, most recent first. */
export async function lookupGuestHistory(idNumber: string): Promise<
  { ok: true; stays: GuestStayHistory[] } | { ok: false; error: string }
> {
  try {
    await assertPmsRole();
    const trimmed = idNumber.trim();
    if (!trimmed) return { ok: true, stays: [] };

    const supabase = await createClient();
    const selectCols =
      "id, check_in_date, check_out_date, rate_plan_name, total_folio_amount, status, rooms(room_number)";
    const [{ data: asPrimary, error: err1 }, { data: asSecond, error: err2 }] = await Promise.all([
      supabase.from("bookings").select(selectCols).eq("guest_id_number", trimmed),
      supabase.from("bookings").select(selectCols).eq("second_guest_id_number", trimmed),
    ]);
    if (err1) return { ok: false, error: err1.message };
    if (err2) return { ok: false, error: err2.message };

    interface BookingHistoryRow {
      id: string;
      check_in_date: string;
      check_out_date: string;
      rate_plan_name: string | null;
      total_folio_amount: number;
      status: string;
      rooms: { room_number: string } | null;
    }
    const byId = new Map<string, BookingHistoryRow>();
    for (const b of [...(asPrimary ?? []), ...(asSecond ?? [])] as unknown as BookingHistoryRow[]) {
      byId.set(b.id, b);
    }

    const stays: GuestStayHistory[] = Array.from(byId.values())
      .sort((a, b) => new Date(b.check_in_date).getTime() - new Date(a.check_in_date).getTime())
      .slice(0, 5)
      .map((b) => {
        const room = b.rooms as unknown as { room_number: string } | null;
        return {
          bookingId: b.id,
          roomNumber: room?.room_number ?? null,
          checkInDate: b.check_in_date,
          checkOutDate: b.check_out_date,
          ratePlanName: b.rate_plan_name,
          amount: Number(b.total_folio_amount),
          status: b.status as BookingStatus,
        };
      });
    return { ok: true, stays };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function setBookingStatus(
  bookingId: string,
  status: BookingStatus,
  paymentMethod?: PaymentMethod,
  creditAccountId?: string
): Promise<ActionResult> {
  try {
    await assertPmsRole();
    const supabase = await createClient();

    // Don't let a guest walk out with an unsettled room-service bill — those
    // only post to the folio when the order completes (Trigger B).
    if (status === "checked_out") {
      const { data: openRs } = await supabase
        .from("restaurant_orders")
        .select("order_number, business_date")
        .eq("booking_id", bookingId)
        .eq("order_status", "active");
      if (openRs && openRs.length > 0) {
        const nums = openRs.map((o) => `#${formatOrderNumber(o.business_date, o.order_number)}`).join(", ");
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
    if (status === "checked_out") {
      patch.actual_check_out = new Date().toISOString();
      patch.payment_method = paymentMethod ?? "cash";
      if (paymentMethod === "credit") {
        if (!creditAccountId) return { ok: false, error: "Pick a credit account." };
        patch.credit_account_id = creditAccountId;
      }
    }
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

/** Extend an overnight stay by extra nights — pushes checkout forward and tops up the folio at the plan's nightly rate. */
export async function extendOvernightStay(
  bookingId: string,
  extraNights: number
): Promise<ActionResult> {
  try {
    const profile = await assertPmsRole();
    if (!Number.isInteger(extraNights) || extraNights < 1)
      return { ok: false, error: "Extension must be at least 1 night." };

    const supabase = await createClient();
    const { data: b } = await supabase
      .from("bookings")
      .select("id, status, stay_type, check_out_date, rate_plan_price, guest_name")
      .eq("id", bookingId)
      .single();
    if (!b) return { ok: false, error: "Booking not found." };
    if (b.stay_type !== "overnight")
      return { ok: false, error: "Only overnight stays can be extended by nights." };
    if (b.status !== "checked_in")
      return { ok: false, error: "Only in-house stays can be extended." };

    const nightlyRate = Number(b.rate_plan_price ?? 0);
    const topUp = Math.round(nightlyRate * extraNights * 100) / 100;
    const newEnd = new Date(
      new Date(b.check_out_date).getTime() + extraNights * 86_400_000
    ).toISOString();

    // Push the checkout date first…
    const { error: e1 } = await supabase
      .from("bookings")
      .update({ check_out_date: newEnd })
      .eq("id", bookingId);
    if (e1) return { ok: false, error: e1.message };

    // …then the charge — the booking_charges trigger tops up the folio.
    if (topUp > 0) {
      const { error: e2 } = await supabase.from("booking_charges").insert({
        booking_id: bookingId,
        description: `Extended stay +${extraNights} night${extraNights > 1 ? "s" : ""}`,
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

/**
 * Shortens an overnight stay by N nights — for a guest leaving earlier than
 * planned (e.g. booked to the 8th, actually checking out today). Pulls the
 * checkout date back and removes N nights' worth of room charge from the
 * folio directly (not via booking_charges, which only allows positive
 * amounts — that table is for add-on charges, not a reduction like this).
 * Extra charges (minibar, laundry, previous extends) are left untouched.
 */
export async function shortenOvernightStay(
  bookingId: string,
  reduceNights: number
): Promise<ActionResult> {
  try {
    await assertPmsRole();
    if (!Number.isInteger(reduceNights) || reduceNights < 1)
      return { ok: false, error: "Reduction must be at least 1 night." };

    const supabase = await createClient();
    const { data: b } = await supabase
      .from("bookings")
      .select("id, status, stay_type, check_in_date, check_out_date, rate_plan_price, total_folio_amount")
      .eq("id", bookingId)
      .single();
    if (!b) return { ok: false, error: "Booking not found." };
    if (b.stay_type !== "overnight")
      return { ok: false, error: "Only overnight stays can be shortened by nights." };
    if (b.status !== "checked_in")
      return { ok: false, error: "Only in-house stays can be adjusted." };

    const currentNights = Math.max(
      1,
      Math.round(
        (new Date(b.check_out_date).getTime() - new Date(b.check_in_date).getTime()) / 86_400_000
      )
    );
    if (reduceNights >= currentNights)
      return { ok: false, error: `This stay only has ${currentNights} night(s) — can't remove that many.` };

    const nightlyRate = Number(b.rate_plan_price ?? 0);
    const reduction = Math.round(nightlyRate * reduceNights * 100) / 100;
    const newCheckout = new Date(
      new Date(b.check_out_date).getTime() - reduceNights * 86_400_000
    ).toISOString();
    const newFolio = Math.max(0, Number(b.total_folio_amount) - reduction);

    const { error } = await supabase
      .from("bookings")
      .update({ check_out_date: newCheckout, total_folio_amount: newFolio })
      .eq("id", bookingId);
    if (error) return { ok: false, error: error.message };

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
