"use client";

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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatLKR } from "@/lib/utils";
import type { ChannelType, ExpenseCategory } from "@/lib/types";
import type { DailyPnlPoint } from "./page";

const CHANNEL_LABEL: Record<ChannelType, string> = {
  dine_in: "Dine-in",
  room_service: "Room Service",
  takeaway: "Takeaway",
  delivery: "Delivery",
};

const EXPENSE_LABEL: Record<ExpenseCategory, string> = {
  utilities: "Utilities",
  purchasing: "Purchasing",
  salary: "Salary",
  maintenance: "Maintenance",
  marketing: "Marketing",
};

const PIE_COLORS = ["#38bdf8", "#a78bfa", "#fbbf24", "#34d399", "#f87171"];

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
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          {entry.name}: <Money value={Number(entry.value ?? 0)} />
        </p>
      ))}
    </div>
  );
}

export function ReportCharts({
  points,
  channelTotals,
  expenseTotals,
}: {
  points: DailyPnlPoint[];
  channelTotals: Record<ChannelType, number>;
  expenseTotals: Record<ExpenseCategory, number>;
}) {
  const channelData = (Object.keys(channelTotals) as ChannelType[])
    .map((c) => ({ name: CHANNEL_LABEL[c], value: channelTotals[c] }))
    .filter((d) => d.value > 0);

  const expenseData = (Object.keys(expenseTotals) as ExpenseCategory[])
    .map((c) => ({ name: EXPENSE_LABEL[c], value: expenseTotals[c] }))
    .filter((d) => d.value > 0);

  return (
    <div className="grid gap-6">
      {/* Daily revenue vs expenses */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenue vs expenses — daily</CardTitle>
        </CardHeader>
        <CardContent className="h-[320px]">
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
                tickFormatter={(v: number) =>
                  v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
                }
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="revenue" name="Revenue" fill="#34d399" radius={[3, 3, 0, 0]} />
              <Bar dataKey="expenses" name="Expenses" fill="#f87171" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
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
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
                    }
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={90}
                  />
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
