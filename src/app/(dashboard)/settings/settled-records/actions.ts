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
