"use server";

import { revalidatePath } from "next/cache";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import type { CashDirection } from "@/lib/types";

interface ActionResult {
  ok: boolean;
  error?: string;
}

const CASH_ROLES = ["admin", "manager"];

async function assertCashRole() {
  const profile = await getSessionProfile();
  if (!profile || !CASH_ROLES.includes(profile.role)) {
    throw new Error("Not authorized for cash book entries.");
  }
  return profile;
}

function revalidateCashBook(): void {
  revalidatePath("/finance/cash-book");
  revalidatePath("/");
}

export async function createCashMovement(formData: FormData): Promise<ActionResult> {
  try {
    const profile = await assertCashRole();
    const supabase = await createClient();

    const direction = String(formData.get("direction") ?? "") as CashDirection;
    const category = String(formData.get("category") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const amount = Number(formData.get("amount") ?? 0);
    const date = String(formData.get("date") ?? "");

    if (direction !== "in" && direction !== "out")
      return { ok: false, error: "Pick In or Out." };
    if (!category) return { ok: false, error: "Give this movement a category (e.g. Bank Deposit)." };
    if (!Number.isFinite(amount) || amount <= 0)
      return { ok: false, error: "Amount must be greater than zero." };
    if (!date) return { ok: false, error: "Pick a date." };

    const { error } = await supabase.from("cash_movements").insert({
      direction,
      category,
      description: description || null,
      amount: Math.round(amount * 100) / 100,
      date,
      logged_by: profile.id,
    });
    if (error) return { ok: false, error: error.message };

    revalidateCashBook();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteCashMovement(movementId: string): Promise<ActionResult> {
  try {
    await assertCashRole();
    const supabase = await createClient();
    const { error } = await supabase.from("cash_movements").delete().eq("id", movementId);
    if (error) return { ok: false, error: error.message };

    revalidateCashBook();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
