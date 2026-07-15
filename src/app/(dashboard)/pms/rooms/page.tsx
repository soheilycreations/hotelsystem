import { createClient } from "@/lib/supabase/server";
import type { Room } from "@/lib/types";
import { LiveRefresher } from "../../live-refresher";
import { RoomGrid } from "./room-grid";

export const dynamic = "force-dynamic";
export const metadata = { title: "Room Grid" };

export default async function RoomsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rooms")
    .select("*, room_types(*)")
    .order("room_number");

  const rooms = (data ?? []) as Room[];
  const zones = Array.from(new Set(rooms.map((r) => r.floor_zone ?? "Unzoned")));

  return (
    <div className="space-y-6">
      <LiveRefresher tables={["rooms", "bookings"]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Room grid</h1>
        <p className="text-sm text-muted-foreground">
          Live status matrix — updates in real time as guests check in and out.
        </p>
      </div>
      <RoomGrid rooms={rooms} zones={zones} />
    </div>
  );
}
