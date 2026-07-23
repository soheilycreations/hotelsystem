import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  BedDouble,
  ChefHat,
  CircleAlert,
  DoorOpen,
  LogIn,
  ReceiptText,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { colomboDateKey, colomboDaysAgo, colomboToday } from "@/lib/colombo-date";
import { formatLKR, formatDateTime } from "@/lib/utils";
import type { Booking, ChannelType, Expense, Room } from "@/lib/types";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RevenueChart } from "./revenue-chart";
import { LiveRefresher } from "./live-refresher";

export const dynamic = "force-dynamic";

type ActivityKind = "check_in" | "check_out" | "bill" | "expense" | "housekeeping" | "low_stock" | "system";

interface ActivityItem {
  kind: ActivityKind;
  message: string;
  at: string;
}

const ACTIVITY_META: Record<
  ActivityKind,
  { label: string; variant: "info" | "success" | "warning" | "danger" | "secondary" }
> = {
  check_in: { label: "CHECK-IN", variant: "info" },
  check_out: { label: "CHECK-OUT", variant: "secondary" },
  bill: { label: "BILL", variant: "success" },
  expense: { label: "EXPENSE", variant: "warning" },
  housekeeping: { label: "HOUSEKEEPING", variant: "warning" },
  low_stock: { label: "LOW STOCK", variant: "danger" },
  system: { label: "SYSTEM", variant: "secondary" },
};

function activityKindForLog(eventType: string): ActivityKind {
  if (eventType === "HOUSEKEEPING") return "housekeeping";
  if (eventType === "LOW_STOCK") return "low_stock";
  return "system"; // FOLIO_POST, stock_adjustment, and anything else
}

