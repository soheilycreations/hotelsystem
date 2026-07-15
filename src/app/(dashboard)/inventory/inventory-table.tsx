"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, PackagePlus, Plus, SlidersHorizontal } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatLKR } from "@/lib/utils";
import type { InventoryItem } from "@/lib/types";
import { adjustStock, createInventoryItem } from "./actions";

export function InventoryTable({
  items,
  canManage,
}: {
  items: InventoryItem[];
  canManage: boolean;
}) {
  const [query, setQuery] = useState("");
  const [adjusting, setAdjusting] = useState<InventoryItem | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, query]);

  const lowCount = useMemo(
    () => items.filter((i) => Number(i.quantity_in_stock) < Number(i.reorder_level)).length,
    [items]
  );

  const stockValue = useMemo(
    () => items.reduce((sum, i) => sum + Number(i.quantity_in_stock) * Number(i.unit_cost), 0),
    [items]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search ingredients…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
        <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
          {lowCount > 0 && (
            <Badge variant="warning">
              <AlertTriangle className="mr-1 h-3 w-3" />
              {lowCount} below reorder level
            </Badge>
          )}
          <span>Stock value: {formatLKR(stockValue)}</span>
          {canManage && (
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <PackagePlus className="mr-2 h-4 w-4" />
                  New item
                </Button>
              </DialogTrigger>
              <AddItemDialog
                onDone={(msg) => {
                  setAddOpen(false);
                  setFeedback(msg);
                }}
              />
            </Dialog>
          )}
        </div>
      </div>

      {feedback && <p className="rounded-md bg-muted px-3 py-2 text-xs">{feedback}</p>}

      <Card>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ingredient</TableHead>
                <TableHead className="text-right">In stock</TableHead>
                <TableHead className="text-right">Reorder at</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => {
                const stock = Number(item.quantity_in_stock);
                const reorder = Number(item.reorder_level);
                const low = stock < reorder;
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
                    <TableCell className="text-right tabular-nums">
                      {formatLKR(Number(item.unit_cost))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatLKR(stock * Number(item.unit_cost))}
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
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setAdjusting(item)}
                      >
                        <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
                        Adjust
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    No ingredients match your search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={adjusting !== null} onOpenChange={(open) => !open && setAdjusting(null)}>
        {adjusting && (
          <AdjustDialog
            item={adjusting}
            onDone={(msg) => {
              setAdjusting(null);
              setFeedback(msg);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function AdjustDialog({
  item,
  onDone,
}: {
  item: InventoryItem;
  onDone: (msg: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a positive amount.");
      return;
    }
    const delta = direction === "in" ? value : -value;
    startTransition(async () => {
      const res = await adjustStock(item.id, delta, reason.trim());
      if (res.ok) {
        onDone(
          `${item.name}: ${delta > 0 ? "+" : ""}${delta} ${item.unit} recorded.`
        );
      } else {
        setError(res.error ?? "Adjustment failed.");
      }
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Adjust stock — {item.name}</DialogTitle>
        <DialogDescription>
          Current: {Number(item.quantity_in_stock).toLocaleString()} {item.unit}. Use “Stock in”
          for goods received and “Stock out” for wastage or corrections.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Direction</Label>
            <Select
              value={direction}
              onChange={(e) => setDirection(e.target.value as "in" | "out")}
            >
              <option value="in">Stock in (+)</option>
              <option value="out">Stock out (−)</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adj-amount">Amount ({item.unit})</Label>
            <Input
              id="adj-amount"
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="adj-reason">Reason</Label>
          <Input
            id="adj-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. GRN #123 / spoilage"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={pending}>
          <Plus className="mr-2 h-4 w-4" />
          Record adjustment
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function AddItemDialog({ onDone }: { onDone: (msg: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = await createInventoryItem(formData);
      if (res.ok) onDone("New inventory item added.");
      else setError(res.error ?? "Could not add the item.");
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New inventory item</DialogTitle>
        <DialogDescription>
          Add an ingredient so it can be used in menu recipes and tracked for reordering.
        </DialogDescription>
      </DialogHeader>
      <form action={submit} className="grid gap-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="inv-name">Name</Label>
          <Input id="inv-name" name="name" placeholder="e.g. Coconut milk" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="inv-unit">Unit</Label>
            <Select id="inv-unit" name="unit" defaultValue="grams">
              <option value="grams">grams</option>
              <option value="ml">ml</option>
              <option value="units">units</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-qty">Opening stock</Label>
            <Input id="inv-qty" name="quantity_in_stock" type="number" min="0" step="any" defaultValue="0" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="inv-cost">Unit cost (LKR)</Label>
            <Input id="inv-cost" name="unit_cost" type="number" min="0" step="any" defaultValue="0" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-reorder">Reorder level</Label>
            <Input id="inv-reorder" name="reorder_level" type="number" min="0" step="any" defaultValue="0" />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="submit" disabled={pending}>
            <PackagePlus className="mr-2 h-4 w-4" />
            Add item
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
