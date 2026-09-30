"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatLKR } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n/language-context";

interface Point {
  day: string;
  revenue: number;
  expenses: number;
}

// CSS variables so the bars follow the light/dark design tokens.
const REVENUE_FILL = "rgb(var(--rw-chart-rev))";
const EXPENSES_FILL = "rgb(var(--rw-chart-exp))";

export function RevenueChart({ data }: { data: Point[] }) {
  const { t } = useLanguage();

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barGap={3} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="rgb(var(--rw-border))" />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11, fill: "rgb(var(--rw-muted))" }}
            tickLine={false}
            axisLine={false}
            // "17 Sept" → "17": the card subtitle already names the range
            tickFormatter={(v: string) => v.split(" ")[0] ?? v}
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "rgb(var(--rw-muted))" }}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
          />
          <Tooltip
            cursor={{ fill: "rgb(var(--rw-soft))" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-xl border border-rw-border bg-rw-card px-3 py-2 text-xs shadow-lg">
                  <p className="mb-1 font-semibold text-rw-ink">{label}</p>
                  {payload.map((p) => (
                    <p key={String(p.dataKey)} className="flex items-center gap-2 text-rw-muted">
                      <span
                        className="h-2 w-2 rounded-sm"
                        style={{ background: p.dataKey === "revenue" ? REVENUE_FILL : EXPENSES_FILL }}
                      />
                      {p.dataKey === "revenue" ? t("Revenue") : t("Expenses")}
                      <span className="ml-auto pl-3 font-semibold tabular-nums text-rw-ink">
                        {formatLKR(Number(p.value))}
                      </span>
                    </p>
                  ))}
                </div>
              );
            }}
          />
          <Bar dataKey="revenue" fill={REVENUE_FILL} radius={[4, 4, 0, 0]} maxBarSize={12} />
          <Bar dataKey="expenses" fill={EXPENSES_FILL} radius={[4, 4, 0, 0]} maxBarSize={12} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
