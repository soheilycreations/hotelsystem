import { createClient } from "@/lib/supabase/server";
import { colomboToday } from "@/lib/colombo-date";
import type { HotelSettings } from "@/lib/types";
import { formatOrderNumber } from "@/lib/utils";
import { LiveRefresher } from "../../live-refresher";
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

  const [{ data: hotel }, { data: checkouts }, { data: orders }, { data: expenses }, { data: advancesToday }] =
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
      // Advance payments collected TODAY (regardless of whether that
      // booking has checked out yet) — counted as cash-in-hand today, not
      // deferred to checkout. See recordAdvancePayment for the rationale.
      supabase
        .from("booking_advance_payments")
        .select("booking_id, amount, payment_method, bookings(guest_name, rooms(room_number))")
        .eq("date", date),
    ]);

  // ----- Room & Restaurant Ledger (cash-only, carried forward day to day) -----
  // Mirrors the Cash Book's running-balance mechanic, but split by division
  // and evaluated for this one day: Inhand (everything before today, netted
  // into one opening figure) + today's cash in − today's cash out = balance,
  // which becomes tomorrow's Inhand automatically.
  const [{ data: allCashCheckouts }, { data: allCashOrders }, { data: allCashExpenses }, { data: allCashMovements }, { data: allAdvances }] =
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
      // Cash movements (float top-ups, bank deposits, owner withdrawals) —
      // these aren't Room- or Restaurant-specific, so they're tracked as
      // their own "Other" ledger below rather than forced into either side.
      // Without this, real cash the Cash Book already counts (like a float
      // top-up) would silently disappear from this page's numbers.
      supabase.from("cash_movements").select("direction, category, description, amount, date").lte("date", date),
      // ALL advance payments (any method) up to today — needed so a
      // checkout's cash-in isn't double-counted for whatever was already
      // collected earlier as an advance.
      supabase.from("booking_advance_payments").select("booking_id, amount, payment_method, date").lte("date", date),
    ]);

  const advanceTotalByBooking = new Map<string, number>();
  for (const a of allAdvances ?? []) {
    advanceTotalByBooking.set(a.booking_id, (advanceTotalByBooking.get(a.booking_id) ?? 0) + Number(a.amount));
  }

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
    const advance = advanceTotalByBooking.get(b.id) ?? 0;
    const roomPortion = Math.max(0, Number(b.total_folio_amount) - rs - advance);
    const checkoutDate = b.actual_check_out.slice(0, 10);
    if (checkoutDate === date) {
      roomTodayIn += roomPortion;
      restaurantTodayIn += rs;
    } else if (checkoutDate < date) {
      roomOpening += roomPortion;
      restaurantOpening += rs;
    }
  }
  // Cash advances land in the Room ledger on the day they were actually
  // collected — ahead of checkout, not deferred to it.
  for (const a of allAdvances ?? []) {
    if (a.payment_method !== "cash") continue;
    const advanceDate = String(a.date).slice(0, 10);
    const amount = Number(a.amount);
    if (advanceDate === date) roomTodayIn += amount;
    else if (advanceDate < date) roomOpening += amount;
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
  // Float top-ups, bank deposits, owner withdrawals — this hotel runs
  // everything through the Restaurant side as its one main cash pot (Room
  // cash is kept separate, only moving between the two via a tagged
  // expense), so these land in the Restaurant ledger, same as any other
  // untagged cash movement.
  const todayCashMovements: { direction: string; category: string; description: string | null; amount: number }[] = [];
  for (const m of allCashMovements ?? []) {
    const moveDate = String(m.date).slice(0, 10);
    const amount = Number(m.amount);
    if (moveDate === date) {
      if (m.direction === "in") restaurantTodayIn += amount;
      else restaurantTodayOut += amount;
      todayCashMovements.push({
        direction: m.direction,
        category: m.category,
        description: m.description,
        amount,
      });
    } else if (moveDate < date) {
      restaurantOpening += m.direction === "in" ? amount : -amount;
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

  // Amount here is the BALANCE actually collected at checkout today — any
  // advance already paid earlier (see recordAdvancePayment) is netted out,
  // since that cash was already counted on the day it was received.
  const roomSales = (checkouts ?? []).map((b) => {
    const amount = Math.max(
      0,
      Number(b.total_folio_amount) - (rsByBooking[b.id] ?? 0) - (advanceTotalByBooking.get(b.id) ?? 0)
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

  type AdvanceTodayRoom = { room_number: string } | { room_number: string }[] | null;
  type AdvanceTodayBooking = { guest_name: string; rooms: AdvanceTodayRoom } | { guest_name: string; rooms: AdvanceTodayRoom }[] | null;
  const advanceBookingOf = (b: AdvanceTodayBooking) => (Array.isArray(b) ? b[0] : b) ?? null;
  const advanceRoomOf = (r: AdvanceTodayRoom) => (Array.isArray(r) ? r[0]?.room_number : r?.room_number) ?? "—";

  const advancePaymentsToday = ((advancesToday ?? []) as unknown as {
    booking_id: string;
    amount: number;
    payment_method: string;
    bookings: AdvanceTodayBooking;
  }[]).map((a) => {
    const booking = advanceBookingOf(a.bookings);
    return {
      guestName: booking?.guest_name ?? "Guest",
      roomNumber: advanceRoomOf(booking?.rooms ?? null),
      amount: Number(a.amount),
      paymentMethod: a.payment_method,
    };
  });

  // Combined Room + POS revenue for the day, split by how the guest paid —
  // the quick "how much cash actually came in today" answer, at a glance.
  // Advance payments count here too, under their own method, regardless of
  // whether that booking checks out today or weeks from now.
  const revenueByMethod: Record<string, number> = {};
  for (const r of roomSales) {
    const method = r.paymentMethod;
    revenueByMethod[method] = (revenueByMethod[method] ?? 0) + r.amount;
  }
  for (const o of orders ?? []) {
    const method = o.payment_method ?? "cash";
    revenueByMethod[method] = (revenueByMethod[method] ?? 0) + Number(o.total_amount);
  }
  for (const a of advancePaymentsToday) {
    revenueByMethod[a.paymentMethod] = (revenueByMethod[a.paymentMethod] ?? 0) + a.amount;
  }

  // Restaurant revenue today, split by how it was paid — shown next to the
  // Restaurant cash ledger so it's obvious at a glance how much of today's
  // revenue is NOT cash (card/bank/credit), i.e. why "revenue" and "cash in
  // hand" aren't the same number.
  const posRevenueByMethod: Record<string, number> = {};
  for (const o of orders ?? []) {
    const method = o.payment_method ?? "cash";
    posRevenueByMethod[method] = (posRevenueByMethod[method] ?? 0) + Number(o.total_amount);
  }

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

  // Bank-transfer and owner-paid expenses are the owner's own direct funds,
  // not money spent out of the hotel's revenue — they're shown for the
  // record (in the full total below) but don't reduce the Net Cash Balance
  // the way cash/card expenses do. Room/Restaurant expenses are split out
  // for the divisional balance, same rule as the P&L Report.
  const expensesTotal = (expenses ?? []).reduce((sum, e) => sum + Number(e.amount), 0);
  const cashExpenses = (expenses ?? []).filter(
    (e) => e.payment_method !== "bank_transfer" && e.payment_method !== "owner_paid"
  );
  const expensesAgainstRevenue = cashExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const roomExpenses = cashExpenses
    .filter((e) => e.division === "room")
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const restaurantExpenses = cashExpenses
    .filter((e) => e.division !== "room")
    .reduce((sum, e) => sum + Number(e.amount), 0);

  // Credit accounts — settled against a named account instead of cash/card/
  // bank. Still counts as revenue above (room or restaurant, per source). Two
  // views: today's new credit activity (what got added today), and each
  // account's running balance AS OF this date — the latter keeps showing up
  // every day, even with no new activity, until the account is fully paid
  // off, exactly like the paper ledger.
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
      source: `Bill #${formatOrderNumber(date, o.order_number)} — ${String(o.channel_type).replace("_", " ")}`,
      accountName: accountName ?? "Unknown account",
      amount: Number(o.total_amount),
    });
  }

  const [
    { data: allAccounts },
    { data: allCreditBookings },
    { data: allCreditOrders },
    { data: allCreditAdjustments },
    { data: allCreditRepayments },
  ] = await Promise.all([
    supabase.from("credit_accounts").select("id, name"),
    supabase
      .from("bookings")
      .select("credit_account_id, total_folio_amount, actual_check_out")
      .eq("payment_method", "credit")
      .not("credit_account_id", "is", null)
      .lt("actual_check_out", endIso),
    supabase
      .from("restaurant_orders")
      .select("credit_account_id, total_amount, business_date")
      .eq("payment_method", "credit")
      .not("credit_account_id", "is", null)
      .lte("business_date", date),
    supabase.from("credit_adjustments").select("credit_account_id, amount, date").lte("date", date),
    supabase.from("credit_repayments").select("credit_account_id, amount, date").lte("date", date),
  ]);

  const balanceByAccount = new Map<string, number>();
  const bumpBalance = (id: string | null, delta: number) => {
    if (!id) return;
    balanceByAccount.set(id, (balanceByAccount.get(id) ?? 0) + delta);
  };
  for (const b of allCreditBookings ?? []) bumpBalance(b.credit_account_id, Number(b.total_folio_amount));
  for (const o of allCreditOrders ?? []) bumpBalance(o.credit_account_id, Number(o.total_amount));
  for (const a of allCreditAdjustments ?? []) bumpBalance(a.credit_account_id, Number(a.amount));
  for (const r of allCreditRepayments ?? []) bumpBalance(r.credit_account_id, -Number(r.amount));

  const creditAccountBalances = ((allAccounts ?? []) as { id: string; name: string }[])
    .map((a) => ({ accountName: a.name, balance: balanceByAccount.get(a.id) ?? 0 }))
    .filter((a) => a.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  return (
    <>
      <LiveRefresher
        tables={[
          "bookings",
          "restaurant_orders",
          "expenses",
          "booking_advance_payments",
          "cash_movements",
          "credit_repayments",
          "credit_adjustments",
        ]}
      />
      <DailySummaryView
        date={date}
        hotel={(hotel as HotelSettings | null) ?? null}
        roomSales={roomSales}
        roomRevenueTotal={roomRevenueTotal}
        revenueByMethod={revenueByMethod}
        itemSales={itemSales}
        posSubtotal={posSubtotal}
        posServiceCharge={posServiceCharge}
        posTotal={posTotal}
        posRevenueByMethod={posRevenueByMethod}
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
        creditAccountBalances={creditAccountBalances}
        advancePaymentsToday={advancePaymentsToday}
        roomLedger={roomLedger}
        todayCashMovements={todayCashMovements}
        restaurantLedger={restaurantLedger}
      />
    </>
  );
}
