"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { CalendarPlus, Clock, History, Loader2, UserPlus } from "lucide-react";
import type { GuestStayHistory, Room, RoomRatePlan } from "@/lib/types";
import { formatDate, formatLKR } from "@/lib/utils";
import { createBooking, lookupGuestHistory } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export function BookingForm({
  rooms,
  ratePlans,
}: {
  rooms: Room[];
  ratePlans: RoomRatePlan[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const [roomId, setRoomId] = useState("");
  const [planId, setPlanId] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [showSecondGuest, setShowSecondGuest] = useState(false);
  const [useCustomPrice, setUseCustomPrice] = useState(false);
  const [customPrice, setCustomPrice] = useState("");

  const [guestIdNumber, setGuestIdNumber] = useState("");
  const [history, setHistory] = useState<GuestStayHistory[] | null>(null);
  const [historyChecked, setHistoryChecked] = useState("");
  const [checkingHistory, setCheckingHistory] = useState(false);

  async function checkGuestHistory() {
    const idNumber = guestIdNumber.trim();
    if (!idNumber || idNumber === historyChecked) return;
    setCheckingHistory(true);
    try {
      const result = await lookupGuestHistory(idNumber);
      if (result.ok) {
        setHistory(result.stays);
        setHistoryChecked(idNumber);
      }
    } finally {
      setCheckingHistory(false);
    }
  }

  const selectedRoom = rooms.find((r) => r.id === roomId);
  const availablePlans = useMemo(
    () =>
      selectedRoom
        ? ratePlans.filter((p) => p.room_type_id === selectedRoom.type_id && p.is_active)
        : [],
    [ratePlans, selectedRoom]
  );
  const selectedPlan = availablePlans.find((p) => p.id === planId) ?? null;

  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime();
    return diff > 0 ? Math.max(1, Math.ceil(diff / 86_400_000)) : 0;
  }, [checkIn, checkOut]);

  const preview = useMemo(() => {
    if (!selectedPlan) return null;
    if (selectedPlan.kind === "block") {
      return {
        label: `${selectedPlan.name} — ${selectedPlan.duration_hours}h from check-in`,
        amount: Number(selectedPlan.price),
      };
    }
    if (nights === 0) return null;
    return {
      label: `${selectedPlan.name} × ${nights} night${nights > 1 ? "s" : ""}`,
      amount: Number(selectedPlan.price) * nights,
    };
  }, [selectedPlan, nights]);

  const onSubmit = (formData: FormData) => {
    setMessage(null);
    startTransition(async () => {
      const result = await createBooking(formData);
      if (result.ok) {
        formRef.current?.reset();
        setRoomId("");
        setPlanId("");
        setCheckIn("");
        setCheckOut("");
        setShowSecondGuest(false);
        setUseCustomPrice(false);
        setCustomPrice("");
        setGuestIdNumber("");
        setHistory(null);
        setHistoryChecked("");
        setMessage({ ok: true, text: "Booking saved." });
      } else {
        setMessage({ ok: false, text: result.error ?? "Something went wrong." });
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>New booking</CardTitle>
        <CardDescription>
          Pick a room, then a rate plan — overnight or a timed block for short stays.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="guest_name">Guest name</Label>
            <Input id="guest_name" name="guest_name" placeholder="e.g. Nimal Perera" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="guest_id_number">NIC / Passport No.</Label>
              <Input
                id="guest_id_number"
                name="guest_id_number"
                placeholder="e.g. 200012345678"
                value={guestIdNumber}
                onChange={(e) => setGuestIdNumber(e.target.value)}
                onBlur={checkGuestHistory}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact_number">Contact number</Label>
              <Input id="contact_number" name="contact_number" type="tel" placeholder="07X XXX XXXX" />
            </div>
          </div>

          {checkingHistory && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Checking previous stays…
            </p>
          )}
          {!checkingHistory && history !== null && historyChecked === guestIdNumber.trim() && (
            <div className="rounded-md border px-3 py-2">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <History className="h-3.5 w-3.5" />
                {history.length === 0 ? "No previous stays found for this ID." : "Stayed before:"}
              </p>
              {history.length > 0 && (
                <div className="space-y-1">
                  {history.map((h) => (
                    <div key={h.bookingId} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {formatDate(h.checkInDate)} · Room {h.roomNumber ?? "—"} · {h.ratePlanName ?? "—"}
                      </span>
                      <span className="tabular-nums">{formatLKR(h.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!showSecondGuest ? (
            <button
              type="button"
              onClick={() => setShowSecondGuest(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <UserPlus className="h-3.5 w-3.5" /> Add a second guest
            </button>
          ) : (
            <div className="space-y-1.5 rounded-md border border-dashed p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Second guest</p>
                <button
                  type="button"
                  onClick={() => setShowSecondGuest(false)}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="second_guest_name">Guest 2 name</Label>
                  <Input id="second_guest_name" name="second_guest_name" placeholder="e.g. Kamala Perera" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="second_guest_id_number">Guest 2 NIC / Passport No.</Label>
                  <Input id="second_guest_id_number" name="second_guest_id_number" placeholder="Optional" />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="room_id">Room</Label>
            <Select
              id="room_id"
              name="room_id"
              required
              value={roomId}
              onChange={(e) => {
                setRoomId(e.target.value);
                setPlanId("");
              }}
            >
              <option value="" disabled>
                Select a room…
              </option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id} disabled={room.status === "maintenance"}>
                  {room.room_number} — {room.room_types?.name} · {room.status}
                </option>
              ))}
            </Select>
          </div>

          {selectedRoom && (
            <div className="space-y-1.5">
              <Label htmlFor="rate_plan_id">Rate plan</Label>
              <Select
                id="rate_plan_id"
                name="rate_plan_id"
                required
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
              >
                <option value="" disabled>
                  Select a plan…
                </option>
                {availablePlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatLKR(Number(p.price))}
                    {p.kind === "per_night" ? "/night" : ` (${p.duration_hours}h)`}
                  </option>
                ))}
              </Select>
              {availablePlans.length === 0 && (
                <p className="text-xs text-amber-500">
                  This category has no active rate plans — add them in Room Setup.
                </p>
              )}
            </div>
          )}

          {selectedPlan?.kind === "per_night" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="check_in_date">Check-in</Label>
                <Input
                  id="check_in_date"
                  name="check_in_date"
                  type="date"
                  required
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="check_out_date">Check-out</Label>
                <Input
                  id="check_out_date"
                  name="check_out_date"
                  type="date"
                  required
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                />
              </div>
            </div>
          )}

          {selectedPlan?.kind === "block" && (
            <p className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              {selectedPlan.duration_hours}h block — the countdown starts the moment the guest
              checks in.
            </p>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="check_in_now" className="h-4 w-4 accent-current" />
            Check the guest in immediately
          </label>

          {preview && !useCustomPrice && (
            <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
              <span className="text-muted-foreground">{preview.label}</span>
              <span className="font-semibold tabular-nums">{formatLKR(preview.amount)}</span>
            </div>
          )}

          {selectedPlan && (
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-current"
                  checked={useCustomPrice}
                  onChange={(e) => {
                    setUseCustomPrice(e.target.checked);
                    if (e.target.checked && !customPrice && preview) {
                      setCustomPrice(String(preview.amount));
                    }
                  }}
                />
                Use a custom price for this stay
              </label>
              {useCustomPrice && (
                <div className="space-y-1.5">
                  <Label htmlFor="custom_price">Custom total (Rs)</Label>
                  <Input
                    id="custom_price"
                    name="custom_price"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    placeholder="Negotiated total for the whole stay"
                  />
                  <p className="text-xs text-muted-foreground">
                    Overrides the rate plan&apos;s calculated price — flagged on the booking so
                    reports can tell it was a negotiated rate.
                  </p>
                </div>
              )}
            </div>
          )}

          {message ? (
            <p className={`text-sm ${message.ok ? "text-emerald-500" : "text-destructive"}`}>
              {message.text}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <CalendarPlus />}
            {pending ? "Saving…" : "Create booking"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
