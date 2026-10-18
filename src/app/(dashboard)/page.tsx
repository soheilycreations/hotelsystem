import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { colomboDateKey, colomboDaysAgo, colomboToday } from "@/lib/colombo-date";
import { formatDateTime, formatOrderNumber, formatOverdue } from "@/lib/utils";
import { getFinanceChannels, getFinanceSummary } from "@/lib/finance/revenue";
import type { Booking, ChannelType, Expense, Room } from "@/lib/types";
import { LiveRefresher } from "./live-refresher";
import { OverviewView, type ActivityItem, type ActivityKind, type OverviewAlert, type OverviewData } from "./overview-view";
import { OverviewSkeleton } from "./overview-skeleton";

export const dynamic = "force-dynamic";

function activityKindForLog(eventType: string): ActivityKind {
  if (eventType === "HOUSEKEEPING") return "housekeeping";
  if (eventType === "LOW_STOCK") return "low_stock";
  return "system"; // FOLIO_POST, stock_adjustment, and anything else
}

/** "30 Sept" style label for a Colombo YYYY-MM-DD key. */
function dayLabel(key: string, withYear = false): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
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
  const dayAgoIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  // Abandoned Rs 0 orders are cleared before counting (migration 042).
  await supabase.rpc("rpc_purge_empty_orders", { p_min_age_minutes: 30 });

  const [
    boardRes,
    finance,
    channelRevenue,
    settledRes,
    expensesRes,
    logsRes,
    folioRes,
    recentBookingsRes,
    todayBookingsRes,
    kotRes,
    inventoryRes,
    staleOrdersRes,
  ] = await Promise.all([
    // Rooms come from the same server-side room board as the room grid
    // (migration 038) — never silently empty.
    supabase.rpc("rpc_room_board"),
    // Revenue/expenses: the shared finance source, same as Daily Summary
    // and Reports (src/lib/finance/revenue.ts).
    getFinanceSummary(supabase, sinceDate, today),
    getFinanceChannels(supabase, sinceDate, today),
    // Settled bills for the activity feed, at their real settle time.
    supabase
      .from("restaurant_orders")
      .select("order_number, total_amount, channel_type, business_date, settled_at")
      .eq("order_status", "completed")
      .not("settled_at", "is", null)
      .gte("settled_at", `${sinceDate}T00:00:00+05:30`)
      .order("settled_at", { ascending: false })
      .limit(10),
    supabase
      .from("expenses")
      .select("amount, date, description, category_id, created_at, expense_categories(name)")
      .gte("date", sinceDate)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("system_logs").select("*").order("created_at", { ascending: false }).limit(8),
    supabase.from("bookings").select("total_folio_amount").in("status", ["checked_in"]),
    // Recent check-ins/check-outs for the activity feed (last 13 days)
    supabase
      .from("bookings")
      .select("guest_name, actual_check_in, actual_check_out, status")
      .or(`actual_check_in.gte.${sinceDate}T00:00:00+05:30,actual_check_out.gte.${sinceDate}T00:00:00+05:30`),
    // Today's arrivals/departures for the snapshot row
    supabase
      .from("bookings")
      .select("id, actual_check_in, actual_check_out")
      .or(`actual_check_in.gte.${today}T00:00:00+05:30,actual_check_out.gte.${today}T00:00:00+05:30`),
    supabase
      .from("restaurant_orders")
      .select("id, order_items(is_custom, kot_printed_at)")
      .eq("order_status", "active"),
    supabase.from("inventory_items").select("id, name, quantity_in_stock, reorder_level"),
    supabase
      .from("restaurant_orders")
      .select("id, created_at")
      .eq("order_status", "active")
      .lt("created_at", dayAgoIso)
      .order("created_at"),
  ]);

  // ----- Rooms -----
  const board = (boardRes.data ?? []) as RoomBoardRow[];
  const roomsError = boardRes.error ? boardRes.error.message : null;
  const occupied = board.filter((r) => r.status === "occupied").length;
  const occupancyPct = board.length ? Math.round((occupied / board.length) * 100) : 0;
  const overdueStays = board
    .filter((r) => r.booking_id && r.overdue_minutes != null && r.overdue_minutes > 0)
    .map((r) => ({
      room: r.room_number,
      guest: r.guest_name ?? "Guest",
      overdue: formatOverdue(r.overdue_minutes ?? 0),
    }));

  // ----- Money (shared definition) -----
  const totals = finance.totals;
  const days = finance.days.map((d) => ({
    day: dayLabel(d.day),
    revenue: d.totalRevenue,
    expenses: d.expensesOperating,
  }));
  const todayRevenue = finance.days[finance.days.length - 1]?.totalRevenue ?? 0;
  const yesterdayRevenue = finance.days[finance.days.length - 2]?.totalRevenue ?? 0;
  const revenueDelta = Math.round((todayRevenue - yesterdayRevenue) * 100) / 100;

  const folioRows = folioRes.data ?? [];
  const openFolios = folioRows.reduce((sum, b) => sum + Math.round(Number(b.total_folio_amount) * 100), 0) / 100;

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

  // KOT-pending bill count
  const kotOrders = (kotRes.data ?? []) as {
    id: string;
    order_items: { is_custom: boolean; kot_printed_at: string | null }[];
  }[];
  const activeOrders = kotOrders.length;
  const kotPendingCount = kotOrders.filter((o) =>
    (o.order_items ?? []).some((i) => !i.is_custom && !i.kot_printed_at)
  ).length;

  // Low-stock item count
  const inventory = (inventoryRes.data ?? []) as {
    id: string;
    name: string;
    quantity_in_stock: number;
    reorder_level: number;
  }[];
  const lowStockItems = inventory.filter((i) => Number(i.quantity_in_stock) < Number(i.reorder_level));

  // Channel mix (14 days) — historical banquet backfills shown separately.
  const channels = (["dine_in", "room_service", "takeaway", "delivery", "banquet"] as ChannelType[]).map(
    (channel) => ({
      channel,
      value: channelRevenue[channel]?.revenue ?? 0,
      count: channelRevenue[channel]?.bills ?? 0,
    })
  );
  const historical = {
    value: channelRevenue.historical?.revenue ?? 0,
    count: channelRevenue.historical?.bills ?? 0,
  };

  // ----- Warnings -----
  const staleOrders = (staleOrdersRes.data ?? []) as { id: string; created_at: string }[];
  const alerts: OverviewAlert[] = [];
  for (const s of overdueStays) {
    alerts.push({
      tone: "red",
      text: `Room ${s.room} — ${s.guest} is overdue by ${s.overdue} (planned checkout passed)`,
      href: "/pms/reserve",
    });
  }
  if (staleOrders.length > 0) {
    alerts.push({
      tone: "amber",
      text: `${staleOrders.length} open order${staleOrders.length > 1 ? "s" : ""} older than 24h — oldest opened ${formatDateTime(staleOrders[0]!.created_at)}. Settle or void ${staleOrders.length > 1 ? "them" : "it"}.`,
      href: "/pos/billing",
    });
  }

  // ----- Activity feed — real timestamps (bills at settled_at) -----
  const recentBookings = (recentBookingsRes.data ?? []) as {
    guest_name: string;
    actual_check_in: string | null;
    actual_check_out: string | null;
    status: string;
  }[];
  const expenses = (expensesRes.data ?? []) as unknown as (Pick<
    Expense,
    "amount" | "date" | "description" | "category_id"
  > & { created_at: string; expense_categories: { name: string }[] | { name: string } | null })[];

  const activity: (ActivityItem & { sortAt: string })[] = [];
  for (const b of recentBookings) {
    if (b.actual_check_in) {
      activity.push({ kind: "check_in", name: b.guest_name, sortAt: b.actual_check_in, at: "" });
    }
    if (b.actual_check_out) {
      activity.push({ kind: "check_out", name: b.guest_name, sortAt: b.actual_check_out, at: "" });
    }
  }
  for (const o of (settledRes.data ?? []) as {
    order_number: number | null;
    total_amount: number;
    channel_type: ChannelType;
    business_date: string;
    settled_at: string;
  }[]) {
    activity.push({
      kind: "bill",
      name: formatOrderNumber(o.business_date, o.order_number),
      channel: o.channel_type,
      amount: Number(o.total_amount),
      sortAt: o.settled_at,
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
    .map(({ sortAt, ...item }) => ({ ...item, at: formatDateTime(sortAt) }));

  // Greeting follows the Colombo clock, not the server's.
  const colomboHour = new Date(Date.now() + 5.5 * 3600 * 1000).getUTCHours();
  const greeting: OverviewData["greeting"] =
    colomboHour < 12 ? "morning" : colomboHour < 17 ? "afternoon" : "evening";

  const data: OverviewData = {
    greeting,
    todayLabel: dayLabel(today),
    rangeLabel: `${dayLabel(sinceDate)} – ${dayLabel(today, true)}`,
    todayRevenue,
    revenueDelta,
    posRevenue: totals.restaurantRevenue,
    roomRevenue: totals.roomRevenue,
    totalExpenses: totals.expensesTotal,
    operatingExpenses: totals.expensesOperating,
    netProfit: totals.netProfit,
    openFolios,
    openFolioCount: folioRows.length,
    settledBillCount: totals.bills,
    todayCheckIns,
    todayCheckOuts,
    occupied,
    vacant: board.filter((r) => r.status === "vacant").length,
    totalRooms: board.length,
    occupancyPct,
    roomsError,
    overdueStays,
    alerts,
    activeOrders,
    kotPendingCount,
    lowStockCount: lowStockItems.length,
    days,
    channels,
    historical,
    activity: recentActivity,
  };

  return <OverviewView data={data} />;
}

interface RoomBoardRow {
  room_id: string;
  room_number: string;
  status: Room["status"];
  booking_id: string | null;
  guest_name: string | null;
  overdue_minutes: number | null;
}
