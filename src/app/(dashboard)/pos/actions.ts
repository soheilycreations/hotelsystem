"use server";

import { revalidatePath } from "next/cache";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import type { ChannelType, DeliveryStatus, PaymentMethod } from "@/lib/types";

interface ActionResult {
  ok: boolean;
  error?: string;
  orderId?: string;
}

const POS_ROLES = ["admin", "manager", "cashier"];
const KITCHEN_ROLES = [...POS_ROLES, "kitchen_staff"];
// Voiding reverses a KOT/BOT already sent to the kitchen/bar and can hide
// mistakes if left open to everyone who can run the POS — admin only.
const VOID_ROLES = ["admin"];

async function assertRole(roles: string[]) {
  const profile = await getSessionProfile();
  if (!profile || !roles.includes(profile.role)) {
    throw new Error("Not authorized for this POS operation.");
  }
  return profile;
}

function revalidatePos(): void {
  revalidatePath("/pos/active");
  revalidatePath("/pos/billing");
}

export interface OpenOrderInput {
  channel: ChannelType;
  tableId?: string;
  bookingId?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  eventName?: string;
}

export async function openOrder(input: OpenOrderInput): Promise<ActionResult> {
  try {
    const profile = await assertRole(POS_ROLES);
    const supabase = await createClient();

    if (input.channel === "dine_in" && !input.tableId)
      return { ok: false, error: "Pick a table for dine-in orders." };
    if (input.channel === "room_service" && !input.bookingId)
      return { ok: false, error: "Pick an in-house guest for room service." };
    if (input.channel === "delivery" && !input.deliveryAddress?.trim())
      return { ok: false, error: "Delivery orders need an address." };
    if (input.channel === "banquet" && !input.eventName?.trim())
      return { ok: false, error: "Give the function/event a name." };

    const { data, error } = await supabase
      .from("restaurant_orders")
      .insert({
        channel_type: input.channel,
        table_id: input.tableId ?? null,
        booking_id: input.bookingId ?? null,
        customer_phone: input.customerPhone?.trim() || null,
        delivery_address: input.deliveryAddress?.trim() || null,
        event_name: input.channel === "banquet" ? input.eventName?.trim() || null : null,
        delivery_status: input.channel === "delivery" ? "pending" : null,
        order_status: "active",
        created_by: profile.id,
      })
      .select("id")
      .single();

    if (error || !data) return { ok: false, error: error?.message ?? "Could not open the order." };

    if (input.tableId) {
      await supabase
        .from("restaurant_tables")
        .update({ current_status: "occupied" })
        .eq("id", input.tableId);
    }

    revalidatePos();
    return { ok: true, orderId: data.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function addOrderItem(
  orderId: string,
  menuItemId: string,
  quantity: number
): Promise<ActionResult> {
  try {
    await assertRole(POS_ROLES);
    if (quantity < 1) return { ok: false, error: "Quantity must be at least 1." };
    const supabase = await createClient();

    const { data: menuItem } = await supabase
      .from("menu_items")
      .select("selling_price, is_available, service_chargeable")
      .eq("id", menuItemId)
      .single();
    if (!menuItem) return { ok: false, error: "Menu item not found." };
    if (!menuItem.is_available) return { ok: false, error: "That item is marked unavailable." };

    // Merge only with a line that hasn't gone to the kitchen yet — once a line
    // is on a KOT, further additions create a NEW line so the next KOT prints them.
    const { data: existingLines } = await supabase
      .from("order_items")
      .select("id, quantity")
      .eq("order_id", orderId)
      .eq("menu_item_id", menuItemId)
      .is("kot_printed_at", null)
      .limit(1);
    const existing = existingLines?.[0];

    const { error } = existing
      ? await supabase
          .from("order_items")
          .update({ quantity: existing.quantity + quantity })
          .eq("id", existing.id)
      : await supabase.from("order_items").insert({
          order_id: orderId,
          menu_item_id: menuItemId,
          quantity,
          unit_price: menuItem.selling_price,
          service_chargeable: menuItem.service_chargeable,
        });

    if (error) return { ok: false, error: error.message };
    revalidatePos();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

/**
 * Sets an item's on-order quantity to an exact number instead of
 * incrementing — backs the "type a count, hit Enter" quantity box on the
 * menu grid, so a bulk order doesn't need N taps of +. Same merge rule as
 * addOrderItem (only touches a line that hasn't gone to the kitchen yet);
 * a quantity of 0 removes that pending line.
 */
export async function setOrderItemQuantity(
  orderId: string,
  menuItemId: string,
  quantity: number
): Promise<ActionResult> {
  try {
    await assertRole(POS_ROLES);
    if (!Number.isFinite(quantity) || quantity < 0 || !Number.isInteger(quantity))
      return { ok: false, error: "Enter a valid quantity." };
    const supabase = await createClient();

    const { data: existingLines } = await supabase
      .from("order_items")
      .select("id")
      .eq("order_id", orderId)
      .eq("menu_item_id", menuItemId)
      .is("kot_printed_at", null)
      .limit(1);
    const existing = existingLines?.[0];

    if (quantity === 0) {
      if (existing) {
        const { error } = await supabase.from("order_items").delete().eq("id", existing.id);
        if (error) return { ok: false, error: error.message };
      }
      revalidatePos();
      return { ok: true };
    }

    if (existing) {
      const { error } = await supabase
        .from("order_items")
        .update({ quantity })
        .eq("id", existing.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { data: menuItem } = await supabase
        .from("menu_items")
        .select("selling_price, is_available, service_chargeable")
        .eq("id", menuItemId)
        .single();
      if (!menuItem) return { ok: false, error: "Menu item not found." };
      if (!menuItem.is_available) return { ok: false, error: "That item is marked unavailable." };

      const { error } = await supabase.from("order_items").insert({
        order_id: orderId,
        menu_item_id: menuItemId,
        quantity,
        unit_price: menuItem.selling_price,
        service_chargeable: menuItem.service_chargeable,
      });
      if (error) return { ok: false, error: error.message };
    }

    revalidatePos();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function setOrderBusinessDate(orderId: string, date: string): Promise<ActionResult> {
  try {
    await assertRole(POS_ROLES);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      return { ok: false, error: "Pick a valid date." };

    const supabase = await createClient();
    const { error } = await supabase
      .from("restaurant_orders")
      .update({ business_date: date })
      .eq("id", orderId);
    if (error) return { ok: false, error: error.message };

    revalidatePos();
    revalidatePath("/finance/reports");
    revalidatePath("/finance/daily-summary");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export interface CustomOrderItemInput {
  orderId: string;
  description: string;
  amount: number;
  serviceChargeable: boolean;
  logAsExpense: boolean;
  expenseAmount?: number; // defaults to `amount` when logAsExpense is true
}

/**
 * Adds a typed (non-menu) line to a bill — e.g. "AC Charge" on a banquet
 * function. Optionally logs the same cost as an expense in the same step,
 * so a pass-through charge (hotel pays an external vendor, then bills the
 * customer) shows correctly as both revenue and an expense.
 */
export async function addCustomOrderItem(input: CustomOrderItemInput): Promise<ActionResult> {
  try {
    const profile = await assertRole(POS_ROLES);
    const description = input.description.trim();
    if (!description) return { ok: false, error: "Describe the item (e.g. AC Charge)." };
    if (!Number.isFinite(input.amount) || input.amount <= 0)
      return { ok: false, error: "Amount must be greater than zero." };

    const supabase = await createClient();
    const { error } = await supabase.from("order_items").insert({
      order_id: input.orderId,
      menu_item_id: null,
      is_custom: true,
      custom_description: description,
      service_chargeable: input.serviceChargeable,
      quantity: 1,
      unit_price: Math.round(input.amount * 100) / 100,
    });
    if (error) return { ok: false, error: error.message };

    if (input.logAsExpense) {
      const expenseAmount = input.expenseAmount ?? input.amount;
      if (!Number.isFinite(expenseAmount) || expenseAmount <= 0)
        return { ok: false, error: "Expense amount must be greater than zero." };

      const { error: expError } = await supabase.from("expenses").insert({
        category: "function_cost",
        amount: Math.round(expenseAmount * 100) / 100,
        date: new Date().toISOString().slice(0, 10),
        description: `${description} (billed to customer)`,
        logged_by: profile.id,
      });
      if (expError) return { ok: false, error: expError.message };
      revalidatePath("/finance/expenses");
      revalidatePath("/finance/reports");
      revalidatePath("/finance/daily-summary");
    }

    revalidatePos();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

const KOT_LOCKED_ERROR =
  "Already sent to the kitchen/bar — this line can't be changed. Void the whole order if it was a mistake.";

export async function removeOrderItem(orderItemId: string): Promise<ActionResult> {
  try {
    await assertRole(POS_ROLES);
    const supabase = await createClient();
    const { data: item } = await supabase
      .from("order_items")
      .select("kot_printed_at")
      .eq("id", orderItemId)
      .single();
    if (!item) return { ok: false, error: "Line not found." };
    if (item.kot_printed_at) return { ok: false, error: KOT_LOCKED_ERROR };

    const { error } = await supabase.from("order_items").delete().eq("id", orderItemId);
    if (error) return { ok: false, error: error.message };
    revalidatePos();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

/** +1 to a line's quantity — the fast in-place stepper on the order pad. */
export async function incrementOrderItem(orderItemId: string): Promise<ActionResult> {
  try {
    await assertRole(POS_ROLES);
    const supabase = await createClient();
    const { data: item } = await supabase
      .from("order_items")
      .select("quantity")
      .eq("id", orderItemId)
      .single();
    if (!item) return { ok: false, error: "Line not found." };
    const { error } = await supabase
      .from("order_items")
      .update({ quantity: item.quantity + 1 })
      .eq("id", orderItemId);
    if (error) return { ok: false, error: error.message };
    revalidatePos();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

/**
 * -1 to a line's quantity — removes the line once it hits zero.
 * Locked once the line has gone out on a KOT/BOT: the kitchen/bar already
 * started on that quantity, so it can't quietly shrink or disappear —
 * only a full order void (admin-only) can undo it at that point.
 */
export async function decrementOrderItem(orderItemId: string): Promise<ActionResult> {
  try {
    await assertRole(POS_ROLES);
    const supabase = await createClient();
    const { data: item } = await supabase
      .from("order_items")
      .select("quantity, kot_printed_at")
      .eq("id", orderItemId)
      .single();
    if (!item) return { ok: false, error: "Line not found." };
    if (item.kot_printed_at) return { ok: false, error: KOT_LOCKED_ERROR };

    if (item.quantity <= 1) {
      const { error } = await supabase.from("order_items").delete().eq("id", orderItemId);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase
        .from("order_items")
        .update({ quantity: item.quantity - 1 })
        .eq("id", orderItemId);
      if (error) return { ok: false, error: error.message };
    }
    revalidatePos();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

/**
 * Stamp specific lines as sent (call AFTER the KOT/BOT actually prints).
 * Takes explicit item ids rather than "every pending line in the order" so
 * the kitchen ticket and the bar ticket can each be sent — and marked —
 * independently of one another.
 */
export async function markKotPrinted(orderId: string, orderItemIds: string[]): Promise<ActionResult> {
  try {
    await assertRole(KITCHEN_ROLES);
    if (orderItemIds.length === 0) return { ok: true };
    const supabase = await createClient();
    const { error } = await supabase
      .from("order_items")
      .update({ kot_printed_at: new Date().toISOString() })
      .eq("order_id", orderId)
      .in("id", orderItemIds)
      .eq("is_custom", false)
      .is("kot_printed_at", null);
    if (error) return { ok: false, error: error.message };
    revalidatePos();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function markTableBilled(tableId: string): Promise<ActionResult> {
  try {
    await assertRole(POS_ROLES);
    const supabase = await createClient();
    const { error } = await supabase
      .from("restaurant_tables")
      .update({ current_status: "billed" })
      .eq("id", tableId);
    if (error) return { ok: false, error: error.message };
    revalidatePos();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function setDeliveryStatus(
  orderId: string,
  status: DeliveryStatus
): Promise<ActionResult> {
  try {
    await assertRole(KITCHEN_ROLES);
    const supabase = await createClient();
    const { error } = await supabase
      .from("restaurant_orders")
      .update({ delivery_status: status })
      .eq("id", orderId);
    if (error) return { ok: false, error: error.message };
    revalidatePos();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

/**
 * Settling a bill = flipping order_status to 'completed'.
 * Trigger B then deducts recipe stock, posts room-service totals to the
 * guest folio, and frees the table — all inside Postgres.
 */
export async function settleOrder(
  orderId: string,
  paymentMethod?: PaymentMethod,
  serviceChargeWaived = false,
  creditAccountId?: string
): Promise<ActionResult> {
  try {
    const profile = await assertRole(POS_ROLES);
    const supabase = await createClient();

    const { data: order } = await supabase
      .from("restaurant_orders")
      .select("id, total_amount, order_status")
      .eq("id", orderId)
      .single();
    if (!order) return { ok: false, error: "Order not found." };
    if (order.order_status !== "active") return { ok: false, error: "Order already settled." };
    if (Number(order.total_amount) <= 0)
      return { ok: false, error: "Cannot settle an empty bill — add items first." };

    // The DB recalc trigger only fires on order_items changes, not on
    // restaurant_orders updates — so when the service charge is waived at
    // settle time, recompute the totals here rather than relying on it.
    //
    // paymentMethod is only written when explicitly given. A room-service
    // order charged straight to the guest's folio ("Charge to room folio")
    // isn't actually paid yet — the real payment method is chosen later at
    // checkout — so it's left null here rather than silently defaulting to
    // "cash", which would mislabel it.
    let patch: Record<string, unknown> = {
      order_status: "completed",
      settled_at: new Date().toISOString(),
      settled_by: profile.id,
      service_charge_waived: serviceChargeWaived,
    };
    if (paymentMethod) patch.payment_method = paymentMethod;
    if (paymentMethod === "credit") {
      if (!creditAccountId) return { ok: false, error: "Pick a credit account." };
      patch.credit_account_id = creditAccountId;
    }

    if (serviceChargeWaived) {
      const { data: items } = await supabase
        .from("order_items")
        .select("line_total")
        .eq("order_id", orderId);
      const subtotal = (items ?? []).reduce((sum, i) => sum + Number(i.line_total), 0);
      patch = { ...patch, subtotal, service_charge: 0, total_amount: subtotal };
    }

    const { error } = await supabase.from("restaurant_orders").update(patch).eq("id", orderId);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function cancelOrder(orderId: string): Promise<ActionResult> {
  try {
    await assertRole(VOID_ROLES);
    const supabase = await createClient();

    const { data: order } = await supabase
      .from("restaurant_orders")
      .select("id, table_id")
      .eq("id", orderId)
      .single();
    if (!order) return { ok: false, error: "Order not found." };

    const { error } = await supabase
      .from("restaurant_orders")
      .update({ order_status: "cancelled" })
      .eq("id", orderId);
    if (error) return { ok: false, error: error.message };

    if (order.table_id) {
      await supabase
        .from("restaurant_tables")
        .update({ current_status: "vacant" })
        .eq("id", order.table_id);
    }

    revalidatePos();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
