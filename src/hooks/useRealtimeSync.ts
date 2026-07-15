"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to Postgres changes on the given tables and refreshes the
 * current server component tree whenever a row mutates. This keeps every
 * terminal (reception, POS, kitchen) in sync without manual reloads.
 *
 * Usage: useRealtimeSync(["rooms", "bookings"]);
 */
export function useRealtimeSync(tables: string[], onEvent?: () => void): void {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase.channel(`sync:${tables.join(",")}`);
    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          router.refresh();
          onEvent?.();
        }
      );
    }
    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(","), router]);
}
