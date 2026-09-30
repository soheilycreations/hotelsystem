"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Panel } from "./panel";

/** Title + subtitle + legend slot, then the chart body. */
export function ChartCard({
  title,
  subtitle,
  legend,
  className,
  bodyClassName,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  legend?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <Panel className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-rw-muted">{subtitle}</p>}
        </div>
        {legend && <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{legend}</div>}
      </div>
      <div className={cn("mt-4", bodyClassName)}>{children}</div>
    </Panel>
  );
}

/** Static legend entry — coloured square + label. */
export function LegendDot({ color, label }: { color: string; label: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-rw-muted">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

/** Legend entry that shows/hides a series: filled when on, outlined when off. */
export function LegendToggle({
  color,
  label,
  active,
  onToggle,
}: {
  color: string;
  label: ReactNode;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition-colors",
        active
          ? "border-transparent bg-rw-soft text-rw-ink"
          : "border-rw-border bg-transparent text-rw-muted hover:text-rw-ink"
      )}
    >
      <span
        className="h-2.5 w-2.5 rounded-full border-2"
        style={{ borderColor: color, background: active ? color : "transparent" }}
      />
      {label}
    </button>
  );
}

/** Shared tooltip card for Recharts: white card, soft shadow, Rs values. */
export function ChartTooltipCard({
  label,
  rows,
}: {
  label?: ReactNode;
  rows: { key: string; color?: string; name: ReactNode; value: ReactNode }[];
}) {
  return (
    <div className="rounded-xl border border-rw-border bg-rw-card px-3 py-2 text-xs shadow-[0_8px_24px_rgba(15,61,46,0.12)]">
      {label && <p className="mb-1 font-semibold text-rw-ink">{label}</p>}
      {rows.map((r) => (
        <p key={r.key} className="flex items-center gap-2 text-rw-muted">
          {r.color && <span className="h-2 w-2 rounded-sm" style={{ background: r.color }} />}
          {r.name}
          <span className="ml-auto pl-3 font-semibold tabular-nums text-rw-ink">{r.value}</span>
        </p>
      ))}
    </div>
  );
}
