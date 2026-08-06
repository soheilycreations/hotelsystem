"use client";

import { useRef, useState, useTransition } from "react";
import { BedDouble, CalendarClock, Loader2, ReceiptText } from "lucide-react";
import type { CreditAccount, Room } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createHistoricalBooking, createHistoricalSale } from "./actions";

export function BackfillView({ rooms, creditAccounts }: { rooms: Room[]; creditAccounts: CreditAccount[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <HistoricalBookingForm rooms={rooms} creditAccounts={creditAccounts} />
      <HistoricalSaleForm creditAccounts={creditAccounts} />
    </div>
  );
}

function HistoricalBookingForm({ rooms, creditAccounts }: { rooms: Room[]; creditAccounts: CreditAccount[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "bank_transfer" | "credit">("cash");
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
              <Label htmlFor="hb-idnum">NIC / Passport (optional)</Label>
              <Input id="hb-idnum" name="guest_id_number" placeholder="e.g. 200012345678" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hb-contact">Contact (optional)</Label>
            <Input id="hb-contact" name="contact_number" placeholder="07X XXX XXXX" />
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
          <div className="space-y-1.5">
            <Label htmlFor="hb-payment">Paid by</Label>
            <Select
              id="hb-payment"
              name="payment_method"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
            >
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="credit">Credit (settle to an account)</option>
            </Select>
          </div>
          {paymentMethod === "credit" && (
            <div className="space-y-1.5">
              <Label htmlFor="hb-credit-account">Credit account</Label>
              <Select id="hb-credit-account" name="credit_account_id" defaultValue="">
                <option value="">Select an account…</option>
                {creditAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
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

function HistoricalSaleForm({ creditAccounts }: { creditAccounts: CreditAccount[] }) {
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [serviceChargeable, setServiceChargeable] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "bank_transfer" | "credit">("cash");
  const [creditAccountId, setCreditAccountId] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (paymentMethod === "credit" && !creditAccountId) {
      setMessage({ ok: false, text: "Pick a credit account." });
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const res = await createHistoricalSale({
        date,
        description,
        amount: Number(amount),
        serviceChargeable,
        paymentMethod,
        creditAccountId: paymentMethod === "credit" ? creditAccountId : undefined,
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
        <div className="space-y-1.5">
          <Label htmlFor="hs-payment">Paid by</Label>
          <Select
            id="hs-payment"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
          >
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="credit">Credit (settle to an account)</option>
          </Select>
        </div>
        {paymentMethod === "credit" && (
          <div className="space-y-1.5">
            <Label htmlFor="hs-credit-account">Credit account</Label>
            <Select
              id="hs-credit-account"
              value={creditAccountId}
              onChange={(e) => setCreditAccountId(e.target.value)}
            >
              <option value="">Select an account…</option>
              {creditAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
        )}
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
