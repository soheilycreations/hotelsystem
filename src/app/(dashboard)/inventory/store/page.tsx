import { createClient, getSessionProfile } from "@/lib/supabase/server";
import type { InventoryItem, StoreItem } from "@/lib/types";
import { LiveRefresher } from "../../live-refresher";
import { StoreDesk } from "./store-desk";

export const dynamic = "force-dynamic";

export default async function StorePage() {
  const supabase = await createClient();
  const profile = await getSessionProfile();

  // Roll yesterday's closing balance into today's opening balance for every
  // item before reading the dashboard, so the numbers are always current.
  await supabase.rpc("ensure_today_store_snapshots");

  const [{ data: items }, { data: inventoryItems }] = await Promise.all([
    supabase
      .from("store_items")
      .select("*, inventory_items(name, unit)")
      .order("name", { ascending: true }),
    supabase.from("inventory_items").select("id, name, unit").order("name", { ascending: true }),
  ]);

  const canManage = profile?.role === "admin" || profile?.role === "manager" || profile?.role === "kitchen_staff";

  return (
    <div className="space-y-6">
      <LiveRefresher tables={["store_items", "store_daily_snapshots", "store_transactions"]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Store</h1>
        <p className="text-sm text-muted-foreground">
          Central store-room stock — receive goods, issue to the kitchen, and track daily
          opening/closing balances.
        </p>
      </div>
      <StoreDesk
        items={(items as StoreItem[] | null) ?? []}
        inventoryItems={(inventoryItems as Pick<InventoryItem, "id" | "name" | "unit">[] | null) ?? []}
        canManage={canManage}
      />
    </div>
  );
}
