"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Loader2,
  Receipt,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatLKR, formatOrderNumber, cn } from "@/lib/utils";
import type { PaymentMethod } from "@/lib/types";
import { generateBillsReportPdf, openPdfBlob } from "@/lib/report-pdf";

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank Transfer",
  complimentary: "Complimentary",
  credit: "Credit",
  owner_paid: "Owner / Boss",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

interface BillItem {
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

interface Bill {
  orderId: string;
  orderNumber: number;
  channel: string;
  reference: string;
  openedAt: string;
  settledAt: string | null;
  paymentMethod: PaymentMethod | null;
  cashierName: string | null;
  subtotal: number;
  serviceCharge: number;
  amount: number;
  items: BillItem[];
}

export function BillsView({ date, hotelName, bills }: { date: string; hotelName: string; bills: Bill[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [exporting, setExporting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function goToDate(next: string) {
    startTransition(() => {
      router.push(`/finance/bills?date=${next}`);
    });
  }

  function shiftDay(delta: number) {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + delta);
    goToDate(toDateKey(d));
  }

  async function exportPdf() {
    setExporting(true);
    try {
      const blob = await generateBillsReportPdf({
        date,
        hotelName,
        bills: bills.map((b) => ({
          orderNumber: b.orderNumber,
          channel: b.channel,
          reference: b.reference,
          openedAt: b.openedAt,
          settledAt: b.settledAt,
          paymentMethod: b.paymentMethod,
          cashierName: b.cashierName,
          subtotal: b.subtotal,
          serviceCharge: b.serviceCharge,
          amount: b.amount,
          items: b.items,
        })),
      });
      openPdfBlob(blob);
    } finally {
      setExporting(false);
    }
  }

  const prettyDate = new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const totalItems = bills.reduce((sum, b) => sum + b.items.reduce((s, it) => s + it.qty, 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bills</h1>
          <p className="text-sm text-muted-foreground">{prettyDate}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={() => shiftDay(-1)} disabled={pending}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="date"
              value={date}
              onChange={(e) => goToDate(e.target.value)}
              className="w-44 pl-8"
              disabled={pending}
            />
          </div>
          <Button size="icon" variant="outline" onClick={() => shiftDay(1)} disabled={pending}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={exportPdf} disabled={exporting}>
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="mr-2 h-4 w-4" />
            )}
            Export PDF
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>{bills.length} bill(s)</span>
        <span>·</span>
        <span>{totalItems} items sold</span>
      </div>

      <div className="space-y-2">
        {bills.length === 0 && (
          <div className="rounded-lg border py-12 text-center text-sm text-muted-foreground">
            No bills settled for this date.
          </div>
        )}

        {bills.map((b) => {
          const isOpen = expandedId === b.orderId;
          return (
            <div key={b.orderId} className="overflow-hidden rounded-lg border">
              <button
                type="button"
                onClick={() => setExpandedId(isOpen ? null : b.orderId)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/50"
              >
                <Receipt className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-medium">
                    <span>#{formatOrderNumber(date, b.orderNumber)}</span>
                    <span className="text-muted-foreground">·</span>
                    <span>{b.channel}</span>
                    <span className="text-xs font-normal text-muted-foreground">{b.reference}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Opened {formatTime(b.openedAt)} · Settled {b.settledAt ? formatTime(b.settledAt) : "—"}
                    {b.cashierName ? ` · Cashier: ${b.cashierName}` : ""}
                  </p>
                </div>
                <Badge variant={b.paymentMethod === "bank_transfer" ? "warning" : "secondary"}>
                  {b.paymentMethod ? PAYMENT_LABEL[b.paymentMethod] : "—"}
                </Badge>
                <span className="w-24 shrink-0 text-right font-semibold tabular-nums">{formatLKR(b.amount)}</span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
              </button>

              {isOpen && (
                <div className="border-t bg-muted/30 px-4 py-3">
                  <div className="space-y-1.5">
                    {b.items.map((it, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">
                          {it.name} <span className="text-muted-foreground">×{it.qty}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {formatLKR(it.unitPrice)} each · {formatLKR(it.lineTotal)}
                        </span>
                      </div>
                    ))}
                    {b.items.length === 0 && (
                      <p className="text-sm text-muted-foreground">No items on this bill.</p>
                    )}
                  </div>
                  <div className="mt-3 space-y-1 border-t pt-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="tabular-nums">{formatLKR(b.subtotal)}</span>
                    </div>
                    {b.serviceCharge > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Service charge</span>
                        <span className="tabular-nums">{formatLKR(b.serviceCharge)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between font-semibold">
                      <span>Total</span>
                      <span className="tabular-nums">{formatLKR(b.amount)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
