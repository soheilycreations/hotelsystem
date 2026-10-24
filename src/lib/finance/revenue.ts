import "server-only";
import type { createClient } from "@/lib/supabase/server";

/**
 * The ONE place pages get revenue/expense figures from — Dashboard, Daily
 * Summary and Reports/P&L all call these, so the same date range shows the
 * same numbers everywhere. The definitions live in SQL (migration 040,
 * fn_finance_daily / fn_finance_channels); read that header for what counts
 * as revenue on which day. Dates are Colombo YYYY-MM-DD, inclusive.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface FinanceDay {
  day: string;
  restaurantRevenue: number;
  roomRevenue: number;
  totalRevenue: number;
  /** everything logged */
  expensesTotal: number;
  /** paid from hotel money (excludes bank transfer / owner-paid) — what net profit subtracts */
  expensesOperating: number;
  expensesOperatingRoom: number;
  expensesOperatingRestaurant: number;
  bills: number;
  checkouts: number;
}

export interface FinanceTotals extends Omit<FinanceDay, "day"> {
  netProfit: number;
}

export interface FinanceSummary {
  days: FinanceDay[];
  totals: FinanceTotals;
}

interface FinanceDayRow {
  day: string;
  restaurant_revenue: number | string;
  room_revenue: number | string;
  total_revenue: number | string;
  expenses_total: number | string;
  expenses_operating: number | string;
  expenses_operating_room: number | string;
  expenses_operating_restaurant: number | string;
  bills: number;
  checkouts: number;
}

/** Sums in whole cents so totals never drift (no Rs 3,499.99 from float maths). */
function sumMoney(values: number[]): number {
  return values.reduce((cents, v) => cents + Math.round(v * 100), 0) / 100;
}

export async function getFinanceSummary(supabase: Supabase, from: string, to: string): Promise<FinanceSummary> {
  const { data, error } = await supabase.rpc("fn_finance_daily", { p_from: from, p_to: to });
  if (error) throw new Error(`Could not load revenue figures: ${error.message}`);

  const days: FinanceDay[] = ((data ?? []) as FinanceDayRow[]).map((r) => ({
    day: String(r.day).slice(0, 10),
    restaurantRevenue: Number(r.restaurant_revenue),
    roomRevenue: Number(r.room_revenue),
    totalRevenue: Number(r.total_revenue),
    expensesTotal: Number(r.expenses_total),
    expensesOperating: Number(r.expenses_operating),
    expensesOperatingRoom: Number(r.expenses_operating_room),
    expensesOperatingRestaurant: Number(r.expenses_operating_restaurant),
    bills: Number(r.bills),
    checkouts: Number(r.checkouts),
  }));

  const sum = (pick: (d: FinanceDay) => number) => sumMoney(days.map(pick));
  const totalRevenue = sum((d) => d.totalRevenue);
  const expensesOperating = sum((d) => d.expensesOperating);
  return {
    days,
    totals: {
      restaurantRevenue: sum((d) => d.restaurantRevenue),
      roomRevenue: sum((d) => d.roomRevenue),
      totalRevenue,
      expensesTotal: sum((d) => d.expensesTotal),
      expensesOperating,
      expensesOperatingRoom: sum((d) => d.expensesOperatingRoom),
      expensesOperatingRestaurant: sum((d) => d.expensesOperatingRestaurant),
      bills: days.reduce((n, d) => n + d.bills, 0),
      checkouts: days.reduce((n, d) => n + d.checkouts, 0),
      netProfit: sumMoney([totalRevenue, -expensesOperating]),
    },
  };
}

/** Restaurant revenue by channel ("historical" = backfilled entries). Adds up to restaurantRevenue. */
export async function getFinanceChannels(
  supabase: Supabase,
  from: string,
  to: string
): Promise<Record<string, { revenue: number; bills: number }>> {
  const { data, error } = await supabase.rpc("fn_finance_channels", { p_from: from, p_to: to });
  if (error) throw new Error(`Could not load channel figures: ${error.message}`);
  const out: Record<string, { revenue: number; bills: number }> = {};
  for (const r of (data ?? []) as { bucket: string; revenue: number | string; bills: number }[]) {
    out[r.bucket] = { revenue: Number(r.revenue), bills: Number(r.bills) };
  }
  return out;
}
