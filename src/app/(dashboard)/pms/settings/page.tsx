import { createClient } from "@/lib/supabase/server";
import type { Room, RoomType } from "@/lib/types";
import { LiveRefresher } from "../../live-refresher";
import { RoomSetup } from "./room-setup";

export const dynamic = "force-dynamic";
export const metadata = { title: "Room Setup" };

export default async function RoomSettingsPage() {
  const supabase = await createClient();

  const [{ data: roomTypes }, { data: rooms }] = await Promise.all([
    supabase.from("room_types").select("*").order("name"),
    supabase.from("rooms").select("*, room_types(*)").order("room_number"),
  ]);

  return (
    <div className="space-y-6">
      <LiveRefresher tables={["rooms", "room_types"]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Room setup</h1>
        <p className="text-sm text-muted-foreground">
          Manage room categories, nightly rates, and the room list. Rate changes only affect new
          bookings.
        </p>
      </div>
      <RoomSetup
        roomTypes={(roomTypes as RoomType[] | null) ?? []}
        rooms={(rooms as Room[] | null) ?? []}
      />
    </div>
  );
}
