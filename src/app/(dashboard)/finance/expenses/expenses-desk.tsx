"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { BadgeDollarSign, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatLKR } from "@/lib/utils";
import type { ExpenseCategory } from "@/lib/types";
import type { ExpenseWithLogger } from "./page";
import { deleteExpense, logExpense } from "../actions";

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  utilities: "Utilities",
  purchasing: "Purchasing",
  salary: "Salary",
  maintenance: "Maintenance",
  marketing: "Marketing",
  function_cost: "Function Cost",
};

const CATEGORY_BADGE: Record<ExpenseCategory, "info" | "success" | "warning" | "danger" | "secondary"> = {
  utilities: "info",
  purchasing: "warning",
  salary: "success",
  maintenance: "danger",
  marketing: "secondary",
  function_cost: "secondary",
};

export function ExpensesDesk({ expenses }: { expenses: ExpenseWithLogger[] }) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const monthTotal = useMemo(() => {
    const now = new Date();
    return expenses
      .filter((e) => {
        const d = new Date(e.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((sum, e) => sum + Number(e.amount), 0);
  }, [expenses]);

  function submit(formData: FormData) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await logExpense(formData);
      if (res.ok) {
        formRef.current?.reset();
        setNotice("Expense logged.");
      } else {
        setError(res.error ?? "Could not log the expense.");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deleteExpense(id);
      if (!res.ok) setError(res.error ?? "Could not delete.");
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      {/* Logger form */}
      <Card className="h-fit lg:sticky lg:top-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BadgeDollarSign className="h-4 w-4" />
            Log an expense
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form ref={formRef} action={submit} className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="exp-category">Category</Label>
                <Select id="exp-category" name="category" defaultValue="purchasing">
                  {(Object.keys(CATEGORY_LABEL) as ExpenseCategory[]).map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exp-date">Date</Label>
                <Input id="exp-date" name="date" type="date" defaultValue={today} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-amount">Amount (LKR)</Label>
              <Input
                id="exp-amount"
                name="amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-desc">Description</Label>
              <Textarea
                id="exp-desc"
                name="description"
                rows={2}
                placeholder="e.g. CEB electricity bill — June"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {notice && <p className="text-sm text-emerald-500">{notice}</p>}
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Log expense"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Recent expenses */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Recent expenses</CardTitle>
          <span className="text-sm text-muted-foreground">
            This month: <span className="font-medium text-foreground">{formatLKR(monthTotal)}</span>
          </span>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Logged by</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-sm">{formatDate(e.date)}</TableCell>
                  <TableCell>
                    <Badge variant={CATEGORY_BADGE[e.category]}>{CATEGORY_LABEL[e.category]}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">
                    {e.description ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {e.staff_profiles?.full_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatLKR(Number(e.amount))}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(e.id)}
                      disabled={pending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {expenses.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No expenses logged yet.
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
