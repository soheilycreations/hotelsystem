"use client";

import { useEffect, useState, useTransition } from "react";
import {
  BadgePlus,
  Clock,
  DoorOpen,
  LogIn,
  Loader2,
  Printer,
  Timer,
  XCircle,
} from "lucide-react";
import type { Booking, HotelSettings } from "@/lib/types";
import { formatDate, formatLKR } from "@/lib/utils";
import { useThermalPrint } from "@/hooks/useThermalPrint";
import { addBookingCharge, extendShortStay, setBookingStatus } from "../actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type ServiceOrder = { orderNumber: number; amount: number };

/** Live countdown for a time-block stay. Re-renders every 30s. */
export function StayCountdown({ booking }: { booking: Booking }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (booking.stay_type !== "short_stay" || booking.status !== "checked_in") return null;

  const end = new Date(booking.check_out_date).getTime();
  const diffMin = Math.round((end - now) / 60_000);
  const abs = Math.abs(diffMin);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const label = `${h > 0 ? `${h}h ` : ""}${m}m`;

  if (diffMin < 0) {
    return (
      <Badge variant="danger">
        <Timer className="mr-1 h-3 w-3" />
        Over by {label}
      </Badge>
    );
  }
  if (diffMin <= 30) {
    return (
      <Badge variant="warning">
        <Timer className="mr-1 h-3 w-3" />
        {label} left
      </Badge>
    );
  }
  return (
    <Badge variant="success">
      <Timer className="mr-1 h-3 w-3" />
      {label} left
    </Badge>
  );
}

export function BookingList({
  bookings,
  serviceOrdersByBooking = {},
  hotel = null,
}: {
  bookings: Booking[];
  serviceOrdersByBooking?: Record<string, ServiceOrder[]>;
  hotel?: HotelSettings | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [extending, setExtending] = useState<Booking | null>(null);
  const [charging, setCharging] = useState<Booking | null>(null);
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
    const charges = (b.booking_charges ?? []).map((c) => ({
      description: c.description,
      amount: Number(c.amount),
    }));
    const chargesTotal = charges.reduce((sum, c) => sum + c.amount, 0);
    const total = Number(b.total_folio_amount);
    const roomCharge = Math.max(0, total - serviceTotal - chargesTotal);
    const nights = Math.max(
      1,
      Math.round(
        (new Date(b.check_out_date).getTime() - new Date(b.check_in_date).getTime()) / 86_400_000
      )
    );
    const sent = await printFolio({
      guestName: b.guest_name,
      roomNumber: b.rooms?.room_number ?? "—",
      roomTypeName: b.rooms?.room_types?.name,
      checkInDate: b.check_in_date,
      checkOutDate: b.check_out_date,
      stayType: b.stay_type,
      durationHours: b.duration_hours,
      planName: b.rate_plan_name,
      nights,
      roomCharge,
      charges,
      serviceOrders,
      total,
      hotel: hotel
        ? {
            name: hotel.hotel_name,
            address: hotel.address,
            phonePrimary: hotel.phone_primary,
            phoneSecondary: hotel.phone_secondary,
          }
        : undefined,
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
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium">{b.guest_name}</p>
                  <Badge variant={b.status === "checked_in" ? "info" : "secondary"}>
                    {b.status === "checked_in" ? "In house" : "Pending"}
                  </Badge>
                  <StayCountdown booking={b} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Room {b.rooms?.room_number ?? "—"}
                  {b.rate_plan_name ? ` · ${b.rate_plan_name}` : ""}
                  {b.stay_type === "short_stay"
                    ? ` · ${b.duration_hours}h block`
                    : ` · ${formatDate(b.check_in_date)} → ${formatDate(b.check_out_date)}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  Folio:{" "}
                  <span className="font-medium text-foreground">
                    {formatLKR(Number(b.total_folio_amount))}
                  </span>
                  {(b.booking_charges ?? []).length > 0
                    ? ` (incl. ${b.booking_charges?.length} extra charge${
                        (b.booking_charges?.length ?? 0) > 1 ? "s" : ""
                      })`
                    : ""}
                  {b.contact_number ? ` · ${b.contact_number}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
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
                    {b.stay_type === "short_stay" && (
                      <Button size="sm" variant="outline" onClick={() => setExtending(b)}>
                        <Clock /> Extend
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setCharging(b)}>
                      <BadgePlus /> Charge
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={printing}
                      onClick={() => printBill(b)}
                      title="Print the room bill"
                    >
                      {printing ? <Loader2 className="animate-spin" /> : <Printer />} Bill
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
          housekeeping (database Trigger A). Time-block countdowns start at the actual check-in.
        </p>
      </CardContent>

      {/* Extend dialog */}
      <Dialog open={extending !== null} onOpenChange={(open) => !open && setExtending(null)}>
        {extending && (
          <ExtendDialog
            booking={extending}
            onDone={(msg) => {
              setExtending(null);
              setNotice(msg);
            }}
          />
        )}
      </Dialog>

      {/* Custom charge dialog */}
      <Dialog open={charging !== null} onOpenChange={(open) => !open && setCharging(null)}>
        {charging && (
          <ChargeDialog
            booking={charging}
            onDone={(msg) => {
              setCharging(null);
              setNotice(msg);
            }}
          />
        )}
      </Dialog>
    </Card>
  );
}

function ExtendDialog({ booking, onDone }: { booking: Booking; onDone: (msg: string) => void }) {
  const [hours, setHours] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const perHour =
    booking.rate_plan_price && booking.duration_hours
      ? Number(booking.rate_plan_price) / Number(booking.duration_hours)
      : 0;
  const topUp = Math.round(perHour * Number(hours || 0) * 100) / 100;

  function submit() {
    const h = Number(hours);
    startTransition(async () => {
      const res = await extendShortStay(booking.id, h);
      if (res.ok) onDone(`${booking.guest_name}'s stay extended by ${h}h (+${formatLKR(topUp)}).`);
      else setError(res.error ?? "Could not extend.");
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Extend stay — {booking.guest_name}</DialogTitle>
        <DialogDescription>
          Pushes the deadline and adds the extension to the folio at the plan&apos;s hourly
          equivalent.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="ext-hours">Extra hours</Label>
          <Select id="ext-hours" value={hours} onChange={(e) => setHours(e.target.value)}>
            {[1, 2, 3, 4, 6, 12].map((h) => (
              <option key={h} value={h}>
                +{h} hour{h > 1 ? "s" : ""}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
          <span className="text-muted-foreground">Folio top-up</span>
          <span className="font-semibold tabular-nums">{formatLKR(topUp)}</span>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={pending}>
          <Clock className="mr-2 h-4 w-4" />
          {pending ? "Extending…" : "Extend stay"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function ChargeDialog({ booking, onDone }: { booking: Booking; onDone: (msg: string) => void }) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await addBookingCharge(booking.id, Number(amount), description);
      if (res.ok) onDone(`${formatLKR(Number(amount))} added to ${booking.guest_name}'s folio.`);
      else setError(res.error ?? "Could not add the charge.");
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add charge — {booking.guest_name}</DialogTitle>
        <DialogDescription>
          For overtime, minibar, laundry or any custom amount — it appears as its own line on the
          bill.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="chg-desc">Description</Label>
          <Input
            id="chg-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Overtime 1h / Laundry"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="chg-amount">Amount (LKR)</Label>
          <Input
            id="chg-amount"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={pending}>
          <BadgePlus className="mr-2 h-4 w-4" />
          {pending ? "Adding…" : "Add to folio"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
