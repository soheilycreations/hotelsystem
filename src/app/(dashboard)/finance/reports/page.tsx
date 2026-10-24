import { createClient } from "@/lib/supabase/server";
import { colomboToday } from "@/lib/colombo-date";
import { getFinanceChannels, getFinanceSummary } from "@/lib/finance/revenue";
import { LiveRefresher } from "../../live-refresher";
import { ReportsView } from "./reports-view";

export const dynamic = "force-dynamic";

export interface DailyPnlPoint {
  date: string; // yyyy-mm-dd
  label: string; // e.g. "12 Jul"
  room: number;
  food: number;
  expenses: number;
  profit: number;
}

/** First-of-current-month, Colombo calendar. */
function colomboMonthStart(): string {
  const today = colomboToday();
  return `${today.slice(0, 7)}-01`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const isValidDate = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

  const today = colomboToday();
  const fromDate = isValidDate(from) ? (from as string) : colomboMonthStart();
  const toDate = isValidDate(to) && (to as string) >= fromDate ? (to as string) : today;

  const supabase = await createClient();

  // Revenue, P&L and channel mix come from the shared finance source
  // (src/lib/finance/revenue.ts) — the Dashboard and Daily Summary use the
  // same one, so their numbers always agree for the same dates.
  const [finance, channels, { data: expenses }, { data: categories }] = await Promise.all([
    getFinanceSummary(supabase, fromDate, toDate),
    getFinanceChannels(supabase, fromDate, toDate),
    supabase
      .from("expenses")
      .select("amount, category_id, date, payment_method, division, expense_categories(name)")
      .gte("date", fromDate)
      .lte("date", toDate),
    supabase.from("expense_categories").select("*").order("sort_order"),
  ]);

  const points: DailyPnlPoint[] = finance.days.map((d) => ({
    date: d.day,
    label: new Date(`${d.day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
    room: d.roomRevenue,
    food: d.restaurantRevenue,
    expenses: d.expensesOperating,
    profit: d.totalRevenue - d.expensesOperating,
  }));

  const channelTotals: Record<string, number> = {
    dine_in: 0,
    room_service: 0,
    takeaway: 0,
    delivery: 0,
    banquet: 0,
    historical: 0, // backfilled entries — kept separate so they don't inflate real Banquet revenue
  };
  for (const [bucket, v] of Object.entries(channels)) channelTotals[bucket] = v.revenue;

  // Category breakdown shows every logged expense; bank-transfer and
  // owner-paid ones are the owner's own funds and are left out of net
  // profit (see migration 040).
  const expenseTotals: Record<string, number> = {};
  for (const c of categories ?? []) expenseTotals[c.name] = 0;
  for (const e of expenses ?? []) {
    const categoryName = (e.expense_categories as { name?: string } | null)?.name ?? "Uncategorised";
    expenseTotals[categoryName] = Math.round(((expenseTotals[categoryName] ?? 0) + Number(e.amount)) * 100) / 100;
  }

  const t = finance.totals;
  const roomRevenue = t.roomRevenue;
  const posRevenue = t.restaurantRevenue;
  const roomExpenses = t.expensesOperatingRoom;
  const restaurantExpenses = t.expensesOperatingRestaurant;
  const ownerFundedTotal = Math.round((t.expensesTotal - t.expensesOperating) * 100) / 100;
  const roomBalance = Math.round((roomRevenue - roomExpenses) * 100) / 100;
  const restaurantBalance = Math.round((posRevenue - restaurantExpenses) * 100) / 100;

  return (
    <div className="space-y-6">
      <LiveRefresher tables={["restaurant_orders", "expenses", "bookings", "expense_categories"]} />
      <ReportsView
        fromDate={fromDate}
        toDate={toDate}
        roomRevenue={roomRevenue}
        roomExpenses={roomExpenses}
        roomBalance={roomBalance}
        restaurantRevenue={posRevenue}
        restaurantExpenses={restaurantExpenses}
        restaurantBalance={restaurantBalance}
        ownerFundedTotal={ownerFundedTotal}
        points={points}
        channelTotals={channelTotals}
        expenseTotals={expenseTotals}
      />
    </div>
  );
}
