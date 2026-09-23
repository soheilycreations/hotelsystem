"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DateRangePicker } from "./report-charts";
import { ReportCharts } from "./report-charts";
import { DivisionalPnl } from "./divisional-pnl";
import type { DailyPnlPoint } from "./page";

export function ReportsView({
  fromDate,
  toDate,
  roomRevenue,
  roomExpenses,
  roomBalance,
  restaurantRevenue,
  restaurantExpenses,
  restaurantBalance,
  ownerFundedTotal,
  points,
  channelTotals,
  expenseTotals,
}: {
  fromDate: string;
  toDate: string;
  roomRevenue: number;
  roomExpenses: number;
  roomBalance: number;
  restaurantRevenue: number;
  restaurantExpenses: number;
  restaurantBalance: number;
  ownerFundedTotal: number;
  points: DailyPnlPoint[];
  channelTotals: Record<string, number>;
  expenseTotals: Record<string, number>;
}) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">P&amp;L Report</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(`${fromDate}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            {" – "}
            {new Date(`${toDate}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </div>
        <DateRangePicker fromDate={fromDate} toDate={toDate} />
      </div>

      {/* Room, Restaurant, Overall — Revenue / Expenses / Balance. This is
          the whole answer to "how are we doing" — everything else is
          optional detail behind the toggle below. */}
      <DivisionalPnl
        roomRevenue={roomRevenue}
        roomExpenses={roomExpenses}
        roomBalance={roomBalance}
        restaurantRevenue={restaurantRevenue}
        restaurantExpenses={restaurantExpenses}
        restaurantBalance={restaurantBalance}
        ownerFundedTotal={ownerFundedTotal}
      />

      <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => setShowDetails((v) => !v)}>
        <ChevronDown className={cn("mr-2 h-4 w-4 transition-transform", showDetails && "rotate-180")} />
        {showDetails ? "Hide full details" : "Show full details"}
      </Button>

      {showDetails && (
        <ReportCharts points={points} channelTotals={channelTotals} expenseTotals={expenseTotals} />
      )}
    </div>
  );
}
