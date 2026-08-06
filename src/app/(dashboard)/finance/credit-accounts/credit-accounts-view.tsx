"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CreditCard, Plus, PlusCircle, Receipt, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatLKR } from "@/lib/utils";
import type { CreditAccountWithBalance } from "./page";
import { addCreditAdjustment, createCreditAccount, recordCreditRepayment, updateCreditAccount } from "./actions";

export function CreditAccountsView({
  accounts,
  isAdmin,
}: {
  accounts: CreditAccountWithBalance[];
  isAdmin: boolean;
}) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [repayFor, setRepayFor] = useState<CreditAccountWithBalance | null>(null);
  const [editFor, setEditFor] = useState<CreditAccountWithBalance | null>(null);
  const [adjustFor, setAdjustFor] = useState<CreditAccountWithBalance | null>(null);

  const totalOwed = accounts.reduce((s, a) => s + Math.max(0, a.balance), 0);

  return (
    <div className="space-y-4">
      {feedback && <p className="rounded-md bg-muted px-3 py-2 text-xs">{feedback}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Total outstanding: <span className="font-semibold text-foreground">{formatLKR(totalOwed)}</span>{" "}
          across {accounts.length} account{accounts.length === 1 ? "" : "s"}
        </p>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <UserPlus className="mr-2 h-4 w-4" />
              New account
            </Button>
          </DialogTrigger>
          <AccountDialog
            onDone={(msg) => {
              setAddOpen(false);
              setFeedback(msg);
            }}
          />
        </Dialog>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => (
          <Card key={a.id}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/finance/credit-accounts/${a.id}`} className="truncate font-medium hover:underline">
                    {a.name}
                  </Link>
                  {a.notes && <p className="truncate text-xs text-muted-foreground">{a.notes}</p>}
                </div>
                <Badge variant={a.balance > 0 ? "warning" : "success"}>
                  {a.balance > 0 ? "Owes" : "Clear"}
                </Badge>
              </div>
              <p className={`text-xl font-bold tabular-nums ${a.balance > 0 ? "text-amber-500" : "text-emerald-500"}`}>
                {formatLKR(Math.max(0, a.balance))}
              </p>
              <p className="text-xs text-muted-foreground">
                {a.lastActivity ? `Last activity: ${formatDate(a.lastActivity)}` : "No activity yet"}
              </p>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setRepayFor(a)}>
                  <Receipt className="mr-1.5 h-3.5 w-3.5" />
                  Repayment
                </Button>
                {isAdmin && (
                  <Button size="sm" variant="outline" onClick={() => setAdjustFor(a)}>
                    <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
                    Adjust
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setEditFor(a)}>
                  Edit
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {accounts.length === 0 && (
          <Card className="sm:col-span-2 lg:col-span-3">
            <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
              <CreditCard className="h-5 w-5" />
              No credit accounts yet — add one, then pick "Credit" as the payment method on any
              bill or booking to settle it against this account.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={repayFor !== null} onOpenChange={(open) => !open && setRepayFor(null)}>
        {repayFor && (
          <RepaymentDialog
            account={repayFor}
            onDone={(msg) => {
              setRepayFor(null);
              setFeedback(msg);
            }}
          />
        )}
      </Dialog>

      <Dialog open={editFor !== null} onOpenChange={(open) => !open && setEditFor(null)}>
        {editFor && (
          <AccountDialog
            account={editFor}
            onDone={(msg) => {
              setEditFor(null);
              setFeedback(msg);
            }}
          />
        )}
      </Dialog>

      <Dialog open={adjustFor !== null} onOpenChange={(open) => !open && setAdjustFor(null)}>
        {adjustFor && (
          <AdjustmentDialog
            account={adjustFor}
            onDone={(msg) => {
              setAdjustFor(null);
              setFeedback(msg);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function AccountDialog({
  account,
  onDone,
}: {
  account?: CreditAccountWithBalance;
  onDone: (msg: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editing = Boolean(account);

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = editing
        ? await updateCreditAccount(account!.id, formData)
        : await createCreditAccount(formData);
      if (res.ok) onDone(editing ? "Account updated." : "Credit account added.");
      else setError(res.error ?? "Could not save.");
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{editing ? `Edit — ${account?.name}` : "New credit account"}</DialogTitle>
        <DialogDescription>
          This name shows up in the "Credit" option when settling a bill or booking.
        </DialogDescription>
      </DialogHeader>
      <form action={submit} className="grid gap-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="ca-name">Name</Label>
          <Input id="ca-name" name="name" defaultValue={account?.name} placeholder="e.g. Mr. Ruwan" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ca-notes">Notes (optional)</Label>
          <Textarea id="ca-notes" name="notes" rows={2} defaultValue={account?.notes ?? ""} placeholder="Contact number, arrangement details…" />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="submit" disabled={pending}>
            <Plus className="mr-2 h-4 w-4" />
            {pending ? "Saving…" : editing ? "Save changes" : "Add account"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function RepaymentDialog({
  account,
  onDone,
}: {
  account: CreditAccountWithBalance;
  onDone: (msg: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  function submit(formData: FormData) {
    formData.set("credit_account_id", account.id);
    startTransition(async () => {
      const res = await recordCreditRepayment(formData);
      if (res.ok) onDone(`Repayment recorded for ${account.name}.`);
      else setError(res.error ?? "Could not save.");
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Record repayment — {account.name}</DialogTitle>
        <DialogDescription>
          Currently owes {formatLKR(Math.max(0, account.balance))}. A cash repayment also lands in
          the Cash Book automatically.
        </DialogDescription>
      </DialogHeader>
      <form action={submit} className="grid gap-4 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="rp-amount">Amount (LKR)</Label>
            <Input id="rp-amount" name="amount" type="number" min="0" step="0.01" placeholder="0.00" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rp-date">Date</Label>
            <Input id="rp-date" name="date" type="date" defaultValue={today} required />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rp-method">Received by</Label>
          <Select id="rp-method" name="payment_method" defaultValue="cash">
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank Transfer</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rp-desc">Note (optional)</Label>
          <Input id="rp-desc" name="description" placeholder="e.g. Partial payment" />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="submit" disabled={pending}>
            <Receipt className="mr-2 h-4 w-4" />
            {pending ? "Saving…" : "Record repayment"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function AdjustmentDialog({
  account,
  onDone,
}: {
  account: CreditAccountWithBalance;
  onDone: (msg: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  function submit(formData: FormData) {
    formData.set("credit_account_id", account.id);
    startTransition(async () => {
      const res = await addCreditAdjustment(formData);
      if (res.ok) onDone(`Adjustment added to ${account.name}.`);
      else setError(res.error ?? "Could not save.");
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add manual adjustment — {account.name}</DialogTitle>
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
            <PlusCircle className="mr-2 h-4 w-4" />
            {pending ? "Saving…" : "Add adjustment"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
