"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Point {
  day: string;
  revenue: number;
  expenses: number;
}

export function RevenueChart({ data }: { data: Point[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(160 84% 39%)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="hsl(160 84% 39%)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(0 72% 51%)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(0 72% 51%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              `Rs. ${Number(value).toLocaleString("en-LK")}`,
              name === "revenue" ? "Revenue" : "Expenses",
            ]}
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              color: "hsl(var(--popover-foreground))",
              fontSize: 12,
            }}
          />
          <Area type="monotone" dataKey="revenue" stroke="hsl(160 84% 39%)" fill="url(#rev)" strokeWidth={2} />
          <Area type="monotone" dataKey="expenses" stroke="hsl(0 72% 51%)" fill="url(#exp)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
