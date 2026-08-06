"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeDollarSign,
  BedDouble,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Loader2,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatLKR } from "@/lib/utils";
import type { HotelSettings, PaymentMethod } from "@/lib/types";
import { generateDailySummaryPdf, openPdfBlob } from "@/lib/report-pdf";

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank Transfer",
  complimentary: "Complimentary",
  credit: "Credit",
};

interface RoomSaleRow {
  guestName: string;
  roomNumber: string;
  planName: string | null;
  amount: number;
  paymentMethod: PaymentMethod;
}
interface ItemSaleRow {
  name: string;
  qty: number;
  revenue: number;
}
interface ExpenseRow {
  category: string;
  description: string | null;
  amount: number;
  paymentMethod: PaymentMethod;
}

export function DailySummaryView({
  date,
  hotel,
  roomSales,
  roomRevenueTotal,
  itemSales,
  posSubtotal,
  posServiceCharge,
  posTotal,
  expenses,
  expensesTotal,
  expensesAgainstRevenue,
  roomExpenses,
  restaurantExpenses,
  creditSales,
  creditAccountBalances,
  roomLedger,
  restaurantLedger,
}: {
  date: string;
  hotel: HotelSettings | null;
  roomSales: RoomSaleRow[];
  roomRevenueTotal: number;
  itemSales: ItemSaleRow[];
  posSubtotal: number;
  posServiceCharge: number;
  posTotal: number;
  expenses: ExpenseRow[];
  expensesTotal: number;
  expensesAgainstRevenue: number;
  roomExpenses: number;
  restaurantExpenses: number;
  creditSales: { source: string; accountName: string; amount: number }[];
  creditAccountBalances: { accountName: string; balance: number }[];
  roomLedger: { opening: number; todayIn: number; todayOut: number; closing: number };
  restaurantLedger: { opening: number; todayIn: number; todayOut: number; closing: number };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [exporting, setExporting] = useState(false);

  const totalRevenue = roomRevenueTotal + posTotal;
  const netCash = totalRevenue - expensesAgainstRevenue;
  const bankTransferTotal = expensesTotal - expensesAgainstRevenue;
  const roomBalance = roomRevenueTotal - roomExpenses;
  const restaurantBalance = posTotal - restaurantExpenses;

  function toDateKey(d: Date): string {
    // Build YYYY-MM-DD from LOCAL date parts — toISOString() would convert to
    // UTC first and silently shift the date by a day in +5:30 timezones.
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function goToDate(next: string) {
    startTransition(() => {
      router.push(`/finance/daily-summary?date=${next}`);
    });
  }

  function shiftDay(delta: number) {
    const d = new Date(`${date}T12:00:00`); // midday avoids DST-edge edge cases
    d.setDate(d.getDate() + delta);
    goToDate(toDateKey(d));
  }

  async function exportPdf() {
    setExporting(true);
    try {
      const blob = await generateDailySummaryPdf({
        date,
        hotelName: hotel?.hotel_name ?? "Soheily PMS",
        roomSales,
        roomRevenueTotal,
        itemSales,
        posSubtotal,
        posServiceCharge,
        posTotal,
        expenses,
        expensesTotal,
        roomExpenses,
        restaurantExpenses,
        roomLedger,
        restaurantLedger,
        creditSales,
        creditAccountBalances,
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Daily Summary</h1>
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

      {/* Room & Restaurant Ledger — cash-only, carried forward day to day */}
      <div className="grid gap-4 sm:grid-cols-2">
        <LedgerCard title="Room" icon={BedDouble} ledger={roomLedger} />
        <LedgerCard title="Restaurant" icon={UtensilsCrossed} ledger={restaurantLedger} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Room revenue" value={formatLKR(roomRevenueTotal)} hint={`${roomSales.length} checkout(s)`} icon={BedDouble} />
        <StatCard title="POS revenue" value={formatLKR(posTotal)} hint={`incl. ${formatLKR(posServiceCharge)} service charge`} icon={UtensilsCrossed} />
        <StatCard title="Expenses" value={formatLKR(expensesTotal)} hint={`${expenses.length} entrie(s)`} icon={Wallet} />
        <StatCard
          title="Net cash balance"
          value={formatLKR(netCash)}
          hint={`Revenue ${formatLKR(totalRevenue)}`}
          icon={BadgeDollarSign}
        />
      </div>

      {/* Room sales */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Room sales — checkouts today</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Guest</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Paid by</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roomSales.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{r.guestName}</TableCell>
                  <TableCell>{r.roomNumber}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.planName ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.paymentMethod === "bank_transfer" ? "warning" : "secondary"}>
                      {PAYMENT_LABEL[r.paymentMethod]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatLKR(r.amount)}</TableCell>
                </TableRow>
              ))}
              {roomSales.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    No checkouts recorded for this date.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Item sales */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Item sales — restaurant / POS</CardTitle>
          <span className="text-sm text-muted-foreground">
            Subtotal {formatLKR(posSubtotal)} · SC {formatLKR(posServiceCharge)}
          </span>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itemSales.map((it) => (
                <TableRow key={it.name}>
                  <TableCell className="font-medium">{it.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{it.qty}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatLKR(it.revenue)}</TableCell>
                </TableRow>
              ))}
              {itemSales.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                    No completed orders for this date.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Expenses */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Expenses</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Paid by</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((e, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {e.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {e.description ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={e.paymentMethod === "bank_transfer" ? "warning" : "secondary"}>
                      {PAYMENT_LABEL[e.paymentMethod]}
                    </Badge>
                    {e.paymentMethod === "bank_transfer" && (
                      <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                        Owner-funded — excluded below
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatLKR(e.amount)}</TableCell>
                </TableRow>
              ))}
              {expenses.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    No expenses logged for this date.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Cash summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cash summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Room revenue</span>
            <span className="tabular-nums">{formatLKR(roomRevenueTotal)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">POS revenue (incl. service charge)</span>
            <span className="tabular-nums">{formatLKR(posTotal)}</span>
          </div>
          <div className="flex items-center justify-between border-t pt-2 text-sm font-medium">
            <span>Total revenue</span>
            <span className="tabular-nums">{formatLKR(totalRevenue)}</span>
          </div>
          <div className="flex items-center justify-between text-sm text-red-500">
            <span>Expenses (against revenue)</span>
            <span className="tabular-nums">−{formatLKR(expensesAgainstRevenue)}</span>
          </div>
          {bankTransferTotal > 0 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Owner bank transfers (excluded)</span>
              <span className="tabular-nums">{formatLKR(bankTransferTotal)}</span>
            </div>
          )}
          <div className="flex items-center justify-between border-t pt-2 text-base font-bold">
            <span>Net cash balance</span>
            <span className={`tabular-nums ${netCash >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {formatLKR(netCash)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Credit accounts */}
      {creditAccountBalances.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Credit accounts — still owing</CardTitle>
            <p className="text-xs text-muted-foreground">
              Balance as of this date — stays here every day until fully repaid, not just the day
              a bill was added.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              {creditAccountBalances.map((a, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                  <p className="truncate font-medium">{a.accountName}</p>
                  <span className="shrink-0 tabular-nums font-medium text-amber-500">
                    {formatLKR(a.balance)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t pt-2 text-sm font-semibold">
                <span>Total outstanding</span>
                <span className="tabular-nums">
                  {formatLKR(creditAccountBalances.reduce((s, a) => s + a.balance, 0))}
                </span>
              </div>
            </div>
            {creditSales.length > 0 && (
              <div className="space-y-1.5 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground">Added today</p>
                {creditSales.map((c, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-muted-foreground">
                      {c.accountName} — {c.source}
                    </span>
                    <span className="shrink-0 tabular-nums">{formatLKR(c.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Room vs Restaurant */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Room vs Restaurant</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border p-3">
            <p className="text-sm font-medium">Room</p>
            <div className="mt-2 space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Revenue</span>
                <span className="tabular-nums">{formatLKR(roomRevenueTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-red-500">
                <span>Expenses</span>
                <span className="tabular-nums">−{formatLKR(roomExpenses)}</span>
              </div>
              <div className="flex items-center justify-between border-t pt-1.5 font-bold">
                <span>Balance</span>
                <span className={roomBalance >= 0 ? "text-emerald-500" : "text-red-500"}>
                  {formatLKR(roomBalance)}
                </span>
              </div>
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-sm font-medium">Restaurant</p>
            <div className="mt-2 space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Revenue</span>
                <span className="tabular-nums">{formatLKR(posTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-red-500">
                <span>Expenses</span>
                <span className="tabular-nums">−{formatLKR(restaurantExpenses)}</span>
              </div>
              <div className="flex items-center justify-between border-t pt-1.5 font-bold">
                <span>Balance</span>
                <span className={restaurantBalance >= 0 ? "text-emerald-500" : "text-red-500"}>
                  {formatLKR(restaurantBalance)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LedgerCard({
  title,
  icon: Icon,
  ledger,
}: {
  title: string;
  icon: typeof BedDouble;
  ledger: { opening: number; todayIn: number; todayOut: number; closing: number };
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4" />
          {title} — cash ledger
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Inhand (yesterday's closing)</span>
          <span className="tabular-nums">{formatLKR(ledger.opening)}</span>
        </div>
        <div className="flex items-center justify-between text-sm text-emerald-500">
          <span>+ Today's cash in</span>
          <span className="tabular-nums">{formatLKR(ledger.todayIn)}</span>
        </div>
        <div className="flex items-center justify-between text-sm text-red-500">
          <span>− Today's cash out</span>
          <span className="tabular-nums">{formatLKR(ledger.todayOut)}</span>
        </div>
        <div className="flex items-center justify-between border-t pt-2 text-base font-bold">
          <span>Balance (carries to tomorrow)</span>
          <span className={ledger.closing >= 0 ? "text-emerald-500" : "text-red-500"}>
            {formatLKR(ledger.closing)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
