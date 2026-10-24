import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatLKR(amount: number): string {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
  }).format(amount);
}

// Always Colombo time — the server (Cloudflare Workers) runs in UTC, so
// without an explicit zone server-rendered times are 5h30m behind.
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Colombo",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Colombo",
  });
}

/** Minutes past a planned checkout as "2d 3h" / "5h 10m" / "25m". */
export function formatOverdue(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const min = m % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${min}m`;
  return `${min}m`;
}

/**
 * Bill number as printed: {settle date as YYYYMMDD}-{per-day number, 3 digits}.
 * Both parts are stamped by the database when the bill is settled
 * (migration 041), so numbers run 001, 002… within each day.
 * e.g. business_date "2026-10-19", order_number 1 → "20261019-001".
 * Bills settled before migration 041 keep their old (global) numbers.
 */
export function formatOrderNumber(businessDate: string, orderNumber: number | null): string {
  if (orderNumber == null) return "—"; // not yet billed/settled — see rpc_ensure_order_number()
  return `${businessDate.slice(0, 10).replace(/-/g, "")}-${String(orderNumber).padStart(3, "0")}`;
}

/** Heading printed on a bill: the real number once settled, otherwise a
 * clearly-marked pre-bill (numbers are issued at settle time only). */
export function billTitle(order: { business_date: string; order_number: number | null }): string {
  return order.order_number == null
    ? "PRE-BILL (not paid)"
    : `Bill #${formatOrderNumber(order.business_date, order.order_number)}`;
}

/** Date/time printed on a bill: when it was settled, else when it was opened. */
export function billDateTime(order: { created_at: string; settled_at?: string | null }): string {
  return new Date(order.settled_at ?? order.created_at).toLocaleString("en-GB", { timeZone: "Asia/Colombo" });
}
