import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Status colours shared by pills and tags (light + dark variants). */
export type Tone = "neutral" | "green" | "amber" | "red" | "blue" | "orange" | "lime";

export const TONES: Record<Tone, string> = {
  neutral: "bg-rw-soft text-rw-muted",
  green: "bg-[#E6F4D2] text-[#2E6A12] dark:bg-rw-lime/15 dark:text-rw-lime",
  amber: "bg-[#FCF0CF] text-[#8A5A00] dark:bg-amber-400/15 dark:text-amber-300",
  red: "bg-[#FCE4DF] text-[#B3261E] dark:bg-red-400/15 dark:text-red-300",
  blue: "bg-[#E2ECFA] text-[#1F4F9A] dark:bg-sky-400/15 dark:text-sky-300",
  orange: "bg-[#FDE8DA] text-[#B4501A] dark:bg-orange-400/15 dark:text-orange-300",
  lime: "bg-rw-lime text-rw-on-lime",
};

/** Small rounded status pill — "14 days", "Pending", "Margin 32.1%". */
export function Pill({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** Compact uppercase tag — activity kinds, categories ("BILL", "EXPENSE"). */
export function Tag({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
