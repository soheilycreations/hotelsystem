"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Live count of restaurant_orders still order_status = 'active' (opened,
 * not yet settled) — backs the "pending bill" notification dot on the POS
 * nav link, so it's visible to staff wherever they are in the dashboard,
 * not just on the POS Terminal page itself.
 */
export function useActiveOrderCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function refresh() {
      const { count: c } = await supabase
        .from("restaurant_orders")
        .select("id", { count: "exact", head: true })
        .eq("order_status", "active");
      if (!cancelled) setCount(c ?? 0);
    }

    refresh();

    const channel = supabase
      .channel("sync:active-order-count")
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_orders" }, refresh)
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, []);

  return count;
}
