"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Banknote,
  Bell,
  CalendarDays,
  ChevronDown,
  Plus,
  ReceiptText,
  Search,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { cn, formatLKR } from "@/lib/utils";
import type { ChannelType } from "@/lib/types";
import { useLanguage } from "@/lib/i18n/language-context";
import { RevenueChart } from "./revenue-chart";

export type ActivityKind = "check_in" | "check_out" | "bill" | "expense" | "housekeeping" | "low_stock" | "system";

export interface ActivityItem {
  kind: ActivityKind;
  /** Guest name (check-in/out), bill number (bill), category (expense) or log message */
  name: string;
  channel?: ChannelType;
  detail?: string;
  amount?: number;
  /** Pre-formatted timestamp */
  at: string;
}

export interface OverviewData {
  greeting: "morning" | "afternoon" | "evening";
  todayLabel: string;
  rangeLabel: string;
  todayRevenue: number;
  revenueDelta: number;
  posRevenue: number;
  roomRevenue: number;
  totalExpenses: number;
  openFolios: number;
  openFolioCount: number;
  settledBillCount: number;
  todayCheckIns: number;
  todayCheckOuts: number;
  occupied: number;
  vacant: number;
  totalRooms: number;
  occupancyPct: number;
  activeOrders: number;
  kotPendingCount: number;
  lowStockCount: number;
  days: { day: string; revenue: number; expenses: number }[];
  channels: { channel: ChannelType; value: number; count: number }[];
  historical: { value: number; count: number };
  activity: ActivityItem[];
}

type Tone = "neutral" | "green" | "amber" | "red" | "blue" | "orange";

const TONES: Record<Tone, string> = {
  neutral: "bg-rw-soft text-rw-muted",
  green: "bg-[#E6F4D2] text-[#2E6A12] dark:bg-rw-lime/15 dark:text-rw-lime",
  amber: "bg-[#FCF0CF] text-[#8A5A00] dark:bg-amber-400/15 dark:text-amber-300",
  red: "bg-[#FCE4DF] text-[#B3261E] dark:bg-red-400/15 dark:text-red-300",
  blue: "bg-[#E2ECFA] text-[#1F4F9A] dark:bg-sky-400/15 dark:text-sky-300",
  orange: "bg-[#FDE8DA] text-[#B4501A] dark:bg-orange-400/15 dark:text-orange-300",
};

const ACTIVITY_TAGS: Record<ActivityKind, { label: string; tone: Tone }> = {
  bill: { label: "BILL", tone: "green" },
  check_in: { label: "CHECK-IN", tone: "blue" },
  check_out: { label: "CHECK-OUT", tone: "neutral" },
  expense: { label: "EXPENSE", tone: "orange" },
  housekeeping: { label: "HOUSEKEEPING", tone: "amber" },
  low_stock: { label: "LOW STOCK", tone: "red" },
  system: { label: "SYSTEM", tone: "neutral" },
};

const CHANNEL_LABELS: Record<ChannelType, string> = {
  dine_in: "Dine in",
  room_service: "Room service",
  takeaway: "Takeaway",
  delivery: "Delivery",
  banquet: "Banquet",
};

const GREETINGS: Record<OverviewData["greeting"], string> = {
  morning: "Good morning, welcome back",
  afternoon: "Good afternoon, welcome back",
  evening: "Good evening, welcome back",
};

