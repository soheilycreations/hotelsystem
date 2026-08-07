"use server";

import { revalidatePath } from "next/cache";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import type { PaymentMethod } from "@/lib/types";

interface ActionResult {
  ok: boolean;
  error?: string;
}

async function assertAdmin() {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "admin") {
    throw new Error("Only an admin can edit a settled record.");
  }
  return profile;
}

function revalidateAll(): void {
  revalidatePath("/settings/settled-records", "layout");
  revalidatePath("/finance/cash-book");
  revalidatePath("/finance/daily-summary");
  revalidatePath("/finance/reports");
  revalidatePath("/finance/credit-accounts", "layout");
  revalidatePath("/pos/billing");
  revalidatePath("/pms/reserve");
  revalidatePath("/");
}

export interface UpdateOrderInput {
  orderId: string;
  paymentMethod: PaymentMethod;
  creditAccountId?: string;
  subtotal: number;
  serviceCharge: number;
}

export async function updateSettledOrder(input: UpdateOrderInput): Promise<ActionResult> {
  try {
    await assertAdmin();

    if (input.paymentMethod === "credit" && !input.creditAccountId)
      return { ok: false, error: "Pick a credit account." };
    if (!Number.isFinite(input.subtotal) || input.subtotal < 0)
      return { ok: false, error: "Subtotal must be zero or more." };
    if (!Number.isFinite(input.serviceCharge) || input.serviceCharge < 0)
      return { ok: false, error: "Service charge must be zero or more." };

    const supabase = await createClient();
    const { error } = await supabase
      .from("restaurant_orders")
      .update({
        payment_method: input.paymentMethod,
        credit_account_id: input.paymentMethod === "credit" ? input.creditAccountId : null,
        subtotal: input.subtotal,
        service_charge: input.serviceCharge,
        total_amount: input.subtotal + input.serviceCharge,
      })
      .eq("id", input.orderId)
      .eq("order_status", "completed"); // guard: only ever touch already-settled bills here
    if (error) return { ok: false, error: error.message };

    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export interface UpdateBookingInput {
  bookingId: string;
  paymentMethod: PaymentMethod;
  creditAccountId?: string;
  ratePlanPrice: number | null;
  totalFolioAmount: number;
}

export async function updateSettledBooking(input: UpdateBookingInput): Promise<ActionResult> {
  try {
    await assertAdmin();

    if (input.paymentMethod === "credit" && !input.creditAccountId)
      return { ok: false, error: "Pick a credit account." };
    if (!Number.isFinite(input.totalFolioAmount) || input.totalFolioAmount < 0)
      return { ok: false, error: "Total must be zero or more." };

    const supabase = await createClient();
    const { error } = await supabase
      .from("bookings")
      .update({
        payment_method: input.paymentMethod,
        credit_account_id: input.paymentMethod === "credit" ? input.creditAccountId : null,
        rate_plan_price: input.ratePlanPrice,
        total_folio_amount: input.totalFolioAmount,
      })
      .eq("id", input.bookingId)
      .eq("status", "checked_out"); // guard: only ever touch already-checked-out bookings here
    if (error) return { ok: false, error: error.message };

    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------------------------------------------------------------------------
// Item-level editing — the DB trigger recalculates the order's subtotal,
// service charge, and total automatically whenever order_items change, so
// these just touch the item rows and let that trigger keep everything else
// consistent.
// ---------------------------------------------------------------------------

export async function updateSettledOrderItemQuantity(
  itemId: string,
  quantity: number
): Promise<ActionResult> {
  try {
    await assertAdmin();
    if (!Number.isInteger(quantity) || quantity < 1)
      return { ok: false, error: "Quantity must be at least 1." };

    const supabase = await createClient();
    const { error } = await supabase.from("order_items").update({ quantity }).eq("id", itemId);
    if (error) return { ok: false, error: error.message };

    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteSettledOrderItem(itemId: string): Promise<ActionResult> {
  try {
    await assertAdmin();
    const supabase = await createClient();

    // Refuse to delete the last remaining item — a settled bill with zero
    // items is a broken state; delete the whole record via SQL if that's
    // genuinely what's needed.
    const { data: item } = await supabase
      .from("order_items")
      .select("order_id")
      .eq("id", itemId)
      .single();
    if (item) {
      const { count } = await supabase
        .from("order_items")
        .select("id", { count: "exact", head: true })
        .eq("order_id", item.order_id);
      if ((count ?? 0) <= 1)
        return { ok: false, error: "Can't delete the last item on a bill." };
    }

    const { error } = await supabase.from("order_items").delete().eq("id", itemId);
    if (error) return { ok: false, error: error.message };

    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export interface AddSettledOrderItemInput {
  orderId: string;
  description: string;
  amount: number;
  serviceChargeable: boolean;
}

export async function addSettledOrderItem(input: AddSettledOrderItemInput): Promise<ActionResult> {
  try {
    await assertAdmin();
    const description = input.description.trim();
    if (!description) return { ok: false, error: "Describe the item." };
    if (!Number.isFinite(input.amount) || input.amount <= 0)
      return { ok: false, error: "Amount must be greater than zero." };

    const supabase = await createClient();
    const { error } = await supabase.from("order_items").insert({
      order_id: input.orderId,
      menu_item_id: null,
      is_custom: true,
      custom_description: description,
      service_chargeable: input.serviceChargeable,
      quantity: 1,
      unit_price: Math.round(input.amount * 100) / 100,
    });
    if (error) return { ok: false, error: error.message };

    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export interface AddSettledOrderItemFromMenuInput {
  orderId: string;
  menuItemId: string;
  quantity: number;
}

export async function addSettledOrderItemFromMenu(
  input: AddSettledOrderItemFromMenuInput
): Promise<ActionResult> {
  try {
    await assertAdmin();
    if (!Number.isInteger(input.quantity) || input.quantity < 1)
      return { ok: false, error: "Quantity must be at least 1." };

    const supabase = await createClient();
    const { data: menuItem } = await supabase
      .from("menu_items")
      .select("selling_price, service_chargeable")
      .eq("id", input.menuItemId)
      .single();
    if (!menuItem) return { ok: false, error: "Menu item not found." };

    const { error } = await supabase.from("order_items").insert({
      order_id: input.orderId,
      menu_item_id: input.menuItemId,
      is_custom: false,
      quantity: input.quantity,
      unit_price: menuItem.selling_price,
      service_chargeable: menuItem.service_chargeable,
    });
    if (error) return { ok: false, error: error.message };

    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------------------------------------------------------------------------
// Room booking charges — the trigger on booking_charges only handles INSERT
// (adds to the folio) and DELETE (subtracts from the folio), not UPDATE. So
// "editing" a charge is a delete-then-insert here, which the same trigger
// still applies correctly — the folio nets out to the right number without
// needing a migration.
// ---------------------------------------------------------------------------

export interface AddSettledBookingChargeInput {
  bookingId: string;
  description: string;
  amount: number;
}

export async function addSettledBookingCharge(input: AddSettledBookingChargeInput): Promise<ActionResult> {
  try {
    const profile = await assertAdmin();
    const description = input.description.trim();
    if (!description) return { ok: false, error: "Describe the charge." };
    if (!Number.isFinite(input.amount) || input.amount <= 0)
      return { ok: false, error: "Amount must be greater than zero." };

    const supabase = await createClient();
    const { error } = await supabase.from("booking_charges").insert({
      booking_id: input.bookingId,
      description,
      amount: Math.round(input.amount * 100) / 100,
      created_by: profile.id,
    });
    if (error) return { ok: false, error: error.message };

    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export interface UpdateSettledBookingChargeInput {
  chargeId: string;
  bookingId: string;
  description: string;
  amount: number;
}

export async function updateSettledBookingCharge(
  input: UpdateSettledBookingChargeInput
): Promise<ActionResult> {
  try {
    const profile = await assertAdmin();
    const description = input.description.trim();
    if (!description) return { ok: false, error: "Describe the charge." };
    if (!Number.isFinite(input.amount) || input.amount <= 0)
      return { ok: false, error: "Amount must be greater than zero." };

    const supabase = await createClient();
    // Delete the old charge (folio -= old amount via trigger)…
    const { error: delError } = await supabase.from("booking_charges").delete().eq("id", input.chargeId);
    if (delError) return { ok: false, error: delError.message };
    // …then insert the corrected one (folio += new amount via trigger).
    const { error: insError } = await supabase.from("booking_charges").insert({
      booking_id: input.bookingId,
      description,
      amount: Math.round(input.amount * 100) / 100,
      created_by: profile.id,
    });
    if (insError) return { ok: false, error: insError.message };

    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteSettledBookingCharge(chargeId: string): Promise<ActionResult> {
  try {
    await assertAdmin();
    const supabase = await createClient();
    const { error } = await supabase.from("booking_charges").delete().eq("id", chargeId);
    if (error) return { ok: false, error: error.message };

    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
