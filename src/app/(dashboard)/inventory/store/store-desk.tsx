"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  ChefHat,
  Loader2,
  Package,
  Pencil,
  Plus,
} from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";
import { colomboToday } from "@/lib/colombo-date";
import { cn } from "@/lib/utils";
import type { InventoryItem, StoreItem, StoreTransaction } from "@/lib/types";
import { createStoreItem, issueStoreToKitchen, recordStoreTransaction, updateStoreItem } from "./actions";

const NONE_VALUE = "__none__";

export function StoreDesk({
  items,
  inventoryItems,
  canManage,
}: {
  items: StoreItem[];
  inventoryItems: Pick<InventoryItem, "id" | "name" | "unit">[];
  canManage: boolean;
}) {
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<StoreItem | null>(null);
  const [stockDialog, setStockDialog] = useState<{ item: StoreItem; direction: "IN" | "OUT" } | null>(null);
  const [issuing, setIssuing] = useState<StoreItem | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, query]);

  const lowCount = useMemo(
    () => items.filter((i) => Number(i.current_stock) <= Number(i.reorder_level)).length,
    [items]
  );

  return (
    <div className="space-y-4">
      <Tabs defaultValue="dashboard">
        <div className="flex flex-wrap items-center gap-3">
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="history">Daily History</TabsTrigger>
          </TabsList>
          <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
            {lowCount > 0 && (
              <Badge variant="warning">
                <AlertTriangle className="mr-1 h-3 w-3" />
                {lowCount} below reorder level
              </Badge>
            )}
            {canManage && (
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    New store item
                  </Button>
                </DialogTrigger>
                <ItemDialog
                  inventoryItems={inventoryItems}
                  onDone={(msg) => {
                    setAddOpen(false);
                    setFeedback(msg);
                  }}
                />
              </Dialog>
            )}
          </div>
        </div>

        {feedback && <p className="mt-3 rounded-md bg-muted px-3 py-2 text-xs">{feedback}</p>}

        <TabsContent value="dashboard">
          <div className="space-y-4">
            <Input
              placeholder="Search store items…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="max-w-xs"
            />
            <Card>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">In stock</TableHead>
                      <TableHead className="text-right">Reorder at</TableHead>
                      <TableHead>Kitchen link</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-64" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((item) => {
                      const stock = Number(item.current_stock);
                      const reorder = Number(item.reorder_level);
                      const low = stock <= reorder;
                      const critical = stock <= 0 || stock < reorder * 0.5;
                      return (
                        <TableRow key={item.id} className={low ? "bg-amber-500/5" : ""}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {stock.toLocaleString()} {item.unit}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {reorder.toLocaleString()} {item.unit}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {item.inventory_items ? (
                              <span className="inline-flex items-center gap-1">
                                <ChefHat className="h-3.5 w-3.5" />
                                {item.inventory_items.name}
                              </span>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell>
                            {critical ? (
                              <Badge variant="danger">Critical</Badge>
                            ) : low ? (
                              <Badge variant="warning">Low</Badge>
                            ) : (
                              <Badge variant="success">OK</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {canManage && (
                              <div className="flex flex-wrap justify-end gap-1">
                                <Button size="sm" variant="outline" onClick={() => setStockDialog({ item, direction: "IN" })}>
                                  <ArrowDownToLine className="mr-1.5 h-3.5 w-3.5" />
                                  In
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setStockDialog({ item, direction: "OUT" })}>
                                  <ArrowUpFromLine className="mr-1.5 h-3.5 w-3.5" />
                                  Out
                                </Button>
                                <Button size="sm" onClick={() => setIssuing(item)}>
                                  <ChefHat className="mr-1.5 h-3.5 w-3.5" />
                                  Issue to kitchen
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(item)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                          No store items match your search.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <DailyHistory />
        </TabsContent>
      </Tabs>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing && (
          <ItemDialog
            key={editing.id}
            item={editing}
            inventoryItems={inventoryItems}
            onDone={(msg) => {
              setEditing(null);
              setFeedback(msg);
            }}
          />
        )}
      </Dialog>

      <Dialog open={stockDialog !== null} onOpenChange={(open) => !open && setStockDialog(null)}>
        {stockDialog && (
          <StockDialog
            item={stockDialog.item}
            direction={stockDialog.direction}
            onDone={(msg) => {
              setStockDialog(null);
              setFeedback(msg);
            }}
          />
        )}
      </Dialog>

      <Dialog open={issuing !== null} onOpenChange={(open) => !open && setIssuing(null)}>
        {issuing && (
          <IssueDialog
            item={issuing}
            onDone={(msg) => {
              setIssuing(null);
              setFeedback(msg);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function ItemDialog({
  item,
  inventoryItems,
  onDone,
}: {
  item?: StoreItem;
  inventoryItems: Pick<InventoryItem, "id" | "name" | "unit">[];
  onDone: (msg: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = item ? await updateStoreItem(item.id, formData) : await createStoreItem(formData);
      if (res.ok) onDone(item ? `${item.name} updated.` : "New store item added.");
      else setError(res.error ?? "Could not save.");
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{item ? `Edit — ${item.name}` : "New store item"}</DialogTitle>
        <DialogDescription>
          {item
            ? "Stock quantity isn't changed here — use Stock In / Out or Issue to kitchen for that."
            : "Add a store-room item. Link it to a kitchen inventory item so issuing to the kitchen tops that item's stock up automatically."}
        </DialogDescription>
      </DialogHeader>
      <form action={submit} className="grid gap-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="store-name">Name</Label>
          <Input id="store-name" name="name" placeholder="e.g. Dishwashing liquid" defaultValue={item?.name} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="store-unit">Unit</Label>
            <Input id="store-unit" name="unit" placeholder="pcs / kg / bottle" defaultValue={item?.unit ?? "pcs"} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="store-reorder">Reorder level</Label>
            <Input
              id="store-reorder"
              name="reorder_level"
              type="number"
              min="0"
              step="any"
              defaultValue={item ? Number(item.reorder_level) : 0}
            />
          </div>
        </div>
        {!item && (
          <div className="space-y-1.5">
            <Label htmlFor="store-opening">Opening stock</Label>
            <Input id="store-opening" name="current_stock" type="number" min="0" step="any" defaultValue="0" />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="store-link">Kitchen inventory link (optional)</Label>
          <Select id="store-link" name="linked_inventory_item_id" defaultValue={item?.linked_inventory_item_id ?? NONE_VALUE}>
            <option value={NONE_VALUE}>Not linked — doesn&apos;t go to the kitchen</option>
            {inventoryItems.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.unit})
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            When set, &ldquo;Issue to kitchen&rdquo; for this item also adds the same quantity to this
            kitchen ingredient&apos;s stock — enter quantities in the same unit as that ingredient.
          </p>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Package className="mr-2 h-4 w-4" />}
            {pending ? "Saving…" : item ? "Save changes" : "Add item"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function StockDialog({
  item,
  direction,
  onDone,
}: {
  item: StoreItem;
  direction: "IN" | "OUT";
  onDone: (msg: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isIn = direction === "IN";

  function submit() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a positive amount.");
      return;
    }
    startTransition(async () => {
      const res = await recordStoreTransaction(item.id, direction, value, reason.trim());
      if (res.ok) onDone(`${item.name}: ${isIn ? "+" : "−"}${value} ${item.unit} recorded.`);
      else setError(res.error ?? "Could not save.");
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {isIn ? "Stock in" : "Stock out"} — {item.name}
        </DialogTitle>
        <DialogDescription>
          Current: {Number(item.current_stock).toLocaleString()} {item.unit}.{" "}
          {isIn ? "Use this for goods received into the store." : "Use this for wastage, damage, or corrections."}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="stock-amount">Quantity ({item.unit})</Label>
          <Input
            id="stock-amount"
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="stock-reason">Reason</Label>
          <Input
            id="stock-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={isIn ? "e.g. Received from supplier" : "e.g. Damaged / expired"}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          {pending ? "Saving…" : `Record ${isIn ? "stock in" : "stock out"}`}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function IssueDialog({ item, onDone }: { item: StoreItem; onDone: (msg: string) => void }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a positive amount.");
      return;
    }
    startTransition(async () => {
      const res = await issueStoreToKitchen(item.id, value, note.trim());
      if (res.ok) {
        onDone(
          `${value} ${item.unit} of ${item.name} issued to the kitchen` +
            (item.inventory_items ? ` — ${item.inventory_items.name} stock topped up.` : ".")
        );
      } else {
        setError(res.error ?? "Could not save.");
      }
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Issue to kitchen — {item.name}</DialogTitle>
        <DialogDescription>
          Current: {Number(item.current_stock).toLocaleString()} {item.unit}.{" "}
          {item.inventory_items
            ? `This also adds the quantity to "${item.inventory_items.name}" in the kitchen Inventory, in the same step.`
            : "This item isn't linked to a kitchen inventory ingredient, so only the store's own stock will change."}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="issue-amount">Quantity ({item.unit})</Label>
          <Input
            id="issue-amount"
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="issue-note">Note (optional)</Label>
          <Input id="issue-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. for today's lunch prep" />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ChefHat className="mr-2 h-4 w-4" />}
          {pending ? "Saving…" : "Issue to kitchen"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

interface SnapshotRow {
  store_item_id: string;
  name: string;
  unit: string;
  reorder_level: number;
  opening_stock: number;
  stock_in: number;
  stock_out: number;
  closing_stock: number;
}

function DailyHistory() {
  const [date, setDate] = useState(colomboToday);
  const [rows, setRows] = useState<SnapshotRow[]>([]);
  const [transactions, setTransactions] = useState<StoreTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const supabase = createClient();

    async function load() {
      const [{ data: snapshots, error: snapError }, { data: txs, error: txError }] = await Promise.all([
        supabase
          .from("store_daily_snapshots")
          .select("store_item_id, opening_stock, stock_in, stock_out, closing_stock, store_items(name, unit, reorder_level)")
          .eq("date", date),
        supabase
          .from("store_transactions")
          .select("*, store_items(name, unit), staff_profiles(full_name)")
          .gte("created_at", `${date}T00:00:00`)
          .lte("created_at", `${date}T23:59:59.999`)
          .order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      if (snapError || txError) {
        setError(snapError?.message ?? txError?.message ?? "Failed to load report");
        setLoading(false);
        return;
      }
      type SnapshotJoin = {
        store_item_id: string;
        opening_stock: number;
        stock_in: number;
        stock_out: number;
        closing_stock: number;
        store_items: { name: string; unit: string; reorder_level: number } | null;
      };
      const mapped = ((snapshots ?? []) as unknown as SnapshotJoin[])
        .map((r) => ({
          store_item_id: r.store_item_id,
          name: r.store_items?.name ?? "Unknown item",
          unit: r.store_items?.unit ?? "",
          reorder_level: r.store_items?.reorder_level ?? 0,
          opening_stock: r.opening_stock,
          stock_in: r.stock_in,
          stock_out: r.stock_out,
          closing_stock: r.closing_stock,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setRows(mapped);
      setTransactions((txs as unknown as StoreTransaction[] | null) ?? []);
      setLoading(false);
    }

    load().catch((e) => {
      if (cancelled) return;
      setError(e instanceof Error ? e.message : "Failed to load report");
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [date]);

  const totals = rows.reduce(
    (acc, r) => ({
      opening: acc.opening + r.opening_stock,
      in: acc.in + r.stock_in,
      out: acc.out + r.stock_out,
      closing: acc.closing + r.closing_stock,
    }),
    { opening: 0, in: 0, out: 0, closing: 0 }
  );

  return (
    <div className="space-y-4">
      <Input
        type="date"
        value={date}
        max={colomboToday()}
        onChange={(e) => setDate(e.target.value)}
        className="max-w-[200px]"
      />

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Opening" value={totals.opening} />
        <SummaryCard label="Total IN" value={totals.in} accent="text-emerald-500" />
        <SummaryCard label="Total OUT" value={totals.out} accent="text-rose-500" />
        <SummaryCard label="Closing" value={totals.closing} bold />
      </div>

      <Card>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Opening</TableHead>
                <TableHead className="text-right">IN</TableHead>
                <TableHead className="text-right">OUT</TableHead>
                <TableHead className="text-right">Closing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading &&
                rows.map((r) => {
                  const low = r.closing_stock <= r.reorder_level;
                  return (
                    <TableRow key={r.store_item_id} className={low ? "bg-amber-500/5" : ""}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.opening_stock.toLocaleString()} {r.unit}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-500">
                        +{r.stock_in.toLocaleString()} {r.unit}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-rose-500">
                        −{r.stock_out.toLocaleString()} {r.unit}
                      </TableCell>
                      <TableCell className={cn("text-right font-semibold tabular-nums", low && "text-amber-500")}>
                        {r.closing_stock.toLocaleString()} {r.unit}
                      </TableCell>
                    </TableRow>
                  );
                })}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    No snapshot recorded for this date.
                  </TableCell>
                </TableRow>
              )}
              {loading && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
          Transaction history ({transactions.length})
        </h3>
        <div className="space-y-2">
          {!loading &&
            transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={tx.type === "IN" ? "success" : "danger"}>{tx.type}</Badge>
                    <span className="truncate font-medium">{tx.store_items?.name ?? "Item"}</span>
                    {tx.issued_to_kitchen && (
                      <Badge variant="info">
                        <ChefHat className="mr-1 h-3 w-3" />
                        Kitchen
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {tx.reason || "No reason given"}
                    {tx.staff_profiles?.full_name ? ` · ${tx.staff_profiles.full_name}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-semibold tabular-nums">
                    {tx.type === "IN" ? "+" : "−"}
                    {Number(tx.quantity).toLocaleString()} {tx.store_items?.unit ?? ""}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(tx.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            ))}
          {!loading && transactions.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No transactions on this date.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
  bold,
}: {
  label: string;
  value: number;
  accent?: string;
  bold?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-3.5">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={cn("text-xl", bold ? "font-extrabold" : "font-bold", accent)}>
          {value.toLocaleString()}
        </div>
      </CardContent>
    </Card>
  );
}
