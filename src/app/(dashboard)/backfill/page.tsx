import { createClient } from "@/lib/supabase/server";
import type { Room } from "@/lib/types";
import { BackfillView } from "./backfill-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Backfill Historical Data" };

export default async function BackfillPage() {
  const supabase = await createClient();
  const { data: rooms } = await supabase
    .from("rooms")
    .select("*, room_types(*)")
    .order("room_number");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Backfill historical data</h1>
        <p className="text-sm text-muted-foreground">
          Type in past bookings and sales from the old paper register — pick the actual date and
          it records against that day everywhere (Daily Summary, P&amp;L, activity feed). Today&apos;s
          real room status is never touched by this.
        </p>
      </div>
      <BackfillView rooms={(rooms as Room[] | null) ?? []} />
    </div>
  );
}
