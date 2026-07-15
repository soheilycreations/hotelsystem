import { createClient, getSessionProfile } from "@/lib/supabase/server";
import type { InventoryItem } from "@/lib/types";
import { LiveRefresher } from "../live-refresher";
import { InventoryTable } from "./inventory-table";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const supabase = await createClient();
  const profile = await getSessionProfile();

  const { data: items } = await supabase
    .from("inventory_items")
    .select("*")
    .order("name", { ascending: true });

  const canManage = profile?.role === "admin" || profile?.role === "manager";

  return (
    <div className="space-y-6">
      <LiveRefresher tables={["inventory_items", "system_logs"]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-sm text-muted-foreground">
          Live stock levels — recipe deductions from completed orders appear here in real time.
        </p>
      </div>
      <InventoryTable items={(items as InventoryItem[] | null) ?? []} canManage={canManage} />
    </div>
  );
}
