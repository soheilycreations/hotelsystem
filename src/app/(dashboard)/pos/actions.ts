"use server";

import { revalidatePath } from "next/cache";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import type { ChannelType, DeliveryStatus } from "@/lib/types";

interface ActionResult {
  ok: boolean;
  error?: string;
  orderId?: string;
}

const POS_ROLES = ["admin", "manager", "cashier"];
const KITCHEN_ROLES = [...POS_ROLES, "kitchen_staff"];

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

    const { data, error } = await supabase
      .from("restaurant_orders")
      .insert({
        channel_type: input.channel,
        table_id: input.tableId ?? null,
        booking_id: input.bookingId ?? null,
        customer_phone: input.customerPhone?.trim() || null,
        delivery_address: input.deliveryAddress?.trim() || null,
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
      .select("selling_price, is_available")
      .eq("id", menuItemId)
      .single();
    if (!menuItem) return { ok: false, error: "Menu item not found." };
    if (!menuItem.is_available) return { ok: false, error: "That item is marked unavailable." };

    // Merge with an existing line for the same item, if present
    const { data: existing } = await supabase
      .from("order_items")
      .select("id, quantity")
      .eq("order_id", orderId)
      .eq("menu_item_id", menuItemId)
      .maybeSingle();

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
        });

    if (error) return { ok: false, error: error.message };
    revalidatePos();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function removeOrderItem(orderItemId: string): Promise<ActionResult> {
  try {
    await assertRole(POS_ROLES);
    const supabase = await createClient();
    const { error } = await supabase.from("order_items").delete().eq("id", orderItemId);
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
export async function settleOrder(orderId: string): Promise<ActionResult> {
  try {
    await assertRole(POS_ROLES);
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

    const { error } = await supabase
      .from("restaurant_orders")
      .update({ order_status: "completed" })
      .eq("id", orderId);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function cancelOrder(orderId: string): Promise<ActionResult> {
  try {
    await assertRole(POS_ROLES);
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
