# Soheily PMS — Hotel PMS + Restaurant POS + Inventory + Ledger

A production-grade, realtime hotel management system built with **Next.js 15 (App Router + Server Actions)**, **Supabase** (Postgres, Realtime, RLS), **Tailwind + shadcn-style UI**, and strict TypeScript. Dark/light slate theme, mobile-first.

## Modules

| Module | Route | What it does |
|---|---|---|
| Overview | `/` | Occupancy %, 14-day revenue vs expenses, live activity feed, channel mix |
| Room Grid | `/pms/rooms` | Zone-grouped, color-coded status board with in-house guest names and **live short-stay countdowns** (green → amber ≤30 min → red overtime). Gear icon → Room Setup |
| Backfill Data | `/backfill` | Type in past bookings and POS sales from an old paper register, picking the real historical date — records land correctly in Daily Summary/P&L/activity feed without touching today's real room status |
| Staff Accounts | `/settings/users` | **Admin only** — create staff logins, change roles, deactivate access, reset passwords. Temporary passwords are auto-generated and shown once |
| Room Setup | `/pms/settings` | Rooms + categories (physical room types only) + **rate plans** — one room sells under any of its category's plans (AC / Non-AC per-night, hourly blocks) |
| Reservations | `/pms/reserve` | Bookings with rate-plan pricing (price snapshot per booking), short-stay countdowns, **Extend** (+hours, folio tops up), **Charge** (overtime/minibar custom amounts), and **Print bill** (plan + extras + room-service breakdown) |
| POS Terminal | `/pos/active` | 5 channels: dine-in (compact table strip), room service (charge to folio), takeaway, delivery (status pipeline), **Banquet** (function name + custom bill lines). A large, always-visible **Menu panel** (search + categories + qty box) works for whichever order is active. **Send KOT** (kitchen ticket for new items). Gear icon → Table Setup |
| Table Setup | `/pos/tables` | Add/edit/**delete** restaurant tables (number, seats, zone) — instantly reflected on the POS terminal |
| Billing | `/pos/billing` | Settle bills, void, mark table billed, KOT-sent indicator (warns before settling un-KOT'd bills), **ESC/POS thermal receipt printing (WebUSB)** |
| Menu Items | `/pos/menu` | Add/edit/**delete** dishes, change prices, availability toggle, and a **Categories manager** (add/rename/delete — categories are no longer fixed) |
| Inventory | `/inventory` | Live stock table, low-stock highlighting, stock in/out adjustments with audit log, **edit** (name/unit/cost/reorder level) and **delete** (blocked while used in a recipe) |
| Recipes & Costing | `/inventory/recipes` | Per-dish recipe editor — ingredient cost + an editable flat **"other cost"** (packaging/gas/misc), margin %, profit per plate |
| Expenses | `/finance/expenses` | Expense logger (utilities / purchasing / salary / maintenance / marketing) |
| P&L Report | `/finance/reports` | **Date range picker** (custom from/to, or "This month" / "Last 30 days" presets), a daily chart split into **Room / Food / Expenses** with independent show/hide toggles, channel mix (Banquet vs Backfilled "Historical Entries" kept separate), and a dynamic expense-category breakdown |
| Daily Summary | `/finance/daily-summary` | One day, fully broken down: room sales (checkouts that day), item-wise POS sales, expenses, and a **net cash balance**. Date picker + prev/next day, **PDF export** |
| Cash Book | `/finance/cash-book` | **Running, day-to-day cash-in-hand balance** — carries forward automatically from cash-paid bookings/POS sales/expenses, plus manual **cash movements** (bank deposits, owner withdrawals, float top-ups). Date range picker, daily in/out chart with a running-balance line, and a **PDF ledger export** — every transaction, chronological, with a running balance column |

## Database automation (the "brain" lives in Postgres)

All critical business logic runs as **database triggers**, so it fires no matter which client writes the data:

- **Trigger A — Housekeeping:** booking → `checked_out` flips the room to `dirty`; `checked_in` flips it to `occupied`.
- **Trigger B — Stock & folio:** order → `completed` deducts every recipe ingredient from inventory (set-based, one statement), posts room-service totals onto the guest's `total_folio_amount`, and frees the table.
- **Trigger C — Low-stock alerts:** edge-triggered `system_logs` entry the moment an ingredient crosses below its `reorder_level`.
- Order totals recalculate automatically whenever `order_items` change.

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** → paste the whole of `supabase/schema.sql` → **Run**. This creates all tables, enums, triggers, RLS policies, realtime publication, and Sri Lankan seed data (rooms, tables, menu, recipes).
3. Create your first admin (a chicken-and-egg step — there's no admin yet to use the in-app Staff Accounts page): **Authentication → Users → Add user** (email + password), copy the user's UUID, then run:

   ```sql
   insert into public.staff_profiles (id, full_name, role)
   values ('<auth-user-uuid>', 'Your Name', 'admin');
   ```

4. Every other staff member — **add them from inside the app** at `/settings/users` once you've logged in as that first admin. No more manual SQL or Supabase Dashboard trips.

### 2. App

```bash
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm install
npm run dev
```

`.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

`SUPABASE_SERVICE_ROLE_KEY` is in Supabase under **Project Settings → API → service_role key**. It's required for **Staff Accounts** (`/settings/users`) to create and manage logins — never prefix it with `NEXT_PUBLIC_` and never expose it to the browser; the app only ever uses it inside server actions.

Deploy to Vercel: push to GitHub → import → add all three env vars.

### 3. Thermal printer (optional)

Billing uses raw **ESC/POS over WebUSB** — works in Chrome/Edge with 80mm Epson TM-T series and compatible clones. On the first print, the browser asks you to pick the USB printer. Browsers without WebUSB fall back to `window.print()`.

## Banquet Hall & custom bill lines

- A dedicated **Banquet** channel on the POS terminal — no table needed, just a function/event name (e.g. "Perera Wedding — 120 pax") and an optional contact number.
- Food & beverage still comes from the normal Menu panel. For everything else — AC charge, decoration, external services — the order pad has an **"Add custom item"** box: type a description and amount, and it goes straight onto the bill as its own line.
- **Service charge applies only to food & beverage.** Each custom line has a "Service chargeable" checkbox (off by default), and every menu item now has its own **"Applies service charge"** toggle in Menu Items — so even a normal menu item can be excluded (e.g. a merchandise or rental item you sell through the regular menu) and it will never attract service charge, guaranteed by the database.
- **Pass-through costs**: a custom line can optionally **"Also log as an expense"** — e.g. the hotel is billed Rs 5,000 by an AC rental company and bills the customer Rs 6,000; check the box, the same (or a different, editable) amount is logged under the new **Function Cost** expense category in the same step. Revenue and cost both show up correctly instead of just netting invisibly.

## Billing date & quantity entry

- Every bill has a **business date** — defaults to the day it was opened, but is editable right on the Billing screen ("Counts toward: [date]"). Settle a banquet function the morning after and it still posts to last night's date in the Daily Summary and P&L report, instead of defaulting to "today."
- The POS Menu panel has a small **quantity box** next to the search bar — set it once (e.g. 5) and the next tap on any item adds that many at once, then resets back to 1.

## Complimentary bills, per-bill service charge waiver, extend for overnight stays, itemized room-service on the folio

- **Complimentary** is now a payment method option (Billing settle, booking checkout) alongside Cash/Card/Bank Transfer — for a manager's discretionary "don't charge this guest." The bill/booking still settles normally and shows in the Activity Feed, but it's **excluded from revenue everywhere** (P&L Report, Daily Summary, Overview, and by nature the Cash Book already only counts cash) — so it never inflates real sales figures.
- **"No service charge on this bill"** — a checkbox on the Billing settle panel waives service charge for that one bill regardless of what the normal rate would compute, for staff meals, negotiated regulars, or manager overrides. Recorded per-order so it never affects any other bill.
- **Extend** now works for overnight bookings too, not just short stays — add extra nights, the checkout date pushes forward and the folio tops up at the plan's nightly rate, exactly like the short-stay hourly extend.
- **Room-service items now print on the final room bill** — previously the folio only showed "Room service — bill #12 (Rs 2,450)"; it now lists what was actually ordered under each room-service line, on both the thermal receipt and the PDF.

## Staff Accounts

`/settings/users` (admin only) replaces the old "create a user in Supabase Dashboard + run a SQL insert" setup step from the original install instructions:

- **New staff** — full name, email, role → creates both the Supabase Auth login and the `staff_profiles` row in one step. A strong temporary password is auto-generated and shown **once**, with a copy button — share it with the staff member and it's gone from the screen for good.
- **Edit** — change name or role at any time.
- **Activate / deactivate** — a soft toggle, not a delete. A deactivated login is blocked at sign-in immediately, but their name stays intact everywhere it's referenced historically (logged expenses, settled bills, past bookings).
- **Reset password** — generates a new one-time temporary password for someone who's forgotten theirs.
- **Safety rails**: you can't deactivate or demote your own account, and the system won't let the last active admin be deactivated or demoted — so the hotel can never end up locked out of admin access.

This needs no database migration — `staff_profiles` already had everything required (`is_active`, `role`). It does need `SUPABASE_SERVICE_ROLE_KEY` set (see Setup above), since creating/managing logins goes through Supabase's Admin API rather than the regular client.

## Cash Book — day-to-day cash-in-hand

- Bookings, POS bills, and expenses now carry a **payment method** (cash / card / bank transfer) — set on the Billing screen before settling, on the booking Check-out dialog, and on the expense logger. Room-service orders don't ask for one (the guest's checkout payment covers it — asking twice would double count).
- The Cash Book only counts **cash-tagged** transactions — card and bank-transfer sales/expenses don't touch the physical drawer, so they're correctly excluded from cash-in-hand.
- A separate **cash movements** ledger (admin/manager only — this is sensitive) covers things that are real cash-drawer events but aren't revenue or a P&L expense: **Bank Deposit**, **Bank Withdrawal**, **Owner Withdrawal**, **Float Top-up**, or a custom category.
- The balance **carries forward day to day** automatically — no manual "opening balance" entry needed after the first day; the system nets everything before your selected range into one opening figure.
- **Export PDF** prints a proper ledger for the selected range: every individual cash-paid checkout, cash POS bill, cash expense, and manual movement, in date order, each with its own running balance — not just daily totals.
- Backfill's historical booking and historical sale forms now also ask **"Paid by"** (defaults to Cash) — old paper-register entries you migrate in show up in the Cash Book and its PDF export too, exactly like live transactions.

## Expense categories & P&L filtering

- The booking form now records the guest's **NIC / Passport number** alongside their name and contact — shown on the room grid's in-house guest popup, the bookings list, and printed/PDF room bills.

- Expense categories are a real, editable table now (`expense_categories`) — same pattern as menu categories. Add, rename, or delete them from the gear icon next to "Log an expense." A category can't be deleted while any expense still uses it.
- The P&L Report's daily chart now shows **Room sales**, **Food/POS sales**, and **Expenses** as three independently toggleable series (checkboxes above the chart) instead of one combined "revenue" bar — so you can isolate exactly what you want to look at.
- A **date range picker** replaces the fixed 30-day window — pick any custom From/To range, or use the "This month" / "Last 30 days" quick presets. Every stat card, the daily chart, the channel mix, and the expense breakdown all respect the selected range.
- The channel-mix chart keeps **Banquet** (real functions booked through the POS terminal) separate from **Historical Entries** (anything logged via Backfill), so backfilled data doesn't make it look like every day was a banquet function.

## Menu categories, item deletion, and recipe "other costs"

- Menu categories are a real, editable table now (`menu_categories`) — add, rename, or delete them from the **Categories** dialog on the Menu Items page. A category can't be deleted while any menu item still uses it.
- Menu items and inventory items can be **deleted**, not just hidden — but only if they were never used (an item that appears in a past order, or an ingredient still linked to a recipe, is protected by a database foreign key and the action returns a clear message telling you to switch it off / unlink it first instead).
- Recipe Costing now has an editable **"Other costs"** field per dish — a flat amount (packaging, gas, misc.) added on top of the ingredient subtotal for margin calculations. It never touches inventory stock.
- **Stock only deducts for dishes that have a recipe defined.** The Billing screen now shows a warning naming any item on the bill with no recipe, so it's obvious in the moment rather than a silent gap — define the recipe on `/inventory/recipes` to fix it going forward.

## Daily Summary & cash reconciliation

`/finance/daily-summary` gives a single day's complete picture for closing the till: room sales for every checkout that day (de-duplicated against room-service the same way as the P&L report), an item-by-item POS sales table, the day's expenses, and a **net cash balance** (revenue − expenses). Use the date picker or the prev/next arrows to check any day, and **Export PDF** for a printable/shareable A4 report — handy for daily reconciliation without opening a spreadsheet.

## Dashboard (Overview)

- **Today's snapshot** — check-ins/check-outs today, today's revenue vs yesterday, and a shortcut to Daily Summary.
- **Activity feed** replaces the old "system feed" — merges check-ins, check-outs, settled bills, expenses, and system alerts (housekeeping/low-stock/folio-post) into one timeline, most recent first, last 10.
- **Revenue vs expenses chart** now buckets by **business date**, matching Daily Summary and P&L — a bill settled late but dated to an earlier day shows on the right bar, not "today's".
- **Quick action tiles** — KOT-pending bill count (→ Billing), low-stock item count (→ Inventory), and shortcuts to Bookings and the POS terminal.
- **Channel mix** now includes Banquet alongside dine-in/room-service/takeaway/delivery.

## Backfilling the old paper register

`/backfill` (admin/manager) exists for migrating a physical booking book into the system:

- **Historical booking** — enter guest, room, the real check-in/check-out dates and the total amount; it's saved directly as "checked out". Because this is a plain insert (not a status *change*), Trigger A never fires, so **today's actual room status is never touched**.
- **Historical POS/restaurant sale** — one description + one amount for a whole day's takings (or itemize with several entries), dated to the real day. Internally it opens a Banquet-channel order, adds it as a custom line, sets the business date, and settles it in one step — so it shows correctly in Daily Summary, P&L, and the item-sales breakdown.

## Rate plans & short stays

- A **category is just the physical room type** (Deluxe, Family Suite) — it carries no price. All pricing lives in that category's rate plans: per-night (e.g. "AC — Full Night", "Non-AC — Full Night") and time blocks (e.g. "Day Use — 12h", "Short Stay — 3h"). The same room can be sold as a 3h short stay today and a Non-AC full night tomorrow, each charged by its plan.
- The booking form shows only the selected room's active plans; the folio opens at plan price × nights, or the flat block price.
- Bookings store a **snapshot** of the plan name + price, so later price edits never change existing bills.
- Time-block countdowns re-anchor to the **actual check-in moment** and tick live on the room grid and bookings list. Overtime turns red — staff can then **Extend** (deadline pushed, folio topped up at the plan's hourly equivalent) or add a custom **Charge**; both print as their own bill lines via the `booking_charges` trigger.

## Hotel profile

`/settings` (admin/manager) stores the hotel name, address, two contact numbers, and a logo URL. The name + logo replace the sidebar brand, and the name/address/phones print at the top of room bills and restaurant receipts. Thermal output keeps the header as text — ESC/POS logo rasters are unreliable across clone printers.

## Service charge

A configurable service charge (default **10%**, set in Hotel Profile, 0 = off) is applied to every POS order by the database recalculator: `subtotal + service charge = total`. The breakdown shows on the POS order pad, the Billing screen, and prints as its own receipt lines. Room-service totals posted to guest folios include the charge. Past/settled bills are never recalculated retroactively.

Checkout is blocked while a guest still has an **unsettled room-service bill**. Room-service orders have a one-tap **"Charge to room folio"** button right on the POS order pad (and on Billing) — charging posts the order to the guest folio via Trigger B. The printed/PDF room bill always shows **both** settled and still-pending room-service orders, so the grand total is complete either way.

## Paperless bills — PDF & WhatsApp

- Every room bill and restaurant bill can open as an **A5 PDF** (generated client-side with jsPDF) — the PDF includes the hotel header, plan/charge/room-service lines, service charge breakdown, and actual check-in/checkout times.
- **WhatsApp**: one tap generates the PDF, uploads it to the public `bills` storage bucket, and opens WhatsApp with a prefilled message + link to the customer's number (Sri Lankan numbers normalised to +94 automatically). True in-chat file attachments need the WhatsApp Business API or a bot (e.g. Baileys) — the link approach works with zero extra infrastructure; the number field on the booking/bill must be filled.
- Actual **check-in and check-out timestamps** are recorded the moment staff press the buttons and appear on bills and the bookings list, separate from the booked window.

## KOT (Kitchen Order Ticket) workflow

- Adding items to an order leaves them **KOT-pending** (no ✓ mark).
- **Send KOT** on the order pad prints a price-free kitchen ticket with only the *new* items, then stamps them as sent (`order_items.kot_printed_at`).
- Adding a dish again *after* its line went to the kitchen creates a **new line**, so the next KOT prints the addition.
- Billing shows a **KOT sent / KOT pending** badge. Settling a bill with unsent items shows a warning first — press settle again to proceed anyway.

> **Upgrading an existing database?** Run migrations **001 → 012** in the SQL Editor, in order, each once: `migration-001-kot.sql`, `migration-002-rateplans-hotel.sql`, `migration-003-service-charge.sql`, `migration-004-times-pdf.sql`, `migration-005-categories-recipe-cost.sql`, `migration-006-banquet.sql`, `migration-007-billing-date-sc-flag.sql`, `migration-008-historical-flag.sql`, `migration-009-expense-categories.sql`, `migration-010-guest-id-number.sql`, `migration-011-cash-book.sql`, `migration-012-comp-sc-waiver.sql` — do **not** re-run the full `schema.sql`. Migration 002 auto-creates a "Full Night" plan per category at the current nightly rate, so pricing keeps working immediately. Fresh installs get everything from `schema.sql` alone.

## RBAC matrix

Enforced twice: **RLS policies in Postgres** (authoritative) + route guards in the app.

| Route | admin | manager | receptionist | cashier | kitchen_staff |
|---|---|---|---|---|---|
| `/` (overview) | ✅ | ✅ | — | — | — |
| `/pms/rooms`, `/pms/reserve` | ✅ | ✅ | ✅ | — | — |
| `/pms/settings` | ✅ | ✅ | — | — | — |
| `/settings` (hotel profile) | ✅ | ✅ | — | — | — |
| `/settings/users` (staff accounts) | ✅ | — | — | — | — |
| `/pos/active` | ✅ | ✅ | — | ✅ | ✅ (delivery status only) |
| `/pos/billing` | ✅ | ✅ | — | ✅ | — |
| `/pos/menu` | ✅ | ✅ | — | — | — |
| `/pos/tables` | ✅ | ✅ | — | — | — |
| `/finance/cash-book` | ✅ | ✅ | — | — | — |
| `/backfill` | ✅ | ✅ | — | — | — |
| `/inventory` | ✅ | ✅ | — | — | ✅ |
| `/inventory/recipes` | ✅ | ✅ | — | — | — |
| `/finance/*` | ✅ | ✅ | — | — | — |

After login, each role lands on its home screen (receptionist → room grid, cashier/kitchen → POS, etc.).

## Realtime

Every operational screen mounts a `LiveRefresher` island (`useRealtimeSync`) subscribed to the relevant tables via Supabase Realtime — a checkout at reception instantly turns the room red on every housekeeping tablet, and a settled bill updates inventory on the kitchen display.

## Stack notes

- **Server Actions** for all mutations — no API routes, validation + role assertion server-side, `revalidatePath` for cache busting.
- **Native styled `<select>`** instead of Radix Select — deliberate, so selects stay reliable inside `<form action={serverAction}>`.
- Strict TS (`noUncheckedIndexedAccess`), LKR currency formatting throughout.

## Project structure

```
src/
├── app/
│   ├── (auth)/login/            # email+password login, role-based redirect
│   └── (dashboard)/
│       ├── page.tsx             # overview analytics
│       ├── pms/{rooms,reserve}/
│       ├── pos/{active,billing}/
│       ├── inventory/{,recipes}/
│       └── finance/{expenses,reports}/
├── components/                  # sidebar, route guard, theme, ui/*
├── hooks/
│   ├── useRealtimeSync.ts       # realtime → router.refresh()
│   └── useThermalPrint.ts       # ESC/POS byte builder + WebUSB spooler
└── lib/                         # types + RBAC map, supabase clients, utils
supabase/schema.sql              # complete DB: tables, triggers, RLS, seed
```
