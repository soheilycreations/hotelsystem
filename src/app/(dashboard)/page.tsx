import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { colomboDateKey, colomboDayStartIso, colomboDaysAgo, colomboToday, formatDayKey } from "@/lib/colombo-date";
import { formatDateTime, formatOrderNumber } from "@/lib/utils";
import type { Booking, ChannelType, Expense, Room } from "@/lib/types";
import { LiveRefresher } from "./live-refresher";
import { OverviewView, type ActivityItem, type ActivityKind, type OverviewData } from "./overview-view";
import { OverviewSkeleton } from "./overview-skeleton";

export const dynamic = "force-dynamic";

function activityKindForLog(eventType: string): ActivityKind {
  if (eventType === "HOUSEKEEPING") return "housekeeping";
  if (eventType === "LOW_STOCK") return "low_stock";
  return "system"; // FOLIO_POST, stock_adjustment, and anything else
}

/** "30 Sept" style label for a Colombo YYYY-MM-DD key. */
function dayLabel(key: string, withYear = false): string {
  return formatDayKey(key, "en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
}

export default function OverviewPage() {
  return (
    <>
      <LiveRefresher
        tables={["restaurant_orders", "rooms", "system_logs", "bookings", "expenses", "inventory_items"]}
      />
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewContent />
      </Suspense>
    </>
  );
}

async function OverviewContent() {
  const supabase = await createClient();
  const today = colomboToday();
  const sinceDate = colomboDaysAgo(13);
  // Day boundaries as real instants at 00:00 Colombo — a bare "T00:00:00"
  // is read by Postgres as UTC midnight (05:30 Colombo) and silently drops
  // anything between midnight and 05:29.
  const todayStartIso = colomboDayStartIso(today);
  const sinceStartIso = colomboDayStartIso(sinceDate);

  const [
    roomsRes,
    ordersRes,
    expensesRes,
    logsRes,
    folioRes,
    recentBookingsRes,
    todayBookingsRes,
    kotRes,
    inventoryRes,
    checkoutsRes,
  ] = await Promise.all([
    supabase.from("rooms").select("id, status"),
    supabase
      .from("restaurant_orders")
      .select("id, order_number, total_amount, order_status, channel_type, business_date, is_historical, settled_at")
      .or("payment_method.neq.complimentary,payment_method.is.null")
      .gte("business_date", sinceDate),
    supabase
      .from("expenses")
      .select("amount, date, description, category_id, created_at, expense_categories(name)")
      .gte("date", sinceDate),
    supabase.from("system_logs").select("*").order("created_at", { ascending: false }).limit(8),
    supabase.from("bookings").select("total_folio_amount").in("status", ["checked_in"]),
    // Recent check-ins/check-outs for the activity feed (last 13 days)
    supabase
      .from("bookings")
      .select("guest_name, actual_check_in, actual_check_out, status")
      .or(`actual_check_in.gte.${sinceStartIso},actual_check_out.gte.${sinceStartIso}`),
    // Today's arrivals/departures for the snapshot row
    supabase
      .from("bookings")
      .select("id, actual_check_in, actual_check_out")
      .or(`actual_check_in.gte.${todayStartIso},actual_check_out.gte.${todayStartIso}`),
    supabase
      .from("restaurant_orders")
      .select("id, order_items(quantity, is_custom, kot_printed_at)")
      .eq("order_status", "active"),
    supabase.from("inventory_items").select("id, name, quantity_in_stock, reorder_level"),
    // Room revenue for the chart — checkouts in the window (business_date has
    // no equivalent on bookings, so actual_check_out is the correct anchor).
    supabase
      .from("bookings")
      .select("id, total_folio_amount, actual_check_out")
      .eq("status", "checked_out")
      .or("payment_method.neq.complimentary,payment_method.is.null")
      .gte("actual_check_out", `${sinceDate}T00:00:00+05:30`),
  ]);

  const rooms = (roomsRes.data ?? []) as Pick<Room, "id" | "status">[];
  const orders = (ordersRes.data ?? []) as {
    id: string;
    order_number: number | null;
    total_amount: number;
    order_status: string;
    channel_type: ChannelType;
    business_date: string;
    is_historical: boolean;
    settled_at: string | null;
  }[];
  const expenses = (expensesRes.data ?? []) as unknown as (Pick<
    Expense,
    "amount" | "date" | "description" | "category_id"
  > & { created_at: string; expense_categories: { name: string }[] | { name: string } | null })[];

  const occupied = rooms.filter((r) => r.status === "occupied").length;
  const occupancyPct = rooms.length ? Math.round((occupied / rooms.length) * 100) : 0;

  const completed = orders.filter((o) => o.order_status === "completed");
  const posRevenue = completed.reduce((sum, o) => sum + Number(o.total_amount), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const folioRows = folioRes.data ?? [];
  const openFolios = folioRows.reduce((sum, b) => sum + Number(b.total_folio_amount), 0);

  // Room revenue for the chart — room-service orders are counted in POS
  // revenue AND posted onto folios by Trigger B, so subtract them per
  // booking here (same de-dupe as the P&L report) to avoid double counting.
  const checkouts = (checkoutsRes.data ?? []) as {
    id: string;
    total_folio_amount: number;
    actual_check_out: string | null;
  }[];
  const checkoutIds = checkouts.map((b) => b.id);
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
  const roomRevenue14d = checkouts.reduce(
    (sum, b) => sum + Math.max(0, Number(b.total_folio_amount) - (roomServiceByBooking.get(b.id) ?? 0)),
    0
  );

  // 14-day total revenue (room + POS) vs expenses series — bucketed by
  // business_date / actual_check_out so a bill or checkout dated to an
  // earlier day lands on the right bar, not "today's".
  const days: { day: string; revenue: number; expenses: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const key = colomboDateKey(Date.now() - i * 86_400_000);
    const posForDay = completed
      .filter((o) => o.business_date === key)
      .reduce((s, o) => s + Number(o.total_amount), 0);
    const roomForDay = checkouts
      .filter((b) => b.actual_check_out && colomboDateKey(new Date(b.actual_check_out).getTime()) === key)
      .reduce((s, b) => s + Math.max(0, Number(b.total_folio_amount) - (roomServiceByBooking.get(b.id) ?? 0)), 0);
    days.push({
      day: formatDayKey(key, "en-GB", { day: "2-digit", month: "short" }),
      revenue: posForDay + roomForDay,
      expenses: expenses.filter((e) => e.date === key).reduce((s, e) => s + Number(e.amount), 0),
    });
  }

  // Today's snapshot
  const todayBookings = (todayBookingsRes.data ?? []) as Pick<
    Booking,
    "id" | "actual_check_in" | "actual_check_out"
  >[];
  const todayCheckIns = todayBookings.filter(
    (b) => b.actual_check_in && colomboDateKey(new Date(b.actual_check_in).getTime()) === today
  ).length;
  const todayCheckOuts = todayBookings.filter(
    (b) => b.actual_check_out && colomboDateKey(new Date(b.actual_check_out).getTime()) === today
  ).length;
  const todayRevenue = days[days.length - 1]?.revenue ?? 0;

  // Yesterday up to the SAME clock time as now — comparing today-so-far with
  // all of yesterday made every morning look like a bad day. A bill counts if
  // it was settled by this time yesterday (bills from before settled_at
  // existed have no timestamp and are counted); a room counts if it checked
  // out by then.
  const yesterdayKey = colomboDateKey(Date.now() - 86_400_000);
  const yesterdayCutoff = Date.now() - 86_400_000;
  const posYesterdaySoFar = completed
    .filter(
      (o) =>
        o.business_date === yesterdayKey &&
        (!o.settled_at || new Date(o.settled_at).getTime() <= yesterdayCutoff)
    )
    .reduce((s, o) => s + Number(o.total_amount), 0);
  const roomYesterdaySoFar = checkouts
    .filter((b) => {
      if (!b.actual_check_out) return false;
      const t = new Date(b.actual_check_out).getTime();
      return colomboDateKey(t) === yesterdayKey && t <= yesterdayCutoff;
    })
    .reduce((s, b) => s + Math.max(0, Number(b.total_folio_amount) - (roomServiceByBooking.get(b.id) ?? 0)), 0);
  const yesterdaySoFar = posYesterdaySoFar + roomYesterdaySoFar;
  const revenueDelta = todayRevenue - yesterdaySoFar;

  // Kitchen — every open bill (any date, not just the 14-day window), plus
  // item counts: lines not yet on a KOT, and lines already sent to the
  // kitchen on a bill that's still open. Custom lines never go on a KOT.
  const kotOrders = (kotRes.data ?? []) as {
    id: string;
    order_items: { quantity: number; is_custom: boolean; kot_printed_at: string | null }[];
  }[];
  const kitchenItems = kotOrders.flatMap((o) => o.order_items ?? []).filter((i) => !i.is_custom);
  const kitchen = {
    openBills: kotOrders.length,
    itemsAwaitingKot: kitchenItems.filter((i) => !i.kot_printed_at).reduce((s, i) => s + Number(i.quantity), 0),
    itemsSentToKitchen: kitchenItems.filter((i) => i.kot_printed_at).reduce((s, i) => s + Number(i.quantity), 0),
  };

  // Low-stock item count
  const inventory = (inventoryRes.data ?? []) as {
    id: string;
    name: string;
    quantity_in_stock: number;
    reorder_level: number;
  }[];
  const lowStockItems = inventory.filter((i) => Number(i.quantity_in_stock) < Number(i.reorder_level));

  // Channel mix (14 days) — same split as before: historical banquet
  // backfills are shown separately rather than under "banquet".
  const channels = (["dine_in", "room_service", "takeaway", "delivery", "banquet"] as ChannelType[]).map(
    (channel) => {
      const channelOrders = completed.filter(
        (o) => o.channel_type === channel && !(channel === "banquet" && o.is_historical)
      );
      return {
        channel,
        value: channelOrders.reduce((s, o) => s + Number(o.total_amount), 0),
        count: channelOrders.length,
      };
    }
  );
  const historicalOrders = completed.filter((o) => o.is_historical);
  const historical = {
    value: historicalOrders.reduce((s, o) => s + Number(o.total_amount), 0),
    count: historicalOrders.length,
  };

  // Unified activity feed — merge check-ins/outs, settled bills, expenses and
  // system alerts into one timeline, most recent first, top 10.
  const recentBookings = (recentBookingsRes.data ?? []) as {
    guest_name: string;
    actual_check_in: string | null;
    actual_check_out: string | null;
    status: string;
  }[];

  const activity: (ActivityItem & { sortAt: string; dateOnly?: string })[] = [];
  for (const b of recentBookings) {
    if (b.actual_check_in) {
      activity.push({ kind: "check_in", name: b.guest_name, sortAt: b.actual_check_in, at: "" });
    }
    if (b.actual_check_out) {
      activity.push({ kind: "check_out", name: b.guest_name, sortAt: b.actual_check_out, at: "" });
    }
  }
  for (const o of completed) {
    // settled_at is the real moment the bill was paid. Bills settled before
    // that column existed only have a business date — sort them at the
    // start of that Colombo day and show the date alone (not a fake 00:00).
    activity.push({
      kind: "bill",
      name: formatOrderNumber(o.business_date, o.order_number),
      channel: o.channel_type,
      amount: Number(o.total_amount),
      sortAt: o.settled_at ?? colomboDayStartIso(o.business_date),
      dateOnly: !o.settled_at ? o.business_date : undefined,
      at: "",
    });
  }
  for (const e of expenses) {
    activity.push({
      kind: "expense",
      name:
        (Array.isArray(e.expense_categories) ? e.expense_categories[0]?.name : e.expense_categories?.name) ??
        "Uncategorised",
      detail: e.description || undefined,
      amount: Number(e.amount),
      sortAt: e.created_at,
      at: "",
    });
  }
  for (const log of (logsRes.data ?? []) as { event_type: string; message: string; created_at: string }[]) {
    activity.push({
      kind: activityKindForLog(log.event_type),
      name: log.message,
      sortAt: log.created_at,
      at: "",
    });
  }
  activity.sort((a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime());
  const recentActivity: ActivityItem[] = activity
    .slice(0, 10)
    .map(({ sortAt, dateOnly, ...item }) => ({ ...item, at: dateOnly ? formatDayKey(dateOnly) : formatDateTime(sortAt) }));

  // Greeting follows the Colombo clock, not the server's.
  const colomboHour = new Date(Date.now() + 5.5 * 3600 * 1000).getUTCHours();
  const greeting: OverviewData["greeting"] =
    colomboHour < 12 ? "morning" : colomboHour < 17 ? "afternoon" : "evening";

  const data: OverviewData = {
    greeting,
    todayLabel: dayLabel(today),
    rangeLabel: `${dayLabel(sinceDate)} – ${dayLabel(today, true)}`,
    todayRevenue,
    yesterdaySoFar,
    revenueDelta,
    posRevenue,
    roomRevenue: roomRevenue14d,
    totalExpenses,
    openFolios,
    openFolioCount: folioRows.length,
    settledBillCount: completed.length,
    todayCheckIns,
    todayCheckOuts,
    occupied,
    roomStatus: {
      vacant: rooms.filter((r) => r.status === "vacant").length,
      occupied,
      dirty: rooms.filter((r) => r.status === "dirty").length,
      maintenance: rooms.filter((r) => r.status === "maintenance").length,
    },
    totalRooms: rooms.length,
    occupancyPct,
    kitchen,
    lowStockCount: lowStockItems.length,
    days,
    channels,
    historical,
    activity: recentActivity,
  };

  return <OverviewView data={data} />;
}
