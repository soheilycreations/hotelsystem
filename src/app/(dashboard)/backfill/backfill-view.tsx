"use client";

import { useRef, useState, useTransition } from "react";
import { BedDouble, CalendarClock, Loader2, ReceiptText } from "lucide-react";
import type { Room } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createHistoricalBooking, createHistoricalSale } from "./actions";

export function BackfillView({ rooms }: { rooms: Room[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <HistoricalBookingForm rooms={rooms} />
      <HistoricalSaleForm />
    </div>
  );
}

function HistoricalBookingForm({ rooms }: { rooms: Room[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const res = await createHistoricalBooking(formData);
      if (res.ok) {
        formRef.current?.reset();
        setMessage({ ok: true, text: "Historical booking added." });
      } else {
        setMessage({ ok: false, text: res.error ?? "Could not save." });
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BedDouble className="h-4 w-4" />
          Historical room booking
        </CardTitle>
        <CardDescription>
          Recreates a past stay exactly as it happened — saved straight as &ldquo;checked
          out&rdquo;.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={submit} className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="hb-guest">Guest name</Label>
            <Input id="hb-guest" name="guest_name" placeholder="e.g. Nimal Perera" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="hb-room">Room</Label>
              <Select id="hb-room" name="room_id" required>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.room_number} — {r.room_types?.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hb-contact">Contact (optional)</Label>
              <Input id="hb-contact" name="contact_number" placeholder="07X XXX XXXX" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="hb-checkin">Check-in date</Label>
              <Input id="hb-checkin" name="check_in_date" type="date" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hb-checkout">Check-out date</Label>
              <Input id="hb-checkout" name="check_out_date" type="date" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="hb-amount">Total amount (LKR)</Label>
              <Input
                id="hb-amount"
                name="amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hb-plan">Plan label (optional)</Label>
              <Input id="hb-plan" name="plan_label" placeholder="e.g. AC — Full Night" />
            </div>
          </div>
          {message ? (
            <p className={`text-sm ${message.ok ? "text-emerald-500" : "text-destructive"}`}>
              {message.text}
            </p>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarClock className="mr-2 h-4 w-4" />}
            {pending ? "Saving…" : "Add historical booking"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function HistoricalSaleForm() {
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [serviceChargeable, setServiceChargeable] = useState(true);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const res = await createHistoricalSale({
        date,
        description,
        amount: Number(amount),
        serviceChargeable,
      });
      if (res.ok) {
        setDescription("");
        setAmount("");
        setMessage({ ok: true, text: "Historical sale logged." });
      } else {
        setMessage({ ok: false, text: res.error ?? "Could not save." });
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ReceiptText className="h-4 w-4" />
          Historical POS / restaurant sale
        </CardTitle>
        <CardDescription>
          One line, one amount — logged and settled instantly against the date you pick.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="hs-date">Date</Label>
          <Input id="hs-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hs-desc">Description</Label>
          <Input
            id="hs-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Dinner service, Lunch takeaway"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hs-amount">Amount (LKR)</Label>
          <Input
            id="hs-amount"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={serviceChargeable}
            onChange={(e) => setServiceChargeable(e.target.checked)}
            className="h-4 w-4 accent-current"
          />
          Apply the current service charge rate on top
        </label>
        {message ? (
          <p className={`text-sm ${message.ok ? "text-emerald-500" : "text-destructive"}`}>
            {message.text}
          </p>
        ) : null}
        <Button onClick={submit} disabled={pending || !date || !description.trim() || !amount}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ReceiptText className="mr-2 h-4 w-4" />}
          {pending ? "Saving…" : "Log historical sale"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Saved as a settled bill dated to the day you pick — appears in Daily Summary, P&amp;L,
          and the item-sales breakdown as &ldquo;{description || "your description"}&rdquo;.
        </p>
      </CardContent>
    </Card>
  );
}
