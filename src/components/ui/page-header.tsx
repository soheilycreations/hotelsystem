import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const STACK: Record<"lg" | "xl" | "2xl", string> = {
  lg: "lg:flex-row lg:items-start lg:justify-between",
  xl: "xl:flex-row xl:items-start xl:justify-between",
  "2xl": "2xl:flex-row 2xl:items-start 2xl:justify-between",
};

/** Page title (28px bold) + muted subtitle, with actions on the right. */
export function PageHeader({
  title,
  subtitle,
  actions,
  stackUntil = "lg",
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Breakpoint at which actions move beside the title */
  stackUntil?: "lg" | "xl" | "2xl";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 text-rw-ink", STACK[stackUntil], className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-rw-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:gap-3">{actions}</div>}
    </div>
  );
}
