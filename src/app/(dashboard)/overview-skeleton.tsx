import { cn } from "@/lib/utils";

function Block({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-rw-border/70", className)} />;
}

function PanelSkeleton({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-rw border border-rw-border bg-rw-card p-5 sm:p-6", className)}>{children}</div>
  );
}

/** Mirrors the Overview grid so the page doesn't jump when data arrives. */
export function OverviewSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
        <div className="space-y-2">
          <Block className="h-8 w-72" />
          <Block className="h-4 w-56" />
        </div>
        <div className="flex flex-wrap gap-3">
          <Block className="h-11 w-60 rounded-full" />
          <Block className="h-11 w-48 rounded-full" />
          <Block className="h-11 w-24 rounded-full" />
          <Block className="h-11 w-11 rounded-full" />
          <Block className="h-11 w-36 rounded-full" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1.25fr_1fr_1fr_1fr]">
        <div className="h-[220px] animate-pulse rounded-rw bg-rw-hero/80" />
        {[0, 1, 2].map((i) => (
          <PanelSkeleton key={i} className="space-y-5">
            <div className="flex items-center gap-3">
              <Block className="h-10 w-10 rounded-xl" />
              <Block className="h-4 flex-1" />
            </div>
            <Block className="h-8 w-3/4" />
            <Block className="h-4 w-2/3" />
          </PanelSkeleton>
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-[1fr_1.4fr_1fr]">
        <PanelSkeleton className="space-y-4">
          <Block className="h-5 w-40" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Block className="h-10 w-10 rounded-xl" />
              <div className="flex-1 space-y-1.5">
                <Block className="h-4 w-1/2" />
                <Block className="h-3 w-2/3" />
              </div>
              <Block className="h-5 w-12" />
            </div>
          ))}
        </PanelSkeleton>
        <PanelSkeleton className="space-y-4">
          <Block className="h-5 w-48" />
          <Block className="h-3 w-64" />
          <Block className="h-64 w-full rounded-xl" />
        </PanelSkeleton>
        <PanelSkeleton className="space-y-4 lg:col-span-2 xl:col-span-1">
          <Block className="h-5 w-36" />
          <div className="mx-auto h-44 w-44 animate-pulse rounded-full border-[22px] border-rw-border/70" />
          <div className="grid grid-cols-2 gap-3">
            <Block className="h-16 rounded-2xl" />
            <Block className="h-16 rounded-2xl" />
          </div>
        </PanelSkeleton>
      </div>
    </div>
  );
}
