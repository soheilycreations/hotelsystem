import { createClient } from "@/lib/supabase/server";
import type { Booking, Room } from "@/lib/types";
import { LiveRefresher } from "../../live-refresher";
import { BookingForm } from "./booking-form";
import { BookingList } from "./booking-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bookings" };

export default async function ReservePage() {
  const supabase = await createClient();

  const [roomsRes, bookingsRes] = await Promise.all([
    supabase.from("rooms").select("*, room_types(*)").order("room_number"),
    supabase
      .from("bookings")
      .select("*, rooms(room_number)")
      .in("status", ["pending", "checked_in"])
      .order("check_in_date"),
  ]);

  const rooms = (roomsRes.data ?? []) as Room[];
  const bookings = (bookingsRes.data ?? []) as Booking[];

  return (
    <div className="space-y-6">
      <LiveRefresher tables={["bookings", "rooms"]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Booking engine</h1>
        <p className="text-sm text-muted-foreground">
          Reserve, check in and check out guests. Housekeeping flags fire automatically.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <BookingForm rooms={rooms} />
        </div>
        <div className="lg:col-span-3">
          <BookingList bookings={bookings} />
        </div>
      </div>
    </div>
  );
}
