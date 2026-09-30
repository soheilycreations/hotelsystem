import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Icon + 17px bold heading, with an optional right-hand slot (link, pill). */
export function SectionTitle({
  icon: Icon,
  children,
  action,
  className,
  as: Heading = "h2",
}: {
  icon?: LucideIcon;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  as?: "h2" | "h3";
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Heading className={cn("flex min-w-0 items-center gap-2 text-[17px] font-bold text-rw-ink", className)}>
        {Icon && <Icon className="h-[18px] w-[18px] shrink-0 text-rw-muted" strokeWidth={1.8} />}
        <span className="min-w-0">{children}</span>
      </Heading>
      {action}
    </div>
  );
}
