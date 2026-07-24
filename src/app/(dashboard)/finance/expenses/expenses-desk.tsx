"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { BadgeDollarSign, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
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
import type { ExpenseCategoryRow } from "@/lib/types";
import type { ExpenseWithLogger } from "./page";
import {
  createExpenseCategory,
  deleteExpense,
  deleteExpenseCategory,
  logExpense,
  renameExpenseCategory,
} from "../actions";

const BADGE_CYCLE = ["info", "warning", "success", "danger", "secondary"] as const;

export function ExpensesDesk({
  expenses,
  categories,
}: {
  expenses: ExpenseWithLogger[];
  categories: ExpenseCategoryRow[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const badgeByCategory = useMemo(() => {
    const map = new Map<string, (typeof BADGE_CYCLE)[number]>();
    categories.forEach((c, i) => map.set(c.id, BADGE_CYCLE[i % BADGE_CYCLE.length] ?? "secondary"));
    return map;
  }, [categories]);

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
                    <Badge variant={badgeByCategory.get(e.category_id) ?? "secondary"}>
                      {e.expense_categories?.name ?? "—"}
                    </Badge>
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
