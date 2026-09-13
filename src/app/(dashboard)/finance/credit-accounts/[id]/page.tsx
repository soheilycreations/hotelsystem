import { notFound } from "next/navigation";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import type { CreditAccount } from "@/lib/types";
import { formatOrderNumber } from "@/lib/utils";
import { LiveRefresher } from "../../../live-refresher";
import { CreditAccountDetailView } from "./detail-view";

export const dynamic = "force-dynamic";

export interface CreditLedgerEntry {
  date: string;
  kind: "charge" | "adjustment" | "repayment";
  description: string;
  amount: number; // positive = adds to balance owed, negative = reduces it
  /** Present only for a restaurant-order charge — lets the ledger row
   * expand to show the item breakdown, same as the Bills page. */
  orderId?: string;
  items?: { name: string; qty: number; unitPrice: number; lineTotal: number }[];
  subtotal?: number;
  serviceCharge?: number;
}

export default async function CreditAccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const profile = await getSessionProfile();

  const [{ data: account }, { data: bookings }, { data: orders }, { data: adjustments }, { data: repayments }, { data: hotel }] =
    await Promise.all([
      supabase.from("credit_accounts").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("bookings")
        .select(
          "id, guest_name, total_folio_amount, check_in_date, check_out_date, actual_check_out, rate_plan_name, rooms(room_number), booking_charges(description, amount)"
        )
        .eq("credit_account_id", id)
        .eq("payment_method", "credit"),
      supabase
        .from("restaurant_orders")
        .select(
          "id, order_number, channel_type, total_amount, business_date, subtotal, service_charge, order_items(quantity, unit_price, line_total, is_custom, custom_description, menu_items(name))"
        )
        .eq("credit_account_id", id)
        .eq("payment_method", "credit"),
      supabase.from("credit_adjustments").select("*").eq("credit_account_id", id).order("date"),
      supabase.from("credit_repayments").select("*").eq("credit_account_id", id).order("date"),
      supabase.from("hotel_settings").select("hotel_name").eq("id", 1).maybeSingle(),
    ]);

  if (!account) notFound();

  // Room-service items already folded into these bookings' folios — needed
  // so a room-checkout charge can show what was actually in the bill, not
  // just the folio total.
  const bookingIds = (bookings ?? []).map((b) => b.id);
  const roomServiceByBooking: Record<
    string,
    { name: string; qty: number; unitPrice: number; lineTotal: number }[]
  > = {};
  if (bookingIds.length > 0) {
    const { data: rsOrders } = await supabase
      .from("restaurant_orders")
      .select(
        "booking_id, order_items(quantity, unit_price, line_total, is_custom, custom_description, menu_items(name))"
      )
      .eq("channel_type", "room_service")
      .eq("order_status", "completed")
      .in("booking_id", bookingIds);
    for (const o of rsOrders ?? []) {
      if (!o.booking_id) continue;
      const items = (o.order_items ?? []).map((it) => {
        const menuItem = it.menu_items as unknown as { name: string } | null;
        return {
          name: it.is_custom ? (it.custom_description as string | null) ?? "Item" : menuItem?.name ?? "Item",
          qty: Number(it.quantity),
          unitPrice: Number(it.unit_price),
          lineTotal: Number(it.line_total),
        };
      });
      (roomServiceByBooking[o.booking_id] ??= []).push(...items);
    }
  }

  const entries: CreditLedgerEntry[] = [];

  for (const b of bookings ?? []) {
    if (!b.actual_check_out) continue;
    const rooms = b.rooms as unknown as { room_number: string } | null;
    const charges = (b.booking_charges ?? []) as { description: string; amount: number }[];
    const chargesTotal = charges.reduce((sum, c) => sum + Number(c.amount), 0);
    const rsItems = roomServiceByBooking[b.id] ?? [];
    const rsTotal = rsItems.reduce((sum, it) => sum + it.lineTotal, 0);
    const nights = Math.max(
      1,
      Math.round((new Date(b.check_out_date).getTime() - new Date(b.check_in_date).getTime()) / 86_400_000)
    );
    const roomCharge = Math.max(0, Number(b.total_folio_amount) - chargesTotal - rsTotal);
    entries.push({
      date: b.actual_check_out.slice(0, 10),
      kind: "charge",
      description: `Room ${rooms?.room_number ?? "—"} checkout — ${b.guest_name}`,
      amount: Number(b.total_folio_amount),
      items: [
        { name: `${b.rate_plan_name ?? "Room"} — ${nights} night(s)`, qty: 1, unitPrice: roomCharge, lineTotal: roomCharge },
        ...charges.map((c) => ({ name: c.description, qty: 1, unitPrice: Number(c.amount), lineTotal: Number(c.amount) })),
        ...rsItems,
      ],
    });
  }
  for (const o of orders ?? []) {
    const items = (o.order_items ?? []).map((it) => {
      const menuItem = it.menu_items as unknown as { name: string } | null;
      return {
        name: it.is_custom ? (it.custom_description as string | null) ?? "Item" : menuItem?.name ?? "Item",
        qty: Number(it.quantity),
        unitPrice: Number(it.unit_price),
        lineTotal: Number(it.line_total),
      };
    });
    entries.push({
      date: o.business_date,
      kind: "charge",
      description: `Bill #${formatOrderNumber(o.business_date, o.order_number)} — ${String(o.channel_type).replace("_", " ")}`,
      amount: Number(o.total_amount),
      orderId: o.id,
      items,
      subtotal: Number(o.subtotal),
      serviceCharge: Number(o.service_charge),
    });
  }
  for (const a of adjustments ?? []) {
    entries.push({
      date: a.date,
      kind: "adjustment",
      description: a.description || "Manual adjustment",
      amount: Number(a.amount),
    });
  }
  for (const r of repayments ?? []) {
    entries.push({
      date: r.date,
      kind: "repayment",
      description: r.description || `Repayment (${r.payment_method.replace("_", " ")})`,
      amount: -Number(r.amount),
    });
  }

  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let running = 0;
  const entriesWithBalance = entries.map((e) => {
    running += e.amount;
    return { ...e, balance: running };
  });

  return (
    <div className="space-y-6">
      <LiveRefresher
        tables={["credit_accounts", "credit_adjustments", "credit_repayments", "restaurant_orders", "bookings"]}
      />
      <CreditAccountDetailView
        account={account as CreditAccount}
        entries={entriesWithBalance.slice().reverse()}
        balance={running}
        isAdmin={profile?.role === "admin"}
        hotelName={(hotel as { hotel_name?: string } | null)?.hotel_name ?? "Soheily PMS"}
      />
    </div>
  );
}
