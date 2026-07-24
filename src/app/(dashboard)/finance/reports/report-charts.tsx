"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarRange, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatLKR } from "@/lib/utils";
import type { DailyPnlPoint } from "./page";

const CHANNEL_LABEL: Record<string, string> = {
  dine_in: "Dine-in",
  room_service: "Room Service",
  takeaway: "Takeaway",
  delivery: "Delivery",
  banquet: "Banquet",
  historical: "Historical Entries",
};

const PIE_COLORS = ["#38bdf8", "#a78bfa", "#fbbf24", "#34d399", "#f87171", "#818cf8", "#fb923c"];

function Money({ value }: { value: number }) {
  return <span className="tabular-nums">{formatLKR(value)}</span>;
}

interface TooltipEntry {
  name?: string;
  value?: number | string;
  color?: string;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      {label && <p className="mb-1 font-medium">{label}</p>}
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.name}: <Money value={Number(entry.value ?? 0)} />
        </p>
      ))}
    </div>
  );
}

function DateRangePicker({ fromDate, toDate }: { fromDate: string; toDate: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState(fromDate);
  const [to, setTo] = useState(toDate);

  function apply(nextFrom: string, nextTo: string) {
    startTransition(() => {
      router.push(`/finance/reports?from=${nextFrom}&to=${nextTo}`);
    });
  }

  function presetThisMonth() {
    const now = new Date();
    const first = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const today = now.toISOString().slice(0, 10);
    setFrom(first);
    setTo(today);
    apply(first, today);
  }

  function presetLast30() {
    const now = new Date();
    const start = new Date(now.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
    const today = now.toISOString().slice(0, 10);
    setFrom(start);
    setTo(today);
    apply(start, today);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <CalendarRange className="h-4 w-4 text-muted-foreground" />
      <Input
        type="date"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        onBlur={() => apply(from, to)}
        className="h-8 w-36 text-xs"
        disabled={pending}
      />
      <span className="text-sm text-muted-foreground">to</span>
      <Input
        type="date"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        onBlur={() => apply(from, to)}
        className="h-8 w-36 text-xs"
        disabled={pending}
      />
      <Button size="sm" variant="outline" onClick={presetThisMonth} disabled={pending}>
        This month
      </Button>
      <Button size="sm" variant="outline" onClick={presetLast30} disabled={pending}>
        Last 30 days
      </Button>
      {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
    </div>
  );
}

export function ReportCharts({
  points,
  channelTotals,
  expenseTotals,
  fromDate,
  toDate,
}: {
  points: DailyPnlPoint[];
  channelTotals: Record<string, number>;
  expenseTotals: Record<string, number>;
  fromDate: string;
  toDate: string;
}) {
  const [showRoom, setShowRoom] = useState(true);
  const [showFood, setShowFood] = useState(true);
  const [showExpenses, setShowExpenses] = useState(true);

  const channelData = Object.keys(channelTotals)
    .map((c) => ({ name: CHANNEL_LABEL[c] ?? c, value: channelTotals[c] ?? 0 }))
    .filter((d) => d.value > 0);

  const expenseData = Object.keys(expenseTotals)
    .map((c) => ({ name: c, value: expenseTotals[c] ?? 0 }))
    .filter((d) => d.value > 0);

  return (
    <div className="grid gap-6">
      {/* Daily room / food / expenses */}
      <Card>
        <CardHeader className="flex-col items-start gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Room, food &amp; expenses — daily</CardTitle>
          <DateRangePicker fromDate={fromDate} toDate={toDate} />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={showRoom}
                onChange={(e) => setShowRoom(e.target.checked)}
                className="h-3.5 w-3.5 accent-emerald-500"
              />
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
              Room sales
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={showFood}
                onChange={(e) => setShowFood(e.target.checked)}
                className="h-3.5 w-3.5 accent-sky-500"
              />
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-sky-500" />
              Food / POS sales
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={showExpenses}
                onChange={(e) => setShowExpenses(e.target.checked)}
                className="h-3.5 w-3.5 accent-red-500"
              />
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
              Expenses
            </label>
          </div>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {showRoom && <Bar dataKey="room" name="Room sales" fill="#34d399" radius={[3, 3, 0, 0]} />}
                {showFood && <Bar dataKey="food" name="Food / POS sales" fill="#38bdf8" radius={[3, 3, 0, 0]} />}
                {showExpenses && <Bar dataKey="expenses" name="Expenses" fill="#f87171" radius={[3, 3, 0, 0]} />}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Channel mix */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue by channel</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            {channelData.length === 0 ? (
              <EmptyChart label="No completed orders in this period." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={channelData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={56}
                    outerRadius={92}
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {channelData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Expense breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Expenses by category</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            {expenseData.length === 0 ? (
              <EmptyChart label="No expenses logged in this period." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={expenseData} layout="vertical" margin={{ left: 16, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                  />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={90} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
                  <Bar dataKey="value" name="Amount" fill="#a78bfa" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}
