import { createClient } from "@/lib/supabase/server";
import type { RestaurantTable } from "@/lib/types";
import { LiveRefresher } from "../../live-refresher";
import { TableSetup } from "./table-setup";

export const dynamic = "force-dynamic";
export const metadata = { title: "Table Setup" };

export default async function TablesSettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("restaurant_tables").select("*").order("table_number");

  return (
    <div className="space-y-6">
      <LiveRefresher tables={["restaurant_tables"]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Table setup</h1>
        <p className="text-sm text-muted-foreground">
          Add, rename, or remove restaurant tables — changes appear on the POS terminal instantly.
        </p>
      </div>
      <TableSetup tables={(data as RestaurantTable[] | null) ?? []} />
    </div>
  );
}
