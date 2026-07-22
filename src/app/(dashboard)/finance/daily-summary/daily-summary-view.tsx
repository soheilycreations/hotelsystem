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
import type { HotelSettings } from "@/lib/types";
import { generateDailySummaryPdf, openPdfBlob } from "@/lib/report-pdf";

interface RoomSaleRow {
  guestName: string;
  roomNumber: string;
  planName: string | null;
  amount: number;
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
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [exporting, setExporting] = useState(false);

  const totalRevenue = roomRevenueTotal + posTotal;
  const netCash = totalRevenue - expensesTotal;

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
                  <TableCell className="text-right tabular-nums">{formatLKR(r.amount)}</TableCell>
                </TableRow>
              ))}
              {roomSales.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
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
                  <TableCell className="text-right tabular-nums">{formatLKR(e.amount)}</TableCell>
                </TableRow>
              ))}
              {expenses.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
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
            <span>Total expenses</span>
            <span className="tabular-nums">−{formatLKR(expensesTotal)}</span>
          </div>
          <div className="flex items-center justify-between border-t pt-2 text-base font-bold">
            <span>Net cash balance</span>
            <span className={`tabular-nums ${netCash >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {formatLKR(netCash)}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
