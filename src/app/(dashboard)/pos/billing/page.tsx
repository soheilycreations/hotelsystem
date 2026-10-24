import { createClient, getSessionProfile } from "@/lib/supabase/server";
import type { Booking, CreditAccount, HotelSettings, RestaurantOrder } from "@/lib/types";
import { LiveRefresher } from "../../live-refresher";
import { BillingDesk } from "./billing-desk";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const supabase = await createClient();
  const profile = await getSessionProfile();
  const canVoid = profile?.role === "admin";

  // Abandoned Rs 0 orders (opened, nothing added) are removed after 30 min
  // and their tables freed — see rpc_purge_empty_orders (migration 042).
  await supabase.rpc("rpc_purge_empty_orders", { p_min_age_minutes: 30 });

  const [{ data: orders }, { data: hotel }, { data: creditAccounts }, { data: guests }] = await Promise.all([
    supabase
      .from("restaurant_orders")
      .select(
        "*, restaurant_tables(*), bookings(*, rooms(*)), order_items(*, menu_items(*, menu_recipe_ingredients(id)))"
      )
      .eq("order_status", "active")
      .order("created_at", { ascending: true }),
    supabase.from("hotel_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("credit_accounts").select("*").order("name"),
    supabase
      .from("bookings")
      .select("id, guest_name, rooms(room_number)")
      .eq("status", "checked_in")
      .order("guest_name"),
  ]);

  return (
    <div className="space-y-6">
      <LiveRefresher tables={["restaurant_orders", "order_items", "restaurant_tables"]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing & Settlement</h1>
        <p className="text-sm text-muted-foreground">
          Settle open bills, print ESC/POS receipts, and post room-service charges to guest folios.
        </p>
      </div>
      <BillingDesk
        orders={(orders as RestaurantOrder[] | null) ?? []}
        hotel={(hotel as HotelSettings | null) ?? null}
        creditAccounts={(creditAccounts as CreditAccount[] | null) ?? []}
        canVoid={canVoid}
        guests={(guests ?? []) as unknown as Pick<Booking, "id" | "guest_name" | "rooms">[]}
      />
    </div>
  );
}
