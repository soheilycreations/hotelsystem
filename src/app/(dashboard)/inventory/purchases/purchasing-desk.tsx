"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Plus, ShoppingCart, Trash2, Truck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatLKR } from "@/lib/utils";
import type { InventoryItem, InventoryUnit, PaymentMethod, Purchase } from "@/lib/types";
import { recordPurchase, type PurchaseLineInput } from "../actions";

/** Quick-fill options for "how many of the item's own storage unit does one
 * purchased unit equal" — e.g. buying "kg" of something tracked in grams. */
const UNIT_PRESETS: Record<InventoryUnit, { label: string; factor: number }[]> = {
  grams: [
    { label: "Grams (g)", factor: 1 },
    { label: "Kilograms (kg)", factor: 1000 },
  ],
  ml: [
    { label: "Millilitres (ml)", factor: 1 },
    { label: "Litres (L)", factor: 1000 },
  ],
  units: [
    { label: "Units", factor: 1 },
    { label: "Dozen (12)", factor: 12 },
  ],
};

/** Label for the "set your own conversion" option — phrased in the term a
 * hotel actually buys that unit in, not the word "custom". */
const CUSTOM_UNIT_LABEL: Record<InventoryUnit, string> = {
  grams: "Packet / Box…",
  ml: "Bottle…",
  units: "Packet / Box…",
};
const CUSTOM_UNIT_NOUN: Record<InventoryUnit, string> = {
  grams: "packet",
  ml: "bottle",
  units: "packet",
};

const NEW_ITEM_VALUE = "__new__";

interface DraftLine {
  key: number;
  inventoryItemId: string;
  isNewItem: boolean;
  newItemName: string;
  newItemUnit: InventoryUnit;
  quantity: string;
  unitPrice: string;
  packSize: string; // how many of the item's storage unit one purchased unit equals
  customPack: boolean; // true once "custom" is picked from the presets dropdown
}

let nextKey = 1;
function emptyLine(defaultItemId: string): DraftLine {
  return {
    key: nextKey++,
    inventoryItemId: defaultItemId,
    isNewItem: false,
    newItemName: "",
    newItemUnit: "grams",
    quantity: "",
    unitPrice: "",
    packSize: "1",
    customPack: false,
  };
}

