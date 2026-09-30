import { cn } from "@/lib/utils";

/** Pulsing placeholder block for loading states. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-rw-border/70", className)} />;
}

/** Generic report-page skeleton: header, 3 stat cards, a chart and a table. */
export function ReportPageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-11 w-full rounded-full sm:w-[420px]" />
      </div>
      <div className={cn("grid gap-4 sm:grid-cols-2", cards >= 4 ? "xl:grid-cols-4" : "lg:grid-cols-3")}>
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="space-y-4 rounded-rw border border-rw-border bg-rw-card p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <Skeleton className="h-4 flex-1" />
            </div>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
      <div className="space-y-4 rounded-rw border border-rw-border bg-rw-card p-5 sm:p-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
      <div className="space-y-3 rounded-rw border border-rw-border bg-rw-card p-5 sm:p-6">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}
