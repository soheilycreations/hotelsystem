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

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Bill/order display number: {business_date as YYYYMMDD}-{order_number,
 * zero-padded to 2 digits}. order_number is one continuous sequence that
 * never resets day to day (so it stays unique on its own) — the date
 * prefix is just there so a printed bill reads its own date at a glance.
 * e.g. business_date "2026-09-10", order_number 1 → "20260910-01".
 */
export function formatOrderNumber(businessDate: string, orderNumber: number | null): string {
  if (orderNumber == null) return "—"; // not yet billed/settled — see rpc_ensure_order_number()
  return `${businessDate.slice(0, 10).replace(/-/g, "")}-${String(orderNumber).padStart(2, "0")}`;
}
