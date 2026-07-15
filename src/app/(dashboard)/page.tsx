import {
  BedDouble,
  CircleAlert,
  ReceiptText,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatLKR, formatDateTime } from "@/lib/utils";
import type { Room, RestaurantOrder, SystemLog, Expense } from "@/lib/types";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RevenueChart } from "./revenue-chart";
import { LiveRefresher } from "./live-refresher";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const supabase = await createClient();
  const since = new Date();
  since.setDate(since.getDate() - 13);
  const sinceIso = since.toISOString();

  const [roomsRes, ordersRes, expensesRes, logsRes, folioRes] = await Promise.all([
    supabase.from("rooms").select("id, status"),
    supabase
      .from("restaurant_orders")
      .select("id, total_amount, order_status, channel_type, created_at")
      .gte("created_at", sinceIso),
    supabase.from("expenses").select("amount, date").gte("date", sinceIso.slice(0, 10)),
    supabase
      .from("system_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("bookings")
      .select("total_folio_amount")
      .in("status", ["checked_in"]),
  ]);

  const rooms = (roomsRes.data ?? []) as Pick<Room, "id" | "status">[];
  const orders = (ordersRes.data ?? []) as Pick<
    RestaurantOrder,
    "id" | "total_amount" | "order_status" | "channel_type" | "created_at"
  >[];
  const expenses = (expensesRes.data ?? []) as Pick<Expense, "amount" | "date">[];
  const logs = (logsRes.data ?? []) as SystemLog[];

  const occupied = rooms.filter((r) => r.status === "occupied").length;
  const occupancyPct = rooms.length ? Math.round((occupied / rooms.length) * 100) : 0;

  const completed = orders.filter((o) => o.order_status === "completed");
  const posRevenue = completed.reduce((sum, o) => sum + Number(o.total_amount), 0);
  const activeOrders = orders.filter((o) => o.order_status === "active").length;
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const openFolios = (folioRes.data ?? []).reduce(
    (sum, b) => sum + Number(b.total_folio_amount),
    0
  );

  // 14-day POS revenue vs expenses series
  const days: { day: string; revenue: number; expenses: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({
      day: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      revenue: completed
        .filter((o) => o.created_at.slice(0, 10) === key)
        .reduce((s, o) => s + Number(o.total_amount), 0),
      expenses: expenses
        .filter((e) => e.date === key)
        .reduce((s, e) => s + Number(e.amount), 0),
    });
  }

  const severityVariant = { info: "info", warning: "warning", critical: "danger" } as const;

  return (
    <div className="space-y-6">
      <LiveRefresher tables={["restaurant_orders", "rooms", "system_logs", "bookings"]} />

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
              <CircleAlert className="h-4 w-4" /> System feed
            </CardTitle>
            <CardDescription>Low-stock alerts, folio posts and housekeeping flags.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing yet — alerts appear here as triggers fire.
              </p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2">
                  <Badge variant={severityVariant[log.severity]} className="mt-0.5 shrink-0">
                    {log.event_type}
                  </Badge>
                  <div className="min-w-0">
                    <p className="text-sm leading-snug">{log.message}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(log.created_at)}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ReceiptText className="h-4 w-4" /> Channel mix (14 days)
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          {(["dine_in", "room_service", "takeaway", "delivery"] as const).map((channel) => {
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
