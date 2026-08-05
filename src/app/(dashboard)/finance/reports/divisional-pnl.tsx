"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BedDouble, Scale, UtensilsCrossed } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatLKR } from "@/lib/utils";

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
          {entry.name}: <span className="tabular-nums">{formatLKR(Number(entry.value ?? 0))}</span>
        </p>
      ))}
    </div>
  );
}

function DivisionCard({
  title,
  icon: Icon,
  revenue,
  expenses,
  balance,
}: {
  title: string;
  icon: typeof BedDouble;
  revenue: number;
  expenses: number;
  balance: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4" />
          {title} P&amp;L
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Revenue</span>
          <span className="tabular-nums">{formatLKR(revenue)}</span>
        </div>
        <div className="flex items-center justify-between text-sm text-red-500">
          <span>Expenses</span>
          <span className="tabular-nums">−{formatLKR(expenses)}</span>
        </div>
        <div className="flex items-center justify-between border-t pt-2 text-base font-bold">
          <span>Balance</span>
          <span className={`tabular-nums ${balance >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {formatLKR(balance)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function DivisionalPnl({
  roomRevenue,
  roomExpenses,
  roomBalance,
  restaurantRevenue,
  restaurantExpenses,
  restaurantBalance,
}: {
  roomRevenue: number;
  roomExpenses: number;
  roomBalance: number;
  restaurantRevenue: number;
  restaurantExpenses: number;
  restaurantBalance: number;
}) {
  const chartData = [
    { name: "Room", Revenue: roomRevenue, Expenses: roomExpenses, Balance: roomBalance },
    { name: "Restaurant", Revenue: restaurantRevenue, Expenses: restaurantExpenses, Balance: restaurantBalance },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Scale className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Room vs Restaurant</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Split by where each expense was allocated ("Room" or "Restaurant" on the expense form) —
        owner bank-transfer expenses are excluded from both, same as Net Profit above.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <DivisionCard
          title="Room"
          icon={BedDouble}
          revenue={roomRevenue}
          expenses={roomExpenses}
          balance={roomBalance}
        />
        <DivisionCard
          title="Restaurant"
          icon={UtensilsCrossed}
          revenue={restaurantRevenue}
          expenses={restaurantExpenses}
          balance={restaurantBalance}
        />
      </div>

      <Card>
        <CardContent className="h-[260px] pt-6">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={64}
                tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Revenue" fill="#38bdf8" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Expenses" fill="#f87171" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Balance" fill="#34d399" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
