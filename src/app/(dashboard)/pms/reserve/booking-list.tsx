"use client";

import { useState, useTransition } from "react";
import { DoorOpen, LogIn, Loader2, Printer, XCircle } from "lucide-react";
import type { Booking } from "@/lib/types";
import { formatDate, formatLKR } from "@/lib/utils";
import { useThermalPrint } from "@/hooks/useThermalPrint";
import { setBookingStatus } from "../actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ServiceOrder = { orderNumber: number; amount: number };

export function BookingList({
  bookings,
  serviceOrdersByBooking = {},
}: {
  bookings: Booking[];
  serviceOrdersByBooking?: Record<string, ServiceOrder[]>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { printFolio, printing, error: printError } = useThermalPrint();

  const update = (id: string, status: "checked_in" | "checked_out" | "cancelled") => {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const result = await setBookingStatus(id, status);
      if (!result.ok) setError(result.error ?? "Update failed");
      setPendingId(null);
    });
  };

  const printBill = async (b: Booking) => {
    setNotice(null);
    const serviceOrders = serviceOrdersByBooking[b.id] ?? [];
    const serviceTotal = serviceOrders.reduce((sum, o) => sum + o.amount, 0);
    const total = Number(b.total_folio_amount);
    const roomCharge = Math.max(0, total - serviceTotal);
    const nights = Math.max(
      1,
      Math.round(
        (new Date(b.check_out_date).getTime() - new Date(b.check_in_date).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    );
    const sent = await printFolio({
      guestName: b.guest_name,
      roomNumber: b.rooms?.room_number ?? "—",
      roomTypeName: b.rooms?.room_types?.name,
      checkInDate: b.check_in_date,
      checkOutDate: b.check_out_date,
      nights,
      roomCharge,
      serviceOrders,
      total,
    });
    if (sent) setNotice(`Room bill for ${b.guest_name} sent to printer.`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Arrivals &amp; in-house guests</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {printError ? <p className="text-sm text-destructive">{printError}</p> : null}
        {notice ? <p className="text-sm text-emerald-500">{notice}</p> : null}
        {bookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No pending or in-house bookings. New reservations appear here.
          </p>
        ) : (
          bookings.map((b) => (
            <div
              key={b.id}
              className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium">{b.guest_name}</p>
                  <Badge variant={b.status === "checked_in" ? "info" : "secondary"}>
                    {b.status === "checked_in" ? "In house" : "Pending"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Room {b.rooms?.room_number ?? "—"} · {formatDate(b.check_in_date)} →{" "}
                  {formatDate(b.check_out_date)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Folio: <span className="font-medium text-foreground">{formatLKR(Number(b.total_folio_amount))}</span>
                  {b.contact_number ? ` · ${b.contact_number}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {b.status === "pending" ? (
                  <>
                    <Button size="sm" disabled={pendingId === b.id} onClick={() => update(b.id, "checked_in")}>
                      {pendingId === b.id ? <Loader2 className="animate-spin" /> : <LogIn />} Check in
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pendingId === b.id}
                      onClick={() => update(b.id, "cancelled")}
                    >
                      <XCircle /> Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={printing}
                      onClick={() => printBill(b)}
                      title="Print the room bill — room charge + room service"
                    >
                      {printing ? <Loader2 className="animate-spin" /> : <Printer />} Print bill
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pendingId === b.id}
                      onClick={() => update(b.id, "checked_out")}
                    >
                      {pendingId === b.id ? <Loader2 className="animate-spin" /> : <DoorOpen />} Check out
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
        <p className="text-xs text-muted-foreground">
          Checking out flips the room to <span className="font-medium">dirty</span> automatically for
          housekeeping (database Trigger A).
        </p>
      </CardContent>
    </Card>
  );
}
