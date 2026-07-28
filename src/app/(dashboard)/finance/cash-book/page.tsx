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

export interface CashLedgerEntry {
  date: string;
  description: string;
  direction: "in" | "out";
  amount: number;
  runningBalance: number;
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
  // opening balance for `from` (everything before it nets into one number),
  // plus enough detail (guest name, bill number, category) to print a proper
  // ledger, not just daily totals.
  const [{ data: checkouts }, { data: orders }, { data: expenses }, { data: movements }, { data: hotel }] =
    await Promise.all([
      supabase
        .from("bookings")
        .select("guest_name, total_folio_amount, actual_check_out, rooms(room_number)")
        .eq("status", "checked_out")
        .eq("payment_method", "cash")
        .lt("actual_check_out", toIsoExclusive),
      supabase
        .from("restaurant_orders")
        .select("order_number, channel_type, total_amount, business_date")
        .eq("order_status", "completed")
        .eq("payment_method", "cash")
        .neq("channel_type", "room_service") // avoid double-counting — RS is already inside the folio above
        .lte("business_date", toDate),
      supabase
        .from("expenses")
        .select("amount, date, description, expense_categories(name)")
        .eq("payment_method", "cash")
        .lte("date", toDate),
      supabase
        .from("cash_movements")
        .select("*")
        .lte("date", toDate)
        .order("date", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase.from("hotel_settings").select("hotel_name").eq("id", 1).maybeSingle(),
    ]);

  type CheckoutRow = {
    guest_name: string;
    total_folio_amount: number;
    actual_check_out: string | null;
    rooms: { room_number: string } | { room_number: string }[] | null;
  };
  type OrderRow = {
    order_number: number;
    channel_type: string;
    total_amount: number;
    business_date: string;
  };
  type ExpenseRow = {
    amount: number;
    date: string;
    description: string | null;
    expense_categories: { name: string } | { name: string }[] | null;
  };

  const roomNumberOf = (r: CheckoutRow["rooms"]): string =>
    (Array.isArray(r) ? r[0]?.room_number : r?.room_number) ?? "—";
  const categoryNameOf = (c: ExpenseRow["expense_categories"]): string =>
    (Array.isArray(c) ? c[0]?.name : c?.name) ?? "Uncategorised";

  // Build one transaction-level entry per cash event (undated running
  // balance added after sorting).
  type RawEntry = { date: string; description: string; direction: "in" | "out"; amount: number };
  const raw: RawEntry[] = [];

  for (const b of (checkouts ?? []) as CheckoutRow[]) {
    if (!b.actual_check_out) continue;
    raw.push({
      date: colomboDateKey(new Date(b.actual_check_out).getTime()),
      description: `Room ${roomNumberOf(b.rooms)} checkout — ${b.guest_name}`,
      direction: "in",
      amount: Number(b.total_folio_amount),
    });
  }
  for (const o of (orders ?? []) as OrderRow[]) {
    raw.push({
      date: String(o.business_date).slice(0, 10),
      description: `Bill #${o.order_number} — ${o.channel_type.replace("_", " ")}`,
      direction: "in",
      amount: Number(o.total_amount),
    });
  }
  for (const e of (expenses ?? []) as ExpenseRow[]) {
    raw.push({
      date: String(e.date).slice(0, 10),
      description: `Expense — ${categoryNameOf(e.expense_categories)}${e.description ? `: ${e.description}` : ""}`,
      direction: "out",
      amount: Number(e.amount),
    });
  }
  for (const m of (movements ?? []) as CashMovement[]) {
    raw.push({
      date: String(m.date).slice(0, 10),
      description: `${m.category}${m.description ? `: ${m.description}` : ""}`,
      direction: m.direction,
      amount: Number(m.amount),
    });
  }

  raw.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Opening balance for `from` = everything strictly before it, netted.
  let runningBalance = 0;
  for (const r of raw) {
    if (r.date < fromDate) runningBalance += r.direction === "in" ? r.amount : -r.amount;
  }
  const openingBalance = runningBalance;

  // Full chronological ledger for the selected range, with a running balance
  // per line — this is what the PDF export prints.
  const ledger: CashLedgerEntry[] = [];
  for (const r of raw) {
    if (r.date < fromDate || r.date > toDate) continue;
    runningBalance += r.direction === "in" ? r.amount : -r.amount;
    ledger.push({ ...r, runningBalance });
  }
  const closingBalance = runningBalance;

  // Daily aggregates for the chart.
  const days: CashDayRow[] = [];
  const dayCount =
    Math.round(
      (new Date(`${toDate}T00:00:00`).getTime() - new Date(`${fromDate}T00:00:00`).getTime()) / 86_400_000
    ) + 1;
  let chartBalance = openingBalance;
  for (let i = 0; i < dayCount; i++) {
    const key = colomboDateKey(new Date(`${fromDate}T00:00:00`).getTime() + i * 86_400_000);
    const dayEntries = ledger.filter((l) => l.date === key);
    const cashIn = dayEntries.filter((l) => l.direction === "in").reduce((s, l) => s + l.amount, 0);
    const cashOut = dayEntries.filter((l) => l.direction === "out").reduce((s, l) => s + l.amount, 0);
    chartBalance += cashIn - cashOut;
    days.push({
      date: key,
      label: new Date(`${key}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      cashIn,
      cashOut,
      net: cashIn - cashOut,
      closingBalance: chartBalance,
    });
  }

  // Manual movements within range, for the on-screen log table (most recent first).
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
        hotelName={(hotel as { hotel_name?: string } | null)?.hotel_name ?? "Soheily PMS"}
        openingBalance={openingBalance}
        closingBalance={closingBalance}
        days={days}
        movements={movementsInRange}
        ledger={ledger}
      />
    </div>
  );
}
