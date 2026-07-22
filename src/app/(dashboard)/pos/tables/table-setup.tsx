"use client";

import { useState, useTransition } from "react";
import { Armchair, Pencil, Plus, Trash2 } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RestaurantTable, TableStatus } from "@/lib/types";
import { createTable, deleteTable, updateTable } from "./actions";

const STATUS_BADGE: Record<TableStatus, "success" | "info" | "warning" | "danger"> = {
  vacant: "success",
  occupied: "info",
  reserved: "warning",
  billed: "danger",
};

export function TableSetup({ tables }: { tables: RestaurantTable[] }) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<
    { mode: "create" } | { mode: "edit"; item: RestaurantTable } | null
  >(null);

  function handleDelete(t: RestaurantTable) {
    startTransition(async () => {
      const res = await deleteTable(t.id);
      setFeedback(res.ok ? `Table ${t.table_number} removed.` : res.error ?? "Could not delete.");
    });
  }

  return (
    <div className="space-y-4">
      {feedback && <p className="rounded-md bg-muted px-3 py-2 text-xs">{feedback}</p>}

      <Card>
        <CardContent className="px-0">
          <div className="flex items-center justify-between px-4 pt-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Armchair className="h-4 w-4" />
              Tables ({tables.length})
            </p>
            <Dialog
              open={dialog?.mode === "create"}
              onOpenChange={(open) => setDialog(open ? { mode: "create" } : null)}
            >
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  New table
                </Button>
              </DialogTrigger>
              {dialog?.mode === "create" && (
                <TableDialog
                  onDone={(msg) => {
                    setDialog(null);
                    setFeedback(msg);
                  }}
                />
              )}
            </Dialog>
          </div>
          <Table className="mt-3">
            <TableHeader>
              <TableRow>
                <TableHead>Table</TableHead>
                <TableHead className="text-right">Seats</TableHead>
                <TableHead>Zone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tables.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.table_number}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.capacity}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t.floor_zone ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[t.current_status]} className="capitalize">
                      {t.current_status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => setDialog({ mode: "edit", item: t })}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        disabled={pending || t.current_status === "occupied"}
                        title={
                          t.current_status === "occupied"
                            ? "Settle its bill first"
                            : "Delete table"
                        }
                        onClick={() => handleDelete(t)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {tables.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    No tables yet — add one to start taking dine-in orders.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialog?.mode === "edit"} onOpenChange={(open) => !open && setDialog(null)}>
        {dialog?.mode === "edit" && (
          <TableDialog
            key={dialog.item.id}
            item={dialog.item}
            onDone={(msg) => {
              setDialog(null);
              setFeedback(msg);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function TableDialog({
  item,
  onDone,
}: {
  item?: RestaurantTable;
  onDone: (msg: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editing = Boolean(item);

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = editing ? await updateTable(item?.id ?? "", formData) : await createTable(formData);
      if (res.ok) onDone(editing ? "Table updated." : "Table added.");
      else setError(res.error ?? "Could not save.");
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{editing ? `Edit — Table ${item?.table_number}` : "New table"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "Renumbering keeps its order history intact."
            : "The table starts as vacant and appears on the POS terminal immediately."}
        </DialogDescription>
      </DialogHeader>
      <form action={submit} className="grid gap-4 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="table-number">Table number</Label>
            <Input id="table-number" name="table_number" defaultValue={item?.table_number} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="table-capacity">Seats</Label>
            <Input
              id="table-capacity"
              name="capacity"
              type="number"
              min="1"
              step="1"
              defaultValue={item?.capacity ?? 2}
              required
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="table-zone">Floor / zone</Label>
          <Input
            id="table-zone"
            name="floor_zone"
            defaultValue={item?.floor_zone ?? ""}
            placeholder="e.g. Indoor, Garden, Rooftop"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : editing ? "Save changes" : "Add table"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
