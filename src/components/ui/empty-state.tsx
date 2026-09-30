import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Friendly dashed placeholder used instead of bare zeros / blank tables. */
export function EmptyState({
  icon: Icon,
  className,
  children,
}: {
  icon?: LucideIcon;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-rw-border bg-rw-soft/50 px-4 py-8 text-center text-sm text-rw-muted",
        className
      )}
    >
      {Icon && <Icon className="h-5 w-5" strokeWidth={1.8} />}
      {children}
    </div>
  );
}
