import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Card wrapper that restyles the shared <Table> inside it: sticky #F4F6F2
 * header, 14px rows, subtle hover, no zebra. The table scrolls sideways
 * inside the card on small screens. Styling is applied from outside so
 * ui/table.tsx (used on non-finance pages too) is left as-is.
 */
export function TableCard({
  title,
  subtitle,
  action,
  footer,
  scrollBody = false,
  className,
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  /** Cap the height so long tables scroll inside the card with a sticky header */
  scrollBody?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("overflow-hidden rounded-rw border border-rw-border bg-rw-card text-rw-ink", className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-4 pt-5 sm:px-6">
          <div className="min-w-0">
            {title && <h2 className="text-[17px] font-bold">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-rw-muted">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div
        className={cn(
          "text-sm",
          // header
          "[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:h-10 [&_thead_th]:bg-rw-page [&_thead_th]:text-xs [&_thead_th]:font-semibold [&_thead_th]:uppercase [&_thead_th]:tracking-wide [&_thead_th]:text-rw-muted",
          "[&_thead_tr]:border-rw-border",
          // body rows
          "[&_tbody_tr]:border-rw-border [&_tbody_tr:hover]:bg-rw-soft/60 [&_td]:text-sm",
          "[&_th:first-child]:pl-5 [&_td:first-child]:pl-5 [&_th:last-child]:pr-5 [&_td:last-child]:pr-5 sm:[&_th:first-child]:pl-6 sm:[&_td:first-child]:pl-6 sm:[&_th:last-child]:pr-6 sm:[&_td:last-child]:pr-6",
          scrollBody && "[&_.overflow-auto]:max-h-[560px]"
        )}
      >
        {children}
      </div>
      {footer && <div className="border-t border-rw-border px-5 py-3 text-sm sm:px-6">{footer}</div>}
    </section>
  );
}
