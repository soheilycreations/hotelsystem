"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Armchair,
  BadgePlus,
  Beer,
  Bike,
  Check,
  ChefHat,
  ConciergeBell,
  Loader2,
  Minus,
  PartyPopper,
  Plus,
  Printer,
  Search,
  ShoppingBag,
  Trash2,
  Wallet,
} from "lucide-react";
import type {
  Booking,
  ChannelType,
  CreditAccount,
  DeliveryStatus,
  HotelSettings,
  MenuCategoryRow,
  MenuItem,
  PaymentMethod,
  RestaurantOrder,
  RestaurantTable,
  TableStatus,
} from "@/lib/types";
import { itemStation } from "@/lib/types";
import { cn, formatLKR, formatOrderNumber } from "@/lib/utils";
import { useThermalPrint } from "@/hooks/useThermalPrint";
import {
  addCustomOrderItem,
  addOrderItem,
  cancelOrder,
  decrementOrderItem,
  incrementOrderItem,
  markKotPrinted,
  openOrder,
  removeOrderItem,
  setDeliveryStatus,
  setOrderItemQuantity,
  settleOrder,
} from "../actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface PosTerminalProps {
  tables: RestaurantTable[];
  categories: MenuCategoryRow[];
  menu: MenuItem[];
  orders: RestaurantOrder[];
  guests: Pick<Booking, "id" | "guest_name" | "rooms">[];
  canVoid: boolean;
  hotel: HotelSettings | null;
  creditAccounts: CreditAccount[];
}

const TABLE_STYLES: Record<TableStatus, string> = {
  vacant: "border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20",
  occupied: "border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20",
  reserved: "border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/20",
  billed: "border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20",
};

const DELIVERY_FLOW: DeliveryStatus[] = ["pending", "cooking", "dispatched", "delivered"];

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank" },
  { value: "credit", label: "Credit" },
  { value: "complimentary", label: "Comp" },
];

