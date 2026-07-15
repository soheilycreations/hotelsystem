"use client";

import { useRef, useState, useTransition } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";
import type { Room } from "@/lib/types";
import { formatLKR } from "@/lib/utils";
import { createBooking } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export function BookingForm({ rooms }: { rooms: Room[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (formData: FormData) => {
    setMessage(null);
    startTransition(async () => {
      const result = await createBooking(formData);
      if (result.ok) {
        formRef.current?.reset();
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
        <CardDescription>Folio opens with room rate × nights.</CardDescription>
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
            <Select id="room_id" name="room_id" required defaultValue="">
              <option value="" disabled>
                Select a room…
              </option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id} disabled={room.status === "maintenance"}>
                  {room.room_number} — {room.room_types?.name} (
                  {formatLKR(Number(room.room_types?.base_price ?? 0))}/n) · {room.status}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="check_in_date">Check-in</Label>
              <Input id="check_in_date" name="check_in_date" type="date" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="check_out_date">Check-out</Label>
              <Input id="check_out_date" name="check_out_date" type="date" required />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="check_in_now" className="h-4 w-4 accent-current" />
            Check the guest in immediately
          </label>

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
