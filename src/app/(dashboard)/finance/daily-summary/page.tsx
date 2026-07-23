import { createClient } from "@/lib/supabase/server";
import type { HotelSettings } from "@/lib/types";
import { DailySummaryView } from "./daily-summary-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Daily Summary" };

/** "Today" in Sri Lanka (UTC+5:30, no DST) regardless of server timezone. */
function colomboToday(): string {
  const colombo = new Date(Date.now() + 5.5 * 3600 * 1000);
  return colombo.toISOString().slice(0, 10);
}

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
        .select("id, guest_name, rate_plan_name, total_folio_amount, rooms(room_number)")
        .eq("status", "checked_out")
        .gte("actual_check_out", startIso)
        .lt("actual_check_out", endIso),
      supabase
        .from("restaurant_orders")
        .select("id, subtotal, service_charge, total_amount, order_items(quantity, line_total, is_custom, custom_description, menu_items(name))")
        .eq("order_status", "completed")
        .eq("business_date", date),
      supabase
        .from("expenses")
        .select("category, description, amount")
        .eq("date", date)
        .order("category"),
    ]);

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

  const expensesTotal = (expenses ?? []).reduce((sum, e) => sum + Number(e.amount), 0);

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
        category: e.category,
        description: e.description,
        amount: Number(e.amount),
      }))}
      expensesTotal={expensesTotal}
    />
  );
}
