"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Armchair,
  Bike,
  ConciergeBell,
  Printer,
  ReceiptText,
  ShoppingBag,
  Wallet,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useThermalPrint } from "@/hooks/useThermalPrint";
import { formatDateTime, formatLKR } from "@/lib/utils";
import type { ChannelType, HotelSettings, RestaurantOrder } from "@/lib/types";
import { cancelOrder, markTableBilled, settleOrder } from "../actions";

const CHANNEL_META: Record<ChannelType, { label: string; icon: typeof Armchair }> = {
  dine_in: { label: "Dine-in", icon: Armchair },
  room_service: { label: "Room Service", icon: ConciergeBell },
  takeaway: { label: "Takeaway", icon: ShoppingBag },
  delivery: { label: "Delivery", icon: Bike },
};

export function BillingDesk({
  orders,
  hotel = null,
}: {
  orders: RestaurantOrder[];
  hotel?: HotelSettings | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(orders[0]?.id ?? null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmSettleId, setConfirmSettleId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { print, printing, error: printError } = useThermalPrint();

  const selected = useMemo(
    () => orders.find((o) => o.id === selectedId) ?? orders[0] ?? null,
    [orders, selectedId]
  );

  const totalOpen = useMemo(
    () => orders.reduce((sum, o) => sum + Number(o.total_amount), 0),
    [orders]
  );

  function handleSettle(order: RestaurantOrder) {
    const kotPending = (order.order_items ?? []).some((i) => !i.kot_printed_at);
    if (kotPending && confirmSettleId !== order.id) {
      // First click with unsent items — warn, but allow settling on the next click.
      setConfirmSettleId(order.id);
      setFeedback(
        "Some items on this bill were never sent to the kitchen (no KOT). Press settle again to proceed anyway."
      );
      return;
    }
    setConfirmSettleId(null);
    startTransition(async () => {
      const res = await settleOrder(order.id);
      setFeedback(
        res.ok
          ? `Bill #${order.order_number} settled — stock deducted${
              order.channel_type === "room_service" ? " & charged to guest folio" : ""
            }.`
          : res.error ?? "Could not settle the bill."
      );
    });
  }

  function handleCancel(order: RestaurantOrder) {
    startTransition(async () => {
      const res = await cancelOrder(order.id);
      setFeedback(res.ok ? `Bill #${order.order_number} voided.` : res.error ?? "Could not void.");
    });
  }

  function handleMarkBilled(order: RestaurantOrder) {
    if (!order.table_id) return;
    startTransition(async () => {
      const res = await markTableBilled(order.table_id as string);
      setFeedback(
        res.ok
          ? `Table ${order.restaurant_tables?.table_number ?? ""} marked as billed.`
          : res.error ?? "Could not update the table."
      );
    });
  }

  async function handlePrint(order: RestaurantOrder) {
    const sent = await print({
      order,
      items: order.order_items ?? [],
      hotel: hotel
        ? {
            name: hotel.hotel_name,
            address: hotel.address,
            phonePrimary: hotel.phone_primary,
            phoneSecondary: hotel.phone_secondary,
          }
        : undefined,
    });
    if (sent) setFeedback(`Receipt for bill #${order.order_number} sent to printer.`);
  }

  if (orders.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
          <ReceiptText className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium">No open bills</p>
          <p className="text-sm text-muted-foreground">
            Bills created at the POS terminal will land here for settlement.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      {/* Open bills list */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Open bills ({orders.length})</CardTitle>
          <span className="text-sm font-medium text-muted-foreground">
            Outstanding: {formatLKR(totalOpen)}
          </span>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bill</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => {
                const meta = CHANNEL_META[order.channel_type];
                const Icon = meta.icon;
                const ref =
                  order.restaurant_tables?.table_number
                    ? `Table ${order.restaurant_tables.table_number}`
                    : order.bookings
                    ? `${order.bookings.guest_name} · Rm ${order.bookings.rooms?.room_number ?? "—"}`
                    : order.customer_phone ?? "—";
                return (
                  <TableRow
                    key={order.id}
                    onClick={() => {
                      setSelectedId(order.id);
                      setConfirmSettleId(null);
                    }}
                    className={
                      "cursor-pointer " + (selected?.id === order.id ? "bg-muted/60" : "")
                    }
                  >
                    <TableCell className="font-medium">#{order.order_number}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        {meta.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{ref}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatLKR(Number(order.total_amount))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Bill detail / settlement panel */}
      {selected && (
        <Card className="h-fit lg:sticky lg:top-6">
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Bill #{selected.order_number}</CardTitle>
              <div className="flex items-center gap-1.5">
                {(selected.order_items ?? []).some((i) => !i.kot_printed_at) ? (
                  <Badge variant="warning">KOT pending</Badge>
                ) : (selected.order_items ?? []).length > 0 ? (
                  <Badge variant="success">KOT sent</Badge>
                ) : null}
                <Badge variant="info">{CHANNEL_META[selected.channel_type].label}</Badge>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Opened {formatDateTime(selected.created_at)}
            </p>
            {selected.bookings && (
              <p className="text-xs text-muted-foreground">
                Guest: {selected.bookings.guest_name} — settling posts this to the room folio.
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {(selected.order_items ?? []).map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <span>
                    {item.menu_items?.name ?? "Item"}{" "}
                    <span className="text-muted-foreground">× {item.quantity}</span>
                  </span>
                  <span className="tabular-nums">{formatLKR(Number(item.line_total))}</span>
                </div>
              ))}
              {(selected.order_items ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">No items on this bill yet.</p>
              )}
            </div>

            <div className="space-y-1 border-t pt-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{formatLKR(Number(selected.subtotal))}</span>
              </div>
              {Number(selected.service_charge) > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Service charge
                    {Number(selected.subtotal) > 0
                      ? ` (${Math.round((Number(selected.service_charge) / Number(selected.subtotal)) * 100)}%)`
                      : ""}
                  </span>
                  <span className="tabular-nums">{formatLKR(Number(selected.service_charge))}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatLKR(Number(selected.total_amount))}</span>
              </div>
            </div>

            <div className="grid gap-2">
              <Button
                onClick={() => handleSettle(selected)}
                disabled={pending || Number(selected.total_amount) <= 0}
                variant={confirmSettleId === selected.id ? "destructive" : "default"}
              >
                <Wallet className="mr-2 h-4 w-4" />
                {confirmSettleId === selected.id ? "Settle anyway (KOT pending)" : "Settle & complete"}
              </Button>
              <Button
                variant="outline"
                onClick={() => handlePrint(selected)}
                disabled={printing || (selected.order_items ?? []).length === 0}
              >
                <Printer className="mr-2 h-4 w-4" />
                {printing ? "Printing…" : "Print receipt (ESC/POS)"}
              </Button>
              {selected.channel_type === "dine_in" &&
                selected.restaurant_tables?.current_status !== "billed" && (
                  <Button
                    variant="secondary"
                    onClick={() => handleMarkBilled(selected)}
                    disabled={pending}
                  >
                    <ReceiptText className="mr-2 h-4 w-4" />
                    Mark table as billed
                  </Button>
                )}
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => handleCancel(selected)}
                disabled={pending}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Void bill
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Settling flips the order to <span className="font-medium">completed</span> — the
              database trigger then deducts recipe stock and posts room-service charges to the
              guest folio automatically.
            </p>

            {(feedback || printError) && (
              <p className="rounded-md bg-muted px-3 py-2 text-xs">
                {printError ?? feedback}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
