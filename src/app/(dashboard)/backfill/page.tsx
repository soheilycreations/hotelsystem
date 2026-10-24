import { createClient } from "@/lib/supabase/server";
import type { CreditAccount, Room } from "@/lib/types";
import { BackfillSwitch } from "./backfill-switch";
import { BackfillView } from "./backfill-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Backfill Historical Data" };

export default async function BackfillPage() {
  const supabase = await createClient();
  const [{ data: settings }, { data: rooms }, { data: creditAccounts }] = await Promise.all([
    supabase.from("hotel_settings").select("backfill_enabled").eq("id", 1).maybeSingle(),
    supabase.from("rooms").select("*, room_types(*)").order("room_number"),
    supabase.from("credit_accounts").select("*").order("name"),
  ]);

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
      <BackfillSwitch enabled={Boolean(settings?.backfill_enabled)} />
      {settings?.backfill_enabled ? (
        <BackfillView
          rooms={(rooms as Room[] | null) ?? []}
          creditAccounts={(creditAccounts as CreditAccount[] | null) ?? []}
        />
      ) : null}
    </div>
  );
}
