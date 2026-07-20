"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { CalendarPlus, Clock, Loader2 } from "lucide-react";
import type { Room, RoomRatePlan } from "@/lib/types";
import { formatLKR } from "@/lib/utils";
import { createBooking } from "../actions";
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
          <div className="space-y-1.5">
            <Label htmlFor="contact_number">Contact number</Label>
            <Input id="contact_number" name="contact_number" type="tel" placeholder="07X XXX XXXX" />
          </div>
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

          {preview && (
            <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
              <span className="text-muted-foreground">{preview.label}</span>
              <span className="font-semibold tabular-nums">{formatLKR(preview.amount)}</span>
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
