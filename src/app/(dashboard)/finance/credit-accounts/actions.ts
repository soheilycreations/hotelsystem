"use server";

import { revalidatePath } from "next/cache";
import { createClient, getSessionProfile } from "@/lib/supabase/server";

interface ActionResult {
  ok: boolean;
  error?: string;
  accountId?: string;
}

const CREDIT_ROLES = ["admin", "manager", "receptionist", "cashier"];
const REPAYMENT_ROLES = ["admin", "manager"];

async function assertCreditRole() {
  const profile = await getSessionProfile();
  if (!profile || !CREDIT_ROLES.includes(profile.role)) {
    throw new Error("Not authorized for credit accounts.");
  }
  return profile;
}

function revalidateCredit(): void {
  revalidatePath("/finance/credit-accounts", "layout");
  revalidatePath("/finance/cash-book");
  revalidatePath("/finance/daily-summary");
  revalidatePath("/pos/billing");
  revalidatePath("/pms/reserve");
}

export async function createCreditAccount(formData: FormData): Promise<ActionResult> {
  try {
    const profile = await assertCreditRole();
    const name = String(formData.get("name") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();
    if (!name) return { ok: false, error: "Account name is required." };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("credit_accounts")
      .insert({ name, notes: notes || null, created_by: profile.id })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };

    revalidateCredit();
    return { ok: true, accountId: data.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function updateCreditAccount(
  accountId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    await assertCreditRole();
    const name = String(formData.get("name") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();
    if (!name) return { ok: false, error: "Account name is required." };

    const supabase = await createClient();
    const { error } = await supabase
      .from("credit_accounts")
      .update({ name, notes: notes || null })
      .eq("id", accountId);
    if (error) return { ok: false, error: error.message };

    revalidateCredit();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function recordCreditRepayment(formData: FormData): Promise<ActionResult> {
  try {
    const profile = await getSessionProfile();
    if (!profile || !REPAYMENT_ROLES.includes(profile.role)) {
      throw new Error("Not authorized to record repayments.");
    }

    const creditAccountId = String(formData.get("credit_account_id") ?? "");
    const amount = Number(formData.get("amount") ?? 0);
    const paymentMethod = String(formData.get("payment_method") ?? "cash");
    const date = String(formData.get("date") ?? "");
    const description = String(formData.get("description") ?? "").trim();

    if (!creditAccountId) return { ok: false, error: "Pick an account." };
    if (!Number.isFinite(amount) || amount <= 0)
      return { ok: false, error: "Amount must be greater than zero." };
    if (!["cash", "bank_transfer"].includes(paymentMethod))
      return { ok: false, error: "Pick how the repayment arrived." };
    if (!date) return { ok: false, error: "Pick a date." };

    const supabase = await createClient();
    const { data: account } = await supabase
      .from("credit_accounts")
      .select("name")
      .eq("id", creditAccountId)
      .single();

    const { error } = await supabase.from("credit_repayments").insert({
      credit_account_id: creditAccountId,
      amount,
      payment_method: paymentMethod,
      date,
      description: description || null,
      logged_by: profile.id,
    });
    if (error) return { ok: false, error: error.message };

    // Cash repayments also land in the Cash Book as a manual "in" movement —
    // real money physically arrived, same as any other cash-in event.
    if (paymentMethod === "cash") {
      await supabase.from("cash_movements").insert({
        direction: "in",
        category: "Credit Repayment",
        description: account?.name ? `${account.name}${description ? ` — ${description}` : ""}` : description || null,
        amount,
        date,
        logged_by: profile.id,
      });
    }

    revalidateCredit();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

/**
 * Manually adds to what an account owes — for old bills that can't be
 * individually found and retagged. Admin only, since it changes a balance
 * without a real bill behind it.
 */
export async function addCreditAdjustment(formData: FormData): Promise<ActionResult> {
  try {
    const profile = await getSessionProfile();
    if (!profile || profile.role !== "admin") {
      throw new Error("Only an admin can add a manual credit adjustment.");
    }

    const creditAccountId = String(formData.get("credit_account_id") ?? "");
    const amount = Number(formData.get("amount") ?? 0);
    const date = String(formData.get("date") ?? "");
    const description = String(formData.get("description") ?? "").trim();

    if (!creditAccountId) return { ok: false, error: "Pick an account." };
    if (!Number.isFinite(amount) || amount <= 0)
      return { ok: false, error: "Amount must be greater than zero." };
    if (!date) return { ok: false, error: "Pick a date." };

    const supabase = await createClient();
    const { error } = await supabase.from("credit_adjustments").insert({
      credit_account_id: creditAccountId,
      amount,
      date,
      description: description || null,
      created_by: profile.id,
    });
    if (error) return { ok: false, error: error.message };

    revalidateCredit();
    revalidatePath(`/finance/credit-accounts/${creditAccountId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
