"use server";

import { revalidatePath } from "next/cache";
import { createClient, getSessionProfile } from "@/lib/supabase/server";

interface ActionResult {
  ok: boolean;
  error?: string;
}

const FLOAT_ROLES = ["admin", "manager", "cashier"];

export async function setCashierFloat(date: string, amount: number): Promise<ActionResult> {
  try {
    const profile = await getSessionProfile();
    if (!profile || !FLOAT_ROLES.includes(profile.role)) {
      return { ok: false, error: "Not authorized to set the cashier float." };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Pick a valid date." };
    if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: "Enter a valid amount." };

    const supabase = await createClient();
    const { error } = await supabase
      .from("cashier_float")
      .upsert({ date, amount, set_by: profile.id, updated_at: new Date().toISOString() }, { onConflict: "date" });
    if (error) return { ok: false, error: error.message };

    revalidatePath("/finance/simple-report");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
