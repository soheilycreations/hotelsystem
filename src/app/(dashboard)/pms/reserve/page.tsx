import { createClient } from "@/lib/supabase/server";
import type { Booking, CreditAccount, HotelSettings, Room, RoomRatePlan } from "@/lib/types";
import { LiveRefresher } from "../../live-refresher";
import { BookingForm } from "./booking-form";
import { BookingList } from "./booking-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bookings" };

export interface ServiceOrderDetail {
  orderNumber: number;
  amount: number;
  items: { name: string; quantity: number; lineTotal: number }[];
}

export default async function ReservePage() {
  const supabase = await createClient();

  const [roomsRes, bookingsRes, plansRes, hotelRes, creditRes] = await Promise.all([
    supabase.from("rooms").select("*, room_types(*)").order("room_number"),
    supabase
      .from("bookings")
      .select("*, rooms(room_number, room_types(name)), booking_charges(*)")
      .in("status", ["pending", "checked_in"])
      .order("check_in_date"),
    supabase.from("room_rate_plans").select("*").eq("is_active", true).order("name"),
    supabase.from("hotel_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("credit_accounts").select("*").order("name"),
  ]);

  const rooms = (roomsRes.data ?? []) as Room[];
  const bookings = (bookingsRes.data ?? []) as Booking[];
  const ratePlans = (plansRes.data ?? []) as RoomRatePlan[];
  const creditAccounts = (creditRes.data ?? []) as CreditAccount[];
  const hotel = (hotelRes.data ?? null) as HotelSettings | null;

  // Completed room-service orders per in-house booking — needed to break the
  // folio down on the printed room bill, itemized (not just the order total).
  const bookingIds = bookings.map((b) => b.id);
  const serviceOrdersByBooking: Record<string, ServiceOrderDetail[]> = {};
  const pendingServiceByBooking: Record<string, ServiceOrderDetail[]> = {};
  if (bookingIds.length > 0) {
    const { data: rsOrders } = await supabase
      .from("restaurant_orders")
      .select(
        "booking_id, order_number, total_amount, order_status, order_items(quantity, line_total, is_custom, custom_description, menu_items(name))"
      )
      .eq("channel_type", "room_service")
      .in("order_status", ["completed", "active"])
      .in("booking_id", bookingIds);
    for (const o of rsOrders ?? []) {
      if (!o.booking_id) continue;
      const bucket =
        o.order_status === "completed" ? serviceOrdersByBooking : pendingServiceByBooking;
      (bucket[o.booking_id] ??= []).push({
        orderNumber: o.order_number,
        amount: Number(o.total_amount),
        items: (o.order_items ?? []).map((it) => {
          const menuItem = it.menu_items as unknown as { name: string } | null;
          return {
            name: it.is_custom ? (it.custom_description as string | null) ?? "Item" : menuItem?.name ?? "Item",
            quantity: Number(it.quantity),
            lineTotal: Number(it.line_total),
          };
        }),
      });
    }
  }

  return (
    <div className="space-y-6">
      <LiveRefresher tables={["bookings", "rooms", "booking_charges", "room_rate_plans"]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Booking engine</h1>
        <p className="text-sm text-muted-foreground">
          Reserve, check in and check out guests. Housekeeping flags fire automatically.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <BookingForm rooms={rooms} ratePlans={ratePlans} />
        </div>
        <div className="lg:col-span-3">
          <BookingList
            bookings={bookings}
            serviceOrdersByBooking={serviceOrdersByBooking}
            pendingServiceByBooking={pendingServiceByBooking}
            hotel={hotel}
            creditAccounts={creditAccounts}
          />
        </div>
      </div>
    </div>
  );
}
