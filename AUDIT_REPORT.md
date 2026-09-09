# hotel-pms-pos — Full Audit Report

**Scope:** Full codebase audit covering security/auth, database schema & business-logic triggers, and application code quality.
**Stack:** Next.js 15 (App Router + Server Actions), TypeScript, Supabase (Postgres/Auth/Realtime/RLS), Tailwind + Radix UI.
**Method:** Static review of `src/`, `supabase/schema.sql`, and all 16 numbered migrations. No automated tests exist in the repo, so no test execution was part of this pass.

---

## Executive Summary

The system is well-built for its scale: RLS is applied consistently and correctly, the privileged Supabase service-role key is properly isolated to a single server-only file, currency is stored as fixed-point `numeric` (not float), and TypeScript is run in strict mode with minimal use of `any`. There are no hardcoded secrets anywhere in the codebase.

The issues found are concentrated in three areas: **repo hygiene** (no `.gitignore`, no `.env.example` despite the README referencing one), **financial data integrity** (no audit trail for edits to settled records, a couple of non-transactional multi-step writes), and **defensive constraints** (stock quantities can go negative, a couple of migrations are order-dependent). None of these are exploitable security holes in the traditional sense — they're correctness and operational-risk gaps worth closing before the system scales up or handles disputes over money.

---

## 🔴 Critical

### 1. No `.gitignore` and no `.env.example`
- **Where:** repo root.
- **Issue:** There is no `.gitignore` at all, so nothing stops `.env.local`, `node_modules/`, or build output from being committed in the future. The README (line 56) tells developers to `cp .env.example .env.local`, but `.env.example` doesn't actually exist in the repo — so there's no template *and* no safety net.
- **Why it matters:** One `git add .` away from committing the Supabase service-role key or DB password to a public/shared history.
- **Fix:** Add a standard Next.js `.gitignore` (`node_modules`, `.next`, `.env*.local`, etc.) and commit a real `.env.example` listing the required variable names (no values) referenced in the README.

### 2. No audit trail for edits to settled financial records
- **Where:** `src/app/(dashboard)/backfill/actions.ts`, `src/app/(dashboard)/settings/settled-records/actions.ts`.
- **Issue:** Both are role-gated (admin/manager, admin-only respectively) and scope their updates with `.eq("status","checked_out")` / `.eq("order_status","completed")` guards, which limits blast radius — but there is no `audit_log` table or insert anywhere in the codebase (confirmed via repo-wide search). An admin can rewrite `total_amount`, `subtotal`, `payment_method`, or folio totals on an already-settled booking/order with **zero trace** of who changed what, from what value, or when.
- **Why it matters:** This is the exact surface a financial dispute or fraud investigation would need, and it currently produces no record.
- **Fix:** Add an `audit_log` table (`table_name`, `record_id`, `changed_by`, `old_value` jsonb, `new_value` jsonb, `changed_at`) and insert a row from each correction action before/alongside the update, ideally inside the same DB transaction.

---

## 🟠 High

### 3. Non-transactional multi-step writes in stay-extension actions
- **Where:** `src/app/(dashboard)/pms/actions.ts` — `extendShortStay`, `extendOvernightStay`, `shortenOvernightStay`.
- **Issue:** Each does two sequential writes: update the booking's checkout date, then insert a row into `booking_charges`. If the second write fails after the first succeeds, the checkout date has already moved but the guest was never charged for the extension — a silent revenue leak and a data-consistency bug.
- **Fix:** Wrap both writes in a single Postgres function called via RPC (so they commit/rollback together), or explicitly compensate (revert the date update) if the charge insert fails.

### 4. No floor constraint on inventory stock
- **Where:** `supabase/schema.sql` — `inventory_items.quantity_in_stock`.
- **Issue:** Unlike `unit_cost` and most other quantity columns, `quantity_in_stock` has no `CHECK (quantity_in_stock >= 0)` constraint. The `tg_recipe_stock_deductor` trigger does a single set-based `UPDATE ... SET quantity_in_stock = quantity_in_stock - ...` with no clamp, so stock can go negative silently when orders exceed recorded inventory.
- **Fix:** Add `CHECK (quantity_in_stock >= 0)`. Decide product behavior for the edge case (block the order vs. allow negative stock as a "shortage" signal) and implement accordingly rather than leaving it unconstrained.

### 5. Order-dependent / risky migrations (#5, #6, #9)
- **Where:** `supabase/005-categories-recipe-cost.sql`, `006-banquet.sql`, `009-expense-categories.sql`.
- **Issue:** #5 and #9 convert an enum column to a table-backed FK, backfill, then `ALTER COLUMN ... SET NOT NULL` — this fails if the guarded backfill condition doesn't match (e.g., re-run after partial failure, or applied to a fresh DB that never had the legacy enum column). #6 does `ALTER TYPE expense_category ADD VALUE ...`, but migration #9 later **drops** `expense_category` entirely — running #6 after #9, or against a schema built fresh from `schema.sql` (which already reflects the post-migration state), will error because the type no longer exists.
- **Fix:** Since `schema.sql` already represents the current, fully-migrated state, treat the numbered migrations as a historical changelog only (add a comment to that effect) and never apply them to a fresh install. For existing databases still catching up, document the required exact run order in `supabase/README` (or similar).

