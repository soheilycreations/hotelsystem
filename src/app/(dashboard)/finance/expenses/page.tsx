import { createClient } from "@/lib/supabase/server";
import type { Expense, StaffProfile } from "@/lib/types";
import { LiveRefresher } from "../../live-refresher";
import { ExpensesDesk } from "./expenses-desk";

export const dynamic = "force-dynamic";

export type ExpenseWithLogger = Expense & {
  staff_profiles: Pick<StaffProfile, "full_name"> | null;
};

export default async function ExpensesPage() {
  const supabase = await createClient();

  const { data: expenses } = await supabase
    .from("expenses")
    .select("*, staff_profiles(full_name)")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <LiveRefresher tables={["expenses"]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
        <p className="text-sm text-muted-foreground">
          Log operational costs — they flow straight into the P&amp;L report.
        </p>
      </div>
      <ExpensesDesk expenses={(expenses as ExpenseWithLogger[] | null) ?? []} />
    </div>
  );
}
