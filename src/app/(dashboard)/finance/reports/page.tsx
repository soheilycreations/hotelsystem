import { Banknote, BedDouble, TrendingDown, TrendingUp, UtensilsCrossed } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { colomboDateKey, colomboToday } from "@/lib/colombo-date";
import { StatCard } from "@/components/stat-card";
import { formatLKR } from "@/lib/utils";
import type { ChannelType } from "@/lib/types";
import { LiveRefresher } from "../../live-refresher";
import { ReportCharts } from "./report-charts";

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
  const fromIso = `${fromDate}T00:00:00+05:30`;
  // +1 day so the range is inclusive of the whole "to" calendar day.
  const toIsoExclusive = new Date(new Date(`${toDate}T00:00:00+05:30`).getTime() + 86_400_000).toISOString();

  const [{ data: orders }, { data: expenses }, { data: checkouts }, { data: categories }] =
    await Promise.all([
      supabase
        .from("restaurant_orders")
        .select("total_amount, channel_type, business_date, is_historical")
        .eq("order_status", "completed")
        .gte("business_date", fromDate)
        .lte("business_date", toDate),
      supabase
        .from("expenses")
        .select("amount, category_id, date, expense_categories(name)")
        .gte("date", fromDate)
        .lte("date", toDate),
      // Room revenue recognized on checkout (folio settled). actual_check_out
      // is used instead of updated_at — updated_at reflects whenever the row
      // was last touched (including a Backfill insert done TODAY for a stay
      // that actually happened weeks ago), while actual_check_out is the real
      // checkout moment either way.
      supabase
        .from("bookings")
        .select("id, total_folio_amount, actual_check_out")
        .eq("status", "checked_out")
        .gte("actual_check_out", fromIso)
        .lt("actual_check_out", toIsoExclusive),
      supabase.from("expense_categories").select("*").order("sort_order"),
    ]);

  // Room-service orders are counted in POS revenue AND posted onto folios by
  // Trigger B — subtract them per booking so nothing is double counted.
  const checkoutIds = (checkouts ?? []).map((b) => b.id);
  const roomServiceByBooking = new Map<string, number>();
  if (checkoutIds.length > 0) {
    const { data: rsOrders } = await supabase
      .from("restaurant_orders")
      .select("booking_id, total_amount")
      .eq("order_status", "completed")
      .eq("channel_type", "room_service")
      .in("booking_id", checkoutIds);
    for (const o of rsOrders ?? []) {
      if (!o.booking_id) continue;
      roomServiceByBooking.set(
        o.booking_id,
        (roomServiceByBooking.get(o.booking_id) ?? 0) + Number(o.total_amount)
      );
    }
  }

  // ----- Build the daily series (room / food / expenses kept separate so
  // each can be toggled independently on the chart) -----
  const series = new Map<string, DailyPnlPoint>();
  const dayCount = Math.round(
    (new Date(`${toDate}T00:00:00`).getTime() - new Date(`${fromDate}T00:00:00`).getTime()) / 86_400_000
  ) + 1;
  for (let i = 0; i < dayCount; i++) {
    const key = colomboDateKey(new Date(`${fromDate}T00:00:00`).getTime() + i * 86_400_000);
    series.set(key, {
      date: key,
      label: new Date(`${key}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      room: 0,
      food: 0,
      expenses: 0,
      profit: 0,
    });
  }

  const channelTotals: Record<string, number> = {
    dine_in: 0,
    room_service: 0,
    takeaway: 0,
    delivery: 0,
    banquet: 0,
    historical: 0, // backfilled entries — kept separate so they don't inflate real Banquet revenue
  };

  let posRevenue = 0;
  for (const o of orders ?? []) {
    const amount = Number(o.total_amount);
    posRevenue += amount;
    const bucket = o.is_historical ? "historical" : (o.channel_type as ChannelType);
    channelTotals[bucket] = (channelTotals[bucket] ?? 0) + amount;
    const key = String(o.business_date).slice(0, 10);
    const point = series.get(key);
    if (point) point.food += amount;
  }

  let roomRevenue = 0;
  for (const b of checkouts ?? []) {
    const amount = Math.max(0, Number(b.total_folio_amount) - (roomServiceByBooking.get(b.id) ?? 0));
    roomRevenue += amount;
    if (!b.actual_check_out) continue;
    const key = colomboDateKey(new Date(b.actual_check_out).getTime());
    const point = series.get(key);
    if (point) point.room += amount;
  }

  const expenseTotals: Record<string, number> = {};
  for (const c of categories ?? []) expenseTotals[c.name] = 0;

  let totalExpenses = 0;
  for (const e of expenses ?? []) {
    const amount = Number(e.amount);
    totalExpenses += amount;
    const categoryName = (e.expense_categories as { name?: string } | null)?.name ?? "Uncategorised";
    expenseTotals[categoryName] = (expenseTotals[categoryName] ?? 0) + amount;
    const point = series.get(String(e.date));
    if (point) point.expenses += amount;
  }

  const points = Array.from(series.values());
  for (const p of points) p.profit = p.room + p.food - p.expenses;

  const totalRevenue = posRevenue + roomRevenue;
  const netProfit = totalRevenue - totalExpenses;

  return (
    <div className="space-y-6">
      <LiveRefresher tables={["restaurant_orders", "expenses", "bookings", "expense_categories"]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">P&amp;L Report</h1>
        <p className="text-sm text-muted-foreground">
          {new Date(`${fromDate}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          {" – "}
          {new Date(`${toDate}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          {" — POS sales, room folios, and logged expenses combined."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total revenue" value={formatLKR(totalRevenue)} hint="POS + room folios" icon={Banknote} />
        <StatCard title="POS revenue" value={formatLKR(posRevenue)} hint="All channels" icon={UtensilsCrossed} />
        <StatCard title="Room revenue" value={formatLKR(roomRevenue)} hint="Checked-out folios (excl. room service)" icon={BedDouble} />
        <StatCard
          title="Net profit"
          value={formatLKR(netProfit)}
          hint={`Expenses: ${formatLKR(totalExpenses)}`}
          icon={netProfit >= 0 ? TrendingUp : TrendingDown}
        />
      </div>

      <ReportCharts
        points={points}
        channelTotals={channelTotals}
        expenseTotals={expenseTotals}
        fromDate={fromDate}
        toDate={toDate}
      />
    </div>
  );
}