### 6. Race condition in order-total recalculation
- **Where:** `supabase/schema.sql` — `tg_recalc_order_total()`.
- **Issue:** On every insert/update/delete of `order_items`, this trigger does a full `SELECT sum(...)` then updates `restaurant_orders`. Under READ COMMITTED, two concurrent transactions adding line items to the *same* order each compute their subtotal from a snapshot taken before locking the order row; the second to commit can overwrite with a total that doesn't include the first transaction's committed rows.
- **Why it matters less in practice:** Exposure is low since typically one cashier works one order at a time — but it's a genuine correctness gap if two staff ever touch the same open order simultaneously (e.g., a shared table split across devices).
- **Fix:** Re-run the `SELECT sum()` *after* acquiring the row lock on `restaurant_orders` (e.g., `SELECT ... FOR UPDATE` on the order row before recomputing), or recompute inside the same statement that holds the lock.

---

## 🟡 Medium

7. **Unchecked `.single()` errors** — `pms/actions.ts:52-56,62-66` (room/rate-plan lookups) and `pos/actions.ts:298-302` (`settleOrder` order lookup) call `.single()` without checking the returned `error`. A transient DB error is indistinguishable from "not found," surfacing a misleading "Room not found" message instead of the real failure.

8. **No optimistic locking on settle/extend actions** — nothing prevents two staff members from concurrently clicking "settle" or "extend" on the same record, risking a double-charge. Consider a `version`/`updated_at` check in the `WHERE` clause of these updates.

9. **Timezone inconsistency in `addCustomOrderItem`** (`pos/actions.ts:199`) — uses raw `new Date().toISOString().slice(0,10)` instead of the project's own `colomboToday()` helper (`src/lib/colombo-date.ts`), risking an expense being filed under the wrong business date during the 00:00–05:29 SLT window.

10. **`generateTempPassword()` uses `Math.random()`** (`src/lib/supabase/admin.ts:27-34`) — not a CSPRNG. Low real-world severity since it's a one-time password immediately reset by the user, but cheap to harden with `crypto.randomBytes`/`crypto.getRandomValues`.

11. **No schema-validation library** — no `zod` (or equivalent) anywhere in `src/`; form validation is manual/ad-hoc per server action (e.g., a hand-rolled email regex in `login/actions.ts`). Easy to miss in newly added actions. Consider introducing a shared validation layer incrementally.

12. **Missing indexes** for common query patterns: `bookings.guest_name` / `bookings.contact_number` (guest search), a composite on `restaurant_orders(business_date, order_status, channel_type)` (reporting), and `restaurant_orders.created_by` / `bookings.created_by` (attribution/audit queries).

13. **`tg_apply_booking_charge` omits `SET search_path = public`** — every sibling trigger/security-definer function sets this explicitly; this one doesn't. Low risk today (no dynamic SQL, only fully-qualified `public.*` references) but worth normalizing for consistency and defense-in-depth.

---

## 🟢 Low / Observations

- No automated tests exist anywhere in the repo — any fix to the items above should ideally land with at least a minimal regression test, but that would require introducing a test setup first.
- Git history is entirely "Add files via upload" commits (GitHub web-UI bulk uploads) — no semantic history to trace when/why features were added.
- `supabase/stock-import-2026-08-05.sql` and `supabase/clear-inventory.sql` are one-off/irreversible scripts, correctly unreferenced by any app code or other SQL files — but there's no `supabase/scripts/README` flagging them as "do not re-run," relying entirely on inline comments.
- Several UI files are large enough to be worth splitting for maintainability: `settled-records-view.tsx` (756 lines), `booking-list.tsx` (680), `report-pdf.ts` (656), `room-setup.tsx` (650), `pos-terminal.tsx` (644).
- Authorization for privileged pages (e.g. `/settings/users`) is enforced in server actions, not at the middleware/route-group level. This is safe today because RLS backstops every write, but a route-level check would fail closed earlier and give a cleaner UX than letting the page render and then having every action reject.

---

## What's Already Solid

- **RLS** is enabled on all 20 sensitive tables and consistently role-based via `get_my_role()`; no `USING (true)` write policies were found anywhere.
- **Service-role key** is isolated correctly: `import "server-only"` guard, read only from a non-`NEXT_PUBLIC_` env var, and used in exactly one file (`settings/users/actions.ts`) for account creation/password reset — never reachable from client code.
- **No hardcoded secrets, API keys, or credentials** anywhere in `src/` or `supabase/`.
- **Currency** is stored as `numeric(12,2)`/`numeric(14,2)` in Postgres, not float, with correct JS-side rounding before insert.
- **ESC/POS / WebUSB printing** (`src/hooks/useThermalPrint.ts`) has a solid defensive fallback to `window.print()` when `navigator.usb` is unavailable (non-Chrome browsers).
- **TypeScript** runs with `strict: true` and `noUncheckedIndexedAccess: true`; `any` usage is minimal (2 occurrences in the whole codebase).
- **Multi-channel order integrity**: CHECK constraints tie each order's channel (`dine_in`/`room_service`/`takeaway`/`delivery`/`banquet`) to its required companion field (table/booking/address), preventing malformed orders at the DB level.
- Money totals shown on receipts/PDFs are read from server-computed fields, not recomputed client-side — no duplicated/divergent billing logic between client and server.

---

## Suggested Priority Order for Fixes

1. `.gitignore` + `.env.example` (5-minute fix, closes a real leak risk)
2. Audit-log table for settled-record edits (financial accountability)
3. Transaction safety for stay-extension actions (revenue leak)
4. Stock quantity floor constraint (data integrity)
5. Document/fix migration ordering risk (#5, #6, #9)
6. Everything else in Medium, as time allows

This report does not include any code changes — findings are catalogued for you to prioritize and greenlight individually.
