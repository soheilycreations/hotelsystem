"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2, Printer, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatLKR } from "@/lib/utils";
import { useThermalPrint } from "@/hooks/useThermalPrint";
import { setCashierFloat } from "./actions";

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank Transfer",
  complimentary: "Complimentary",
  credit: "Credit",
  owner_paid: "Owner / Boss",
};

interface CreditBillLine {
  label: string;
  amount: number;
}
interface AdvancePaymentLine {
  label: string;
  amount: number;
  method: string;
}

function money(v: number): string {
  return v.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** One receipt-style row — label left, amount right, monospace so columns
 * actually line up like the printed statement does. */
function Row({ label, amount, bold, negative }: { label: string; amount: number; bold?: boolean; negative?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between font-mono text-sm ${bold ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">
        {negative ? `(${money(amount)})` : money(amount)}
      </span>
    </div>
  );
}

function Rule({ heavy }: { heavy?: boolean }) {
  return <div className={`border-t ${heavy ? "border-t-2 border-foreground" : "border-dashed"}`} />;
}

export function SimpleReportView({
  date,
  hotelName,
  pettyCash,
  restaurantRevenue,
  cardPayment,
  bankTransfer,
  creditBills,
  cashExpenses,
  cashBalance,
  creditBillLines,
  advancePayments,
}: {
  date: string;
  hotelName: string;
  pettyCash: number;
  restaurantRevenue: number;
  cardPayment: number;
  bankTransfer: number;
  creditBills: number;
  cashExpenses: number;
  cashBalance: number;
  creditBillLines: CreditBillLine[];
  advancePayments: AdvancePaymentLine[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [floatValue, setFloatValue] = useState(String(pettyCash));
  const [floatError, setFloatError] = useState<string | null>(null);
  const [floatSaved, setFloatSaved] = useState(false);
  const { printStatement, printing, error: printError } = useThermalPrint();

  function goToDate(next: string) {
    startTransition(() => router.push(`/finance/simple-report?date=${next}`));
  }

  function saveFloat() {
    const value = Number(floatValue);
    if (!Number.isFinite(value) || value < 0) {
      setFloatError("Enter a valid amount.");
      return;
    }
    setFloatError(null);
    startTransition(async () => {
      const res = await setCashierFloat(date, value);
      if (res.ok) {
        setFloatSaved(true);
        setTimeout(() => setFloatSaved(false), 2000);
      } else {
        setFloatError(res.error ?? "Could not save.");
      }
    });
  }

  async function handlePrint() {
    await printStatement({
      hotelName,
      date,
      pettyCash,
      restaurantRevenue,
      cardPayment,
      bankTransfer,
      creditBills,
      cashExpenses,
      creditBillLines,
      advancePayments,
    });
  }

  const runningAfterCard = pettyCash + restaurantRevenue - cardPayment;
  const runningAfterBank = runningAfterCard - bankTransfer;
  const runningAfterCredit = runningAfterBank - creditBills;

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      {/* Float + date controls */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4" />
              Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Input type="date" value={date} onChange={(e) => goToDate(e.target.value)} disabled={pending} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4" />
              Petty cash / float
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Set this once when opening the shift — it&apos;s the starting cash in the drawer for
              the day.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="float-amount">Amount (LKR)</Label>
            <div className="flex gap-2">
              <Input
                id="float-amount"
                type="number"
                min="0"
                step="0.01"
                value={floatValue}
                onChange={(e) => setFloatValue(e.target.value)}
              />
              <Button onClick={saveFloat} disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </div>
            {floatSaved && <p className="text-xs text-emerald-500">Saved ✓</p>}
            {floatError && <p className="text-xs text-destructive">{floatError}</p>}
          </CardContent>
        </Card>

        <Button className="w-full" size="lg" onClick={handlePrint} disabled={printing}>
          {printing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
          {printing ? "Printing…" : "Print statement"}
        </Button>
        {printError && <p className="text-xs text-destructive">{printError}</p>}
      </div>

      {/* Receipt-style statement */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{hotelName} — Daily Cashier Report</CardTitle>
          <p className="text-sm text-muted-foreground">{date}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="mx-auto max-w-md space-y-1.5 rounded-lg border bg-muted/20 p-4">
            <Row label="Petty Cash" amount={pettyCash} />
            <Row label="Restaurant Revenue" amount={restaurantRevenue} />
            <Rule />
            <Row label="Total" amount={pettyCash + restaurantRevenue} bold />
            <div className="h-2" />
            <Row label="Card Payment" amount={cardPayment} negative />
            <Rule />
            <Row label="" amount={runningAfterCard} />
            {bankTransfer > 0 && (
              <>
                <Row label="Bank Transfer" amount={bankTransfer} negative />
                <Rule />
                <Row label="" amount={runningAfterBank} />
              </>
            )}
            <Row label="Credit Bills" amount={creditBills} negative />
            <Rule />
            <Row label="" amount={runningAfterCredit} />
            <Row label="Expenses (Cash)" amount={cashExpenses} negative />
            <Rule />
            <Row label="Cash Balance Today" amount={cashBalance} bold />
            <Rule heavy />
          </div>

          {creditBillLines.length > 0 && (
            <div className="mx-auto max-w-md space-y-1.5">
              <p className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Credit Bills
              </p>
              <Rule />
              {creditBillLines.map((l, i) => (
                <Row key={i} label={l.label} amount={l.amount} />
              ))}
            </div>
          )}

          {advancePayments.length > 0 && (
            <div className="mx-auto max-w-md space-y-1.5">
              <p className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Advance Payments
              </p>
              <Rule />
              {advancePayments.map((a, i) => (
                <Row key={i} label={`${a.label} (${PAYMENT_LABEL[a.method] ?? a.method})`} amount={a.amount} />
              ))}
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground">
            {formatLKR(cashBalance)} should be counted in the drawer at close for {date}.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
