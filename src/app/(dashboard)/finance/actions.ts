"use server";

import { revalidatePath } from "next/cache";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import type { ExpenseCategory } from "@/lib/types";

interface ActionResult {
  ok: boolean;
  error?: string;
}

const FINANCE_ROLES = ["admin", "manager"];
const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "utilities",
  "purchasing",
  "salary",
  "maintenance",
  "marketing",
];

async function assertFinanceRole() {
  const profile = await getSessionProfile();
  if (!profile || !FINANCE_ROLES.includes(profile.role)) {
    throw new Error("Not authorized for finance operations.");
  }
  return profile;
}

export async function logExpense(formData: FormData): Promise<ActionResult> {
  try {
    const profile = await assertFinanceRole();
    const supabase = await createClient();

    const category = String(formData.get("category") ?? "") as ExpenseCategory;
    const amount = Number(formData.get("amount") ?? 0);
    const date = String(formData.get("date") ?? "");
    const description = String(formData.get("description") ?? "").trim();

    if (!EXPENSE_CATEGORIES.includes(category))
      return { ok: false, error: "Pick a valid expense category." };
    if (!Number.isFinite(amount) || amount <= 0)
      return { ok: false, error: "Amount must be greater than zero." };
    if (!date) return { ok: false, error: "Pick the expense date." };

    const { error } = await supabase.from("expenses").insert({
      category,
      amount,
      date,
      description: description || null,
      logged_by: profile.id,
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath("/finance/expenses");
    revalidatePath("/finance/reports");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteExpense(expenseId: string): Promise<ActionResult> {
  try {
    await assertFinanceRole();
    const supabase = await createClient();
    const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/finance/expenses");
    revalidatePath("/finance/reports");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
