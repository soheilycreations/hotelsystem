"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n/language-context";
import { PageHeader } from "@/components/ui/page-header";
import { DateRangeBar, LAST_30_DAYS, THIS_MONTH } from "@/components/ui/date-range-bar";
import { ReportCharts } from "./report-charts";
import { DivisionalPnl } from "./divisional-pnl";
import type { DailyPnlPoint } from "./page";

function formatDay(key: string): string {
  return new Date(`${key}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

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
  const { t } = useLanguage();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showDetails, setShowDetails] = useState(false);

  // Same navigation as before: the server page reads ?from=&to=.
  function apply(nextFrom: string, nextTo: string) {
    startTransition(() => {
      router.push(`/finance/reports?from=${nextFrom}&to=${nextTo}`);
    });
  }

  return (
    <div className="space-y-6 text-rw-ink">
      <PageHeader
        title={t("P&L Report")}
        subtitle={`${formatDay(fromDate)} – ${formatDay(toDate)}`}
        stackUntil="xl"
        actions={
          <DateRangeBar
            fromDate={fromDate}
            toDate={toDate}
            onApply={apply}
            presets={[THIS_MONTH, LAST_30_DAYS]}
            pending={pending}
          />
        }
      />

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

      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        aria-expanded={showDetails}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-rw-border bg-rw-card px-5 text-sm font-semibold text-rw-ink transition-colors hover:bg-rw-soft sm:w-auto"
      >
        {showDetails ? t("Hide full details") : t("Show full details")}
        <ChevronDown
          className={cn("h-4 w-4 text-rw-muted transition-transform", showDetails && "rotate-180")}
          strokeWidth={1.8}
        />
      </button>

      {showDetails && (
        <ReportCharts points={points} channelTotals={channelTotals} expenseTotals={expenseTotals} />
      )}
    </div>
  );
}
