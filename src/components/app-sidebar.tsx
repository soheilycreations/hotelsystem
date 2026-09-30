"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  BarChart3,
  BedDouble,
  BookOpen,
  Building2,
  Calculator,
  CalendarCheck,
  CalendarDays,
  ChefHat,
  ChevronDown,
  Coins,
  CreditCard,
  FileEdit,
  FileText,
  History,
  LayoutGrid,
  LogOut,
  Menu,
  Moon,
  Package,
  Receipt,
  ReceiptText,
  SlidersHorizontal,
  Sun,
  Truck,
  Users,
  UtensilsCrossed,
  Wallet,
  Warehouse,
  X,
  type LucideIcon,
} from "lucide-react";
import { canAccess, type StaffProfile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useActiveOrderCount } from "@/hooks/useActiveOrderCount";
import { useLanguage } from "@/lib/i18n/language-context";
import { logout } from "@/app/(auth)/login/actions";

interface NavChild {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  section: "MENU" | "MANAGEMENT";
  /** Existing sub-pages, shown nested under the parent when expanded */
  children?: NavChild[];
  /** Shows the live active-kitchen-order count as a lime badge */
  kitchenBadge?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutGrid, section: "MENU" },
  { href: "/pms/rooms", label: "Rooms", icon: BedDouble, section: "MENU" },
  { href: "/pms/reserve", label: "Reservations", icon: CalendarCheck, section: "MENU" },
  { href: "/pms/calendar", label: "Calendar", icon: CalendarDays, section: "MENU" },
  {
    href: "/pos/active",
    label: "Restaurant / POS",
    icon: UtensilsCrossed,
    section: "MENU",
    kitchenBadge: true,
    children: [
      { href: "/pos/active", label: "POS Terminal", icon: UtensilsCrossed },
      { href: "/pos/billing", label: "Billing", icon: Receipt },
      { href: "/pos/menu", label: "Menu Items", icon: BookOpen },
    ],
  },
  {
    href: "/finance/daily-summary",
    label: "Finance",
    icon: Wallet,
    section: "MENU",
    children: [
      { href: "/finance/daily-summary", label: "Daily Summary", icon: CalendarDays },
      { href: "/finance/simple-report", label: "Simple Report", icon: Calculator },
      { href: "/finance/bills", label: "Bills", icon: FileText },
      { href: "/finance/cash-book", label: "Cash Book", icon: Coins },
    ],
  },
  { href: "/finance/reports", label: "Reports", icon: BarChart3, section: "MENU" },
  {
    href: "/inventory",
    label: "Inventory",
    icon: Package,
    section: "MANAGEMENT",
    children: [
      { href: "/inventory", label: "Stock list", icon: Package },
      { href: "/inventory/store", label: "Store", icon: Warehouse },
      { href: "/inventory/purchases", label: "Purchasing", icon: Truck },
      { href: "/inventory/recipes", label: "Recipe Costing", icon: ChefHat },
    ],
  },
  { href: "/finance/expenses", label: "Expenses", icon: ReceiptText, section: "MANAGEMENT" },
  { href: "/finance/credit-accounts", label: "Credit accounts", icon: CreditCard, section: "MANAGEMENT" },
  {
    href: "/settings",
    label: "Settings",
    icon: SlidersHorizontal,
    section: "MANAGEMENT",
    children: [
      { href: "/settings", label: "Hotel Profile", icon: Building2 },
      { href: "/settings/users", label: "Staff Accounts", icon: Users },
      { href: "/settings/settled-records", label: "Settled Records", icon: FileEdit },
      { href: "/backfill", label: "Backfill Data", icon: History },
    ],
  },
];

const SECTIONS: NavItem["section"][] = ["MENU", "MANAGEMENT"];

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  manager: "Manager",
  receptionist: "Receptionist",
  cashier: "Cashier",
  kitchen_staff: "Kitchen",
};

