import { createClient } from "@/lib/supabase/server";
import { colomboToday } from "@/lib/colombo-date";
import { formatOrderNumber } from "@/lib/utils";
import { LiveRefresher } from "../../live-refresher";
import { SimpleReportView } from "./simple-report-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Simple Report" };

function orderLabel(o: {
  order_number: number | null;
  business_date: string;
  channel_type: string;
  restaurant_tables: { table_number: string } | { table_number: string }[] | null;
  bookings: { guest_name: string; rooms: { room_number: string } | { room_number: string }[] | null } | { guest_name: string; rooms: { room_number: string } | { room_number: string }[] | null }[] | null;
  customer_phone: string | null;
  event_name: string | null;
}): string {
  const table = Array.isArray(o.restaurant_tables) ? o.restaurant_tables[0] : o.restaurant_tables;
  if (table) return `Table ${table.table_number}`;
  const booking = Array.isArray(o.bookings) ? o.bookings[0] : o.bookings;
  if (booking) {
    const rooms = Array.isArray(booking.rooms) ? booking.rooms[0] : booking.rooms;
    return `Room No ${rooms?.room_number ?? "?"}`;
  }
  if (o.event_name) return o.event_name;
  if (o.customer_phone) return `${o.channel_type.replace("_", " ")} — ${o.customer_phone}`;
  return `Bill #${formatOrderNumber(o.business_date, o.order_number)}`;
}

export default async function SimpleReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : colomboToday();

  const supabase = await createClient();

  const [{ data: floatRow }, { data: orders }, { data: expenses }, { data: hotel }, { data: advances }] =
    await Promise.all([
      supabase.from("cashier_float").select("amount").eq("date", date).maybeSingle(),
      supabase
        .from("restaurant_orders")
        .select(
          "order_number, business_date, channel_type, total_amount, payment_method, customer_phone, event_name, restaurant_tables(table_number), bookings(guest_name, rooms(room_number))"
        )
        .eq("order_status", "completed")
        .or("payment_method.neq.complimentary,payment_method.is.null")
        .eq("business_date", date),
      supabase
        .from("expenses")
        .select("amount")
        .eq("date", date)
        .eq("division", "restaurant")
        .eq("payment_method", "cash"),
      supabase.from("hotel_settings").select("hotel_name, logo_url").eq("id", 1).maybeSingle(),
      supabase
        .from("booking_advance_payments")
        .select("amount, payment_method, bookings(guest_name, rooms(room_number))")
        .eq("date", date),
    ]);

  const pettyCash = Number(floatRow?.amount ?? 0);

  let restaurantRevenue = 0;
  let cardPayment = 0;
  let bankTransfer = 0;
  let creditBills = 0;
  const creditBillLines: { label: string; amount: number }[] = [];
  for (const o of orders ?? []) {
    const amount = Number(o.total_amount);
    restaurantRevenue += amount;
    const method = o.payment_method ?? "cash";
    if (method === "card") cardPayment += amount;
    else if (method === "bank_transfer") bankTransfer += amount;
    else if (method === "credit") {
      creditBills += amount;
      creditBillLines.push({ label: orderLabel(o), amount });
    }
  }

  const cashExpenses = (expenses ?? []).reduce((sum, e) => sum + Number(e.amount), 0);

  type AdvRoom = { room_number: string } | { room_number: string }[] | null;
  type AdvBooking = { guest_name: string; rooms: AdvRoom } | { guest_name: string; rooms: AdvRoom }[] | null;
  const advancePayments = ((advances ?? []) as unknown as { amount: number; payment_method: string; bookings: AdvBooking }[]).map(
    (a) => {
      const booking = Array.isArray(a.bookings) ? a.bookings[0] : a.bookings;
      const rooms = booking ? (Array.isArray(booking.rooms) ? booking.rooms[0] : booking.rooms) : null;
      return {
        label: `Room ${rooms?.room_number ?? "?"} — ${booking?.guest_name ?? "Guest"}`,
        amount: Number(a.amount),
        method: a.payment_method,
      };
    }
  );

  const cashBalance = pettyCash + restaurantRevenue - cardPayment - bankTransfer - creditBills - cashExpenses;

  return (
    <div className="space-y-6">
      <LiveRefresher tables={["cashier_float", "restaurant_orders", "expenses", "booking_advance_payments"]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Simple Report</h1>
        <p className="text-sm text-muted-foreground">
          Daily cashier float + cash reconciliation — set your float when opening the shift, then
          print this at close.
        </p>
      </div>
      <SimpleReportView
        date={date}
        hotelName={(hotel as { hotel_name?: string } | null)?.hotel_name ?? "Soheily PMS"}
        pettyCash={pettyCash}
        restaurantRevenue={restaurantRevenue}
        cardPayment={cardPayment}
        bankTransfer={bankTransfer}
        creditBills={creditBills}
        cashExpenses={cashExpenses}
        cashBalance={cashBalance}
        creditBillLines={creditBillLines}
        advancePayments={advancePayments}
      />
    </div>
  );
}
