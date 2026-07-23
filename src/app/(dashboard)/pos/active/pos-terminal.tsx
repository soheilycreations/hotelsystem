"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Armchair,
  BadgePlus,
  Bike,
  Check,
  ChefHat,
  ConciergeBell,
  Loader2,
  Minus,
  PartyPopper,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import type {
  Booking,
  ChannelType,
  DeliveryStatus,
  MenuCategoryRow,
  MenuItem,
  RestaurantOrder,
  RestaurantTable,
  TableStatus,
} from "@/lib/types";
import { cn, formatLKR } from "@/lib/utils";
import { useThermalPrint } from "@/hooks/useThermalPrint";
import {
  addCustomOrderItem,
  addOrderItem,
  cancelOrder,
  markKotPrinted,
  openOrder,
  removeOrderItem,
  setDeliveryStatus,
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
}

const TABLE_STYLES: Record<TableStatus, string> = {
  vacant: "border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20",
  occupied: "border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20",
  reserved: "border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/20",
  billed: "border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20",
};

const DELIVERY_FLOW: DeliveryStatus[] = ["pending", "cooking", "dispatched", "delivered"];

export function PosTerminal({ tables, categories, menu, orders, guests }: PosTerminalProps) {
  const [channel, setChannel] = useState<ChannelType>("dine_in");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [guestId, setGuestId] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [eventName, setEventName] = useState("");
  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id ?? "");
  const [menuQuery, setMenuQuery] = useState("");
  const [addQty, setAddQty] = useState("1");
  const [customDesc, setCustomDesc] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const [customChargeable, setCustomChargeable] = useState(false);
  const [customLogExpense, setCustomLogExpense] = useState(false);
  const [customExpenseAmount, setCustomExpenseAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { printKot, printing, error: printError } = useThermalPrint();

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) ?? null,
    [orders, selectedOrderId]
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

  const offTableOrders = orders.filter((o) => o.channel_type !== "dine_in");

  return (
    <div className="grid gap-6 xl:grid-cols-5">
      {/* LEFT: channel selection + table matrix */}
      <div className="space-y-6 xl:col-span-3">
        <Tabs value={channel} onValueChange={(v) => setChannel(v as ChannelType)}>
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="dine_in"><Armchair className="mr-1.5 h-4 w-4" />Dine-in</TabsTrigger>
            <TabsTrigger value="room_service"><ConciergeBell className="mr-1.5 h-4 w-4" />Room service</TabsTrigger>
            <TabsTrigger value="takeaway"><ShoppingBag className="mr-1.5 h-4 w-4" />Takeaway</TabsTrigger>
            <TabsTrigger value="delivery"><Bike className="mr-1.5 h-4 w-4" />Delivery</TabsTrigger>
            <TabsTrigger value="banquet"><PartyPopper className="mr-1.5 h-4 w-4" />Banquet</TabsTrigger>
          </TabsList>

          <TabsContent value="dine_in" className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Tap a vacant table to open an order, or an occupied one to keep adding items.
            </p>
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
                      "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                      TABLE_STYLES[table.current_status],
                      selectedOrder?.table_id === table.id && "ring-2 ring-ring"
                    )}
                  >
                    {table.table_number}
                    {order ? (
                      <span className="text-xs font-normal opacity-80">
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

        {/* Menu — always visible so it works for whichever order is active */}
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Menu
            </h2>
            {!selectedOrder && (
              <span className="text-xs text-muted-foreground">
                Select a table or open an order first
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={menuQuery}
                onChange={(e) => setMenuQuery(e.target.value)}
                placeholder="Search the whole menu…"
                className="pl-8"
              />
            </div>
            <Input
              type="number"
              min="1"
              step="1"
              value={addQty}
              onChange={(e) => setAddQty(e.target.value)}
              title="Quantity to add when you tap an item"
              className="w-16 text-center"
            />
          </div>
          {addQty !== "1" && addQty.trim() !== "" && (
            <p className="text-xs text-muted-foreground">
              Tapping an item now adds <span className="font-medium">×{addQty}</span> at once.
            </p>
          )}
          {menuQuery.trim() === "" ? (
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <Button
                  key={c.id}
                  size="sm"
                  variant={categoryId === c.id ? "default" : "outline"}
                  onClick={() => setCategoryId(c.id)}
                >
                  {c.name}
                </Button>
              ))}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {(menuQuery.trim() !== ""
              ? menu.filter((m) => m.name.toLowerCase().includes(menuQuery.trim().toLowerCase()))
              : menu.filter((m) => m.category_id === categoryId)
            ).map((m) => (
              <button
                key={m.id}
                disabled={pending || !selectedOrder}
                onClick={() => {
                  if (!selectedOrder) return;
                  const qty = Math.max(1, Math.floor(Number(addQty)) || 1);
                  run(() => addOrderItem(selectedOrder.id, m.id, qty));
                  setAddQty("1");
                }}
                className="rounded-lg border p-3 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <p className="font-medium leading-snug">{m.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                  {formatLKR(Number(m.selling_price))}
                  {menuQuery.trim() !== "" ? <span className="ml-1.5">· {m.menu_categories?.name}</span> : null}
                </p>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Settle and print from the Billing screen — stock deducts automatically on settle.
          </p>
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
                      #{o.order_number} · {o.channel_type.replace("_", " ")}
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

      {/* RIGHT: order pad */}
      <div className="xl:col-span-2">
        <Card className="xl:sticky xl:top-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              {selectedOrder ? (
                <>
                  <span>
                    Order #{selectedOrder.order_number}
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
          <CardContent className="space-y-4">
            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            {!selectedOrder ? (
              <p className="text-sm text-muted-foreground">
                Tap a table or open a channel order, then add items from the Menu panel on the left.
              </p>
            ) : (
              <>
                {/* Lines */}
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
                              <span className="text-xs font-normal text-muted-foreground">
                                (no SC)
                              </span>
                            ) : null}
                            {item.kot_printed_at ? (
                              <span title="Sent to kitchen">
                                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                              </span>
                            ) : null}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.quantity} × {formatLKR(Number(item.unit_price))}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold tabular-nums">{formatLKR(Number(item.line_total))}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Remove line"
                            disabled={pending}
                            onClick={() => run(() => removeOrderItem(item.id))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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

                {/* KOT — send new items to the kitchen */}
                {(() => {
                  const pendingKot = (selectedOrder.order_items ?? []).filter(
                    (i) => !i.kot_printed_at && !i.is_custom
                  );
                  return (
                    <div className="space-y-1.5">
                      <Button
                        variant="secondary"
                        className="w-full"
                        disabled={pending || printing || pendingKot.length === 0}
                        onClick={async () => {
                          const sent = await printKot({
                            order: selectedOrder,
                            items: pendingKot,
                          });
                          if (sent) run(() => markKotPrinted(selectedOrder.id));
                        }}
                      >
                        <ChefHat className="mr-2 h-4 w-4" />
                        {printing
                          ? "Printing KOT…"
                          : pendingKot.length > 0
                          ? `Send KOT — ${pendingKot.length} new item${pendingKot.length > 1 ? "s" : ""}`
                          : "All items sent to kitchen"}
                      </Button>
                      {printError ? (
                        <p className="text-xs text-destructive">{printError}</p>
                      ) : null}
                    </div>
                  );
                })()}

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

                {selectedOrder.channel_type === "room_service" && (
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
                )}

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
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
