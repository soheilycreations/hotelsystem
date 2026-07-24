import { createClient } from "@/lib/supabase/server";
import type { Expense, ExpenseCategoryRow, StaffProfile } from "@/lib/types";
import { LiveRefresher } from "../../live-refresher";
import { ExpensesDesk } from "./expenses-desk";

export const dynamic = "force-dynamic";

export type ExpenseWithLogger = Expense & {
  staff_profiles: Pick<StaffProfile, "full_name"> | null;
};

export default async function ExpensesPage() {
  const supabase = await createClient();

  const [{ data: expenses }, { data: categories }] = await Promise.all([
    supabase
      .from("expenses")
      .select("*, staff_profiles(full_name), expense_categories(*)")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("expense_categories").select("*").order("sort_order"),
  ]);

  return (
    <div className="space-y-6">
      <LiveRefresher tables={["expenses", "expense_categories"]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
        <p className="text-sm text-muted-foreground">
          Log operational costs — they flow straight into the P&amp;L report.
        </p>
      </div>
      <ExpensesDesk
        expenses={(expenses as ExpenseWithLogger[] | null) ?? []}
        categories={(categories as ExpenseCategoryRow[] | null) ?? []}
      />
    </div>
  );
}
