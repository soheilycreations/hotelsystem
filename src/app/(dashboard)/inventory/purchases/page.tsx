import { createClient } from "@/lib/supabase/server";
import type { InventoryItem, Purchase } from "@/lib/types";
import { LiveRefresher } from "../../live-refresher";
import { PurchasingDesk } from "./purchasing-desk";

export const dynamic = "force-dynamic";

export default async function PurchasesPage() {
  const supabase = await createClient();

  const [{ data: items }, { data: purchases }] = await Promise.all([
    supabase.from("inventory_items").select("*").order("name", { ascending: true }),
    supabase
      .from("purchases")
      .select("*, purchase_items(*, inventory_items(name, unit))")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  return (
    <div className="space-y-6">
      <LiveRefresher tables={["purchases", "purchase_items", "inventory_items"]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Purchasing</h1>
        <p className="text-sm text-muted-foreground">
          Record a supplier bill — stock tops up and a matching expense posts automatically.
        </p>
      </div>
      <PurchasingDesk
        inventoryItems={(items as InventoryItem[] | null) ?? []}
        recentPurchases={(purchases as Purchase[] | null) ?? []}
      />
    </div>
  );
}
