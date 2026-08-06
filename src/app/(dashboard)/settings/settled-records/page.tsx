import { createClient } from "@/lib/supabase/server";
import { colomboDaysAgo, colomboToday } from "@/lib/colombo-date";
import type { CreditAccount } from "@/lib/types";
import { SettledRecordsView } from "./settled-records-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settled Records" };

export interface SettledOrderRow {
  id: string;
  order_number: number;
  channel_type: string;
  subtotal: number;
  service_charge: number;
  total_amount: number;
  payment_method: string | null;
  credit_account_id: string | null;
  business_date: string;
}

export interface SettledBookingRow {
  id: string;
  guest_name: string;
  room_number: string;
  rate_plan_name: string | null;
  rate_plan_price: number | null;
  total_folio_amount: number;
  payment_method: string | null;
  credit_account_id: string | null;
  actual_check_out: string | null;
}

export default async function SettledRecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const isValidDate = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const fromDate = isValidDate(from) ? (from as string) : colomboDaysAgo(6);
  const toDate = isValidDate(to) && (to as string) >= fromDate ? (to as string) : colomboToday();

  const supabase = await createClient();
  const toIsoExclusive = new Date(new Date(`${toDate}T00:00:00+05:30`).getTime() + 86_400_000).toISOString();

  const [{ data: orders }, { data: bookings }, { data: creditAccounts }] = await Promise.all([
    supabase
      .from("restaurant_orders")
      .select(
        "id, order_number, channel_type, subtotal, service_charge, total_amount, payment_method, credit_account_id, business_date"
      )
      .eq("order_status", "completed")
      .gte("business_date", fromDate)
      .lte("business_date", toDate)
      .order("business_date", { ascending: false })
      .order("order_number", { ascending: false }),
    supabase
      .from("bookings")
      .select(
        "id, guest_name, rate_plan_name, rate_plan_price, total_folio_amount, payment_method, credit_account_id, actual_check_out, rooms(room_number)"
      )
      .eq("status", "checked_out")
      .gte("actual_check_out", `${fromDate}T00:00:00+05:30`)
      .lt("actual_check_out", toIsoExclusive)
      .order("actual_check_out", { ascending: false }),
    supabase.from("credit_accounts").select("*").order("name"),
  ]);

  const bookingRows: SettledBookingRow[] = (bookings ?? []).map((b) => {
    const rooms = b.rooms as unknown as { room_number: string } | null;
    return {
      id: b.id,
      guest_name: b.guest_name,
      room_number: rooms?.room_number ?? "—",
      rate_plan_name: b.rate_plan_name,
      rate_plan_price: b.rate_plan_price,
      total_folio_amount: Number(b.total_folio_amount),
      payment_method: b.payment_method,
      credit_account_id: b.credit_account_id,
      actual_check_out: b.actual_check_out,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settled Records</h1>
        <p className="text-sm text-muted-foreground">
          Reopen an already-settled bill or checked-out booking to fix a mistake — payment
          method, rate, or amount. Admin only.
        </p>
      </div>
      <SettledRecordsView
        fromDate={fromDate}
        toDate={toDate}
        orders={(orders as SettledOrderRow[] | null) ?? []}
        bookings={bookingRows}
        creditAccounts={(creditAccounts as CreditAccount[] | null) ?? []}
      />
    </div>
  );
}
