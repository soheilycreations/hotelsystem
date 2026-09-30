"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatLKR } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n/language-context";
import { ChartCard, ChartTooltipCard, LegendToggle } from "@/components/ui/chart-card";
import { EmptyState } from "@/components/ui/empty-state";
import type { DailyPnlPoint } from "./page";

const CHANNEL_LABEL: Record<string, string> = {
  dine_in: "Dine in",
  room_service: "Room service",
  takeaway: "Takeaway",
  delivery: "Delivery",
  banquet: "Banquet",
  historical: "Historical entries",
};

// Series colours differ in lightness as well as hue, so they stay
// distinguishable for colour-blind staff and in greyscale printouts.
// Room uses the theme token (#0F3D2E light / lighter green in dark mode).
const ROOM_COLOR = "rgb(var(--rw-chart-rev))";
const FOOD_COLOR = "#7FB33D";
const EXPENSE_COLOR = "#E8833A";
const GRID_COLOR = "rgb(var(--rw-grid))";
const AXIS_TICK = { fontSize: 11, fill: "rgb(var(--rw-muted))" };

const PIE_COLORS = [ROOM_COLOR, FOOD_COLOR, EXPENSE_COLOR, "#4C7BD9", "#B5E550", "#94A39B"];

const kFormat = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v));

interface TooltipEntry {
  dataKey?: string | number;
  name?: string;
  value?: number | string;
  color?: string;
  payload?: { fill?: string };
}

export function ReportCharts({
  points,
  channelTotals,
  expenseTotals,
}: {
  points: DailyPnlPoint[];
  channelTotals: Record<string, number>;
  expenseTotals: Record<string, number>;
}) {
  const { t } = useLanguage();
  const [showRoom, setShowRoom] = useState(true);
  const [showFood, setShowFood] = useState(true);
  const [showExpenses, setShowExpenses] = useState(true);

  const channelData = Object.keys(channelTotals)
    .map((c) => ({ name: t(CHANNEL_LABEL[c] ?? c), value: channelTotals[c] ?? 0 }))
    .filter((d) => d.value > 0);
  const channelTotal = channelData.reduce((s, d) => s + d.value, 0);

  const expenseData = Object.keys(expenseTotals)
    .map((c) => ({ name: t(c), value: expenseTotals[c] ?? 0 }))
    .filter((d) => d.value > 0);

  const hasDaily = points.some((p) => p.room > 0 || p.food > 0 || p.expenses > 0);

  const seriesName: Record<string, string> = {
    room: t("Room sales"),
    food: t("Food / POS sales"),
    expenses: t("Expenses"),
  };

  return (
    <div className="grid gap-6">
      {/* Daily room / food / expenses */}
      <ChartCard
        title={t("Room, food & expenses — daily")}
        subtitle={t("Tap a series to show or hide it")}
        legend={
          <>
            <LegendToggle
              color={ROOM_COLOR}
              label={t("Room sales")}
              active={showRoom}
              onToggle={() => setShowRoom((v) => !v)}
            />
            <LegendToggle
              color={FOOD_COLOR}
              label={t("Food / POS sales")}
              active={showFood}
              onToggle={() => setShowFood((v) => !v)}
            />
            <LegendToggle
              color={EXPENSE_COLOR}
              label={t("Expenses")}
              active={showExpenses}
              onToggle={() => setShowExpenses((v) => !v)}
            />
          </>
        }
      >
        {!hasDaily ? (
          <EmptyState className="h-[320px]">{t("No sales or expenses in this period yet.")}</EmptyState>
        ) : (
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barGap={2}>
                <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} tickFormatter={kFormat} />
                <Tooltip
                  cursor={{ fill: "rgb(var(--rw-soft))" }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <ChartTooltipCard
                        label={label}
                        rows={(payload as TooltipEntry[]).map((p) => ({
                          key: String(p.dataKey),
                          color: p.color,
                          name: seriesName[String(p.dataKey)] ?? p.name,
                          value: formatLKR(Number(p.value ?? 0)),
                        }))}
                      />
                    );
                  }}
                />
                {showRoom && <Bar dataKey="room" fill={ROOM_COLOR} radius={[4, 4, 0, 0]} maxBarSize={16} />}
                {showFood && <Bar dataKey="food" fill={FOOD_COLOR} radius={[4, 4, 0, 0]} maxBarSize={16} />}
                {showExpenses && <Bar dataKey="expenses" fill={EXPENSE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={16} />}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Channel mix */}
        <ChartCard title={t("Revenue by channel")}>
          {channelData.length === 0 ? (
            <EmptyState className="h-[260px]">{t("No completed orders in this period.")}</EmptyState>
          ) : (
            <div className="grid items-center gap-4 sm:grid-cols-[200px_1fr]">
              <div className="mx-auto h-[200px] w-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={channelData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={92}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {channelData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0] as TooltipEntry;
                        return (
                          <ChartTooltipCard
                            rows={[
                              {
                                key: "v",
                                color: p.payload?.fill,
                                name: p.name,
                                value: formatLKR(Number(p.value ?? 0)),
                              },
                            ]}
                          />
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-2.5 text-sm">
                {channelData.map((d, i) => (
                  <li key={d.name} className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    <span className="min-w-0 flex-1 truncate">{d.name}</span>
                    <span className="font-semibold tabular-nums">{formatLKR(d.value)}</span>
                    <span className="w-12 text-right text-xs tabular-nums text-rw-muted">
                      {channelTotal > 0 ? `${((d.value / channelTotal) * 100).toFixed(0)}%` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ChartCard>

        {/* Expense breakdown */}
        <ChartCard title={t("Expenses by category")}>
          {expenseData.length === 0 ? (
            <EmptyState className="h-[260px]">{t("No expenses logged in this period.")}</EmptyState>
          ) : (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={expenseData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
                  <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={kFormat} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={AXIS_TICK}
                    tickLine={false}
                    axisLine={false}
                    width={96}
                  />
                  <Tooltip
                    cursor={{ fill: "rgb(var(--rw-soft))" }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0] as TooltipEntry;
                      return (
                        <ChartTooltipCard
                          label={label}
                          rows={[
                            { key: "v", color: EXPENSE_COLOR, name: t("Amount"), value: formatLKR(Number(p.value ?? 0)) },
                          ]}
                        />
                      );
                    }}
                  />
                  <Bar dataKey="value" fill={EXPENSE_COLOR} radius={[0, 4, 4, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
