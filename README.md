# Soheily PMS — Hotel PMS + Restaurant POS + Inventory + Ledger

A production-grade, realtime hotel management system built with **Next.js 15 (App Router + Server Actions)**, **Supabase** (Postgres, Realtime, RLS), **Tailwind + shadcn-style UI**, and strict TypeScript. Dark/light slate theme, mobile-first.

## Modules

| Module | Route | What it does |
|---|---|---|
| Overview | `/` | Occupancy %, 14-day revenue vs expenses, live activity feed, channel mix |
| Room Grid | `/pms/rooms` | Zone-grouped, color-coded status board with in-house guest names and **live short-stay countdowns** (green → amber ≤30 min → red overtime). Gear icon → Room Setup |
| Room Setup | `/pms/settings` | Rooms + categories (physical room types only) + **rate plans** — one room sells under any of its category's plans (AC / Non-AC per-night, hourly blocks) |
| Reservations | `/pms/reserve` | Bookings with rate-plan pricing (price snapshot per booking), short-stay countdowns, **Extend** (+hours, folio tops up), **Charge** (overtime/minibar custom amounts), and **Print bill** (plan + extras + room-service breakdown) |
| POS Terminal | `/pos/active` | 4 channels: dine-in (table matrix), room service (charge to folio), takeaway, delivery (status pipeline). Full-menu search + **Send KOT** (kitchen ticket for new items) |
| Billing | `/pos/billing` | Settle bills, void, mark table billed, KOT-sent indicator (warns before settling un-KOT'd bills), **ESC/POS thermal receipt printing (WebUSB)** |
| Menu Items | `/pos/menu` | Add/edit dishes, change prices, availability toggle (hides from POS instantly) |
| Inventory | `/inventory` | Live stock table, low-stock highlighting, stock in/out adjustments with audit log |
| Recipes & Costing | `/inventory/recipes` | Per-dish recipe editor — food cost, margin %, profit per plate |
| Expenses | `/finance/expenses` | Expense logger (utilities / purchasing / salary / maintenance / marketing) |
| P&L Report | `/finance/reports` | 30-day revenue vs expenses, channel mix, expense breakdown — room-service revenue de-duplicated |

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
3. Create your first admin: **Authentication → Users → Add user** (email + password), copy the user's UUID, then run:

   ```sql
   insert into public.staff_profiles (id, full_name, role)
   values ('<auth-user-uuid>', 'Your Name', 'admin');
   ```

4. Repeat for other staff with roles: `manager`, `receptionist`, `cashier`, `kitchen_staff`.

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
```

Deploy to Vercel: push to GitHub → import → add the two env vars.

### 3. Thermal printer (optional)

Billing uses raw **ESC/POS over WebUSB** — works in Chrome/Edge with 80mm Epson TM-T series and compatible clones. On the first print, the browser asks you to pick the USB printer. Browsers without WebUSB fall back to `window.print()`.

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

> **Upgrading an existing database?** Run `supabase/migration-001-kot.sql`, `supabase/migration-002-rateplans-hotel.sql`, `supabase/migration-003-service-charge.sql`, then `supabase/migration-004-times-pdf.sql` in the SQL Editor (in order, each once) — do **not** re-run the full `schema.sql`. Migration 002 auto-creates a "Full Night" plan per category at the current nightly rate, so pricing keeps working immediately. Fresh installs get everything from `schema.sql` alone.

## RBAC matrix

Enforced twice: **RLS policies in Postgres** (authoritative) + route guards in the app.

| Route | admin | manager | receptionist | cashier | kitchen_staff |
|---|---|---|---|---|---|
| `/` (overview) | ✅ | ✅ | — | — | — |
| `/pms/rooms`, `/pms/reserve` | ✅ | ✅ | ✅ | — | — |
| `/pms/settings` | ✅ | ✅ | — | — | — |
| `/settings` (hotel profile) | ✅ | ✅ | — | — | — |
| `/pos/active` | ✅ | ✅ | — | ✅ | ✅ (delivery status only) |
| `/pos/billing` | ✅ | ✅ | — | ✅ | — |
| `/pos/menu` | ✅ | ✅ | — | — | — |
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
