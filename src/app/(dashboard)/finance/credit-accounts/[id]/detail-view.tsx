"use client";

import Link from "next/link";
import { Fragment, useState, useTransition } from "react";
import { ArrowLeft, ChevronDown, FileDown, Loader2, PlusCircle, Receipt, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatDate, formatLKR } from "@/lib/utils";
import type { CreditAccount } from "@/lib/types";
import { addCreditAdjustment } from "../actions";
import { generateCreditStatementPdf, openPdfBlob } from "@/lib/report-pdf";

const KIND_BADGE = {
  charge: { label: "Bill", variant: "warning" as const },
  adjustment: { label: "Adjustment", variant: "secondary" as const },
  repayment: { label: "Repayment", variant: "success" as const },
};

export function CreditAccountDetailView({
  account,
  entries,
  balance,
  isAdmin,
  hotelName,
}: {
  account: CreditAccount;
  entries: (import("./page").CreditLedgerEntry & { balance: number })[];
  balance: number;
  isAdmin: boolean;
  hotelName: string;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  async function exportPdf() {
    setExporting(true);
    try {
      const blob = await generateCreditStatementPdf({
        hotelName,
        accountName: account.name,
        accountNotes: account.notes,
        balance,
        entries: entries
          .slice()
          .reverse() // oldest first for a statement, same order the ledger builds in
          .map((e) => ({
            date: e.date,
            kind: e.kind,
            description: e.description,
            amount: e.amount,
            balance: e.balance,
            items: e.items,
          })),
      });
      openPdfBlob(blob);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="ghost" asChild>
          <Link href="/finance/credit-accounts">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{account.name}</h1>
          {account.notes && <p className="text-sm text-muted-foreground">{account.notes}</p>}
        </div>
      </div>

      {feedback && <p className="rounded-md bg-muted px-3 py-2 text-xs">{feedback}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Card className="flex-1">
          <CardContent className="flex items-center justify-between p-4">
            <span className="text-sm text-muted-foreground">Currently owes</span>
            <span className={`text-2xl font-bold tabular-nums ${balance > 0 ? "text-amber-500" : "text-emerald-500"}`}>
              {formatLKR(Math.max(0, balance))}
            </span>
          </CardContent>
        </Card>
        <Button variant="outline" onClick={exportPdf} disabled={exporting}>
          {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
          Export PDF
        </Button>
        {isAdmin && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <PlusCircle className="mr-2 h-4 w-4" />
                Add adjustment
              </Button>
            </DialogTrigger>
            <AdjustmentDialog
              accountId={account.id}
              onDone={(msg) => {
                setAddOpen(false);
                setFeedback(msg);
              }}
            />
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bill-by-bill history</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e, i) => {
                const expandable = Boolean(e.orderId);
                const isOpen = expandable && expandedIdx === i;
                return (
                  <Fragment key={i}>
                    <TableRow
                      className={expandable ? "cursor-pointer" : undefined}
                      onClick={expandable ? () => setExpandedIdx(isOpen ? null : i) : undefined}
                    >
                      <TableCell className="whitespace-nowrap text-sm">{formatDate(e.date)}</TableCell>
                      <TableCell>
                        <Badge variant={KIND_BADGE[e.kind].variant}>{KIND_BADGE[e.kind].label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          {e.description}
                          {expandable && (
                            <ChevronDown
                              className={cn("h-3.5 w-3.5 shrink-0 transition-transform", isOpen && "rotate-180")}
                            />
                          )}
                        </span>
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${e.amount >= 0 ? "" : "text-emerald-500"}`}
                      >
                        {e.amount >= 0 ? "+" : "−"}
                        {formatLKR(Math.abs(e.amount))}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatLKR(e.balance)}</TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow>
                        <TableCell colSpan={5} className="bg-muted/30 px-6 py-3">
                          <div className="space-y-1.5">
                            {(e.items ?? []).map((it, j) => (
                              <div key={j} className="flex items-center justify-between gap-2 text-sm">
                                <span className="truncate">
                                  {it.name} <span className="text-muted-foreground">×{it.qty}</span>
                                </span>
                                <span className="shrink-0 tabular-nums text-muted-foreground">
                                  {formatLKR(it.unitPrice)} each · {formatLKR(it.lineTotal)}
                                </span>
                              </div>
                            ))}
                            {(e.items ?? []).length === 0 && (
                              <p className="text-sm text-muted-foreground">No items on this bill.</p>
                            )}
                          </div>
                          <div className="mt-3 space-y-1 border-t pt-2 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Subtotal</span>
                              <span className="tabular-nums">{formatLKR(e.subtotal ?? 0)}</span>
                            </div>
                            {(e.serviceCharge ?? 0) > 0 && (
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Service charge</span>
                                <span className="tabular-nums">{formatLKR(e.serviceCharge ?? 0)}</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between font-semibold">
                              <span>Total</span>
                              <span className="tabular-nums">{formatLKR(e.amount)}</span>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    No activity yet — settle a bill or booking to "Credit" against this account to
                    get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function AdjustmentDialog({
  accountId,
  onDone,
}: {
  accountId: string;
  onDone: (msg: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  function submit(formData: FormData) {
    formData.set("credit_account_id", accountId);
    startTransition(async () => {
      const res = await addCreditAdjustment(formData);
      if (res.ok) onDone("Adjustment added.");
      else setError(res.error ?? "Could not save.");
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-500" />
          Add manual adjustment
        </DialogTitle>
        <DialogDescription>
          For old bills that can't be individually found and retagged — adds straight to what
          this account owes. Admin only.
        </DialogDescription>
      </DialogHeader>
      <form action={submit} className="grid gap-4 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="adj-amount">Amount (LKR)</Label>
            <Input id="adj-amount" name="amount" type="number" min="0" step="0.01" placeholder="0.00" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adj-date">Date</Label>
            <Input id="adj-date" name="date" type="date" defaultValue={today} required />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="adj-desc">Description</Label>
          <Input id="adj-desc" name="description" placeholder="e.g. Old bills before this system, June–July" />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="submit" disabled={pending}>
            <Receipt className="mr-2 h-4 w-4" />
            {pending ? "Saving…" : "Add adjustment"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
