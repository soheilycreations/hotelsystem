import Link from "next/link";
import { Settings } from "lucide-react";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { canAccess } from "@/lib/types";
import type { Booking, MenuCategoryRow, MenuItem, RestaurantOrder, RestaurantTable } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { LiveRefresher } from "../../live-refresher";
import { PosTerminal } from "./pos-terminal";

export const dynamic = "force-dynamic";
export const metadata = { title: "POS Terminal" };

export default async function PosActivePage() {
  const supabase = await createClient();
  const profile = await getSessionProfile();
  const canManageTables = profile ? canAccess(profile.role, "/pos/tables") : false;

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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">POS terminal</h1>
          <p className="text-sm text-muted-foreground">
            Dine-in, room service, takeaway and delivery — one screen, synced live across terminals.
          </p>
        </div>
        {canManageTables ? (
          <Button asChild variant="outline" size="icon" title="Manage tables — numbers, capacity, add/remove">
            <Link href="/pos/tables" aria-label="Manage tables">
              <Settings className="h-4 w-4" />
            </Link>
          </Button>
        ) : null}
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