export function OverviewView({ data }: { data: OverviewData }) {
  const { t } = useLanguage();
  const totalRevenue = data.posRevenue + data.roomRevenue;
  const netProfit = totalRevenue - data.totalExpenses;

  return (
    <div className="space-y-5 text-rw-ink">
      <TopBar data={data} />

      {/* Row 1 — hero + KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1.25fr_1fr_1fr_1fr]">
        <HeroCard data={data} />
        <KpiCard
          icon={TrendingUp}
          tone="green"
          title={t("Total revenue")}
          value={formatLKR(totalRevenue)}
          sub={`${t("POS")} ${formatLKR(data.posRevenue)} · ${t("Rooms")} ${formatLKR(data.roomRevenue)}`}
        />
        <KpiCard
          icon={Banknote}
          tone="lime"
          title={t("Net profit")}
          value={formatLKR(netProfit)}
          valueClassName={netProfit < 0 ? "text-[#B3261E] dark:text-red-300" : undefined}
          sub={t("Revenue minus logged expenses")}
        />
        <KpiCard
          icon={ReceiptText}
          tone="orange"
          title={t("Expenses")}
          value={formatLKR(data.totalExpenses)}
          sub={`${t("Open guest folios")} ${formatLKR(data.openFolios)}`}
        />
      </div>

      {/* Row 2 */}
      <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-[1fr_1.4fr_1fr]">
        <div className="space-y-4">
          <TodayCard data={data} />
          <QuickActions />
        </div>

        <div className="space-y-4">
          <Panel>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">{t("Revenue vs expenses")}</h2>
                <p className="mt-0.5 text-sm text-rw-muted">{t("Room checkouts + settled POS bills, per day")}</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-rw-muted">
                <LegendDot className="bg-[rgb(var(--rw-chart-rev))]" label={t("Revenue")} />
                <LegendDot className="bg-[rgb(var(--rw-chart-exp))]" label={t("Expenses")} />
              </div>
            </div>
            <div className="mt-4">
              {data.days.every((d) => d.revenue === 0 && d.expenses === 0) ? (
                <EmptyState>{t("No revenue or expenses recorded in the last 14 days yet.")}</EmptyState>
              ) : (
                <RevenueChart data={data.days} />
              )}
            </div>
          </Panel>
          <RevenueBySource data={data} />
        </div>

        <div className="grid items-start gap-4 lg:col-span-2 lg:grid-cols-2 xl:col-span-1 xl:grid-cols-1">
          <OccupancyCard data={data} />
          <ActivityCard items={data.activity} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function TopBar({ data }: { data: OverviewData }) {
  const { t, language, setLanguage } = useLanguage();

  return (
    <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">{t(GREETINGS[data.greeting])}</h1>
        <p className="mt-1 text-sm text-rw-muted">{t("Property, restaurant and finance at a glance")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <label className="relative order-last w-full sm:order-none sm:w-auto sm:min-w-[240px] sm:flex-1 2xl:w-64 2xl:flex-none">
          <span className="sr-only">{t("Search")}</span>
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-rw-muted"
            strokeWidth={1.8}
          />
          <input
            type="search"
            placeholder={t("Search guests, bills, rooms")}
            className="h-11 w-full rounded-full border border-rw-border bg-rw-card pl-11 pr-4 text-sm text-rw-ink placeholder:text-rw-muted focus:outline-none focus:ring-2 focus:ring-rw-green/30"
          />
        </label>

        {/* Display-only: the Overview always shows a fixed 14-day window */}
        <div
          className="flex h-11 items-center gap-2 rounded-full border border-rw-border bg-rw-card px-4 text-sm font-medium tabular-nums"
          title={t("Last 14 days")}
        >
          <CalendarDays className="h-4 w-4 text-rw-muted" strokeWidth={1.8} />
          <span className="whitespace-nowrap">{data.rangeLabel}</span>
          <ChevronDown className="h-4 w-4 text-rw-muted" strokeWidth={1.8} />
        </div>

        <div className="flex h-11 items-center rounded-full border border-rw-border bg-rw-card p-1 text-xs font-bold">
          <button
            type="button"
            onClick={() => setLanguage("en")}
            aria-pressed={language === "en"}
            className={cn(
              "h-full rounded-full px-3 transition-colors",
              language === "en" ? "bg-rw-lime text-rw-on-lime" : "text-rw-muted hover:text-rw-ink"
            )}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLanguage("si")}
            aria-pressed={language === "si"}
            className={cn(
              "h-full rounded-full px-3 transition-colors",
              language === "si" ? "bg-rw-lime text-rw-on-lime" : "text-rw-muted hover:text-rw-ink"
            )}
          >
            සිං
          </button>
        </div>

        <Link
          href="/inventory"
          aria-label={t("Notifications")}
          title={
            data.lowStockCount > 0 ? `${data.lowStockCount} ${t("item(s) low on stock")}` : t("No alerts")
          }
          className="relative flex h-11 w-11 items-center justify-center rounded-full border border-rw-border bg-rw-card text-rw-ink transition-colors hover:bg-rw-soft"
        >
          <Bell className="h-[18px] w-[18px]" strokeWidth={1.8} />
          {data.lowStockCount > 0 && (
            <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-[#E5484D] ring-2 ring-rw-card" />
          )}
        </Link>

        <Link
          href="/pms/reserve"
          className="flex h-11 items-center gap-2 rounded-full bg-rw-sidebar px-5 text-sm font-semibold text-white transition-colors hover:bg-rw-green"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          {t("New booking")}
        </Link>
      </div>
    </div>
  );
}

function HeroCard({ data }: { data: OverviewData }) {
  const { t } = useLanguage();
  const down = data.revenueDelta < 0;
  const same = data.revenueDelta === 0;
  const DeltaIcon = down ? TrendingDown : TrendingUp;

  return (
    <div className="relative overflow-hidden rounded-rw bg-rw-hero p-6 text-white">
      {/* Decorative ring */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 top-8 h-72 w-72 rounded-full border-[40px] border-white/[0.04]"
      />
      <div className="relative">
        <span className="inline-flex rounded-full bg-rw-lime px-3 py-1 text-xs font-bold text-rw-on-lime">
          {t("Today")} · {data.todayLabel}
        </span>
        <p className="mt-4 text-sm text-white/75">{t("Today's sales so far")}</p>
        <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight sm:text-4xl">
          {formatLKR(data.todayRevenue)}
        </p>
        <p
          className={cn(
            "mt-3 flex items-center gap-1.5 text-sm tabular-nums",
            same ? "text-white/70" : down ? "text-[#FFB4A6]" : "text-rw-lime"
          )}
        >
          {!same && <DeltaIcon className="h-4 w-4 shrink-0" strokeWidth={1.8} />}
          {same
            ? t("Same as yesterday")
            : `${formatLKR(Math.abs(data.revenueDelta))} ${down ? t("below yesterday") : t("above yesterday")}`}
        </p>
        <Link
          href="/finance/daily-summary"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-rw-lime hover:underline"
        >
          {t("View daily summary")}
          <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
        </Link>
      </div>
    </div>
  );
}

const CHIP_TONES = {
  green: "bg-[#E8F2EC] text-rw-green dark:bg-rw-green/15",
  lime: "bg-rw-lime/25 text-rw-on-lime dark:bg-rw-lime/15 dark:text-rw-lime",
  orange: "bg-[#FDE8DA] text-[#C0561B] dark:bg-orange-400/15 dark:text-orange-300",
} as const;

function KpiCard({
  icon: Icon,
  tone,
  title,
  value,
  sub,
  valueClassName,
}: {
  icon: LucideIcon;
  tone: keyof typeof CHIP_TONES;
  title: string;
  value: string;
  sub: string;
  valueClassName?: string;
}) {
  const { t } = useLanguage();
  return (
    <Panel className="flex flex-col">
      <div className="flex items-center gap-3">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", CHIP_TONES[tone])}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-rw-muted">{title}</span>
        <Pill tone="neutral">{t("14 days")}</Pill>
      </div>
      <p className={cn("mt-5 text-2xl font-bold tabular-nums tracking-tight sm:text-[28px]", valueClassName)}>
        {value}
      </p>
      <p className="mt-2 text-sm tabular-nums text-rw-muted">{sub}</p>
    </Panel>
  );
}

function TodayCard({ data }: { data: OverviewData }) {
  const { t } = useLanguage();
  const down = data.revenueDelta < 0;
  const same = data.revenueDelta === 0;

  const rows: {
    code: string;
    label: string;
    sub: string;
    value: string;
    pill: string;
    tone: Tone;
  }[] = [
    {
      code: "IN",
      label: t("Check-ins"),
      sub: t("Guests checked in today"),
      value: String(data.todayCheckIns),
      pill: data.todayCheckIns > 0 ? t("Arrived") : t("None yet"),
      tone: data.todayCheckIns > 0 ? "green" : "neutral",
    },
    {
      code: "OUT",
      label: t("Check-outs"),
      sub: t("Guests checked out today"),
      value: String(data.todayCheckOuts),
      pill: data.todayCheckOuts > 0 ? t("Departed") : t("None yet"),
      tone: data.todayCheckOuts > 0 ? "blue" : "neutral",
    },
    {
      code: "RM",
      label: t("In-house"),
      sub: t("Rooms occupied tonight"),
      value: data.totalRooms > 0 ? `${data.occupied} / ${data.totalRooms}` : "—",
      pill: data.totalRooms > 0 ? `${data.occupancyPct}%` : t("No rooms"),
      tone: data.occupied > 0 ? "green" : "neutral",
    },
    {
      code: "KT",
      label: t("Kitchen orders"),
      sub:
        data.kotPendingCount > 0
          ? `${data.kotPendingCount} ${t("bill(s) — KOT pending")}`
          : t("Currently cooking"),
      value: String(data.activeOrders),
      pill: data.activeOrders > 0 ? t("Active") : t("Clear"),
      tone: data.kotPendingCount > 0 ? "amber" : data.activeOrders > 0 ? "green" : "neutral",
    },
    {
      code: "FO",
      label: t("Open guest folios"),
      sub: t("Not yet settled"),
      value: formatLKR(data.openFolios),
      pill: data.openFolioCount > 0 ? t("Pending") : t("None"),
      tone: data.openFolioCount > 0 ? "amber" : "neutral",
    },
    {
      code: "RS",
      label: t("Today's sales"),
      sub: same
        ? t("Same as yesterday")
        : `${formatLKR(Math.abs(data.revenueDelta))} ${down ? t("below yesterday") : t("above yesterday")}`,
      value: formatLKR(data.todayRevenue),
      pill: same ? t("Flat") : down ? t("Down") : t("Up"),
      tone: same ? "neutral" : down ? "red" : "green",
    },
  ];

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{t("Today at the hotel")}</h2>
        <Link href="/pms/rooms" className="text-sm font-semibold text-rw-green hover:underline">
          {t("Details")}
        </Link>
      </div>
      <ul className="mt-3 divide-y divide-rw-border">
        {rows.map((row) => (
          <li key={row.code} className="flex items-center gap-3 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rw-soft text-xs font-bold text-rw-ink">
              {row.code}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium">{row.label}</p>
              <p className="truncate text-xs text-rw-muted">{row.sub}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-[15px] font-bold tabular-nums">{row.value}</span>
              <Pill tone={row.tone}>{row.pill}</Pill>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function QuickActions() {
  const { t } = useLanguage();
  const actions = [
    { href: "/pos/active", label: t("New bill") },
    { href: "/pms/reserve", label: t("Check in guest") },
    { href: "/finance/expenses", label: t("Log expense") },
    { href: "/finance/cash-book", label: t("Cash ledger") },
  ];
  return (
    <Panel>
      <h2 className="text-lg font-bold">{t("Quick actions")}</h2>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="flex min-h-[52px] items-center justify-center rounded-2xl border border-rw-border bg-rw-soft px-3 py-3 text-center text-sm font-semibold transition-colors hover:border-rw-green/40 hover:bg-rw-lime/20"
          >
            {a.label}
          </Link>
        ))}
      </div>
    </Panel>
  );
}

function RevenueBySource({ data }: { data: OverviewData }) {
  const { t } = useLanguage();
  const total = data.posRevenue + data.roomRevenue;
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);
  const channels = data.channels.filter((c) => c.count > 0);

  const sources = [
    { label: t("Restaurant / POS"), value: data.posRevenue, bar: "bg-rw-sidebar dark:bg-rw-green" },
    { label: t("Rooms"), value: data.roomRevenue, bar: "bg-rw-lime" },
  ];

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{t("Revenue by source")}</h2>
        <span className="text-xs text-rw-muted">{t("Last 14 days")}</span>
      </div>

      {total === 0 ? (
        <EmptyState className="mt-4">{t("No settled revenue in this period yet.")}</EmptyState>
      ) : (
        <div className="mt-4 space-y-5">
          {sources.map((s, i) => (
            <div key={s.label}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-semibold">{s.label}</span>
                <span className="tabular-nums text-rw-muted">
                  {formatLKR(s.value)} · {pct(s.value).toFixed(1)}%
                </span>
              </div>
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-rw-soft">
                <div className={cn("h-full rounded-full", s.bar)} style={{ width: `${pct(s.value)}%` }} />
              </div>
              {/* Channel mix under Restaurant / POS */}
              {i === 0 && (channels.length > 0 || data.historical.count > 0) && (
                <ul className="mt-3 space-y-1.5 text-xs text-rw-muted">
                  {channels.map((c) => (
                    <li key={c.channel} className="flex justify-between gap-2">
                      <span>
                        {t(CHANNEL_LABELS[c.channel])}{" "}
                        <span className="text-rw-muted/70">({c.count})</span>
                      </span>
                      <span className="tabular-nums text-rw-ink">{formatLKR(c.value)}</span>
                    </li>
                  ))}
                  {data.historical.count > 0 && (
                    <li className="flex justify-between gap-2">
                      <span>
                        {t("Historical entries")}{" "}
                        <span className="text-rw-muted/70">({data.historical.count})</span>
                      </span>
                      <span className="tabular-nums text-rw-ink">{formatLKR(data.historical.value)}</span>
                    </li>
                  )}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="mt-5 text-xs tabular-nums text-rw-muted">
        {data.settledBillCount} {t("settled bills in this period")}
      </p>
    </Panel>
  );
}

function OccupancyCard({ data }: { data: OverviewData }) {
  const { t } = useLanguage();
  const r = 70;
  const circumference = 2 * Math.PI * r;
  const fraction = data.totalRooms > 0 ? data.occupied / data.totalRooms : 0;

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{t("Room occupancy")}</h2>
        <span className="text-xs text-rw-muted">{t("Tonight")}</span>
      </div>

      {data.totalRooms === 0 ? (
        <EmptyState className="mt-4">{t("No rooms set up yet.")}</EmptyState>
      ) : (
        <>
          <div className="relative mx-auto mt-4 h-44 w-44">
            <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90" aria-hidden>
              <circle cx="90" cy="90" r={r} fill="none" strokeWidth="22" className="stroke-rw-lime/25" />
              {fraction > 0 && (
                <circle
                  cx="90"
                  cy="90"
                  r={r}
                  fill="none"
                  strokeWidth="22"
                  strokeLinecap="round"
                  strokeDasharray={`${fraction * circumference} ${circumference}`}
                  className="stroke-[rgb(var(--rw-chart-rev))] transition-[stroke-dasharray] duration-500"
                />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold tabular-nums">{data.occupancyPct}%</span>
              <span className="text-xs tabular-nums text-rw-muted">
                {t("{occupied} of {total} rooms")
                  .replace("{occupied}", String(data.occupied))
                  .replace("{total}", String(data.totalRooms))}
              </span>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <StatTile dot="bg-[rgb(var(--rw-chart-rev))]" label={t("Occupied")} value={data.occupied} />
            <StatTile dot="bg-rw-lime" label={t("Available")} value={data.vacant} />
          </div>
        </>
      )}
    </Panel>
  );
}

function ActivityCard({ items }: { items: ActivityItem[] }) {
  const { t } = useLanguage();

  function describe(item: ActivityItem): { title: string; sub?: string } {
    switch (item.kind) {
      case "bill":
        return {
          title: `${t("Bill")} #${item.name} ${t("settled")}${
            item.channel ? ` · ${t(CHANNEL_LABELS[item.channel])}` : ""
          }`,
        };
      case "check_in":
        return { title: `${item.name} ${t("checked in")}` };
      case "check_out":
        return { title: `${item.name} ${t("checked out")}` };
      case "expense":
        return { title: t(item.name), sub: item.detail };
      default:
        return { title: item.name };
    }
  }

  return (
    <Panel>
      <h2 className="text-lg font-bold">{t("Activity")}</h2>
      {items.length === 0 ? (
        <EmptyState className="mt-4">{t("Nothing yet — activity appears here as guests and bills move.")}</EmptyState>
      ) : (
        <ul className="mt-3 divide-y divide-rw-border">
          {items.map((item, i) => {
            const tag = ACTIVITY_TAGS[item.kind];
            const { title, sub } = describe(item);
            return (
              <li key={i} className="flex items-start gap-3 py-3">
                <span
                  className={cn(
                    "mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wide",
                    TONES[tag.tone]
                  )}
                >
                  {t(tag.label)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium leading-snug">{title}</p>
                  {sub && <p className="truncate text-xs text-rw-muted">{sub}</p>}
                  <p className="text-xs tabular-nums text-rw-muted">{item.at}</p>
                </div>
                {item.amount != null && (
                  <span className="shrink-0 text-sm font-bold tabular-nums">{formatLKR(item.amount)}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ---------------------------- primitives ---------------------------- */

function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn("rounded-rw border border-rw-border bg-rw-card p-5 sm:p-6", className)}>
      {children}
    </section>
  );
}

function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        TONES[tone]
      )}
    >
      {children}
    </span>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-sm", className)} />
      {label}
    </span>
  );
}

function StatTile({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-rw-soft p-3">
      <p className="flex items-center gap-1.5 text-xs text-rw-muted">
        <span className={cn("h-2 w-2 rounded-full", dot)} />
        {label}
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function EmptyState({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-rw-border bg-rw-soft/50 px-4 py-8 text-center text-sm text-rw-muted",
        className
      )}
    >
      {children}
    </div>
  );
}
