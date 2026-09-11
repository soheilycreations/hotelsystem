"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeDollarSign, CalendarRange, FileDown, Loader2, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
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
import { generateExpensesReportPdf, openPdfBlob } from "@/lib/report-pdf";
import type { ExpenseCategoryRow, HotelSettings, PaymentMethod } from "@/lib/types";
import type { ExpenseWithLogger } from "./page";
import {
  createExpenseCategory,
  deleteExpense,
  deleteExpenseCategory,
  logExpense,
  renameExpenseCategory,
  updateExpense,
} from "../actions";

const BADGE_CYCLE = ["info", "warning", "success", "danger", "secondary"] as const;

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank Transfer",
  complimentary: "Complimentary",
  credit: "Credit",
  owner_paid: "Owner / Boss",
};

const PAYMENT_BADGE: Record<PaymentMethod, "success" | "info" | "warning" | "secondary"> = {
  cash: "success",
  card: "info",
  bank_transfer: "warning",
  complimentary: "secondary",
  credit: "warning",
  owner_paid: "secondary",
};

export function ExpensesDesk({
  expenses,
  categories,
  hotel,
  fromDate,
  toDate,
}: {
  expenses: ExpenseWithLogger[];
  categories: ExpenseCategoryRow[];
  hotel: HotelSettings | null;
  fromDate: string;
  toDate: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseWithLogger | null>(null);
  const [exporting, setExporting] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const badgeByCategory = useMemo(() => {
    const map = new Map<string, (typeof BADGE_CYCLE)[number]>();
    categories.forEach((c, i) => map.set(c.id, BADGE_CYCLE[i % BADGE_CYCLE.length] ?? "secondary"));
    return map;
  }, [categories]);

  const rangeTotal = useMemo(() => expenses.reduce((sum, e) => sum + Number(e.amount), 0), [expenses]);

  async function exportPdf() {
    setExporting(true);
    try {
      const blob = await generateExpensesReportPdf({
        hotelName: hotel?.hotel_name ?? "Soheily PMS",
        fromDate,
        toDate,
        entries: expenses.map((e) => ({
          date: e.date,
          category: e.expense_categories?.name ?? "Uncategorised",
          description: e.description,
          division: e.division,
          paymentMethod: e.payment_method,
          amount: Number(e.amount),
          loggedBy: e.staff_profiles?.full_name ?? null,
        })),
      });
      openPdfBlob(blob);
    } finally {
      setExporting(false);
    }
  }

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
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <BadgeDollarSign className="h-4 w-4" />
            Log an expense
          </CardTitle>
          <Dialog open={categoriesOpen} onOpenChange={setCategoriesOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="outline" className="h-8 w-8" title="Manage categories">
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            </DialogTrigger>
            <CategoriesDialog
              categories={categories}
              expenseCountByCategory={Object.fromEntries(
                categories.map((c) => [c.id, expenses.filter((e) => e.category_id === c.id).length])
              )}
              onFeedback={setNotice}
            />
          </Dialog>
        </CardHeader>
        <CardContent>
          <form ref={formRef} action={submit} className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="exp-category">Category</Label>
                <Select id="exp-category" name="category_id" defaultValue={categories[0]?.id}>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exp-date">Date</Label>
                <Input id="exp-date" name="date" type="date" defaultValue={today} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
                <Label htmlFor="exp-payment">Paid by</Label>
                <Select id="exp-payment" name="payment_method" defaultValue="cash">
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="owner_paid">Owner / Boss (not cash drawer)</option>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-division">Allocate to</Label>
              <Select id="exp-division" name="division" defaultValue="restaurant">
                <option value="restaurant">Restaurant</option>
                <option value="room">Room</option>
              </Select>
              <p className="text-xs text-muted-foreground">
                Decides which P&amp;L (Room or Restaurant) this expense counts against.
              </p>
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
            <Button type="submit" disabled={pending || categories.length === 0}>
              {pending ? "Saving…" : "Log expense"}
            </Button>
            {categories.length === 0 && (
              <p className="text-xs text-amber-500">
                No categories yet — add one via the gear icon above.
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Recent expenses */}
      <Card>
        <CardHeader className="flex-col items-start gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Expenses</CardTitle>
            <span className="text-sm text-muted-foreground">
              This range: <span className="font-medium text-foreground">{formatLKR(rangeTotal)}</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker fromDate={fromDate} toDate={toDate} />
            <Button size="sm" variant="outline" onClick={exportPdf} disabled={exporting}>
              {exporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="mr-2 h-4 w-4" />
              )}
              Export PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Paid by</TableHead>
                <TableHead>Division</TableHead>
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
                    <Badge variant={badgeByCategory.get(e.category_id) ?? "secondary"}>
                      {e.expense_categories?.name ?? "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">
                    {e.description ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={PAYMENT_BADGE[e.payment_method]}>
                      {PAYMENT_LABEL[e.payment_method]}
                    </Badge>
                    {e.payment_method === "bank_transfer" && (
                      <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                        Owner-funded — excluded from Net Profit
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={e.division === "room" ? "info" : "secondary"} className="capitalize">
                      {e.division}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {e.staff_profiles?.full_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatLKR(Number(e.amount))}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => setEditingExpense(e)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(e.id)}
                        disabled={pending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {expenses.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    No expenses logged yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={editingExpense !== null} onOpenChange={(open) => !open && setEditingExpense(null)}>
        {editingExpense && (
          <EditExpenseDialog
            expense={editingExpense}
            categories={categories}
            onDone={(msg) => {
              setEditingExpense(null);
              setNotice(msg);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function DateRangePicker({ fromDate, toDate }: { fromDate: string; toDate: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState(fromDate);
  const [to, setTo] = useState(toDate);

  function apply(nextFrom: string, nextTo: string) {
    startTransition(() => router.push(`/finance/expenses?from=${nextFrom}&to=${nextTo}`));
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
      {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
    </div>
  );
}

function EditExpenseDialog({
  expense,
  categories,
  onDone,
}: {
  expense: ExpenseWithLogger;
  categories: ExpenseCategoryRow[];
  onDone: (msg: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = await updateExpense(expense.id, formData);
      if (res.ok) onDone("Expense updated.");
      else setError(res.error ?? "Could not save.");
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Edit expense</DialogTitle>
        <DialogDescription>
          Change the category, allocation, amount, or how it was paid.
        </DialogDescription>
      </DialogHeader>
      <form action={submit} className="grid gap-4 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ee-category">Category</Label>
            <Select id="ee-category" name="category_id" defaultValue={expense.category_id}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ee-date">Date</Label>
            <Input id="ee-date" name="date" type="date" defaultValue={expense.date} required />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ee-amount">Amount (LKR)</Label>
            <Input
              id="ee-amount"
              name="amount"
              type="number"
              min="0"
              step="0.01"
              defaultValue={expense.amount}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ee-payment">Paid by</Label>
            <Select id="ee-payment" name="payment_method" defaultValue={expense.payment_method}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="owner_paid">Owner / Boss (not cash drawer)</option>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ee-division">Allocate to</Label>
          <Select id="ee-division" name="division" defaultValue={expense.division}>
            <option value="restaurant">Restaurant</option>
            <option value="room">Room</option>
          </Select>
          <p className="text-xs text-muted-foreground">
            Decides which P&amp;L (Room or Restaurant) this expense counts against.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ee-desc">Description</Label>
          <Textarea id="ee-desc" name="description" rows={2} defaultValue={expense.description ?? ""} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function CategoriesDialog({
  categories,
  expenseCountByCategory,
  onFeedback,
}: {
  categories: ExpenseCategoryRow[];
  expenseCountByCategory: Record<string, number>;
  onFeedback: (msg: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [newName, setNewName] = useState("");

  function addCategory() {
    if (!newName.trim()) return;
    const fd = new FormData();
    fd.set("name", newName.trim());
    startTransition(async () => {
      const res = await createExpenseCategory(fd);
      if (res.ok) {
        setNewName("");
        onFeedback(`Category "${newName.trim()}" added.`);
      } else {
        setError(res.error ?? "Could not add the category.");
      }
    });
  }

  function saveRename(id: string) {
    if (!renameValue.trim()) return;
    const fd = new FormData();
    fd.set("name", renameValue.trim());
    startTransition(async () => {
      const res = await renameExpenseCategory(id, fd);
      if (res.ok) {
        setRenamingId(null);
        onFeedback("Category renamed.");
      } else {
        setError(res.error ?? "Could not rename.");
      }
    });
  }

  function remove(c: ExpenseCategoryRow) {
    startTransition(async () => {
      const res = await deleteExpenseCategory(c.id);
      onFeedback(res.ok ? `Category "${c.name}" deleted.` : res.error ?? "Could not delete.");
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Expense categories</DialogTitle>
        <DialogDescription>
          These group expenses on this page and the P&amp;L report&apos;s expense breakdown.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2 py-2">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
            {renamingId === c.id ? (
              <>
                <Input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="h-8"
                />
                <Button size="sm" disabled={pending} onClick={() => saveRename(c.id)}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRenamingId(null)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">
                  {expenseCountByCategory[c.id] ?? 0} expense(s)
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => {
                    setRenamingId(c.id);
                    setRenameValue(c.name);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  disabled={pending || (expenseCountByCategory[c.id] ?? 0) > 0}
                  title={
                    (expenseCountByCategory[c.id] ?? 0) > 0
                      ? "Still used by expenses — can't delete"
                      : "Delete category"
                  }
                  onClick={() => remove(c)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        ))}
        {categories.length === 0 && (
          <p className="text-sm text-muted-foreground">No categories yet.</p>
        )}

        <div className="flex items-center gap-2 pt-2">
          <Input
            placeholder="New category name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-8"
          />
          <Button size="sm" disabled={pending || !newName.trim()} onClick={addCategory}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Done</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  );
}