export default async function OverviewPage() {
  const supabase = await createClient();
  const today = colomboToday();
  const sinceDate = colomboDaysAgo(13);

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
  ] = await Promise.all([
    supabase.from("rooms").select("id, status"),
    supabase
      .from("restaurant_orders")
      .select("id, order_number, total_amount, order_status, channel_type, business_date")
      .gte("business_date", sinceDate),
    supabase.from("expenses").select("amount, date, description, category, created_at").gte("date", sinceDate),
    supabase.from("system_logs").select("*").order("created_at", { ascending: false }).limit(8),
    supabase.from("bookings").select("total_folio_amount").in("status", ["checked_in"]),
    // Recent check-ins/check-outs for the activity feed (last 13 days)
    supabase
      .from("bookings")
      .select("guest_name, actual_check_in, actual_check_out, status")
      .or(`actual_check_in.gte.${sinceDate},actual_check_out.gte.${sinceDate}`),
    // Today's arrivals/departures for the snapshot row
    supabase
      .from("bookings")
      .select("id, actual_check_in, actual_check_out")
      .or(`actual_check_in.gte.${today}T00:00:00,actual_check_out.gte.${today}T00:00:00`),
    supabase
      .from("restaurant_orders")
      .select("id, order_items(is_custom, kot_printed_at)")
      .eq("order_status", "active"),
    supabase.from("inventory_items").select("id, name, quantity_in_stock, reorder_level"),
  ]);

  const rooms = (roomsRes.data ?? []) as Pick<Room, "id" | "status">[];
  const orders = (ordersRes.data ?? []) as {
    id: string;
    order_number: number;
    total_amount: number;
    order_status: string;
    channel_type: ChannelType;
    business_date: string;
  }[];
  const expenses = (expensesRes.data ?? []) as (Pick<
    Expense,
    "amount" | "date" | "description" | "category"
  > & { created_at: string })[];

  const occupied = rooms.filter((r) => r.status === "occupied").length;
  const occupancyPct = rooms.length ? Math.round((occupied / rooms.length) * 100) : 0;

  const completed = orders.filter((o) => o.order_status === "completed");
  const posRevenue = completed.reduce((sum, o) => sum + Number(o.total_amount), 0);
  const activeOrders = orders.filter((o) => o.order_status === "active").length;
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const openFolios = (folioRes.data ?? []).reduce((sum, b) => sum + Number(b.total_folio_amount), 0);

  // 14-day POS revenue vs expenses series — bucketed by business_date so a
  // bill settled late but dated to an earlier day lands on the right bar.
  const days: { day: string; revenue: number; expenses: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const key = colomboDateKey(Date.now() - i * 86_400_000);
    days.push({
      day: new Date(`${key}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      revenue: completed
        .filter((o) => o.business_date === key)
        .reduce((s, o) => s + Number(o.total_amount), 0),
      expenses: expenses.filter((e) => e.date === key).reduce((s, e) => s + Number(e.amount), 0),
    });
  }

  // Today's snapshot
  const todayBookings = (todayBookingsRes.data ?? []) as Pick<
    Booking,
    "id" | "actual_check_in" | "actual_check_out"
  >[];
  const todayCheckIns = todayBookings.filter((b) => b.actual_check_in?.slice(0, 10) === today).length;
  const todayCheckOuts = todayBookings.filter((b) => b.actual_check_out?.slice(0, 10) === today).length;
  const todayRevenue = completed
    .filter((o) => o.business_date === today)
    .reduce((s, o) => s + Number(o.total_amount), 0);
  const yesterday = colomboDaysAgo(1);
  const yesterdayRevenue = completed
    .filter((o) => o.business_date === yesterday)
    .reduce((s, o) => s + Number(o.total_amount), 0);
  const revenueDelta = todayRevenue - yesterdayRevenue;

  // KOT-pending bill count
  const kotOrders = (kotRes.data ?? []) as {
    id: string;
    order_items: { is_custom: boolean; kot_printed_at: string | null }[];
  }[];
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

  // Unified activity feed — merge check-ins/outs, settled bills, expenses and
  // system alerts into one timeline, most recent first, top 10.
  const recentBookings = (recentBookingsRes.data ?? []) as {
    guest_name: string;
    actual_check_in: string | null;
    actual_check_out: string | null;
    status: string;
  }[];

  const activity: ActivityItem[] = [];
  for (const b of recentBookings) {
    if (b.actual_check_in) {
      activity.push({ kind: "check_in", message: `${b.guest_name} checked in.`, at: b.actual_check_in });
    }
    if (b.actual_check_out) {
      activity.push({ kind: "check_out", message: `${b.guest_name} checked out.`, at: b.actual_check_out });
    }
  }
  for (const o of completed) {
    activity.push({
      kind: "bill",
      message: `Bill #${o.order_number} settled — ${formatLKR(Number(o.total_amount))} (${o.channel_type.replace("_", " ")}).`,
      at: o.business_date,
    });
  }
  for (const e of expenses) {
    activity.push({
      kind: "expense",
      message: `Expense logged — ${formatLKR(Number(e.amount))} (${e.category.replace("_", " ")}${e.description ? `: ${e.description}` : ""}).`,
      at: e.created_at,
    });
  }
  for (const log of (logsRes.data ?? []) as { event_type: string; message: string; created_at: string }[]) {
    activity.push({
      kind: activityKindForLog(log.event_type),
      message: log.message,
      at: log.created_at,
    });
  }
  activity.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const recentActivity = activity.slice(0, 10);

  return (
    <div className="space-y-6">
      <LiveRefresher
        tables={["restaurant_orders", "rooms", "system_logs", "bookings", "expenses", "inventory_items"]}
      />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Property, restaurant and finance at a glance — last 14 days.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Occupancy"
          value={`${occupancyPct}%`}
          hint={`${occupied} of ${rooms.length} rooms occupied`}
          icon={BedDouble}
        />
        <StatCard
          title="POS revenue (14d)"
          value={formatLKR(posRevenue)}
          hint={`${completed.length} settled bills`}
          icon={TrendingUp}
        />
        <StatCard
          title="Active orders"
          value={String(activeOrders)}
          hint="Currently in the kitchen"
          icon={UtensilsCrossed}
        />
        <StatCard
          title="Expenses (14d)"
          value={formatLKR(totalExpenses)}
          hint={`Open guest folios: ${formatLKR(openFolios)}`}
          icon={Wallet}
        />
      </div>

      {/* Today's snapshot */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Today&apos;s snapshot</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <LogIn className="h-5 w-5 text-emerald-500" />
            <div>
              <p className="text-lg font-semibold tabular-nums">{todayCheckIns}</p>
              <p className="text-xs text-muted-foreground">Check-ins today</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <DoorOpen className="h-5 w-5 text-sky-500" />
            <div>
              <p className="text-lg font-semibold tabular-nums">{todayCheckOuts}</p>
              <p className="text-xs text-muted-foreground">Check-outs today</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <BadgeDollarSign className="h-5 w-5 text-emerald-500" />
            <div>
              <p className="text-lg font-semibold tabular-nums">{formatLKR(todayRevenue)}</p>
              <p className={`text-xs ${revenueDelta >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                {revenueDelta >= 0 ? "+" : ""}
                {formatLKR(revenueDelta)} vs yesterday
              </p>
            </div>
          </div>
          <Link
            href="/finance/daily-summary"
            className="flex items-center justify-between gap-2 rounded-lg border p-3 transition-colors hover:bg-accent"
          >
            <span className="text-sm font-medium">Open Daily Summary</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue vs expenses</CardTitle>
            <CardDescription>Settled POS bills against logged expenses, per day.</CardDescription>
          </CardHeader>
          <CardContent className="pl-0">
            <RevenueChart data={days} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleAlert className="h-4 w-4" /> Activity feed
            </CardTitle>
            <CardDescription>Check-ins, check-outs, bills and expenses — last 10.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing yet — activity appears here as guests and bills move.
              </p>
            ) : (
              recentActivity.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Badge variant={ACTIVITY_META[item.kind].variant} className="mt-0.5 shrink-0">
                    {ACTIVITY_META[item.kind].label}
                  </Badge>
                  <div className="min-w-0">
                    <p className="text-sm leading-snug">{item.message}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(item.at)}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick action shortcuts + KOT/low-stock counters */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/pos/billing">
          <Card className="h-full transition-colors hover:bg-accent">
            <CardContent className="flex items-center gap-3 p-4">
              <ChefHat className={kotPendingCount > 0 ? "h-6 w-6 text-amber-500" : "h-6 w-6 text-muted-foreground"} />
              <div>
                <p className="text-lg font-semibold tabular-nums">{kotPendingCount}</p>
                <p className="text-xs text-muted-foreground">Bill(s) — KOT pending</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/inventory">
          <Card className="h-full transition-colors hover:bg-accent">
            <CardContent className="flex items-center gap-3 p-4">
              <AlertTriangle
                className={lowStockItems.length > 0 ? "h-6 w-6 text-red-500" : "h-6 w-6 text-muted-foreground"}
              />
              <div>
                <p className="text-lg font-semibold tabular-nums">{lowStockItems.length}</p>
                <p className="text-xs text-muted-foreground">Item(s) — low stock</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/pms/reserve">
          <Card className="h-full transition-colors hover:bg-accent">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <span className="text-sm font-medium">Bookings desk</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/pos/active">
          <Card className="h-full transition-colors hover:bg-accent">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <span className="text-sm font-medium">POS terminal</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ReceiptText className="h-4 w-4" /> Channel mix (14 days)
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {(["dine_in", "room_service", "takeaway", "delivery", "banquet"] as ChannelType[]).map((channel) => {
            const channelOrders = completed.filter((o) => o.channel_type === channel);
            const value = channelOrders.reduce((s, o) => s + Number(o.total_amount), 0);
            return (
              <div key={channel} className="rounded-lg border p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {channel.replace("_", " ")}
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{formatLKR(value)}</p>
                <p className="text-xs text-muted-foreground">{channelOrders.length} bills</p>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
