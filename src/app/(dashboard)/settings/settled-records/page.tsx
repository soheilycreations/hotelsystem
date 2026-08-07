import { createClient } from "@/lib/supabase/server";
import { colomboDaysAgo, colomboToday } from "@/lib/colombo-date";
import type { CreditAccount } from "@/lib/types";
import { SettledRecordsView } from "./settled-records-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settled Records" };

export interface SettledOrderItemRow {
  id: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  is_custom: boolean;
  custom_description: string | null;
  service_chargeable: boolean;
  menu_item_name: string | null;
}

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
  items: SettledOrderItemRow[];
}

export interface SettledBookingChargeRow {
  id: string;
  description: string;
  amount: number;
  created_at: string;
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
  charges: SettledBookingChargeRow[];
}

export interface MenuItemOption {
  id: string;
  name: string;
  selling_price: number;
  service_chargeable: boolean;
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

  const [{ data: orders }, { data: bookings }, { data: creditAccounts }, { data: menuItems }] = await Promise.all([
    supabase
      .from("restaurant_orders")
      .select(
        "id, order_number, channel_type, subtotal, service_charge, total_amount, payment_method, credit_account_id, business_date, order_items(id, quantity, unit_price, line_total, is_custom, custom_description, service_chargeable, menu_items(name))"
      )
      .eq("order_status", "completed")
      .gte("business_date", fromDate)
      .lte("business_date", toDate)
      .order("business_date", { ascending: false })
      .order("order_number", { ascending: false }),
    supabase
      .from("bookings")
      .select(
        "id, guest_name, rate_plan_name, rate_plan_price, total_folio_amount, payment_method, credit_account_id, actual_check_out, rooms(room_number), booking_charges(id, description, amount, created_at)"
      )
      .eq("status", "checked_out")
      .gte("actual_check_out", `${fromDate}T00:00:00+05:30`)
      .lt("actual_check_out", toIsoExclusive)
      .order("actual_check_out", { ascending: false }),
    supabase.from("credit_accounts").select("*").order("name"),
    supabase
      .from("menu_items")
      .select("id, name, selling_price, service_chargeable")
      .eq("is_available", true)
      .order("name"),
  ]);

  const orderRows: SettledOrderRow[] = (orders ?? []).map((o) => ({
    id: o.id,
    order_number: o.order_number,
    channel_type: o.channel_type,
    subtotal: Number(o.subtotal),
    service_charge: Number(o.service_charge),
    total_amount: Number(o.total_amount),
    payment_method: o.payment_method,
    credit_account_id: o.credit_account_id,
    business_date: o.business_date,
    items: (
      (o.order_items ?? []) as {
        id: string;
        quantity: number;
        unit_price: number;
        line_total: number;
        is_custom: boolean;
        custom_description: string | null;
        service_chargeable: boolean;
        menu_items: { name: string } | { name: string }[] | null;
      }[]
    ).map((it) => {
      const menuItem = Array.isArray(it.menu_items) ? it.menu_items[0] : it.menu_items;
      return {
        id: it.id,
        quantity: it.quantity,
        unit_price: Number(it.unit_price),
        line_total: Number(it.line_total),
        is_custom: it.is_custom,
        custom_description: it.custom_description,
        service_chargeable: it.service_chargeable,
        menu_item_name: menuItem?.name ?? null,
      };
    }),
  }));

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
      charges: ((b.booking_charges ?? []) as SettledBookingChargeRow[])
        .map((c) => ({ ...c, amount: Number(c.amount) }))
        .sort((a, c) => (a.created_at < c.created_at ? -1 : 1)),
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
        orders={orderRows}
        bookings={bookingRows}
        creditAccounts={(creditAccounts as CreditAccount[] | null) ?? []}
        menuItems={(menuItems as MenuItemOption[] | null) ?? []}
      />
    </div>
  );
}
