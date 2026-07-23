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
