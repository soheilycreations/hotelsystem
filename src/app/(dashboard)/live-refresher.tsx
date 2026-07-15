"use client";

import { useRealtimeSync } from "@/hooks/useRealtimeSync";

/** Drop-in client island: keeps a server page live via Supabase realtime. */
export function LiveRefresher({ tables }: { tables: string[] }) {
  useRealtimeSync(tables);
  return null;
}
