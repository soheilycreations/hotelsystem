import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel } from "./panel";

/** Tinted icon-chip colours. */
export const CHIP_TONES = {
  green: "bg-[#E8F2EC] text-rw-green dark:bg-rw-green/15",
  lime: "bg-rw-lime/25 text-rw-on-lime dark:bg-rw-lime/15 dark:text-rw-lime",
  orange: "bg-[#FDE8DA] text-[#C0561B] dark:bg-orange-400/15 dark:text-orange-300",
  blue: "bg-[#E2ECFA] text-[#1F4F9A] dark:bg-sky-400/15 dark:text-sky-300",
  neutral: "bg-rw-soft text-rw-muted",
} as const;

export type ChipTone = keyof typeof CHIP_TONES;

export function IconChip({ icon: Icon, tone = "neutral", className }: { icon: LucideIcon; tone?: ChipTone; className?: string }) {
  return (
    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", CHIP_TONES[tone], className)}>
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
    </span>
  );
}

/** KPI card: icon chip + label (+ pill) → big number → sub-line. */
export function StatCard({
  icon,
  tone = "neutral",
  label,
  value,
  sub,
  pill,
  valueClassName,
  className,
}: {
  icon: LucideIcon;
  tone?: ChipTone;
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  pill?: ReactNode;
  valueClassName?: string;
  className?: string;
}) {
  return (
    <Panel className={cn("flex flex-col", className)}>
      <div className="flex items-center gap-3">
        <IconChip icon={icon} tone={tone} />
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-rw-muted">{label}</span>
        {pill}
      </div>
      <p className={cn("mt-5 text-2xl font-bold tabular-nums tracking-tight sm:text-[28px]", valueClassName)}>{value}</p>
      {sub && <p className="mt-2 text-sm tabular-nums text-rw-muted">{sub}</p>}
    </Panel>
  );
}
