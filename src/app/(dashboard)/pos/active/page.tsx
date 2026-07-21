import { createClient } from "@/lib/supabase/server";
import type { Booking, MenuCategoryRow, MenuItem, RestaurantOrder, RestaurantTable } from "@/lib/types";
import { LiveRefresher } from "../../live-refresher";
import { PosTerminal } from "./pos-terminal";

export const dynamic = "force-dynamic";
export const metadata = { title: "POS Terminal" };

export default async function PosActivePage() {
  const supabase = await createClient();

  const [tablesRes, categoriesRes, menuRes, ordersRes, guestsRes] = await Promise.all([
    supabase.from("restaurant_tables").select("*").order("table_number"),
    supabase.from("menu_categories").select("*").order("sort_order"),
    supabase
      .from("menu_items")
      .select("*, menu_categories(*)")
      .eq("is_available", true)
      .order("name"),
    supabase
      .from("restaurant_orders")
      .select(
        "*, restaurant_tables(table_number), bookings(guest_name, rooms(room_number)), order_items(*, menu_items(name, menu_recipe_ingredients(id)))"
      )
      .eq("order_status", "active")
      .order("created_at", { ascending: false }),
    supabase
      .from("bookings")
      .select("id, guest_name, rooms(room_number)")
      .eq("status", "checked_in")
      .order("guest_name"),
  ]);

  return (
    <div className="space-y-6">
      <LiveRefresher tables={["restaurant_orders", "order_items", "restaurant_tables", "menu_items"]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">POS terminal</h1>
        <p className="text-sm text-muted-foreground">
          Dine-in, room service, takeaway and delivery — one screen, synced live across terminals.
        </p>
      </div>
      <PosTerminal
        tables={(tablesRes.data ?? []) as RestaurantTable[]}
        categories={(categoriesRes.data ?? []) as MenuCategoryRow[]}
        menu={(menuRes.data ?? []) as MenuItem[]}
        orders={(ordersRes.data ?? []) as RestaurantOrder[]}
        guests={(guestsRes.data ?? []) as unknown as Pick<Booking, "id" | "guest_name" | "rooms">[]}
      />
    </div>
  );
}
