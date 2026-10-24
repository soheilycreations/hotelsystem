"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import type { InventoryItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { recordOpeningStock } from "../actions";

interface RowState {
  quantity: string;
  unitCost: string;
}

export function OpeningStockForm({ items }: { items: InventoryItem[] }) {
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [note, setNote] = useState("Opening stock count");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
  }, [items, query]);

  const entered = Object.entries(rows).filter(([, r]) => r.quantity.trim() !== "");

  function set(id: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [id]: { quantity: "", unitCost: "", ...prev[id], ...patch } }));
  }

  function submit() {
    const payload = entered.map(([id, r]) => ({
      inventoryItemId: id,
      quantity: Number(r.quantity),
      unitCost: r.unitCost.trim() === "" ? null : Number(r.unitCost),
    }));
    if (payload.some((p) => !Number.isFinite(p.quantity) || p.quantity < 0)) {
      setMessage({ ok: false, text: "Counted quantities must be numbers, zero or more." });
      return;
    }
    if (payload.some((p) => p.unitCost != null && (!Number.isFinite(p.unitCost) || p.unitCost < 0))) {
      setMessage({ ok: false, text: "Unit costs must be numbers, zero or more." });
      return;
    }
    startTransition(async () => {
      const res = await recordOpeningStock(payload, note);
      if (res.ok) {
        setRows({});
        setMessage({ ok: true, text: `Saved the count for ${res.count} item(s).` });
      } else {
        setMessage({ ok: false, text: res.error ?? "Could not save the count." });
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="os-search">Find item</Label>
            <Input id="os-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="os-note">Note</Label>
            <Input id="os-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">In system now</TableHead>
                <TableHead>Counted</TableHead>
                <TableHead>Unit cost (optional)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {Number(item.quantity_in_stock).toLocaleString("en-LK")} {item.unit}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        className="h-8 w-28"
                        aria-label={`Counted ${item.name}`}
                        value={rows[item.id]?.quantity ?? ""}
                        onChange={(e) => set(item.id, { quantity: e.target.value })}
                      />
                      <span className="text-xs text-muted-foreground">{item.unit}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      className="h-8 w-28"
                      aria-label={`Unit cost ${item.name}`}
                      placeholder={String(item.unit_cost)}
                      value={rows[item.id]?.unitCost ?? ""}
                      onChange={(e) => set(item.id, { unitCost: e.target.value })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {message ? (
          <p className={message.ok ? "text-sm text-emerald-600" : "text-sm text-destructive"}>{message.text}</p>
        ) : null}
        <Button onClick={submit} disabled={pending || entered.length === 0}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Save count for {entered.length} item(s)
        </Button>
      </CardContent>
    </Card>
  );
}
