import { notFound } from "next/navigation";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import type { CreditAccount } from "@/lib/types";
import { formatOrderNumber } from "@/lib/utils";
import { LiveRefresher } from "../../../live-refresher";
import { CreditAccountDetailView } from "./detail-view";

export const dynamic = "force-dynamic";

export interface CreditLedgerEntry {
  date: string;
  kind: "charge" | "adjustment" | "repayment";
  description: string;
  amount: number; // positive = adds to balance owed, negative = reduces it
}

export default async function CreditAccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const profile = await getSessionProfile();

  const [{ data: account }, { data: bookings }, { data: orders }, { data: adjustments }, { data: repayments }] =
    await Promise.all([
      supabase.from("credit_accounts").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("bookings")
        .select("guest_name, total_folio_amount, actual_check_out, rooms(room_number)")
        .eq("credit_account_id", id)
        .eq("payment_method", "credit"),
      supabase
        .from("restaurant_orders")
        .select("order_number, channel_type, total_amount, business_date")
        .eq("credit_account_id", id)
        .eq("payment_method", "credit"),
      supabase.from("credit_adjustments").select("*").eq("credit_account_id", id).order("date"),
      supabase.from("credit_repayments").select("*").eq("credit_account_id", id).order("date"),
    ]);

  if (!account) notFound();

  const entries: CreditLedgerEntry[] = [];

  for (const b of bookings ?? []) {
    if (!b.actual_check_out) continue;
    const rooms = b.rooms as unknown as { room_number: string } | null;
    entries.push({
      date: b.actual_check_out.slice(0, 10),
      kind: "charge",
      description: `Room ${rooms?.room_number ?? "—"} checkout — ${b.guest_name}`,
      amount: Number(b.total_folio_amount),
    });
  }
  for (const o of orders ?? []) {
    entries.push({
      date: o.business_date,
      kind: "charge",
      description: `Bill #${formatOrderNumber(o.business_date, o.order_number)} — ${String(o.channel_type).replace("_", " ")}`,
      amount: Number(o.total_amount),
    });
  }
  for (const a of adjustments ?? []) {
    entries.push({
      date: a.date,
      kind: "adjustment",
      description: a.description || "Manual adjustment",
      amount: Number(a.amount),
    });
  }
  for (const r of repayments ?? []) {
    entries.push({
      date: r.date,
      kind: "repayment",
      description: r.description || `Repayment (${r.payment_method.replace("_", " ")})`,
      amount: -Number(r.amount),
    });
  }

  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let running = 0;
  const entriesWithBalance = entries.map((e) => {
    running += e.amount;
    return { ...e, balance: running };
  });

  return (
    <div className="space-y-6">
      <LiveRefresher
        tables={["credit_accounts", "credit_adjustments", "credit_repayments", "restaurant_orders", "bookings"]}
      />
      <CreditAccountDetailView
        account={account as CreditAccount}
        entries={entriesWithBalance.slice().reverse()}
        balance={running}
        isAdmin={profile?.role === "admin"}
      />
    </div>
  );
}
