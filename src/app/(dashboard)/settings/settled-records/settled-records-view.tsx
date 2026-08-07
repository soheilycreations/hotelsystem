"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BedDouble, CalendarRange, Loader2, Pencil, Plus, Trash2, UtensilsCrossed } from "lucide-react";
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
import { formatDate, formatLKR } from "@/lib/utils";
import type { CreditAccount, PaymentMethod } from "@/lib/types";
import type { SettledBookingRow, SettledOrderRow, MenuItemOption } from "./page";
import {
  addSettledBookingCharge,
  addSettledOrderItem,
  addSettledOrderItemFromMenu,
  deleteSettledBookingCharge,
  deleteSettledOrderItem,
  updateSettledBooking,
  updateSettledBookingCharge,
  updateSettledOrder,
  updateSettledOrderItemQuantity,
} from "./actions";

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank Transfer",
  complimentary: "Complimentary",
  credit: "Credit",
};

function DateRangePicker({ fromDate, toDate }: { fromDate: string; toDate: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState(fromDate);
  const [to, setTo] = useState(toDate);

  function apply(nextFrom: string, nextTo: string) {
    startTransition(() => router.push(`/settings/settled-records?from=${nextFrom}&to=${nextTo}`));
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

export function SettledRecordsView({
  fromDate,
  toDate,
  orders,
  bookings,
  creditAccounts,
  menuItems,
}: {
  fromDate: string;
  toDate: string;
  orders: SettledOrderRow[];
  bookings: SettledBookingRow[];
  creditAccounts: CreditAccount[];
  menuItems: MenuItemOption[];
}) {
  const [tab, setTab] = useState<"bills" | "bookings">("bills");
  const [editingOrder, setEditingOrder] = useState<SettledOrderRow | null>(null);
  const [editingBooking, setEditingBooking] = useState<SettledBookingRow | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {feedback && <p className="rounded-md bg-muted px-3 py-2 text-xs">{feedback}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button size="sm" variant={tab === "bills" ? "default" : "outline"} onClick={() => setTab("bills")}>
            <UtensilsCrossed className="mr-2 h-4 w-4" />
            POS Bills ({orders.length})
          </Button>
          <Button size="sm" variant={tab === "bookings" ? "default" : "outline"} onClick={() => setTab("bookings")}>
            <BedDouble className="mr-2 h-4 w-4" />
            Room Bookings ({bookings.length})
          </Button>
        </div>
        <DateRangePicker fromDate={fromDate} toDate={toDate} />
      </div>

      {tab === "bills" ? (
        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Bill</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Paid by</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="whitespace-nowrap text-sm">{formatDate(o.business_date)}</TableCell>
                    <TableCell className="font-medium">#{o.order_number}</TableCell>
                    <TableCell className="text-sm text-muted-foreground capitalize">
                      {o.channel_type.replace("_", " ")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{PAYMENT_LABEL[o.payment_method ?? "cash"] ?? "Cash"}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatLKR(o.total_amount)}</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingOrder(o)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {orders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      No settled bills in this range.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Checkout</TableHead>
                  <TableHead>Guest</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Paid by</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {b.actual_check_out ? formatDate(b.actual_check_out) : "—"}
                    </TableCell>
                    <TableCell className="font-medium">{b.guest_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{b.room_number}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{PAYMENT_LABEL[b.payment_method ?? "cash"] ?? "Cash"}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatLKR(b.total_folio_amount)}</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingBooking(b)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {bookings.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      No checked-out bookings in this range.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={editingOrder !== null} onOpenChange={(open) => !open && setEditingOrder(null)}>
        {editingOrder && (
          <EditOrderDialog
            order={editingOrder}
            creditAccounts={creditAccounts}
            menuItems={menuItems}
            onDone={(msg) => {
              setEditingOrder(null);
              setFeedback(msg);
            }}
          />
        )}
      </Dialog>

      <Dialog open={editingBooking !== null} onOpenChange={(open) => !open && setEditingBooking(null)}>
        {editingBooking && (
          <EditBookingDialog
            booking={editingBooking}
            creditAccounts={creditAccounts}
            onDone={(msg) => {
              setEditingBooking(null);
              setFeedback(msg);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function EditOrderDialog({
  order,
  creditAccounts,
  menuItems,
  onDone,
}: {
  order: SettledOrderRow;
  creditAccounts: CreditAccount[];
  menuItems: MenuItemOption[];
  onDone: (msg: string) => void;
}) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>((order.payment_method as PaymentMethod) ?? "cash");
  const [creditAccountId, setCreditAccountId] = useState(order.credit_account_id ?? "");
  const [subtotal, setSubtotal] = useState(String(order.subtotal));
  const [serviceCharge, setServiceCharge] = useState(String(order.service_charge));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [itemPending, startItemTransition] = useTransition();
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newItemAmount, setNewItemAmount] = useState("");
  const [newItemSc, setNewItemSc] = useState(true);
  const [menuQuery, setMenuQuery] = useState("");

  const filteredMenuItems = menuQuery.trim()
    ? menuItems.filter((m) => m.name.toLowerCase().includes(menuQuery.trim().toLowerCase())).slice(0, 6)
    : [];

  const total = (Number(subtotal) || 0) + (Number(serviceCharge) || 0);

  function submit() {
    if (paymentMethod === "credit" && !creditAccountId) {
      setError("Pick a credit account.");
      return;
    }
    startTransition(async () => {
      const res = await updateSettledOrder({
        orderId: order.id,
        paymentMethod,
        creditAccountId: paymentMethod === "credit" ? creditAccountId : undefined,
        subtotal: Number(subtotal),
        serviceCharge: Number(serviceCharge),
      });
      if (res.ok) onDone(`Bill #${order.order_number} updated.`);
      else setError(res.error ?? "Could not save.");
    });
  }

  function changeQuantity(itemId: string, quantity: number) {
    if (quantity < 1) return;
    startItemTransition(async () => {
      const res = await updateSettledOrderItemQuantity(itemId, quantity);
      if (res.ok) onDone(`Bill #${order.order_number} item updated — reopen to see the new total.`);
      else setError(res.error ?? "Could not update the item.");
    });
  }

  function removeItem(itemId: string) {
    startItemTransition(async () => {
      const res = await deleteSettledOrderItem(itemId);
      if (res.ok) onDone(`Bill #${order.order_number} item removed — reopen to see the new total.`);
      else setError(res.error ?? "Could not remove the item.");
    });
  }

  function addMenuItem(menuItemId: string) {
    startItemTransition(async () => {
      const res = await addSettledOrderItemFromMenu({ orderId: order.id, menuItemId, quantity: 1 });
      if (res.ok) {
        setMenuQuery("");
        onDone(`Bill #${order.order_number} item added — reopen to see the new total.`);
      } else {
        setError(res.error ?? "Could not add the item.");
      }
    });
  }

  function addItem() {
    if (!newItemDesc.trim() || !newItemAmount) return;
    startItemTransition(async () => {
      const res = await addSettledOrderItem({
        orderId: order.id,
        description: newItemDesc,
        amount: Number(newItemAmount),
        serviceChargeable: newItemSc,
      });
      if (res.ok) {
        setNewItemDesc("");
        setNewItemAmount("");
        onDone(`Bill #${order.order_number} item added — reopen to see the new total.`);
      } else {
        setError(res.error ?? "Could not add the item.");
      }
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Edit — Bill #{order.order_number}</DialogTitle>
        <DialogDescription>
          {order.channel_type.replace("_", " ")} · {formatDate(order.business_date)}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Items on this bill</Label>
          <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-md border p-2">
            {order.items.map((it) => (
              <div key={it.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {it.is_custom ? it.custom_description : it.menu_item_name ?? "Item"}
                  {!it.service_chargeable && (
                    <span className="ml-1 text-[10px] text-muted-foreground">(no SC)</span>
                  )}
                </span>
                <Input
                  type="number"
                  min="1"
                  value={it.quantity}
                  onChange={(e) => changeQuantity(it.id, Number(e.target.value) || 1)}
                  disabled={itemPending}
                  className="h-7 w-14 text-center text-xs"
                />
                <span className="w-20 shrink-0 text-right tabular-nums text-xs">{formatLKR(it.line_total)}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                  onClick={() => removeItem(it.id)}
                  disabled={itemPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {order.items.length === 0 && (
              <p className="py-2 text-center text-xs text-muted-foreground">No items on this bill.</p>
            )}
          </div>

          <div className="relative space-y-1">
            <Input
              value={menuQuery}
              onChange={(e) => setMenuQuery(e.target.value)}
              placeholder="Search menu items to add…"
              className="h-8 text-xs"
              disabled={itemPending}
            />
            {filteredMenuItems.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-md border">
                {filteredMenuItems.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => addMenuItem(m.id)}
                    disabled={itemPending}
                    className="flex w-full items-center justify-between px-2 py-1.5 text-left text-xs hover:bg-accent"
                  >
                    <span className="truncate">{m.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{formatLKR(m.selling_price)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-center text-[10px] text-muted-foreground">— or add a custom line —</p>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Input
                value={newItemDesc}
                onChange={(e) => setNewItemDesc(e.target.value)}
                placeholder="Add item — description"
                className="h-8 text-xs"
              />
            </div>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={newItemAmount}
              onChange={(e) => setNewItemAmount(e.target.value)}
              placeholder="Amount"
              className="h-8 w-24 text-xs"
            />
            <Button size="sm" variant="outline" onClick={addItem} disabled={itemPending || !newItemDesc.trim() || !newItemAmount}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={newItemSc}
              onChange={(e) => setNewItemSc(e.target.checked)}
              className="h-3 w-3 accent-current"
            />
            New item applies service charge
          </label>
          <p className="text-xs text-amber-500">
            Changing items updates the totals automatically — reopen this dialog after adding or
            removing one to see the refreshed subtotal below.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="eo-payment">Paid by</Label>
          <Select id="eo-payment" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="credit">Credit</option>
            <option value="complimentary">Complimentary</option>
          </Select>
        </div>
        {paymentMethod === "credit" && (
          <div className="space-y-1.5">
            <Label htmlFor="eo-credit">Credit account</Label>
            <Select id="eo-credit" value={creditAccountId} onChange={(e) => setCreditAccountId(e.target.value)}>
              <option value="">Select an account…</option>
              {creditAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="eo-subtotal">Subtotal (LKR)</Label>
            <Input id="eo-subtotal" type="number" min="0" step="0.01" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eo-sc">Service charge (LKR)</Label>
            <Input id="eo-sc" type="number" min="0" step="0.01" value={serviceCharge} onChange={(e) => setServiceCharge(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
          <span className="text-muted-foreground">New total</span>
          <span className="font-semibold tabular-nums">{formatLKR(total)}</span>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function EditBookingDialog({
  booking,
  creditAccounts,
  onDone,
}: {
  booking: SettledBookingRow;
  creditAccounts: CreditAccount[];
  onDone: (msg: string) => void;
}) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>((booking.payment_method as PaymentMethod) ?? "cash");
  const [creditAccountId, setCreditAccountId] = useState(booking.credit_account_id ?? "");
  const [ratePlanPrice, setRatePlanPrice] = useState(
    booking.rate_plan_price != null ? String(booking.rate_plan_price) : ""
  );
  const [totalFolioAmount, setTotalFolioAmount] = useState(String(booking.total_folio_amount));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [chargePending, startChargeTransition] = useTransition();
  const [editingChargeId, setEditingChargeId] = useState<string | null>(null);
  const [editChargeDesc, setEditChargeDesc] = useState("");
  const [editChargeAmount, setEditChargeAmount] = useState("");
  const [newChargeDesc, setNewChargeDesc] = useState("");
  const [newChargeAmount, setNewChargeAmount] = useState("");

  function startEditCharge(chargeId: string, description: string, amount: number) {
    setEditingChargeId(chargeId);
    setEditChargeDesc(description);
    setEditChargeAmount(String(amount));
  }

  function saveChargeEdit() {
    if (!editingChargeId || !editChargeDesc.trim() || !editChargeAmount) return;
    startChargeTransition(async () => {
      const res = await updateSettledBookingCharge({
        chargeId: editingChargeId,
        bookingId: booking.id,
        description: editChargeDesc,
        amount: Number(editChargeAmount),
      });
      if (res.ok) {
        setEditingChargeId(null);
        onDone(`${booking.guest_name}'s charge updated — reopen to see the new total.`);
      } else {
        setError(res.error ?? "Could not update the charge.");
      }
    });
  }

  function removeCharge(chargeId: string) {
    startChargeTransition(async () => {
      const res = await deleteSettledBookingCharge(chargeId);
      if (res.ok) onDone(`${booking.guest_name}'s charge removed — reopen to see the new total.`);
      else setError(res.error ?? "Could not remove the charge.");
    });
  }

  function addCharge() {
    if (!newChargeDesc.trim() || !newChargeAmount) return;
    startChargeTransition(async () => {
      const res = await addSettledBookingCharge({
        bookingId: booking.id,
        description: newChargeDesc,
        amount: Number(newChargeAmount),
      });
      if (res.ok) {
        setNewChargeDesc("");
        setNewChargeAmount("");
        onDone(`${booking.guest_name}'s charge added — reopen to see the new total.`);
      } else {
        setError(res.error ?? "Could not add the charge.");
      }
    });
  }

  function submit() {
    if (paymentMethod === "credit" && !creditAccountId) {
      setError("Pick a credit account.");
      return;
    }
    startTransition(async () => {
      const res = await updateSettledBooking({
        bookingId: booking.id,
        paymentMethod,
        creditAccountId: paymentMethod === "credit" ? creditAccountId : undefined,
        ratePlanPrice: ratePlanPrice.trim() === "" ? null : Number(ratePlanPrice),
        totalFolioAmount: Number(totalFolioAmount),
      });
      if (res.ok) onDone(`${booking.guest_name}'s booking updated.`);
      else setError(res.error ?? "Could not save.");
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Edit — {booking.guest_name}</DialogTitle>
        <DialogDescription>
          Room {booking.room_number} · {booking.rate_plan_name ?? "—"}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Charges on this booking</Label>
          <p className="text-[10px] text-muted-foreground">
            Extends, minibar, custom charges — not the base room rate itself.
          </p>
          <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-md border p-2">
            {booking.charges.map((c) =>
              editingChargeId === c.id ? (
                <div key={c.id} className="flex items-center gap-2 text-sm">
                  <Input
                    value={editChargeDesc}
                    onChange={(e) => setEditChargeDesc(e.target.value)}
                    className="h-7 flex-1 text-xs"
                    disabled={chargePending}
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editChargeAmount}
                    onChange={(e) => setEditChargeAmount(e.target.value)}
                    className="h-7 w-20 text-xs"
                    disabled={chargePending}
                  />
                  <Button size="sm" className="h-7 px-2 text-xs" onClick={saveChargeEdit} disabled={chargePending}>
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setEditingChargeId(null)}
                    disabled={chargePending}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div key={c.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{c.description}</span>
                  <span className="w-20 shrink-0 text-right tabular-nums text-xs">{formatLKR(c.amount)}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    onClick={() => startEditCharge(c.id, c.description, c.amount)}
                    disabled={chargePending}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => removeCharge(c.id)}
                    disabled={chargePending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )
            )}
            {booking.charges.length === 0 && (
              <p className="py-2 text-center text-xs text-muted-foreground">No extra charges on this booking.</p>
            )}
          </div>
          <div className="flex items-end gap-2">
            <Input
              value={newChargeDesc}
              onChange={(e) => setNewChargeDesc(e.target.value)}
              placeholder="Add charge — description"
              className="h-8 flex-1 text-xs"
              disabled={chargePending}
            />
            <Input
              type="number"
              min="0"
              step="0.01"
              value={newChargeAmount}
              onChange={(e) => setNewChargeAmount(e.target.value)}
              placeholder="Amount"
              className="h-8 w-24 text-xs"
              disabled={chargePending}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={addCharge}
              disabled={chargePending || !newChargeDesc.trim() || !newChargeAmount}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-xs text-amber-500">
            Adding, editing, or removing a charge updates the folio automatically — reopen this
            dialog to see the refreshed total below.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="eb-payment">Paid by</Label>
          <Select id="eb-payment" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="credit">Credit</option>
            <option value="complimentary">Complimentary</option>
          </Select>
        </div>
        {paymentMethod === "credit" && (
          <div className="space-y-1.5">
            <Label htmlFor="eb-credit">Credit account</Label>
            <Select id="eb-credit" value={creditAccountId} onChange={(e) => setCreditAccountId(e.target.value)}>
              <option value="">Select an account…</option>
              {creditAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="eb-rate">Rate / night (LKR)</Label>
            <Input
              id="eb-rate"
              type="number"
              min="0"
              step="0.01"
              value={ratePlanPrice}
              onChange={(e) => setRatePlanPrice(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eb-total">Total folio (LKR)</Label>
            <Input
              id="eb-total"
              type="number"
              min="0"
              step="0.01"
              value={totalFolioAmount}
              onChange={(e) => setTotalFolioAmount(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Rate/night only affects future Extends on this booking — it doesn&apos;t itself change
          the total below. Edit Total folio directly for the actual correction.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
