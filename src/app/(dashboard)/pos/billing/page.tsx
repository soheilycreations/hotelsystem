import { createClient } from "@/lib/supabase/server";
import type { RestaurantOrder } from "@/lib/types";
import { LiveRefresher } from "../../live-refresher";
import { BillingDesk } from "./billing-desk";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const supabase = await createClient();

  const { data: orders } = await supabase
    .from("restaurant_orders")
    .select(
      "*, restaurant_tables(*), bookings(*, rooms(*)), order_items(*, menu_items(*))"
    )
    .eq("order_status", "active")
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-6">
      <LiveRefresher tables={["restaurant_orders", "order_items", "restaurant_tables"]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing & Settlement</h1>
        <p className="text-sm text-muted-foreground">
          Settle open bills, print ESC/POS receipts, and post room-service charges to guest folios.
        </p>
      </div>
      <BillingDesk orders={(orders as RestaurantOrder[] | null) ?? []} />
    </div>
  );
}
