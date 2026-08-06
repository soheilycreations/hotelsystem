import { createClient } from "@/lib/supabase/server";
import { colomboToday } from "@/lib/colombo-date";
import type { HotelSettings } from "@/lib/types";
import { DailySummaryView } from "./daily-summary-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Daily Summary" };

/** UTC instants for the start/end of a given calendar date in Colombo time. */
function colomboDayRange(dateStr: string): { startIso: string; endIso: string } {
  const start = new Date(`${dateStr}T00:00:00+05:30`);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export default async function DailySummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : colomboToday();
  const { startIso, endIso } = colomboDayRange(date);

  const supabase = await createClient();

  const [{ data: hotel }, { data: checkouts }, { data: orders }, { data: expenses }] =
    await Promise.all([
      supabase.from("hotel_settings").select("*").eq("id", 1).maybeSingle(),
      supabase
        .from("bookings")
        .select(
          "id, guest_name, rate_plan_name, total_folio_amount, payment_method, credit_account_id, credit_accounts(name), rooms(room_number)"
        )
        .eq("status", "checked_out")
        .or("payment_method.neq.complimentary,payment_method.is.null")
        .gte("actual_check_out", startIso)
        .lt("actual_check_out", endIso),
      supabase
        .from("restaurant_orders")
        .select(
          "id, order_number, channel_type, subtotal, service_charge, total_amount, payment_method, credit_account_id, credit_accounts(name), order_items(quantity, line_total, is_custom, custom_description, menu_items(name))"
        )
        .eq("order_status", "completed")
        .or("payment_method.neq.complimentary,payment_method.is.null")
        .eq("business_date", date),
      supabase
        .from("expenses")
        .select("category_id, description, amount, payment_method, division, expense_categories(name)")
        .eq("date", date)
        .order("category_id"),
    ]);

  // ----- Room & Restaurant Ledger (cash-only, carried forward day to day) -----
  // Mirrors the Cash Book's running-balance mechanic, but split by division
  // and evaluated for this one day: Inhand (everything before today, netted
  // into one opening figure) + today's cash in − today's cash out = balance,
  // which becomes tomorrow's Inhand automatically.
  const [{ data: allCashCheckouts }, { data: allCashOrders }, { data: allCashExpenses }] =
    await Promise.all([
      supabase
        .from("bookings")
        .select("id, total_folio_amount, actual_check_out")
        .eq("status", "checked_out")
        .eq("payment_method", "cash")
        .lt("actual_check_out", endIso),
      supabase
        .from("restaurant_orders")
        .select("total_amount, channel_type, business_date")
        .eq("order_status", "completed")
        .eq("payment_method", "cash")
        .neq("channel_type", "room_service")
        .lte("business_date", date),
      supabase
        .from("expenses")
        .select("amount, date, division")
        .eq("payment_method", "cash")
        .lte("date", date),
    ]);

  const allCheckoutIds = (allCashCheckouts ?? []).map((b) => b.id);
  const rsByBookingAllTime = new Map<string, number>();
  if (allCheckoutIds.length > 0) {
    const { data: rsAllTime } = await supabase
      .from("restaurant_orders")
      .select("booking_id, total_amount")
      .eq("order_status", "completed")
      .eq("channel_type", "room_service")
      .in("booking_id", allCheckoutIds);
    for (const o of rsAllTime ?? []) {
      if (!o.booking_id) continue;
      rsByBookingAllTime.set(o.booking_id, (rsByBookingAllTime.get(o.booking_id) ?? 0) + Number(o.total_amount));
    }
  }

  let roomOpening = 0;
  let roomTodayIn = 0;
  let roomTodayOut = 0;
  let restaurantOpening = 0;
  let restaurantTodayIn = 0;
  let restaurantTodayOut = 0;

  for (const b of allCashCheckouts ?? []) {
    if (!b.actual_check_out) continue;
    const rs = rsByBookingAllTime.get(b.id) ?? 0;
    const roomPortion = Math.max(0, Number(b.total_folio_amount) - rs);
    const checkoutDate = b.actual_check_out.slice(0, 10);
    if (checkoutDate === date) {
      roomTodayIn += roomPortion;
      restaurantTodayIn += rs;
    } else if (checkoutDate < date) {
      roomOpening += roomPortion;
      restaurantOpening += rs;
    }
  }
  for (const o of allCashOrders ?? []) {
    const orderDate = String(o.business_date).slice(0, 10);
    if (orderDate === date) restaurantTodayIn += Number(o.total_amount);
    else if (orderDate < date) restaurantOpening += Number(o.total_amount);
  }
  for (const e of allCashExpenses ?? []) {
    const expenseDate = String(e.date).slice(0, 10);
    const amount = Number(e.amount);
    if (expenseDate === date) {
      if (e.division === "room") roomTodayOut += amount;
      else restaurantTodayOut += amount;
    } else if (expenseDate < date) {
      if (e.division === "room") roomOpening -= amount;
      else restaurantOpening -= amount;
    }
  }

  const roomLedger = {
    opening: roomOpening,
    todayIn: roomTodayIn,
    todayOut: roomTodayOut,
    closing: roomOpening + roomTodayIn - roomTodayOut,
  };
  const restaurantLedger = {
    opening: restaurantOpening,
    todayIn: restaurantTodayIn,
    todayOut: restaurantTodayOut,
    closing: restaurantOpening + restaurantTodayIn - restaurantTodayOut,
  };

  // Room-service orders are counted in POS revenue AND posted onto folios —
  // subtract them per booking so the room total isn't doubled (same pattern
  // used on the P&L report).
  const bookingIds = (checkouts ?? []).map((b) => b.id);
  const rsByBooking: Record<string, number> = {};
  if (bookingIds.length > 0) {
    const { data: rsOrders } = await supabase
      .from("restaurant_orders")
      .select("booking_id, total_amount")
      .eq("order_status", "completed")
      .eq("channel_type", "room_service")
      .in("booking_id", bookingIds);
    for (const o of rsOrders ?? []) {
      if (!o.booking_id) continue;
      rsByBooking[o.booking_id] = (rsByBooking[o.booking_id] ?? 0) + Number(o.total_amount);
    }
  }

  const roomSales = (checkouts ?? []).map((b) => {
    const amount = Math.max(
      0,
      Number(b.total_folio_amount) - (rsByBooking[b.id] ?? 0)
    );
    const rooms = b.rooms as unknown as { room_number: string } | null;
    return {
      guestName: b.guest_name,
      roomNumber: rooms?.room_number ?? "—",
      planName: b.rate_plan_name,
      amount,
      paymentMethod: b.payment_method ?? "cash",
    };
  });
  const roomRevenueTotal = roomSales.reduce((sum, r) => sum + r.amount, 0);

  const itemTotals = new Map<string, { qty: number; revenue: number }>();
  let posSubtotal = 0;
  let posServiceCharge = 0;
  let posTotal = 0;
  for (const o of orders ?? []) {
    posSubtotal += Number(o.subtotal);
    posServiceCharge += Number(o.service_charge);
    posTotal += Number(o.total_amount);
    for (const it of o.order_items ?? []) {
      const menuItem = it.menu_items as unknown as { name: string } | null;
      const name = it.is_custom
        ? (it.custom_description as string | null) ?? "Custom charge"
        : menuItem?.name ?? "Unknown item";
      const cur = itemTotals.get(name) ?? { qty: 0, revenue: 0 };
      cur.qty += Number(it.quantity);
      cur.revenue += Number(it.line_total);
      itemTotals.set(name, cur);
    }
  }
  const itemSales = Array.from(itemTotals.entries())
    .map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  // Bank-transfer expenses are the owner's own direct funds, not money spent
  // out of the hotel's revenue — they're shown for the record (in the full
  // total below) but don't reduce the Net Cash Balance the way cash/card
  // expenses do. Room/Restaurant expenses are split out for the divisional
  // balance, same rule as the P&L Report.
  const expensesTotal = (expenses ?? []).reduce((sum, e) => sum + Number(e.amount), 0);
  const cashExpenses = (expenses ?? []).filter((e) => e.payment_method !== "bank_transfer");
  const expensesAgainstRevenue = cashExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const roomExpenses = cashExpenses
    .filter((e) => e.division === "room")
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const restaurantExpenses = cashExpenses
    .filter((e) => e.division !== "room")
    .reduce((sum, e) => sum + Number(e.amount), 0);

  // Credit sales — settled against a named account instead of cash/card/bank.
  // Still counts as revenue above; listed separately here so it's clear what
  // still needs collecting, and from whom.
  const creditSales: { source: string; accountName: string; amount: number }[] = [];
  for (const b of checkouts ?? []) {
    if (b.payment_method !== "credit") continue;
    const account = b.credit_accounts as unknown as { name: string } | { name: string }[] | null;
    const accountName = Array.isArray(account) ? account[0]?.name : account?.name;
    const rooms = b.rooms as unknown as { room_number: string } | null;
    creditSales.push({
      source: `Room ${rooms?.room_number ?? "—"} — ${b.guest_name}`,
      accountName: accountName ?? "Unknown account",
      amount: Math.max(0, Number(b.total_folio_amount) - (rsByBooking[b.id] ?? 0)),
    });
  }
  for (const o of orders ?? []) {
    if (o.payment_method !== "credit") continue;
    const account = o.credit_accounts as unknown as { name: string } | { name: string }[] | null;
    const accountName = Array.isArray(account) ? account[0]?.name : account?.name;
    creditSales.push({
      source: `Bill #${o.order_number} — ${String(o.channel_type).replace("_", " ")}`,
      accountName: accountName ?? "Unknown account",
      amount: Number(o.total_amount),
    });
  }

  return (
    <DailySummaryView
      date={date}
      hotel={(hotel as HotelSettings | null) ?? null}
      roomSales={roomSales}
      roomRevenueTotal={roomRevenueTotal}
      itemSales={itemSales}
      posSubtotal={posSubtotal}
      posServiceCharge={posServiceCharge}
      posTotal={posTotal}
      expenses={(expenses ?? []).map((e) => ({
        category: (e.expense_categories as { name?: string } | null)?.name ?? "Uncategorised",
        description: e.description,
        amount: Number(e.amount),
        paymentMethod: e.payment_method,
      }))}
      expensesTotal={expensesTotal}
      expensesAgainstRevenue={expensesAgainstRevenue}
      roomExpenses={roomExpenses}
      restaurantExpenses={restaurantExpenses}
      creditSales={creditSales}
      roomLedger={roomLedger}
      restaurantLedger={restaurantLedger}
    />
  );
}
