"use client";

import { BedDouble, Scale, UtensilsCrossed } from "lucide-react";
import { cn, formatLKR } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n/language-context";
import { Panel } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { IconChip, type ChipTone } from "@/components/ui/stat-card";
import { SectionTitle } from "@/components/ui/section-title";

/** Balance as a share of revenue — display only, from the values already shown. */
function marginLabel(balance: number, revenue: number): string {
  if (revenue <= 0) return "—";
  return `${((balance / revenue) * 100).toFixed(1)}%`;
}

function DivisionCard({
  title,
  icon,
  tone,
  revenue,
  expenses,
  balance,
}: {
  title: string;
  icon: typeof BedDouble;
  tone: ChipTone;
  revenue: number;
  expenses: number;
  balance: number;
}) {
  const { t } = useLanguage();
  return (
    <Panel className="flex flex-col">
      <div className="flex items-center gap-3">
        <IconChip icon={icon} tone={tone} />
        <h3 className="text-[17px] font-bold">{title}</h3>
      </div>
      <dl className="mt-5 space-y-2.5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-rw-muted">{t("Revenue")}</dt>
          <dd className="font-medium tabular-nums">{formatLKR(revenue)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 text-[#C2410C] dark:text-orange-300">
          <dt>{t("Expenses")}</dt>
          <dd className="font-medium tabular-nums">−{formatLKR(expenses)}</dd>
        </div>
      </dl>
      <div className="mt-4 border-t border-rw-border pt-4">
        <div className="flex items-end justify-between gap-3">
          <span className="text-sm font-semibold text-rw-muted">{t("Balance")}</span>
          <span
            className={cn(
              "text-2xl font-bold tabular-nums tracking-tight",
              balance >= 0 ? "text-rw-green" : "text-[#B3261E] dark:text-red-300"
            )}
          >
            {formatLKR(balance)}
          </span>
        </div>
        <div className="mt-2 flex justify-end">
          <Pill tone={balance >= 0 ? "green" : "red"}>
            {t("Margin")} {marginLabel(balance, revenue)}
          </Pill>
        </div>
      </div>
    </Panel>
  );
}

function OverallCard({
  revenue,
  expenses,
  balance,
  ownerFundedTotal,
}: {
  revenue: number;
  expenses: number;
  balance: number;
  ownerFundedTotal: number;
}) {
  const { t } = useLanguage();
  const profit = balance >= 0;
  return (
    <section className="relative flex flex-col overflow-hidden rounded-rw bg-rw-hero p-5 text-white sm:p-6">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-10 h-64 w-64 rounded-full border-[36px] border-white/[0.04]"
      />
      <div className="relative flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
          <Scale className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </span>
        <h3 className="flex-1 text-[17px] font-bold">{t("Overall")}</h3>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-bold",
            profit ? "bg-rw-lime text-rw-on-lime" : "bg-[#FFB4A6] text-[#5C1A10]"
          )}
        >
          {profit ? t("Surplus") : t("Deficit")}
        </span>
      </div>
      <dl className="relative mt-5 space-y-2.5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-white/70">{t("Revenue")}</dt>
          <dd className="font-medium tabular-nums">{formatLKR(revenue)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 text-[#FDBA8C]">
          <dt>{t("Expenses")}</dt>
          <dd className="font-medium tabular-nums">−{formatLKR(expenses)}</dd>
        </div>
      </dl>
      <div className="relative mt-4 border-t border-white/15 pt-4">
        <span className="text-sm font-semibold text-white/70">{t("Balance")}</span>
        <p
          className={cn(
            "mt-1 text-3xl font-bold tabular-nums tracking-tight sm:text-[34px]",
            profit ? "text-white" : "text-[#FFB4A6]"
          )}
        >
          {formatLKR(balance)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white">
            {t("Margin")} {marginLabel(balance, revenue)}
          </span>
        </div>
        {ownerFundedTotal > 0 && (
          <p className="mt-3 text-xs tabular-nums text-white/55">
            +{formatLKR(ownerFundedTotal)} {t("owner-funded, excluded")}
          </p>
        )}
      </div>
    </section>
  );
}

/** The whole answer to "how are we doing" — Room, Restaurant, and Overall,
 * each as Revenue / Expenses / Balance. Everything else on the report page
 * (daily trend, channel mix, expense breakdown) is optional detail. */
export function DivisionalPnl({
  roomRevenue,
  roomExpenses,
  roomBalance,
  restaurantRevenue,
  restaurantExpenses,
  restaurantBalance,
  ownerFundedTotal,
}: {
  roomRevenue: number;
  roomExpenses: number;
  roomBalance: number;
  restaurantRevenue: number;
  restaurantExpenses: number;
  restaurantBalance: number;
  ownerFundedTotal: number;
}) {
  const { t } = useLanguage();
  return (
    <div className="space-y-3">
      <SectionTitle icon={Scale}>{t("Room vs Restaurant")}</SectionTitle>

      <div className="grid gap-4 lg:grid-cols-3">
        <DivisionCard
          title={t("Room")}
          icon={BedDouble}
          tone="green"
          revenue={roomRevenue}
          expenses={roomExpenses}
          balance={roomBalance}
        />
        <DivisionCard
          title={t("Restaurant")}
          icon={UtensilsCrossed}
          tone="lime"
          revenue={restaurantRevenue}
          expenses={restaurantExpenses}
          balance={restaurantBalance}
        />
        <OverallCard
          revenue={roomRevenue + restaurantRevenue}
          expenses={roomExpenses + restaurantExpenses}
          balance={roomBalance + restaurantBalance}
          ownerFundedTotal={ownerFundedTotal}
        />
      </div>
    </div>
  );
}
