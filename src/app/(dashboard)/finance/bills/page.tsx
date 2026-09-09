import { createClient } from "@/lib/supabase/server";
import { colomboToday } from "@/lib/colombo-date";
import type { HotelSettings, PaymentMethod } from "@/lib/types";
import { BillsView } from "./bills-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bills" };

const CHANNEL_LABEL: Record<string, string> = {
  dine_in: "Dine-in",
  room_service: "Room service",
  takeaway: "Takeaway",
  delivery: "Delivery",
  banquet: "Banquet",
};

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : colomboToday();

  const supabase = await createClient();

  const [{ data: hotel }, { data: orders }] = await Promise.all([
    supabase.from("hotel_settings").select("*").eq("id", 1).maybeSingle(),
    supabase
      .from("restaurant_orders")
      .select(
        "id, order_number, channel_type, created_at, settled_at, payment_method, subtotal, service_charge, total_amount, customer_phone, event_name, restaurant_tables(table_number), bookings(guest_name, rooms(room_number)), staff_profiles!restaurant_orders_settled_by_fkey(full_name), order_items(quantity, unit_price, line_total, is_custom, custom_description, menu_items(name))"
      )
      .eq("order_status", "completed")
      .eq("business_date", date)
      .order("order_number", { ascending: true }),
  ]);

  const bills = (orders ?? []).map((o) => {
    const table = o.restaurant_tables as unknown as { table_number: string } | null;
    const booking = o.bookings as unknown as { guest_name: string; rooms: { room_number: string } | null } | null;
    const cashier = o.staff_profiles as unknown as { full_name: string } | { full_name: string }[] | null;
    const cashierName = Array.isArray(cashier) ? cashier[0]?.full_name ?? null : cashier?.full_name ?? null;
    const reference = table
      ? `Table ${table.table_number}`
      : booking
      ? `${booking.guest_name} · Rm ${booking.rooms?.room_number ?? "—"}`
      : o.event_name
      ? o.event_name
      : o.customer_phone ?? "—";
    const items = (o.order_items ?? []).map((it) => {
      const menuItem = it.menu_items as unknown as { name: string } | null;
      return {
        name: it.is_custom ? (it.custom_description as string | null) ?? "Custom charge" : menuItem?.name ?? "Unknown item",
        qty: Number(it.quantity),
        unitPrice: Number(it.unit_price),
        lineTotal: Number(it.line_total),
      };
    });
    return {
      orderId: o.id,
      orderNumber: o.order_number,
      channel: CHANNEL_LABEL[o.channel_type] ?? o.channel_type,
      reference,
      openedAt: o.created_at,
      settledAt: o.settled_at,
      paymentMethod: o.payment_method as PaymentMethod | null,
      cashierName,
      subtotal: Number(o.subtotal),
      serviceCharge: Number(o.service_charge),
      amount: Number(o.total_amount),
      items,
    };
  });

  return (
    <BillsView
      date={date}
      hotelName={(hotel as HotelSettings | null)?.hotel_name ?? "Soheily PMS"}
      bills={bills}
    />
  );
}