export function PosTerminal({ tables, categories, menu, orders, guests, canVoid, hotel, creditAccounts }: PosTerminalProps) {
  const [channel, setChannel] = useState<ChannelType>("dine_in");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [guestId, setGuestId] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [eventName, setEventName] = useState("");
  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id ?? "");
  const [menuQuery, setMenuQuery] = useState("");
  const [customDesc, setCustomDesc] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const [customChargeable, setCustomChargeable] = useState(false);
  const [customLogExpense, setCustomLogExpense] = useState(false);
  const [customExpenseAmount, setCustomExpenseAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [creditAccountId, setCreditAccountId] = useState("");
  const [confirmSettle, setConfirmSettle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /** Menu item whose card qty box is currently open for typed entry — click
   * the qty number, type a count, press Enter (faster than tapping + N
   * times for a bulk order). */
  const [editingQtyId, setEditingQtyId] = useState<string | null>(null);
  const [editingQtyValue, setEditingQtyValue] = useState("");
  /** Order-line quantity box currently open for typed entry, in the cart
   * panel on the right — same idea as the menu-grid stepper above, but
   * keyed by order_item id since each line here is already the one
   * pending/editable line for its menu item. */
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editingLineValue, setEditingLineValue] = useState("");
  const { printKot, print, printing, error: printError } = useThermalPrint();
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) ?? null,
    [orders, selectedOrderId]
  );

  // Jump straight into the search box the moment a table/order is opened —
  // the cashier can start typing an item name immediately, no mouse needed.
  useEffect(() => {
    if (selectedOrderId) searchRef.current?.focus();
  }, [selectedOrderId]);

  const visibleItems = useMemo(
    () =>
      menuQuery.trim() !== ""
        ? menu.filter((m) => m.name.toLowerCase().includes(menuQuery.trim().toLowerCase()))
        : menu.filter((m) => m.category_id === categoryId),
    [menu, menuQuery, categoryId]
  );

  const orderForTable = (tableId: string) =>
    orders.find((o) => o.table_id === tableId) ?? null;

  const run = (fn: () => Promise<{ ok: boolean; error?: string; orderId?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "Something went wrong.");
      else if (result.orderId) setSelectedOrderId(result.orderId);
    });
  };

  const handleTableTap = (table: RestaurantTable) => {
    const existing = orderForTable(table.id);
    if (existing) {
      setSelectedOrderId(existing.id);
    } else if (table.current_status === "vacant" || table.current_status === "reserved") {
      run(() => openOrder({ channel: "dine_in", tableId: table.id }));
    }
  };

  /** Enter in the search box adds the top match and clears the search —
   * type a name, hit Enter, keep typing the next one. */
  function addTopSearchMatch() {
    if (!selectedOrder || menuQuery.trim() === "") return;
    const top = visibleItems[0];
    if (!top) return;
    run(() => addOrderItem(selectedOrder.id, top.id, 1));
    setMenuQuery("");
  }

  /** Total quantity of a menu item already on the current order — shown as
   * the hover stepper's count on its menu card. */
  function orderQtyForItem(menuItemId: string): number {
    return (selectedOrder?.order_items ?? [])
      .filter((oi) => oi.menu_item_id === menuItemId)
      .reduce((sum, oi) => sum + oi.quantity, 0);
  }

  /** The one line the hover stepper's "-" can shrink — only a line that
   * hasn't been sent to the kitchen/bar yet, matching addOrderItem's own
   * merge rule (new taps land on that same line, not a KOT'd one). */
  function pendingLineForItem(menuItemId: string) {
    return (selectedOrder?.order_items ?? []).find((oi) => oi.menu_item_id === menuItemId && !oi.kot_printed_at);
  }

  function openQtyEdit(menuItemId: string) {
    setEditingQtyId(menuItemId);
    setEditingQtyValue(String(orderQtyForItem(menuItemId) || ""));
  }

  /** Commits the hover stepper's typed quantity box — the number typed is
   * the item's new TOTAL on the order, so it's translated into a delta on
   * the still-editable (unprinted) line; a total below what's already been
   * sent on a KOT/BOT is rejected rather than silently clamped. */
  function commitQtyEdit(menuItemId: string) {
    const raw = editingQtyValue.trim();
    setEditingQtyId(null);
    if (raw === "" || !selectedOrder) return;
    const desired = Math.round(Number(raw));
    if (!Number.isFinite(desired) || desired < 0) return;

    const printedQty = orderQtyForItem(menuItemId) - (pendingLineForItem(menuItemId)?.quantity ?? 0);
    if (desired < printedQty) {
      setError(`Already sent ${printedQty} to the kitchen/bar — can't go below that.`);
      return;
    }
    run(() => setOrderItemQuantity(selectedOrder.id, menuItemId, desired - printedQty));
  }

  /** Commits the cart panel's typed quantity box for one line — the line is
   * already the pending/editable one for its menu item, so the typed number
   * becomes its new quantity directly (no printed-portion math needed). */
  function commitLineQtyEdit(menuItemId: string | null) {
    const raw = editingLineValue.trim();
    setEditingLineId(null);
    if (raw === "" || !selectedOrder || !menuItemId) return;
    const desired = Math.round(Number(raw));
    if (!Number.isFinite(desired) || desired < 0) return;
    run(() => setOrderItemQuantity(selectedOrder.id, menuItemId, desired));
  }

  const openChannelOrder = () => {
    run(() =>
      openOrder({
        channel,
        bookingId: channel === "room_service" ? guestId : undefined,
        customerPhone:
          channel === "takeaway" || channel === "delivery" || channel === "banquet"
            ? phone
            : undefined,
        deliveryAddress: channel === "delivery" ? address : undefined,
        eventName: channel === "banquet" ? eventName : undefined,
      })
    );
  };

  function receiptPayload(order: RestaurantOrder) {
    return {
      order,
      items: order.order_items ?? [],
      hotel: hotel
        ? {
            name: hotel.hotel_name,
            address: hotel.address,
            phonePrimary: hotel.phone_primary,
            phoneSecondary: hotel.phone_secondary,
            logoUrl: hotel.logo_url,
            reviewQrUrl: hotel.review_qr_url,
          }
        : undefined,
    };
  }

  async function handlePrintBill(order: RestaurantOrder) {
    const sent = await print(receiptPayload(order));
    if (sent) setError(null);
  }

  function handleSettle(order: RestaurantOrder) {
    if (paymentMethod === "credit" && !creditAccountId) {
      setError("Pick a credit account before settling.");
      return;
    }
    const kotPending = (order.order_items ?? []).some((i) => !i.kot_printed_at && !i.is_custom);
    if (kotPending && !confirmSettle) {
      setConfirmSettle(true);
      setError("Some items were never sent to the kitchen/bar (no KOT/BOT). Press settle again to proceed anyway.");
      return;
    }
    setConfirmSettle(false);
    run(async () => {
      const res = await settleOrder(
        order.id,
        paymentMethod,
        false,
        paymentMethod === "credit" ? creditAccountId : undefined
      );
      if (res.ok) setSelectedOrderId(null);
      return res;
    });
  }

  const offTableOrders = orders.filter((o) => o.channel_type !== "dine_in");

  return (
    <div className="grid gap-6 xl:grid-cols-5">
      {/* LEFT: channel selection + table matrix */}
      <div className="space-y-4 xl:col-span-3">
      {/* Sticky header — channel tabs, table row, search and categories stay
          put while the item grid below scrolls. */}
      <div className="sticky top-0 z-10 -mt-4 space-y-3 bg-background pb-3 pt-4 md:-mt-6 md:pt-6">
        <Tabs value={channel} onValueChange={(v) => setChannel(v as ChannelType)}>
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="dine_in"><Armchair className="mr-1.5 h-4 w-4" />Dine-in</TabsTrigger>
            <TabsTrigger value="room_service"><ConciergeBell className="mr-1.5 h-4 w-4" />Room service</TabsTrigger>
            <TabsTrigger value="takeaway"><ShoppingBag className="mr-1.5 h-4 w-4" />Takeaway</TabsTrigger>
            <TabsTrigger value="delivery"><Bike className="mr-1.5 h-4 w-4" />Delivery</TabsTrigger>
            <TabsTrigger value="banquet"><PartyPopper className="mr-1.5 h-4 w-4" />Banquet</TabsTrigger>
          </TabsList>

          <TabsContent value="dine_in" className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {tables.map((table) => {
                const order = orderForTable(table.id);
                return (
                  <button
                    key={table.id}
                    disabled={pending}
                    onClick={() => handleTableTap(table)}
                    title={`Seats ${table.capacity} · ${table.floor_zone ?? "—"}`}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                      TABLE_STYLES[table.current_status],
                      selectedOrder?.table_id === table.id && "ring-2 ring-ring"
                    )}
                  >
                    {table.table_number}
                    {order ? (
                      <span className="font-normal opacity-80">
                        {formatLKR(Number(order.total_amount))}
                      </span>
                    ) : null}
                  </button>
                );
              })}
              {tables.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No tables set up yet — add some from the gear icon above.
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="room_service" className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="rs-guest">In-house guest</Label>
                <Select id="rs-guest" value={guestId} onChange={(e) => setGuestId(e.target.value)}>
                  <option value="">Select guest…</option>
                  {guests.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.guest_name} — Room {(g.rooms as { room_number?: string } | undefined)?.room_number ?? "?"}
                    </option>
                  ))}
                </Select>
              </div>
              <Button onClick={openChannelOrder} disabled={pending || !guestId}>
                {pending ? <Loader2 className="animate-spin" /> : <Plus />} Open order
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Settled room-service bills post straight onto the guest folio.
            </p>
          </TabsContent>

          <TabsContent value="takeaway" className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="ta-phone">Customer phone (optional)</Label>
                <Input id="ta-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07X XXX XXXX" />
              </div>
              <Button onClick={openChannelOrder} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <Plus />} Open order
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="delivery" className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="dl-phone">Customer phone</Label>
                <Input id="dl-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07X XXX XXXX" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dl-address">Delivery address</Label>
                <Input id="dl-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="No. 12, Galle Rd…" />
              </div>
            </div>
            <Button onClick={openChannelOrder} disabled={pending || !address.trim()}>
              {pending ? <Loader2 className="animate-spin" /> : <Plus />} Open delivery order
            </Button>
          </TabsContent>

          <TabsContent value="banquet" className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="bq-event">Function / event name</Label>
                <Input
                  id="bq-event"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  placeholder="e.g. Perera Wedding — 120 pax"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bq-phone">Customer contact (optional)</Label>
                <Input
                  id="bq-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="07X XXX XXXX"
                />
              </div>
            </div>
            <Button onClick={openChannelOrder} disabled={pending || !eventName.trim()}>
              {pending ? <Loader2 className="animate-spin" /> : <Plus />} Open banquet order
            </Button>
            <p className="text-xs text-muted-foreground">
              Add food &amp; beverage from the Menu panel below. Use &ldquo;Add custom
              item&rdquo; on the order pad for AC charges, decoration, or other external
              services — those can skip service charge and optionally log as an expense too.
            </p>
          </TabsContent>
        </Tabs>

        {/* Search + categories — part of the sticky header, right above the
            (non-sticky) item grid so only the items scroll underneath. */}
        <div className="space-y-2.5 rounded-lg border bg-background p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={menuQuery}
              onChange={(e) => setMenuQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTopSearchMatch();
                }
              }}
              placeholder={selectedOrder ? "Type an item, press Enter to add…" : "Select a table first…"}
              className="pl-8"
            />
          </div>
          {menuQuery.trim() === "" && (
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategoryId(c.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                    categoryId === c.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {c.station === "bar" ? <Beer className="h-3 w-3" /> : <ChefHat className="h-3 w-3" />}
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

        {/* Items — the only part of the left column that scrolls */}
        <div className="rounded-lg border p-3">
          <div className="grid grid-cols-2 content-start gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {visibleItems.length === 0 && (
              <p className="col-span-full py-6 text-center text-sm text-muted-foreground">No items found.</p>
            )}
            {visibleItems.map((m) => {
              const cardQty = orderQtyForItem(m.id);
              const disabled = pending || !selectedOrder;
              return (
                <div
                  key={m.id}
                  role="button"
                  tabIndex={disabled ? -1 : 0}
                  aria-disabled={disabled}
                  onClick={() => {
                    if (disabled || !selectedOrder) return;
                    run(() => addOrderItem(selectedOrder.id, m.id, 1));
                  }}
                  onKeyDown={(e) => {
                    if (disabled || !selectedOrder) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      run(() => addOrderItem(selectedOrder.id, m.id, 1));
                    }
                  }}
                  className={cn(
                    "group relative cursor-pointer overflow-hidden rounded-lg border text-left text-sm shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    disabled && "pointer-events-none opacity-60"
                  )}
                >
                  <div className="relative aspect-[4/3] w-full bg-muted">
                    {m.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        {itemStation(m) === "bar" ? (
                          <Beer className="h-6 w-6 text-muted-foreground/40" />
                        ) : (
                          <ChefHat className="h-6 w-6 text-muted-foreground/40" />
                        )}
                      </div>
                    )}
                    {itemStation(m) === "bar" && (
                      <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-background/90 shadow-sm">
                        <Beer className="h-3 w-3 text-primary" />
                      </span>
                    )}
                    {cardQty > 0 && (
                      <span className="absolute left-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground shadow-sm">
                        {cardQty}
                      </span>
                    )}
                    {/* Hover stepper — set the quantity right here instead of
                        tapping the card repeatedly. Hidden until hovered so
                        it doesn't clutter the grid at rest. */}
                    <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-background/0 opacity-0 transition-opacity group-hover:bg-background/70 group-hover:opacity-100">
                      <button
                        type="button"
                        aria-label={`Remove one ${m.name}`}
                        disabled={disabled || !pendingLineForItem(m.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          const line = pendingLineForItem(m.id);
                          if (line) run(() => decrementOrderItem(line.id));
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-background text-foreground shadow-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      {editingQtyId === m.id ? (
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          autoFocus
                          value={editingQtyValue}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setEditingQtyValue(e.target.value)}
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitQtyEdit(m.id);
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              setEditingQtyId(null);
                            }
                          }}
                          onBlur={() => setEditingQtyId(null)}
                          className="num h-7 w-10 rounded-md border bg-background text-center text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      ) : (
                        <button
                          type="button"
                          aria-label={`Type a quantity for ${m.name}`}
                          disabled={disabled}
                          onClick={(e) => {
                            e.stopPropagation();
                            openQtyEdit(m.id);
                          }}
                          className="min-w-5 rounded-md px-1 text-center text-sm font-semibold tabular-nums hover:bg-background/80 disabled:pointer-events-none"
                        >
                          {cardQty}
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`Add one ${m.name}`}
                        disabled={disabled}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!selectedOrder) return;
                          run(() => addOrderItem(selectedOrder.id, m.id, 1));
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-colors hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="p-2.5">
                    <p className="truncate font-medium leading-snug">{m.name}</p>
                    <p className="mt-0.5 text-xs font-semibold text-muted-foreground tabular-nums">
                      {formatLKR(Number(m.selling_price))}
                      {menuQuery.trim() !== "" ? <span className="ml-1.5 font-normal">· {m.menu_categories?.name}</span> : null}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Non-table active orders */}
        {offTableOrders.length > 0 ? (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Active off-table orders
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {offTableOrders.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setSelectedOrderId(o.id)}
                  className={cn(
                    "flex items-center justify-between rounded-lg border p-3 text-left text-sm transition-colors hover:bg-accent",
                    selectedOrderId === o.id && "ring-2 ring-ring"
                  )}
                >
                  <div>
                    <p className="font-medium">
                      #{formatOrderNumber(o.business_date, o.order_number)} · {o.channel_type.replace("_", " ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {o.event_name ?? o.bookings?.guest_name ?? o.customer_phone ?? "Walk-in"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">{formatLKR(Number(o.total_amount))}</p>
                    {o.delivery_status ? (
                      <Badge variant="info" className="mt-1 capitalize">{o.delivery_status}</Badge>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* RIGHT: order pad — everything needed to fire, print and settle a bill
          from one screen, without a trip to the Billing page. */}
      <div className="xl:col-span-2">
        <Card className="xl:sticky xl:top-6 overflow-hidden">
          <CardHeader className="border-b bg-muted/30 py-3">
            <CardTitle className="flex items-center justify-between text-base">
              {selectedOrder ? (
                <>
                  <span>
                    Order #{formatOrderNumber(selectedOrder.business_date, selectedOrder.order_number)}
                    {selectedOrder.restaurant_tables
                      ? ` · Table ${selectedOrder.restaurant_tables.table_number}`
                      : ""}
                  </span>
                  <Badge variant="secondary" className="capitalize">
                    {selectedOrder.channel_type.replace("_", " ")}
                  </Badge>
                </>
              ) : (
                "No order selected"
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}

            {!selectedOrder ? (
              <p className="text-sm text-muted-foreground">
                Tap a table or open a channel order, then add items from the Menu panel on the left.
              </p>
            ) : (
              <>
                {/* Lines — +/- stepper for fast quantity changes, no re-typing */}
                <div className="space-y-2">
                  {(selectedOrder.order_items ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Empty bill — add the first item.</p>
                  ) : (
                    (selectedOrder.order_items ?? []).map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 truncate font-medium">
                            {item.is_custom ? item.custom_description : item.menu_items?.name}
                            {item.is_custom && !item.service_chargeable ? (
                              <span className="text-xs font-normal text-muted-foreground">(no SC)</span>
                            ) : null}
                            {item.kot_printed_at ? (
                              <span title="Sent to kitchen/bar">
                                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                              </span>
                            ) : null}
                          </p>
                          <p className="text-xs text-muted-foreground">{formatLKR(Number(item.unit_price))} each</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {item.is_custom ? (
                            <span className="num text-xs text-muted-foreground">×{item.quantity}</span>
                          ) : item.kot_printed_at ? (
                            <span
                              className="num w-4 text-center text-xs font-semibold text-muted-foreground"
                              title="Sent to kitchen/bar — quantity locked"
                            >
                              ×{item.quantity}
                            </span>
                          ) : (
                            <div className="flex items-center gap-1 rounded-md border">
                              <button
                                type="button"
                                disabled={pending}
                                aria-label="Decrease quantity"
                                onClick={() => run(() => decrementOrderItem(item.id))}
                                className="flex h-6 w-6 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              {editingLineId === item.id ? (
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min={0}
                                  autoFocus
                                  value={editingLineValue}
                                  onChange={(e) => setEditingLineValue(e.target.value)}
                                  onFocus={(e) => e.target.select()}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      commitLineQtyEdit(item.menu_item_id);
                                    } else if (e.key === "Escape") {
                                      e.preventDefault();
                                      setEditingLineId(null);
                                    }
                                  }}
                                  onBlur={() => setEditingLineId(null)}
                                  className="num h-6 w-10 rounded-md border bg-background text-center text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                />
                              ) : (
                                <button
                                  type="button"
                                  aria-label="Type a quantity"
                                  disabled={pending}
                                  onClick={() => {
                                    setEditingLineId(item.id);
                                    setEditingLineValue(String(item.quantity));
                                  }}
                                  className="w-4 rounded text-center text-xs font-semibold tabular-nums hover:bg-accent disabled:pointer-events-none"
                                >
                                  {item.quantity}
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={pending}
                                aria-label="Increase quantity"
                                onClick={() => run(() => incrementOrderItem(item.id))}
                                className="flex h-6 w-6 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                          <span className="w-16 text-right font-semibold tabular-nums">{formatLKR(Number(item.line_total))}</span>
                          {item.kot_printed_at ? (
                            <span className="h-7 w-7" aria-hidden="true" />
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label="Remove line"
                              disabled={pending}
                              onClick={() => run(() => removeOrderItem(item.id))}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-1 border-t pt-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="tabular-nums">{formatLKR(Number(selectedOrder.subtotal))}</span>
                  </div>
                  {Number(selectedOrder.service_charge) > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Service charge
                        {Number(selectedOrder.subtotal) > 0
                          ? ` (${Math.round((Number(selectedOrder.service_charge) / Number(selectedOrder.subtotal)) * 100)}%)`
                          : ""}
                      </span>
                      <span className="tabular-nums">
                        {formatLKR(Number(selectedOrder.service_charge))}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Total</span>
                    <span className="text-lg font-bold tabular-nums">
                      {formatLKR(Number(selectedOrder.total_amount))}
                    </span>
                  </div>
                </div>

                {/* KOT / BOT — send new items to the kitchen or bar, split by
                    each item's station (its own override, else its
                    category's) so drinks fire to the bar printer and food
                    fires to the kitchen printer. */}
                {(() => {
                  const nonCustom = (selectedOrder.order_items ?? []).filter((i) => !i.is_custom);
                  const isBar = (i: (typeof nonCustom)[number]) =>
                    i.menu_items ? itemStation(i.menu_items) === "bar" : false;
                  const kitchenItems = nonCustom.filter((i) => !isBar(i));
                  const barItems = nonCustom.filter(isBar);
                  const pendingKitchen = kitchenItems.filter((i) => !i.kot_printed_at);
                  const pendingBar = barItems.filter((i) => !i.kot_printed_at);

                  const send = async (station: "kitchen" | "bar", items: typeof nonCustom) => {
                    const sent = await printKot({ order: selectedOrder, items, station });
                    if (sent) run(() => markKotPrinted(selectedOrder.id, items.map((i) => i.id)));
                  };

                  return (
                    <div className="grid grid-cols-2 gap-1.5">
                      {kitchenItems.length > 0 && (
                        <Button
                          variant="secondary"
                          disabled={pending || printing || pendingKitchen.length === 0}
                          onClick={() => send("kitchen", pendingKitchen)}
                        >
                          <ChefHat className="mr-2 h-4 w-4" />
                          {pendingKitchen.length > 0 ? `KOT (${pendingKitchen.length})` : "KOT sent"}
                        </Button>
                      )}
                      {barItems.length > 0 && (
                        <Button
                          variant="secondary"
                          disabled={pending || printing || pendingBar.length === 0}
                          onClick={() => send("bar", pendingBar)}
                        >
                          <Beer className="mr-2 h-4 w-4" />
                          {pendingBar.length > 0 ? `BOT (${pendingBar.length})` : "BOT sent"}
                        </Button>
                      )}
                    </div>
                  );
                })()}
                {printError ? <p className="text-xs text-destructive">{printError}</p> : null}

                {/* Delivery pipeline */}
                {selectedOrder.channel_type === "delivery" ? (
                  <div className="space-y-1.5">
                    <Label>Delivery status</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {DELIVERY_FLOW.map((s) => (
                        <Button
                          key={s}
                          size="sm"
                          variant={selectedOrder.delivery_status === s ? "default" : "outline"}
                          disabled={pending}
                          onClick={() => run(() => setDeliveryStatus(selectedOrder.id, s))}
                          className="capitalize"
                        >
                          {s}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {selectedOrder.channel_type === "banquet" && (
                  <div className="space-y-2 rounded-lg border border-dashed p-3">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <PartyPopper className="h-3.5 w-3.5" />
                      Add custom item
                    </p>
                    <Input
                      value={customDesc}
                      onChange={(e) => setCustomDesc(e.target.value)}
                      placeholder="e.g. AC Charge, Decoration"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={customAmount}
                        onChange={(e) => setCustomAmount(e.target.value)}
                        placeholder="Amount (LKR)"
                      />
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={customChargeable}
                          onChange={(e) => setCustomChargeable(e.target.checked)}
                          className="h-3.5 w-3.5 accent-current"
                        />
                        Service chargeable
                      </label>
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={customLogExpense}
                        onChange={(e) => setCustomLogExpense(e.target.checked)}
                        className="h-3.5 w-3.5 accent-current"
                      />
                      Also log as an expense (pass-through cost)
                    </label>
                    {customLogExpense && (
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={customExpenseAmount}
                        onChange={(e) => setCustomExpenseAmount(e.target.value)}
                        placeholder={`Expense amount (defaults to ${customAmount || "0"})`}
                      />
                    )}
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={pending || !customDesc.trim() || !customAmount}
                      onClick={() => {
                        const amount = Number(customAmount);
                        const expenseAmount = customExpenseAmount
                          ? Number(customExpenseAmount)
                          : undefined;
                        run(() =>
                          addCustomOrderItem({
                            orderId: selectedOrder.id,
                            description: customDesc,
                            amount,
                            serviceChargeable: customChargeable,
                            logAsExpense: customLogExpense,
                            expenseAmount,
                          })
                        );
                        setCustomDesc("");
                        setCustomAmount("");
                        setCustomChargeable(false);
                        setCustomLogExpense(false);
                        setCustomExpenseAmount("");
                      }}
                    >
                      <BadgePlus className="mr-2 h-4 w-4" />
                      Add to bill
                    </Button>
                  </div>
                )}

                {/* Print + Settle — the whole bill, start to finish, without
                    leaving this screen. */}
                <div className="space-y-2 border-t pt-3">
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={printing || (selectedOrder.order_items ?? []).length === 0}
                    onClick={() => handlePrintBill(selectedOrder)}
                  >
                    <Printer className="mr-2 h-4 w-4" />
                    {printing ? "Printing…" : "Print bill"}
                  </Button>

                  {selectedOrder.channel_type === "room_service" ? (
                    <Button
                      variant="secondary"
                      className="w-full"
                      disabled={pending || Number(selectedOrder.total_amount) <= 0}
                      onClick={() => {
                        run(() => settleOrder(selectedOrder.id));
                        setSelectedOrderId(null);
                      }}
                    >
                      <ConciergeBell className="mr-2 h-4 w-4" />
                      Charge to room folio
                    </Button>
                  ) : (
                    <>
                      <div className="grid grid-cols-5 gap-1">
                        {PAYMENT_METHODS.map((pm) => (
                          <button
                            key={pm.value}
                            type="button"
                            onClick={() => {
                              setPaymentMethod(pm.value);
                              setConfirmSettle(false);
                            }}
                            className={cn(
                              "rounded-md border py-1.5 text-xs font-medium transition-colors",
                              paymentMethod === pm.value
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-input text-muted-foreground hover:bg-accent"
                            )}
                          >
                            {pm.label}
                          </button>
                        ))}
                      </div>
                      {paymentMethod === "credit" && (
                        <Select value={creditAccountId} onChange={(e) => setCreditAccountId(e.target.value)}>
                          <option value="">Select an account…</option>
                          {creditAccounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </Select>
                      )}
                      <Button
                        className="w-full"
                        variant={confirmSettle ? "destructive" : "default"}
                        disabled={
                          pending ||
                          Number(selectedOrder.total_amount) <= 0 ||
                          (paymentMethod === "credit" && !creditAccountId)
                        }
                        onClick={() => handleSettle(selectedOrder)}
                      >
                        <Wallet className="mr-2 h-4 w-4" />
                        {confirmSettle ? "Settle anyway (KOT/BOT pending)" : "Settle & complete"}
                      </Button>
                    </>
                  )}
                </div>

                {canVoid && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={pending}
                    onClick={() => {
                      run(() => cancelOrder(selectedOrder.id));
                      setSelectedOrderId(null);
                    }}
                  >
                    <Minus /> Void this order
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
