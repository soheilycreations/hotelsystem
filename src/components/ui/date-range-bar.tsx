"use client";

import { useState } from "react";
import { CalendarRange, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { colomboDaysAgo, colomboToday } from "@/lib/colombo-date";
import { useLanguage } from "@/lib/i18n/language-context";

export interface DatePreset {
  id: string;
  label: string;
  range: () => { from: string; to: string };
}

/** The two presets the P&L report has always offered (Colombo calendar). */
export const THIS_MONTH: DatePreset = {
  id: "this-month",
  label: "This month",
  range: () => {
    const today = colomboToday();
    return { from: `${today.slice(0, 7)}-01`, to: today };
  },
};

export const LAST_30_DAYS: DatePreset = {
  id: "last-30",
  label: "Last 30 days",
  range: () => ({ from: colomboDaysAgo(29), to: colomboToday() }),
};

/**
 * From/to date inputs + preset pills. Purely presentational: the page
 * passes its own `onApply` (usually a router.push with ?from=&to=), so each
 * page keeps its existing date logic. A date is applied when its input
 * loses focus; a preset fills both dates and applies immediately.
 */
export function DateRangeBar({
  fromDate,
  toDate,
  onApply,
  presets = [],
  pending = false,
  className,
}: {
  fromDate: string;
  toDate: string;
  onApply: (from: string, to: string) => void;
  presets?: DatePreset[];
  pending?: boolean;
  className?: string;
}) {
  const { t } = useLanguage();
  const [from, setFrom] = useState(fromDate);
  const [to, setTo] = useState(toDate);

  const activePreset = presets.find((p) => {
    const r = p.range();
    return r.from === fromDate && r.to === toDate;
  })?.id;

  function applyPreset(p: DatePreset) {
    const r = p.range();
    setFrom(r.from);
    setTo(r.to);
    onApply(r.from, r.to);
  }

  const inputClass =
    "h-9 w-[8.75rem] rounded-full bg-transparent px-2 text-sm font-medium tabular-nums text-rw-ink outline-none focus-visible:ring-2 focus-visible:ring-rw-green/30 disabled:opacity-60 [color-scheme:light] dark:[color-scheme:dark]";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex h-11 items-center gap-1 rounded-full border border-rw-border bg-rw-card pl-3.5 pr-1.5">
        <CalendarRange className="h-4 w-4 shrink-0 text-rw-muted" strokeWidth={1.8} />
        <input
          type="date"
          aria-label={t("From")}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          onBlur={() => onApply(from, to)}
          disabled={pending}
          className={inputClass}
        />
        <span className="text-sm text-rw-muted">–</span>
        <input
          type="date"
          aria-label={t("To")}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          onBlur={() => onApply(from, to)}
          disabled={pending}
          className={inputClass}
        />
      </div>

      {presets.length > 0 && (
        <div className="flex h-11 items-center gap-1 rounded-full border border-rw-border bg-rw-card p-1" role="group">
          {presets.map((p) => {
            const active = activePreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p)}
                disabled={pending}
                aria-pressed={active}
                className={cn(
                  "h-full whitespace-nowrap rounded-full px-3.5 text-sm font-semibold transition-colors disabled:opacity-60",
                  active ? "bg-rw-sidebar text-white" : "text-rw-muted hover:bg-rw-soft hover:text-rw-ink"
                )}
              >
                {t(p.label)}
              </button>
            );
          })}
        </div>
      )}

      {pending && <Loader2 className="h-4 w-4 animate-spin text-rw-muted" aria-label={t("Loading")} />}
    </div>
  );
}
