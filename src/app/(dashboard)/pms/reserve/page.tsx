import { createClient } from "@/lib/supabase/server";
import type { Booking, HotelSettings, Room, RoomRatePlan } from "@/lib/types";
import { LiveRefresher } from "../../live-refresher";
import { BookingForm } from "./booking-form";
import { BookingList } from "./booking-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bookings" };

export default async function ReservePage() {
  const supabase = await createClient();

  const [roomsRes, bookingsRes, plansRes, hotelRes] = await Promise.all([
    supabase.from("rooms").select("*, room_types(*)").order("room_number"),
    supabase
      .from("bookings")
      .select("*, rooms(room_number, room_types(name)), booking_charges(*)")
      .in("status", ["pending", "checked_in"])
      .order("check_in_date"),
    supabase.from("room_rate_plans").select("*").eq("is_active", true).order("name"),
    supabase.from("hotel_settings").select("*").eq("id", 1).maybeSingle(),
  ]);

  const rooms = (roomsRes.data ?? []) as Room[];
  const bookings = (bookingsRes.data ?? []) as Booking[];
  const ratePlans = (plansRes.data ?? []) as RoomRatePlan[];
  const hotel = (hotelRes.data ?? null) as HotelSettings | null;

  // Completed room-service orders per in-house booking — needed to break the
  // folio down on the printed room bill.
  const bookingIds = bookings.map((b) => b.id);
  const serviceOrdersByBooking: Record<string, { orderNumber: number; amount: number }[]> = {};
  if (bookingIds.length > 0) {
    const { data: rsOrders } = await supabase
      .from("restaurant_orders")
      .select("booking_id, order_number, total_amount")
      .eq("order_status", "completed")
      .eq("channel_type", "room_service")
      .in("booking_id", bookingIds);
    for (const o of rsOrders ?? []) {
      if (!o.booking_id) continue;
      (serviceOrdersByBooking[o.booking_id] ??= []).push({
        orderNumber: o.order_number,
        amount: Number(o.total_amount),
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
            hotel={hotel}
          />
        </div>
      </div>
    </div>
  );
}
