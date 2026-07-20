import Link from "next/link";
import { Settings } from "lucide-react";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { canAccess, type Booking, type Room } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { LiveRefresher } from "../../live-refresher";
import { RoomGrid } from "./room-grid";

export const dynamic = "force-dynamic";
export const metadata = { title: "Room Grid" };

export default async function RoomsPage() {
  const supabase = await createClient();
  const profile = await getSessionProfile();
  const [{ data }, { data: inHouse }] = await Promise.all([
    supabase.from("rooms").select("*, room_types(*)").order("room_number"),
    supabase
      .from("bookings")
      .select("*")
      .eq("status", "checked_in"),
  ]);

  const rooms = (data ?? []) as Room[];
  const bookingByRoom: Record<string, Booking> = {};
  for (const b of (inHouse ?? []) as Booking[]) {
    if (b.room_id) bookingByRoom[b.room_id] = b;
  }
  const zones = Array.from(new Set(rooms.map((r) => r.floor_zone ?? "Unzoned")));
  const canSetup = profile ? canAccess(profile.role, "/pms/settings") : false;

  return (
    <div className="space-y-6">
      <LiveRefresher tables={["rooms", "bookings"]} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Room grid</h1>
          <p className="text-sm text-muted-foreground">
            Live status matrix — updates in real time as guests check in and out.
          </p>
        </div>
        {canSetup ? (
          <Button asChild variant="outline" size="icon" title="Room setup — categories, rates, add/remove rooms">
            <Link href="/pms/settings" aria-label="Room setup">
              <Settings className="h-4 w-4" />
            </Link>
          </Button>
        ) : null}
      </div>
      <RoomGrid rooms={rooms} zones={zones} bookingByRoom={bookingByRoom} />
    </div>
  );
}
