import { createClient } from "@/lib/supabase/server";
import { colomboDaysAgo, colomboToday } from "@/lib/colombo-date";
import type { Expense, ExpenseCategoryRow, HotelSettings, StaffProfile } from "@/lib/types";
import { LiveRefresher } from "../../live-refresher";
import { ExpensesDesk } from "./expenses-desk";

export const dynamic = "force-dynamic";

export type ExpenseWithLogger = Expense & {
  staff_profiles: Pick<StaffProfile, "full_name"> | null;
};

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const isValidDate = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const fromDate = isValidDate(from) ? (from as string) : colomboDaysAgo(29);
  const toDate = isValidDate(to) && (to as string) >= fromDate ? (to as string) : colomboToday();

  const supabase = await createClient();

  const [{ data: expenses }, { data: categories }, { data: hotel }] = await Promise.all([
    supabase
      .from("expenses")
      .select("*, staff_profiles(full_name), expense_categories(*)")
      .gte("date", fromDate)
      .lte("date", toDate)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("expense_categories").select("*").order("sort_order"),
    supabase.from("hotel_settings").select("*").eq("id", 1).maybeSingle(),
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
        hotel={(hotel as HotelSettings | null) ?? null}
        fromDate={fromDate}
        toDate={toDate}
      />
    </div>
  );
}
