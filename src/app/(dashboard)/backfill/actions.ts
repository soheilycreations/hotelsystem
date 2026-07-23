"use server";

import { revalidatePath } from "next/cache";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { addCustomOrderItem, openOrder, setOrderBusinessDate, settleOrder } from "../pos/actions";

interface ActionResult {
  ok: boolean;
  error?: string;
}

const BACKFILL_ROLES = ["admin", "manager"];

async function assertBackfillRole() {
  const profile = await getSessionProfile();
  if (!profile || !BACKFILL_ROLES.includes(profile.role)) {
    throw new Error("Not authorized to backfill historical records.");
  }
  return profile;
}

function revalidateBackfill(): void {
  revalidatePath("/backfill");
  revalidatePath("/");
  revalidatePath("/finance/daily-summary");
  revalidatePath("/finance/reports");
  revalidatePath("/pms/rooms");
}

/**
 * Adds a booking that already happened in the past (from the old paper
 * register) — inserted directly as "checked_out" with the given dates and
 * amount. This is a plain INSERT, not an UPDATE, so Trigger A (which only
 * fires on status *changes*) never runs — today's real room status is left
 * completely untouched.
 */
export async function createHistoricalBooking(formData: FormData): Promise<ActionResult> {
  try {
    const profile = await assertBackfillRole();
    const supabase = await createClient();

    const roomId = String(formData.get("room_id") ?? "");
    const guestName = String(formData.get("guest_name") ?? "").trim();
    const contactNumber = String(formData.get("contact_number") ?? "").trim();
    const checkIn = String(formData.get("check_in_date") ?? "");
    const checkOut = String(formData.get("check_out_date") ?? "");
    const amount = Number(formData.get("amount") ?? 0);
    const planLabel = String(formData.get("plan_label") ?? "").trim();

    if (!roomId) return { ok: false, error: "Pick a room." };
    if (!guestName) return { ok: false, error: "Guest name is required." };
    if (!checkIn || !checkOut) return { ok: false, error: "Both dates are required." };
    if (new Date(checkOut) < new Date(checkIn))
      return { ok: false, error: "Check-out can't be before check-in." };
    if (!Number.isFinite(amount) || amount <= 0)
      return { ok: false, error: "Amount must be greater than zero." };

    // Noon avoids timezone-driven off-by-one-day surprises for a date-only
    // record. For a same-day guest (day-use / walk-in-walk-out), check-in and
    // check-out would otherwise land on the exact same timestamp, which the
    // database rejects (check-out must be strictly after check-in) — so
    // spread them across the day instead.
    const sameDay = checkIn === checkOut;
    const checkInIso = new Date(`${checkIn}T${sameDay ? "10:00:00" : "12:00:00"}`).toISOString();
    const checkOutIso = new Date(`${checkOut}T${sameDay ? "18:00:00" : "12:00:00"}`).toISOString();

    const { error } = await supabase.from("bookings").insert({
      room_id: roomId,
      guest_name: guestName,
      contact_number: contactNumber || null,
      check_in_date: checkInIso,
      check_out_date: checkOutIso,
      actual_check_in: checkInIso,
      actual_check_out: checkOutIso,
      total_folio_amount: Math.round(amount * 100) / 100,
      stay_type: "overnight",
      rate_plan_id: null,
      rate_plan_name: planLabel || "Historical entry",
      status: "checked_out",
      created_by: profile.id,
    });
    if (error) return { ok: false, error: error.message };

    revalidateBackfill();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export interface HistoricalSaleInput {
  date: string;
  description: string;
  amount: number;
  serviceChargeable: boolean;
}

/**
 * Logs a past restaurant/POS sale from the old book as a single-line
 * "banquet" order (reusing the custom-line + business-date machinery) —
 * opened, priced, dated, and settled in one step instead of the usual
 * open → add items → settle flow.
 */
export async function createHistoricalSale(input: HistoricalSaleInput): Promise<ActionResult> {
  try {
    await assertBackfillRole();
    const description = input.description.trim();
    if (!description) return { ok: false, error: "Describe the sale (e.g. Dinner service)." };
    if (!Number.isFinite(input.amount) || input.amount <= 0)
      return { ok: false, error: "Amount must be greater than zero." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date))
      return { ok: false, error: "Pick a valid date." };

    const opened = await openOrder({
      channel: "banquet",
      eventName: `Historical sale — ${input.date}`,
    });
    if (!opened.ok || !opened.orderId) return { ok: false, error: opened.error ?? "Could not open." };

    const lineAdded = await addCustomOrderItem({
      orderId: opened.orderId,
      description,
      amount: input.amount,
      serviceChargeable: input.serviceChargeable,
      logAsExpense: false,
    });
    if (!lineAdded.ok) return lineAdded;

    const dated = await setOrderBusinessDate(opened.orderId, input.date);
    if (!dated.ok) return dated;

    const settled = await settleOrder(opened.orderId);
    if (!settled.ok) return settled;

    revalidateBackfill();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
