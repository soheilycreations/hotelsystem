"use server";

import { revalidatePath } from "next/cache";
import { createClient, getSessionProfile } from "@/lib/supabase/server";

interface ActionResult {
  ok: boolean;
  error?: string;
}

const FINANCE_ROLES = ["admin", "manager"];

async function assertFinanceRole() {
  const profile = await getSessionProfile();
  if (!profile || !FINANCE_ROLES.includes(profile.role)) {
    throw new Error("Not authorized for finance operations.");
  }
  return profile;
}

function revalidateFinance(): void {
  revalidatePath("/finance/expenses");
  revalidatePath("/finance/reports");
  revalidatePath("/finance/daily-summary");
  revalidatePath("/");
}

export async function logExpense(formData: FormData): Promise<ActionResult> {
  try {
    const profile = await assertFinanceRole();
    const supabase = await createClient();

    const categoryId = String(formData.get("category_id") ?? "");
    const amount = Number(formData.get("amount") ?? 0);
    const date = String(formData.get("date") ?? "");
    const description = String(formData.get("description") ?? "").trim();
    const paymentMethod = String(formData.get("payment_method") ?? "cash");
    const division = String(formData.get("division") ?? "restaurant");

    if (!categoryId) return { ok: false, error: "Pick a valid expense category." };
    if (!Number.isFinite(amount) || amount <= 0)
      return { ok: false, error: "Amount must be greater than zero." };
    if (!date) return { ok: false, error: "Pick the expense date." };
    if (!["cash", "card", "bank_transfer"].includes(paymentMethod))
      return { ok: false, error: "Pick a valid payment method." };
    if (!["restaurant", "room"].includes(division))
      return { ok: false, error: "Pick a valid allocation." };

    const { error } = await supabase.from("expenses").insert({
      category_id: categoryId,
      amount,
      date,
      description: description || null,
      payment_method: paymentMethod,
      division,
      logged_by: profile.id,
    });
    if (error) return { ok: false, error: error.message };

    revalidateFinance();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function updateExpense(expenseId: string, formData: FormData): Promise<ActionResult> {
  try {
    await assertFinanceRole();
    const supabase = await createClient();

    const categoryId = String(formData.get("category_id") ?? "");
    const amount = Number(formData.get("amount") ?? 0);
    const date = String(formData.get("date") ?? "");
    const description = String(formData.get("description") ?? "").trim();
    const paymentMethod = String(formData.get("payment_method") ?? "cash");
    const division = String(formData.get("division") ?? "restaurant");

    if (!categoryId) return { ok: false, error: "Pick a valid expense category." };
    if (!Number.isFinite(amount) || amount <= 0)
      return { ok: false, error: "Amount must be greater than zero." };
    if (!date) return { ok: false, error: "Pick the expense date." };
    if (!["cash", "card", "bank_transfer"].includes(paymentMethod))
      return { ok: false, error: "Pick a valid payment method." };
    if (!["restaurant", "room"].includes(division))
      return { ok: false, error: "Pick a valid allocation." };

    const { error } = await supabase
      .from("expenses")
      .update({
        category_id: categoryId,
        amount,
        date,
        description: description || null,
        payment_method: paymentMethod,
        division,
      })
      .eq("id", expenseId);
    if (error) return { ok: false, error: error.message };

    revalidateFinance();
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

    revalidateFinance();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------------------------------------------------------------------------
// Expense categories
// ---------------------------------------------------------------------------

export async function createExpenseCategory(formData: FormData): Promise<ActionResult> {
  try {
    await assertFinanceRole();
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { ok: false, error: "Category name is required." };

    const supabase = await createClient();
    const { count } = await supabase
      .from("expense_categories")
      .select("id", { count: "exact", head: true });

    const { error } = await supabase.from("expense_categories").insert({
      name,
      sort_order: (count ?? 0) + 1,
    });
    if (error)
      return {
        ok: false,
        error: error.code === "23505" ? "A category with that name already exists." : error.message,
      };

    revalidateFinance();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function renameExpenseCategory(
  categoryId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    await assertFinanceRole();
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { ok: false, error: "Category name is required." };

    const supabase = await createClient();
    const { error } = await supabase
      .from("expense_categories")
      .update({ name })
      .eq("id", categoryId);
    if (error)
      return {
        ok: false,
        error: error.code === "23505" ? "A category with that name already exists." : error.message,
      };

    revalidateFinance();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteExpenseCategory(categoryId: string): Promise<ActionResult> {
  try {
    await assertFinanceRole();
    const supabase = await createClient();

    const { count } = await supabase
      .from("expenses")
      .select("id", { count: "exact", head: true })
      .eq("category_id", categoryId);
    if ((count ?? 0) > 0)
      return {
        ok: false,
        error: `Cannot delete — ${count} expense(s) still use this category.`,
      };

    const { error } = await supabase.from("expense_categories").delete().eq("id", categoryId);
    if (error) return { ok: false, error: error.message };

    revalidateFinance();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
