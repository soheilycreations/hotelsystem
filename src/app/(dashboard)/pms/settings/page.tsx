import { createClient } from "@/lib/supabase/server";
import type { Room, RoomRatePlan, RoomType } from "@/lib/types";
import { LiveRefresher } from "../../live-refresher";
import { RoomSetup } from "./room-setup";

export const dynamic = "force-dynamic";
export const metadata = { title: "Room Setup" };

export default async function RoomSettingsPage() {
  const supabase = await createClient();

  const [{ data: roomTypes }, { data: rooms }, { data: ratePlans }] = await Promise.all([
    supabase.from("room_types").select("*").order("name"),
    supabase.from("rooms").select("*, room_types(*)").order("room_number"),
    supabase.from("room_rate_plans").select("*").order("name"),
  ]);

  return (
    <div className="space-y-6">
      <LiveRefresher tables={["rooms", "room_types", "room_rate_plans"]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Room setup</h1>
        <p className="text-sm text-muted-foreground">
          Manage room categories, rate plans (AC / Non-AC / hourly blocks), and the room list.
          Price changes only affect new bookings.
        </p>
      </div>
      <RoomSetup
        roomTypes={(roomTypes as RoomType[] | null) ?? []}
        rooms={(rooms as Room[] | null) ?? []}
        ratePlans={(ratePlans as RoomRatePlan[] | null) ?? []}
      />
    </div>
  );
}
