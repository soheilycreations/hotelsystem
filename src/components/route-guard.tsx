"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { canAccess, ROLE_HOME, type StaffRole } from "@/lib/types";
import { Button } from "@/components/ui/button";

/**
 * Second RBAC layer on top of Postgres RLS: hides route content in the shell
 * for roles that shouldn't reach it (RLS still protects the data itself).
 */
export function RouteGuard({ role, children }: { role: StaffRole; children: React.ReactNode }) {
  const pathname = usePathname();

  if (canAccess(role, pathname)) return <>{children}</>;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <ShieldAlert className="h-10 w-10 text-muted-foreground" />
      <div>
        <h1 className="text-lg font-semibold">No access to this area</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your role doesn&apos;t include this module. Ask a manager if you need it enabled.
        </p>
      </div>
      <Button asChild>
        <Link href={ROLE_HOME[role]}>Go to my workspace</Link>
      </Button>
    </div>
  );
}
