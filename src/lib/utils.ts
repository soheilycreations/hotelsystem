import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatColomboDate, formatColomboDateTime } from "./colombo-date";

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

/**
 * Whole rupees, half up (155.50 → 156, 155.49 → 155). Used for amounts the
 * hotel itself calculates (stay prorations) — cash can't be paid in cents.
 * Supplier invoices, expenses and cash movements keep their exact cents.
 */
export function roundToRupee(amount: number): number {
  return Math.round(amount);
}

/**
 * Add money values in integer cents so long ledgers don't drift on
 * floating-point error (0.1 + 0.2 ≠ 0.3). Returns rupees, exact to the cent.
 */
export function sumMoney(values: Iterable<number>): number {
  let cents = 0;
  for (const v of values) cents += Math.round(Number(v) * 100);
  return cents / 100;
}

/** a + b on money values, exact to the cent (see sumMoney). */
export function addMoney(a: number, b: number): number {
  return (Math.round(a * 100) + Math.round(b * 100)) / 100;
}

/** "03 Oct 2026" in Colombo time — see lib/colombo-date. */
export function formatDate(iso: string): string {
  return formatColomboDate(iso);
}

/** "03 Oct, 16:49" in Colombo time — see lib/colombo-date. */
export function formatDateTime(iso: string): string {
  return formatColomboDateTime(iso);
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
