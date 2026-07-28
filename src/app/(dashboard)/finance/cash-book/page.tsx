import { createClient } from "@/lib/supabase/server";
import { colomboDateKey, colomboToday } from "@/lib/colombo-date";
import type { CashMovement } from "@/lib/types";
import { LiveRefresher } from "../../live-refresher";
import { CashBookView } from "./cash-book-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cash Book" };

export interface CashDayRow {
  date: string;
  label: string;
  cashIn: number;
  cashOut: number;
  net: number;
  closingBalance: number;
}

/** First-of-current-month, Colombo calendar. */
function colomboMonthStart(): string {
  const today = colomboToday();
  return `${today.slice(0, 7)}-01`;
}

export default async function CashBookPage({
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
  const toIsoExclusive = new Date(new Date(`${toDate}T00:00:00+05:30`).getTime() + 86_400_000).toISOString();

  // Fetch ALL cash-tagged history up to `to` — needed to compute the
  // opening balance for `from` (everything before it nets into one number).
  const [{ data: checkouts }, { data: orders }, { data: expenses }, { data: movements }] =
    await Promise.all([
      supabase
        .from("bookings")
        .select("total_folio_amount, actual_check_out")
        .eq("status", "checked_out")
        .eq("payment_method", "cash")
        .lt("actual_check_out", toIsoExclusive),
      supabase
        .from("restaurant_orders")
        .select("total_amount, business_date")
        .eq("order_status", "completed")
        .eq("payment_method", "cash")
        .neq("channel_type", "room_service") // avoid double-counting — RS is already inside the folio above
        .lte("business_date", toDate),
      supabase.from("expenses").select("amount, date").eq("payment_method", "cash").lte("date", toDate),
      supabase
        .from("cash_movements")
        .select("*")
        .lte("date", toDate)
        .order("date", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

  // Net cash change per calendar day, across ALL history up to `to`.
  const netByDay = new Map<string, number>();
  const bump = (key: string, delta: number) => netByDay.set(key, (netByDay.get(key) ?? 0) + delta);

  for (const b of checkouts ?? []) {
    if (!b.actual_check_out) continue;
    bump(colomboDateKey(new Date(b.actual_check_out).getTime()), Number(b.total_folio_amount));
  }
  for (const o of orders ?? []) {
    bump(String(o.business_date).slice(0, 10), Number(o.total_amount));
  }
  for (const e of expenses ?? []) {
    bump(String(e.date).slice(0, 10), -Number(e.amount));
  }
  for (const m of movements ?? []) {
    bump(String(m.date).slice(0, 10), m.direction === "in" ? Number(m.amount) : -Number(m.amount));
  }

  // Opening balance for `from` = everything that happened strictly before it.
  let runningBalance = 0;
  for (const [key, delta] of netByDay.entries()) {
    if (key < fromDate) runningBalance += delta;
  }
  const openingBalance = runningBalance;

  // Walk forward through the selected range, day by day.
  const days: CashDayRow[] = [];
  const dayCount =
    Math.round(
      (new Date(`${toDate}T00:00:00`).getTime() - new Date(`${fromDate}T00:00:00`).getTime()) / 86_400_000
    ) + 1;

  for (let i = 0; i < dayCount; i++) {
    const key = colomboDateKey(new Date(`${fromDate}T00:00:00`).getTime() + i * 86_400_000);
    let cashIn = 0;
    let cashOut = 0;
    for (const b of checkouts ?? []) {
      if (!b.actual_check_out) continue;
      if (colomboDateKey(new Date(b.actual_check_out).getTime()) === key)
        cashIn += Number(b.total_folio_amount);
    }
    for (const o of orders ?? []) {
      if (String(o.business_date).slice(0, 10) === key) cashIn += Number(o.total_amount);
    }
    for (const e of expenses ?? []) {
      if (String(e.date).slice(0, 10) === key) cashOut += Number(e.amount);
    }
    for (const m of movements ?? []) {
      if (String(m.date).slice(0, 10) === key) {
        if (m.direction === "in") cashIn += Number(m.amount);
        else cashOut += Number(m.amount);
      }
    }
    const net = cashIn - cashOut;
    runningBalance += net;
    days.push({
      date: key,
      label: new Date(`${key}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      cashIn,
      cashOut,
      net,
      closingBalance: runningBalance,
    });
  }

  const closingBalance = runningBalance;

  // Movements within the selected range, for the log table (most recent first).
  const movementsInRange = ((movements ?? []) as CashMovement[])
    .filter((m) => m.date >= fromDate && m.date <= toDate)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return (
    <div className="space-y-6">
      <LiveRefresher tables={["cash_movements", "bookings", "restaurant_orders", "expenses"]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cash Book</h1>
        <p className="text-sm text-muted-foreground">
          Day-to-day cash-in-hand — carried forward automatically from cash-paid bookings, POS
          sales, and expenses, plus any bank deposits or withdrawals you log below.
        </p>
      </div>
      <CashBookView
        fromDate={fromDate}
        toDate={toDate}
        openingBalance={openingBalance}
        closingBalance={closingBalance}
        days={days}
        movements={movementsInRange}
      />
    </div>
  );
}