export function PurchasingDesk({
  inventoryItems,
  recentPurchases,
}: {
  inventoryItems: InventoryItem[];
  recentPurchases: Purchase[];
}) {
  const [supplierName, setSupplierName] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(inventoryItems[0]?.id ?? "")]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const itemById = useMemo(() => new Map(inventoryItems.map((i) => [i.id, i])), [inventoryItems]);

  const total = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const qty = Number(l.quantity);
        const price = Number(l.unitPrice);
        return sum + (Number.isFinite(qty) && Number.isFinite(price) ? qty * price : 0);
      }, 0),
    [lines]
  );

  function updateLine(key: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine(inventoryItems[0]?.id ?? "")]);
  }

  function removeLine(key: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  function submit() {
    setError(null);
    setFeedback(null);

    const candidates = lines.filter(
      (l) => (l.isNewItem ? l.newItemName.trim() !== "" : l.inventoryItemId !== "") && l.quantity.trim() !== ""
    );

    if (candidates.length === 0) {
      setError("Add at least one item with a quantity.");
      return;
    }
    if (candidates.some((l) => !Number.isFinite(Number(l.quantity)) || Number(l.quantity) <= 0)) {
      setError("Every line needs a quantity greater than zero.");
      return;
    }
    if (candidates.some((l) => !Number.isFinite(Number(l.packSize)) || Number(l.packSize) <= 0)) {
      setError("Pack size must be greater than zero.");
      return;
    }

    const parsed: PurchaseLineInput[] = candidates.map((l) => ({
      inventoryItemId: l.isNewItem ? "" : l.inventoryItemId,
      newItemName: l.isNewItem ? l.newItemName.trim() : undefined,
      newItemUnit: l.isNewItem ? l.newItemUnit : undefined,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice) || 0,
      packSize: Number(l.packSize) || 1,
    }));

    startTransition(async () => {
      const res = await recordPurchase(supplierName, notes, paymentMethod, parsed);
      if (!res.ok) {
        setError(res.error ?? "Could not record the purchase.");
        return;
      }
      setFeedback(`Purchase recorded — Rs ${total.toLocaleString("en-LK", { minimumFractionDigits: 2 })} added to stock and logged as an expense.`);
      setSupplierName("");
      setNotes("");
      setLines([emptyLine(inventoryItems[0]?.id ?? "")]);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      {/* Bill entry */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="h-4 w-4" />
            New supplier bill
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-supplier">Supplier (optional)</Label>
              <Input id="p-supplier" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="e.g. Cargills Wholesale" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-payment">Paid by</Label>
              <Select id="p-payment" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="credit">Credit</option>
              </Select>
            </div>
          </div>

          <div className="space-y-2.5">
            <Label>Items</Label>
            {lines.map((line) => {
              const qty = Number(line.quantity) || 0;
              const price = Number(line.unitPrice) || 0;
              const packSize = Number(line.packSize) || 0;
              const lineTotal = qty * price;
              const existingItem = itemById.get(line.inventoryItemId);
              const unit = line.isNewItem ? line.newItemUnit : existingItem?.unit;
              const presets = unit ? UNIT_PRESETS[unit] : [];

              return (
                <div key={line.key} className="space-y-2 rounded-md border p-2.5">
                  <div className="flex items-center gap-2">
                    {line.isNewItem ? (
                      <>
                        <Input
                          value={line.newItemName}
                          onChange={(e) => updateLine(line.key, { newItemName: e.target.value })}
                          placeholder="New item name…"
                          className="flex-1"
                          autoFocus
                        />
                        <Select
                          value={line.newItemUnit}
                          onChange={(e) => updateLine(line.key, { newItemUnit: e.target.value as InventoryUnit, packSize: "1", customPack: false })}
                          className="w-28"
                        >
                          <option value="grams">grams</option>
                          <option value="ml">ml</option>
                          <option value="units">units</option>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Cancel new item"
                          onClick={() => updateLine(line.key, { isNewItem: false, newItemName: "" })}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <div className="flex-1">
                        <Select
                          value={line.inventoryItemId}
                          onChange={(e) => {
                            if (e.target.value === NEW_ITEM_VALUE) {
                              updateLine(line.key, { isNewItem: true, inventoryItemId: "", packSize: "1", customPack: false });
                            } else {
                              updateLine(line.key, { inventoryItemId: e.target.value, packSize: "1", customPack: false });
                            }
                          }}
                        >
                          <option value="">Select item…</option>
                          {inventoryItems.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name} — tracked in {i.unit}
                            </option>
                          ))}
                          <option value={NEW_ITEM_VALUE}>+ Add new item…</option>
                        </Select>
                      </div>
                    )}
                    {!line.isNewItem && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove line"
                        disabled={lines.length === 1}
                        onClick={() => removeLine(line.key)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {unit && (
                      <Select
                        value={line.customPack ? "custom" : line.packSize}
                        onChange={(e) => {
                          if (e.target.value === "custom") {
                            updateLine(line.key, { customPack: true });
                          } else {
                            updateLine(line.key, { packSize: e.target.value, customPack: false });
                          }
                        }}
                        className="h-8 w-36 text-xs"
                      >
                        {presets.map((p) => (
                          <option key={p.factor} value={p.factor}>
                            Buy in {p.label}
                          </option>
                        ))}
                        <option value="custom">Buy in {unit ? CUSTOM_UNIT_LABEL[unit] : "…"}</option>
                      </Select>
                    )}
                    {unit && line.customPack && (
                      <span className="flex items-center gap-1">
                        1 {CUSTOM_UNIT_NOUN[unit]} =
                        <Input
                          type="number"
                          min="0.0001"
                          step="any"
                          value={line.packSize}
                          onChange={(e) => updateLine(line.key, { packSize: e.target.value })}
                          className="h-8 w-20"
                          autoFocus
                        />
                        {unit}
                      </span>
                    )}
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={line.quantity}
                      onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                      placeholder="Qty"
                      className="h-8 w-20"
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                      placeholder="Price / unit"
                      className="h-8 w-28"
                    />
                    <span className="ml-auto text-right font-medium tabular-nums text-foreground">{formatLKR(lineTotal)}</span>
                  </div>

                  {unit && qty > 0 && packSize > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Adds <span className="font-medium text-foreground">{(qty * packSize).toLocaleString()} {unit}</span>{" "}
                      {line.isNewItem ? (
                        <>as opening stock for the new item &ldquo;{line.newItemName || "…"}&rdquo;.</>
                      ) : (
                        <>
                          to {existingItem?.name}&apos;s stock (currently {Number(existingItem?.quantity_in_stock ?? 0).toLocaleString()} {unit}).
                        </>
                      )}
                    </p>
                  )}
                </div>
              );
            })}
            <Button variant="outline" size="sm" onClick={addLine}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add another item
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-notes">Notes (optional)</Label>
            <Input id="p-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Invoice #, delivery notes…" />
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-sm font-medium">Total</span>
            <span className="text-lg font-bold tabular-nums">{formatLKR(total)}</span>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {feedback && <p className="rounded-md bg-muted px-3 py-2 text-xs">{feedback}</p>}

          <Button className="w-full" disabled={pending || total <= 0} onClick={submit}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShoppingCart className="mr-2 h-4 w-4" />}
            Record purchase
          </Button>
          <p className="text-xs text-muted-foreground">
            Stock tops up for every item above (new items are created on the spot) and one matching expense
            (category &ldquo;Purchasing&rdquo;) posts automatically for the total — all together, or none of it does.
          </p>
        </CardContent>
      </Card>

      {/* History */}
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Recent purchases</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {recentPurchases.length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground">No purchases recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPurchases.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(p.purchase_date)}</TableCell>
                    <TableCell className="text-sm">
                      <div>{p.supplier_name ?? "—"}</div>
                      {p.purchase_items && p.purchase_items.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {p.purchase_items.slice(0, 3).map((pi) => (
                            <Badge key={pi.id} variant="secondary" className="text-xs">
                              {itemById.get(pi.inventory_item_id)?.name ?? pi.inventory_items?.name ?? "item"} ×{pi.quantity}
                              {Number(pi.pack_size) !== 1 ? ` (×${pi.pack_size})` : ""}
                            </Badge>
                          ))}
                          {p.purchase_items.length > 3 && (
                            <span className="text-xs text-muted-foreground">+{p.purchase_items.length - 3} more</span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatLKR(Number(p.total_amount))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
