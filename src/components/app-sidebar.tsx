"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BedDouble,
  BookOpen,
  CalendarCheck,
  ChefHat,
  Hotel,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  ScrollText,
  UtensilsCrossed,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { canAccess, type StaffProfile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { logout } from "@/app/(auth)/login/actions";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard, group: "Analytics" },
  { href: "/pms/rooms", label: "Room Grid", icon: BedDouble, group: "Property" },
  { href: "/pms/reserve", label: "Bookings", icon: CalendarCheck, group: "Property" },
  { href: "/pos/active", label: "POS Terminal", icon: UtensilsCrossed, group: "Restaurant" },
  { href: "/pos/billing", label: "Billing", icon: Receipt, group: "Restaurant" },
  { href: "/pos/menu", label: "Menu Items", icon: BookOpen, group: "Restaurant" },
  { href: "/inventory", label: "Inventory", icon: Package, group: "Kitchen" },
  { href: "/inventory/recipes", label: "Recipe Costing", icon: ChefHat, group: "Kitchen" },
  { href: "/finance/expenses", label: "Expenses", icon: Wallet, group: "Finance" },
  { href: "/finance/reports", label: "P&L Reports", icon: ScrollText, group: "Finance" },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  manager: "Manager",
  receptionist: "Receptionist",
  cashier: "Cashier",
  kitchen_staff: "Kitchen",
};

export function AppSidebar({ profile }: { profile: StaffProfile }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const visible = NAV_ITEMS.filter((item) => canAccess(profile.role, item.href));
  const groups = Array.from(new Set(visible.map((i) => i.group)));

  const nav = (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
      {groups.map((group) => (
        <div key={group}>
          <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group}
          </p>
          <div className="flex flex-col gap-0.5">
            {visible
              .filter((i) => i.group === group)
              .map((item) => {
                const active =
                  item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
          </div>
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{profile.full_name}</p>
          <Badge variant="secondary" className="mt-0.5">
            {ROLE_LABELS[profile.role] ?? profile.role}
          </Badge>
        </div>
        <ThemeToggle />
      </div>
      <form action={logout}>
        <Button variant="outline" size="sm" className="w-full" type="submit">
          <LogOut /> Sign out
        </Button>
      </form>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur md:hidden">
        <Button variant="ghost" size="icon" aria-label="Open menu" onClick={() => setOpen(true)}>
          <Menu className="h-5 w-5" />
        </Button>
        <Hotel className="h-5 w-5 text-primary" />
        <span className="font-semibold">Soheily PMS</span>
      </header>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r bg-background">
            <div className="flex h-14 items-center justify-between border-b px-4">
              <div className="flex items-center gap-2 font-semibold">
                <Hotel className="h-5 w-5 text-primary" /> Soheily PMS
              </div>
              <Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => setOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      ) : null}

      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-background md:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4 font-semibold">
          <Hotel className="h-5 w-5 text-primary" /> Soheily PMS
        </div>
        {nav}
        {footer}
      </aside>
    </>
  );
}
