import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The owner-console card: white (deep green in dark mode), #E6EAE4 border,
 * 22px radius, 20–24px padding. Named Panel because `Card` is the existing
 * shadcn card used across the app.
 */
export function Panel({
  className,
  children,
  as: Tag = "section",
}: {
  className?: string;
  children: ReactNode;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag className={cn("rounded-rw border border-rw-border bg-rw-card p-5 text-rw-ink sm:p-6", className)}>
      {children}
    </Tag>
  );
}
