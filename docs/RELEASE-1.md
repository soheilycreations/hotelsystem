# Release 1 — deploy runbook

Deploy on a quiet afternoon (not during service). Takes ~20 minutes.

## Order matters
0. **Drift check** — run `scripts/drift-check-001-037.sql` (read-only) in the SQL editor.
   It lists anything migrations 001–037 should have created but production lacks,
   with the migration it most likely comes from. Fix the drift (apply the missing
   migration) before Release 1. Release 1 itself skips the store_* tables if they
   are absent, so missing store tables (migration 034) don't block it.
1. **Backup first** — `scripts/backup/backup-local.ps1` (see backups README).
2. **Database migrations, in this order**, each once, in the Supabase SQL editor:
   `migration-038-pms-room-integrity.sql`, `migration-039-audit-log.sql`,
   `migration-040-shared-revenue.sql`, `migration-041-bill-number-at-settle.sql`,
   `migration-042-open-orders-and-folio.sql`, `migration-043-backfill-flag-and-rls.sql`,
   `migration-044-stock-movements-opening.sql`. All are safe to re-run.
3. **Deploy the app immediately after** (Cloudflare — see `CLOUDFLARE_DEPLOY.md`).
   The current app keeps working on the new database (settling, POS, PMS), except
   that editing settled records is refused until the new app (with the reason
   field) is live. The new app does NOT work on the old database — never deploy
   the app before the migrations.

## What changes for staff
- **Bill numbers** are issued when a bill is settled: `#20261021-001`, `-002`… restarting
  every day. A bill printed before settling is a **PRE-BILL** with no number.
- **No "counts toward" date on bills** — a bill belongs to the day it is settled.
- **Charge to room**: dine-in/takeaway bills can be put on an in-house guest's folio
  (payment option "Room"). Room-service bills always go to the folio.
- **Rooms**: "Mark cleaned" is disabled while a guest is in the room; check-in/out
  set the status. Taken rooms are greyed out when booking; the database refuses
  double bookings. Overdue stays show "Overdue by …" everywhere.
- **Tables** turn occupied only when the first item is added; empty orders
  disappear after 30 minutes.
- **Settled Records** (admin): a reason is required and saved in the audit log.
- **Backfill** is switched off (admin can switch it on from the Backfill page).
- **Opening stock**: Inventory → "Opening stock count".
- Each person must use **their own login** — the audit log records who did what.

## Smoke test after deploy (5 minutes)
- Dashboard loads; rooms card shows all rooms; Today's sales = Daily Summary total = P&L for today.
- Open a dine-in order, add an item (table turns occupied), settle cash → bill `#YYYYMMDD-001`.
- Try "Mark cleaned" on an occupied room → disabled.
- Log in as a cashier: Settings / Users / Settled records → 404.
