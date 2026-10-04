/**
 * Sri Lanka is UTC+5:30 with no DST. The Node server this app runs on is
 * usually UTC (e.g. Vercel), so naive `new Date().toISOString().slice(0,10)`
 * calls silently return the WRONG calendar day for roughly 5.5 hours every
 * day (Colombo's 00:00–05:29) — the exact window hotel staff are most likely
 * to be checking overnight reports in. Every report/dashboard date bucket
 * must go through these helpers instead of ad-hoc Date math, so it always
 * lines up with the plain YYYY-MM-DD dates staff pick in Billing, Backfill,
 * and Expenses.
 */

const COLOMBO_OFFSET_MS = 5.5 * 3600 * 1000;

/** Today's date in Sri Lanka, as YYYY-MM-DD, regardless of server timezone. */
export function colomboToday(): string {
  return colomboDateKey(Date.now());
}

/** The Colombo calendar-day (YYYY-MM-DD) that a given instant falls on. */
export function colomboDateKey(epochMs: number): string {
  return new Date(epochMs + COLOMBO_OFFSET_MS).toISOString().slice(0, 10);
}

/** YYYY-MM-DD key for N days before today (Colombo calendar). */
export function colomboDaysAgo(days: number): string {
  return colomboDateKey(Date.now() - days * 86_400_000);
}

// ---------------------------------------------------------------------------
// Display formatting — every date/time shown to staff goes through these.
// `toLocaleString` without a timeZone renders in whatever zone the code runs
// in: UTC on the server (Vercel), the device's zone in the browser. That's how
// the same check-in showed 16:49 on Reservations but 11:19 on the Overview.
// These pin the zone to Asia/Colombo so server pages, client pages, PDFs,
// thermal slips and WhatsApp text all agree.
// ---------------------------------------------------------------------------

export const COLOMBO_TZ = "Asia/Colombo";

type DateInput = string | number | Date;

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Format an instant (timestamptz / epoch / Date) in Colombo time. */
export function formatColombo(
  value: DateInput,
  options: Intl.DateTimeFormatOptions,
  locale = "en-GB"
): string {
  return toDate(value).toLocaleString(locale, { ...options, timeZone: COLOMBO_TZ });
}

/** "03 Oct, 16:49" — lists, activity feeds. */
export function formatColomboDateTime(value: DateInput): string {
  return formatColombo(value, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** "03/10/2026, 16:49" — printed bills and PDFs. */
export function formatColomboDateTimeFull(value: DateInput): string {
  return formatColombo(value, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "03 Oct 2026" */
export function formatColomboDate(value: DateInput): string {
  return formatColombo(value, { day: "2-digit", month: "short", year: "numeric" });
}

/** "03/10/2026" */
export function formatColomboDateNumeric(value: DateInput): string {
  return formatColombo(value, { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** "16:49" */
export function formatColomboTime(value: DateInput): string {
  return formatColombo(value, { hour: "2-digit", minute: "2-digit" });
}

/**
 * Format a calendar-date key (YYYY-MM-DD, e.g. business_date / expense date)
 * — a date with no time, so it must never be shifted by any timezone. Read
 * and printed as UTC on purpose so "2026-10-03" is always 3 Oct everywhere.
 */
export function formatDayKey(
  key: string,
  locale = "en-GB",
  options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }
): string {
  return new Date(`${key.slice(0, 10)}T00:00:00Z`).toLocaleDateString(locale, { ...options, timeZone: "UTC" });
}

/** ISO instant for 00:00 Colombo time on a YYYY-MM-DD key — for DB range filters. */
export function colomboDayStartIso(key: string): string {
  return new Date(`${key.slice(0, 10)}T00:00:00+05:30`).toISOString();
}

/** Minutes past midnight right now, Colombo clock (for same-time-yesterday comparisons). */
export function colomboMinutesNow(epochMs: number = Date.now()): number {
  const d = new Date(epochMs + COLOMBO_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
