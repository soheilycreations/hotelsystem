import { createClient } from "@/lib/supabase/server";
import type { InventoryItem } from "@/lib/types";
import { OpeningStockForm } from "./opening-stock-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Opening Stock" };

export default async function OpeningStockPage() {
  const supabase = await createClient();
  const { data: items } = await supabase.from("inventory_items").select("*").order("name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Opening stock count</h1>
        <p className="text-sm text-muted-foreground">
          Count what is physically in the kitchen and enter it here. Each number replaces the current
          stock figure and is saved as an &quot;opening&quot; stock movement with your name. Leave a
          row blank to skip it.
        </p>
      </div>
      <OpeningStockForm items={(items as InventoryItem[] | null) ?? []} />
    </div>
  );
}