function matches(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  const last = parts[parts.length - 1] ?? "";
  if (!first) return "?";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

/** A nav item after role filtering: link target + the children this role can reach. */
interface VisibleItem extends NavItem {
  target: string;
  visibleChildren: NavChild[];
}

export function AppSidebar({
  profile,
  hotelName = "Soheily PMS",
  logoUrl = null,
}: {
  profile: StaffProfile;
  hotelName?: string;
  logoUrl?: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();
  const activeOrderCount = useActiveOrderCount();

  // Role filtering: a parent stays visible if its own page or any sub-page is
  // reachable; when only sub-pages are, the parent links to the first of them.
  const visible: VisibleItem[] = NAV_ITEMS.flatMap((item) => {
    const visibleChildren = (item.children ?? []).filter((c) => canAccess(profile.role, c.href));
    const selfOk = canAccess(profile.role, item.href);
    const target = selfOk ? item.href : visibleChildren[0]?.href;
    if (!target) return [];
    return [{ ...item, target, visibleChildren }];
  });

  // The single most specific href that matches the current path decides
  // what's highlighted (so /inventory/store lights "Store", not "Stock list").
  const allHrefs = visible.flatMap((i) => [i.href, ...i.visibleChildren.map((c) => c.href)]);
  const activeHref = allHrefs
    .filter((h) => matches(pathname, h))
    .sort((a, b) => b.length - a.length)[0];

  const isItemActive = (item: VisibleItem) =>
    activeHref === item.href || item.visibleChildren.some((c) => c.href === activeHref);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  // Auto-expand the section the user is currently in.
  useEffect(() => {
    const current = visible.find((i) => i.visibleChildren.length > 1 && isItemActive(i));
    if (current) setExpanded((prev) => (prev.has(current.href) ? prev : new Set(prev).add(current.href)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function toggle(href: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  }

  /*
   * `hover` = the desktop/tablet rail: 76px of icons that widens to 248px
   * while the pointer (or keyboard focus) is over it. It floats over the
   * page instead of pushing it, so wide screens like the POS terminal keep
   * their space. Labels are hidden with opacity (not unmounted) so the
   * icons never shift while the rail animates open.
   */
  const reveal = (hover: boolean) =>
    hover
      ? "opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100"
      : "";
  // Written out in full so Tailwind's class scanner picks them up.
  const onlyExpanded = (hover: boolean, display: "flex" | "block" = "flex") =>
    !hover
      ? ""
      : display === "flex"
        ? "hidden group-hover:flex group-has-[:focus-visible]:flex"
        : "hidden group-hover:block group-has-[:focus-visible]:block";

  const nav = (hover: boolean) => (
    <nav className="no-scrollbar flex flex-1 flex-col gap-6 overflow-y-auto overflow-x-hidden px-3 py-2">
      {SECTIONS.map((section) => {
        const items = visible.filter((i) => i.section === section);
        if (items.length === 0) return null;
        return (
          <div key={section}>
            <p
              className={cn(
                "mb-2 whitespace-nowrap px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-rw-sidebar-text/60",
                reveal(hover)
              )}
            >
              {t(section === "MENU" ? "Menu" : "Management")}
            </p>
            <div className="flex flex-col gap-1">
              {items.map((item) => {
                const active = isItemActive(item);
                const hasChildren = item.visibleChildren.length > 1;
                const isOpen = hasChildren && expanded.has(item.href);
                const badge = item.kitchenBadge && activeOrderCount > 0 ? activeOrderCount : 0;
                return (
                  <div key={item.href}>
                    <div className="relative flex items-center">
                      {active && (
                        <span
                          aria-hidden
                          className="absolute -left-3 top-1.5 bottom-1.5 w-1 rounded-r-full bg-rw-lime"
                        />
                      )}
                      <Link
                        href={item.target}
                        onClick={() => setOpen(false)}
                        aria-label={hover ? t(item.label) : undefined}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2.5 text-[15px] font-medium transition-colors",
                          // 17px keeps the icon centred in the 76px rail
                          hover ? "px-[17px]" : "px-3",
                          active
                            ? "bg-white/10 text-white"
                            : "text-rw-sidebar-text hover:bg-white/5 hover:text-white"
                        )}
                      >
                        <span className="relative shrink-0">
                          <item.icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                          {hover && badge > 0 && (
                            <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-rw-lime px-1 text-[10px] font-bold tabular-nums text-rw-on-lime group-hover:hidden group-has-[:focus-visible]:hidden">
                              {badge}
                            </span>
                          )}
                        </span>
                        <span className={cn("truncate whitespace-nowrap", reveal(hover))}>{t(item.label)}</span>
                        {badge > 0 && (
                          <span
                            className={cn(
                              "ml-auto h-6 min-w-6 items-center justify-center rounded-full bg-rw-lime px-1.5 text-xs font-bold tabular-nums text-rw-on-lime",
                              hover ? onlyExpanded(true) : "flex"
                            )}
                            title={`${badge} ${t("active kitchen orders")}`}
                          >
                            {badge}
                          </span>
                        )}
                      </Link>
                      {hasChildren && (
                        <button
                          type="button"
                          onClick={() => toggle(item.href)}
                          aria-label={isOpen ? t("Collapse") : t("Expand")}
                          aria-expanded={isOpen}
                          className={cn(
                            "ml-1 h-8 w-8 shrink-0 items-center justify-center rounded-lg text-rw-sidebar-text/70 transition-colors hover:bg-white/5 hover:text-white",
                            hover ? onlyExpanded(true) : "flex"
                          )}
                        >
                          <ChevronDown
                            className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")}
                            strokeWidth={1.8}
                          />
                        </button>
                      )}
                    </div>
                    {isOpen && (
                      <div
                        className={cn(
                          "ml-[22px] mt-1 flex-col gap-0.5 border-l border-white/10 pl-3",
                          hover ? onlyExpanded(true) : "flex"
                        )}
                      >
                        {item.visibleChildren.map((child) => {
                          const childActive = activeHref === child.href;
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              onClick={() => setOpen(false)}
                              aria-current={childActive ? "page" : undefined}
                              className={cn(
                                "flex items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                                childActive
                                  ? "bg-white/10 font-medium text-white"
                                  : "text-rw-sidebar-text/80 hover:bg-white/5 hover:text-white"
                              )}
                            >
                              <child.icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                              <span className="truncate">{t(child.label)}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );

  const userCard = (hover: boolean) => (
    <div className="p-3">
      <div
        className={cn(
          "rounded-2xl transition-[background-color,padding] duration-150",
          hover
            ? "p-1.5 group-hover:bg-white/[0.06] group-hover:p-3 group-has-[:focus-visible]:bg-white/[0.06] group-has-[:focus-visible]:p-3"
            : "bg-white/[0.06] p-3"
        )}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rw-sidebar-text text-sm font-bold text-rw-sidebar">
            {initials(profile.full_name)}
          </span>
          <div className={cn("min-w-0 flex-1", reveal(hover))}>
            <p className="truncate whitespace-nowrap text-sm font-semibold text-white">{profile.full_name}</p>
            <p className="truncate whitespace-nowrap text-xs text-rw-sidebar-text/70">
              {t(ROLE_LABELS[profile.role] ?? profile.role)}
            </p>
          </div>
          <form action={logout} className={cn(hover && onlyExpanded(true, "block"))}>
            <button
              type="submit"
              aria-label={t("Sign out")}
              title={t("Sign out")}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-rw-sidebar-text transition-colors hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </button>
          </form>
        </div>
        <div
          className={cn(
            "mt-2 items-center gap-1 border-t border-white/10 pt-2",
            hover ? onlyExpanded(true) : "flex"
          )}
        >
          <SidebarLanguageButton />
          <SidebarThemeButton />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 bg-rw-sidebar px-4 text-rw-sidebar-text md:hidden">
        <button
          type="button"
          aria-label={t("Open menu")}
          onClick={() => setOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/10"
        >
          <Menu className="h-5 w-5" strokeWidth={1.8} />
        </button>
        <Brand hotelName={hotelName} logoUrl={logoUrl} compact />
      </header>

      {/* Mobile slide-in drawer */}
      <div
        className={cn("fixed inset-0 z-50 md:hidden", open ? "pointer-events-auto" : "pointer-events-none")}
        inert={!open}
      >
        <div
          className={cn("absolute inset-0 bg-black/50 transition-opacity", open ? "opacity-100" : "opacity-0")}
          onClick={() => setOpen(false)}
        />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 flex w-[248px] max-w-[85vw] flex-col bg-rw-sidebar shadow-xl transition-transform duration-200 ease-out",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex items-center justify-between gap-2 px-5 pb-4 pt-5">
            <Brand hotelName={hotelName} logoUrl={logoUrl} />
            <button
              type="button"
              aria-label={t("Close menu")}
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-rw-sidebar-text hover:bg-white/10"
            >
              <X className="h-5 w-5" strokeWidth={1.8} />
            </button>
          </div>
          {nav(false)}
          {userCard(false)}
        </aside>
      </div>

      {/* Tablet + desktop: icon rail that expands over the page on hover */}
      <aside className="group fixed inset-y-0 left-0 z-30 hidden w-[76px] flex-col overflow-hidden bg-rw-sidebar transition-[width,box-shadow] duration-200 ease-out hover:w-[248px] hover:shadow-2xl has-[:focus-visible]:w-[248px] has-[:focus-visible]:shadow-2xl md:flex">
        <div className="px-4 pb-4 pt-5">
          <Brand hotelName={hotelName} logoUrl={logoUrl} hover />
        </div>
        {nav(true)}
        {userCard(true)}
      </aside>
    </>
  );
}

function SidebarLanguageButton() {
  const { language, setLanguage } = useLanguage();
  return (
    <button
      type="button"
      aria-label="Toggle language"
      title={language === "en" ? "සිංහලට මාරු කරන්න" : "Switch to English"}
      onClick={() => setLanguage(language === "en" ? "si" : "en")}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-[11px] font-bold text-rw-sidebar-text transition-colors hover:bg-white/10 hover:text-white"
    >
      {language === "en" ? "EN" : "සිං"}
    </button>
  );
}

function SidebarThemeButton() {
  const { setTheme, resolvedTheme } = useTheme();
  const { t } = useLanguage();
  return (
    <button
      type="button"
      aria-label={t("Toggle theme")}
      title={t("Toggle theme")}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="relative flex h-8 w-8 items-center justify-center rounded-lg text-rw-sidebar-text transition-colors hover:bg-white/10 hover:text-white"
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" strokeWidth={1.8} />
      <Moon
        className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
        strokeWidth={1.8}
      />
    </button>
  );
}

function Brand({
  hotelName,
  logoUrl,
  compact = false,
  hover = false,
}: {
  hotelName: string;
  logoUrl: string | null;
  compact?: boolean;
  /** Text fades in only while the rail is expanded */
  hover?: boolean;
}) {
  const { t } = useLanguage();
  const mark = logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt=""
      className={cn("shrink-0 rounded-xl bg-white object-contain", compact ? "h-8 w-8" : "h-11 w-11")}
    />
  ) : (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl bg-rw-lime font-bold text-rw-on-lime",
        compact ? "h-8 w-8 text-sm" : "h-11 w-11 text-lg"
      )}
    >
      {hotelName.trim().charAt(0).toUpperCase() || "H"}
    </span>
  );

  return (
    <span className="flex min-w-0 items-center gap-3">
      {mark}
      <span
        className={cn(
          "min-w-0 whitespace-nowrap",
          hover &&
            "opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100"
        )}
      >
        <span className="block truncate text-[17px] font-bold leading-tight text-white">{hotelName}</span>
        {!compact && (
          <span className="block truncate text-xs text-rw-sidebar-text/70">{t("Owner console")}</span>
        )}
      </span>
    </span>
  );
}
