"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarRange,
  FileDown,
  Loader2,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatCard } from "@/components/stat-card";
import { formatLKR } from "@/lib/utils";
import { generateCashBookPdf, openPdfBlob } from "@/lib/report-pdf";
import type { CashMovement } from "@/lib/types";
import type { CashDayRow, CashLedgerEntry } from "./page";
import { createCashMovement, deleteCashMovement } from "./actions";

const CATEGORY_PRESETS = [
  "Bank Deposit",
  "Bank Withdrawal",
  "Owner Withdrawal",
  "Float Top-up",
  "Other",
];

interface TooltipEntry {
  name?: string;
  value?: number | string;
  color?: string;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      {label && <p className="mb-1 font-medium">{label}</p>}
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.name}: <span className="tabular-nums">{formatLKR(Number(entry.value ?? 0))}</span>
        </p>
      ))}
    </div>
  );
}

function DateRangePicker({ fromDate, toDate }: { fromDate: string; toDate: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState(fromDate);
  const [to, setTo] = useState(toDate);

  function apply(nextFrom: string, nextTo: string) {
    startTransition(() => {
      router.push(`/finance/cash-book?from=${nextFrom}&to=${nextTo}`);
    });
  }

  function presetThisMonth() {
    const now = new Date();
    const first = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const t = now.toISOString().slice(0, 10);
    setFrom(first);
    setTo(t);
    apply(first, t);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <CalendarRange className="h-4 w-4 text-muted-foreground" />
      <Input
        type="date"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        onBlur={() => apply(from, to)}
        className="h-8 w-36 text-xs"
        disabled={pending}
      />
      <span className="text-sm text-muted-foreground">to</span>
      <Input
        type="date"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        onBlur={() => apply(from, to)}
        className="h-8 w-36 text-xs"
        disabled={pending}
      />
      <Button size="sm" variant="outline" onClick={presetThisMonth} disabled={pending}>
        This month
      </Button>
      {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
    </div>
  );
}

export function CashBookView({
  fromDate,
  toDate,
  hotelName,
  openingBalance,
  closingBalance,
  days,
  movements,
  ledger,
  roomRevenue,
  roomExpenses,
  restaurantRevenue,
  restaurantExpenses,
}: {
  fromDate: string;
  toDate: string;
  hotelName: string;
  openingBalance: number;
  closingBalance: number;
  days: CashDayRow[];
  movements: CashMovement[];
  ledger: CashLedgerEntry[];
  roomRevenue: number;
  roomExpenses: number;
  restaurantRevenue: number;
  restaurantExpenses: number;
}) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [pending, startTransition] = useTransition();

  const totalIn = days.reduce((s, d) => s + d.cashIn, 0);
  const totalOut = days.reduce((s, d) => s + d.cashOut, 0);
  const roomBalance = roomRevenue - roomExpenses;
  const restaurantBalance = restaurantRevenue - restaurantExpenses;

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deleteCashMovement(id);
      setFeedback(res.ok ? "Movement removed." : res.error ?? "Could not delete.");
    });
  }

  async function exportPdf() {
    setExporting(true);
    try {
      const blob = await generateCashBookPdf({
        hotelName,
        fromDate,
        toDate,
        openingBalance,
        closingBalance,
        totalIn,
        totalOut,
        ledger,
        roomRevenue,
        roomExpenses,
        restaurantRevenue,
        restaurantExpenses,
      });
      openPdfBlob(blob);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {feedback && <p className="rounded-md bg-muted px-3 py-2 text-xs">{feedback}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangePicker fromDate={fromDate} toDate={toDate} />
        <Button variant="outline" onClick={exportPdf} disabled={exporting}>
          {exporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileDown className="mr-2 h-4 w-4" />
          )}
          Export PDF
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Opening balance" value={formatLKR(openingBalance)} hint={fromDate} icon={Wallet} />
        <StatCard title="Cash in" value={formatLKR(totalIn)} hint="Bookings + POS + deposits" icon={ArrowUpCircle} />
        <StatCard title="Cash out" value={formatLKR(totalOut)} hint="Expenses + withdrawals" icon={ArrowDownCircle} />
        <StatCard
          title="Closing balance"
          value={formatLKR(closingBalance)}
          hint={toDate}
          icon={Wallet}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily cash movement &amp; running balance</CardTitle>
        </CardHeader>
        <CardContent className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={days} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={64}
                tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="cashIn" name="Cash in" fill="#34d399" radius={[3, 3, 0, 0]} />
              <Bar dataKey="cashOut" name="Cash out" fill="#f87171" radius={[3, 3, 0, 0]} />
              <Line
                type="monotone"
                dataKey="closingBalance"
                name="Running balance"
                stroke="#38bdf8"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <AddMovementForm onDone={setFeedback} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cash movements — this range</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap text-sm">{m.date}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        {m.direction === "in" ? (
                          <ArrowUpCircle className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <ArrowDownCircle className="h-3.5 w-3.5 text-red-500" />
                        )}
                        {m.category}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">
                      {m.description ?? "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium tabular-nums ${
                        m.direction === "in" ? "text-emerald-500" : "text-red-500"
                      }`}
                    >
                      {m.direction === "in" ? "+" : "−"}
                      {formatLKR(Number(m.amount))}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(m.id)}
                        disabled={pending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {movements.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      No manual cash movements logged in this range.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Room vs Restaurant (cash only, this range) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Room vs Restaurant (cash, this range)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border p-3">
            <p className="text-sm font-medium">Room</p>
            <div className="mt-2 space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Cash in</span>
                <span className="tabular-nums">{formatLKR(roomRevenue)}</span>
              </div>
              <div className="flex items-center justify-between text-red-500">
                <span>Cash out</span>
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
                <span className="text-muted-foreground">Cash in</span>
                <span className="tabular-nums">{formatLKR(restaurantRevenue)}</span>
              </div>
              <div className="flex items-center justify-between text-red-500">
                <span>Cash out</span>
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

function AddMovementForm({ onDone }: { onDone: (msg: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createCashMovement(formData);
      if (res.ok) onDone("Cash movement logged.");
      else setError(res.error ?? "Could not save.");
    });
  }

  return (
    <Card className="h-fit lg:sticky lg:top-6">
      <CardHeader>
        <CardTitle className="text-base">Add cash movement</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={submit} className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cm-direction">Direction</Label>
              <Select id="cm-direction" name="direction" defaultValue="out">
                <option value="in">Cash in (+)</option>
                <option value="out">Cash out (−)</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cm-date">Date</Label>
              <Input id="cm-date" name="date" type="date" defaultValue={today} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cm-category">Category</Label>
            <Select id="cm-category" name="category" defaultValue="Bank Deposit">
              {CATEGORY_PRESETS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cm-amount">Amount (LKR)</Label>
            <Input id="cm-amount" name="amount" type="number" min="0" step="0.01" placeholder="0.00" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cm-desc">Description (optional)</Label>
            <Input id="cm-desc" name="description" placeholder="e.g. Deposited at BOC Kalutara" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending}>
            <Plus className="mr-2 h-4 w-4" />
            {pending ? "Saving…" : "Log movement"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
