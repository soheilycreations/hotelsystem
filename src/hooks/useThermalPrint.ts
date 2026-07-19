"use client";

import { useCallback, useState } from "react";
import type { OrderItem, RestaurantOrder } from "@/lib/types";

/**
 * ESC/POS raw spooler over WebUSB (Chrome/Edge). Builds a raw byte stream
 * for 80mm thermal printers (Epson TM-T series & compatible clones).
 * Falls back to window.print() when WebUSB is unavailable.
 */

const ESC = 0x1b;
const GS = 0x1d;

function encode(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

function line(char = "-", width = 42): number[] {
  return encode(char.repeat(width) + "\n");
}

function row(left: string, right: string, width = 42): number[] {
  const space = Math.max(1, width - left.length - right.length);
  return encode(left + " ".repeat(space) + right + "\n");
}

export interface ReceiptPayload {
  order: RestaurantOrder;
  items: OrderItem[];
  hotelName?: string;
  footerNote?: string;
}

/** Kitchen Order Ticket — only the pending items, no prices. */
export interface KotPayload {
  order: RestaurantOrder;
  items: OrderItem[]; // pass ONLY the lines not yet sent to the kitchen
  kotNumber?: number;
}

export function buildKotTicket({ order, items, kotNumber }: KotPayload): Uint8Array {
  const bytes: number[] = [];

  bytes.push(ESC, 0x40); // initialize
  bytes.push(ESC, 0x61, 0x01); // center
  bytes.push(ESC, 0x21, 0x30); // double height + width
  bytes.push(...encode("*** KOT ***\n"));
  bytes.push(ESC, 0x21, 0x00);
  bytes.push(...line("="));

  bytes.push(ESC, 0x61, 0x00); // left
  bytes.push(
    ...row(
      `Order #${order.order_number}${kotNumber ? ` / KOT ${kotNumber}` : ""}`,
      order.channel_type.replace("_", " ").toUpperCase()
    )
  );
  if (order.restaurant_tables) bytes.push(...row("Table", order.restaurant_tables.table_number));
  if (order.bookings) bytes.push(...row("Guest", order.bookings.guest_name));
  bytes.push(...row("Time", new Date().toLocaleTimeString("en-GB")));
  bytes.push(...line());

  // Big, price-free lines the kitchen can read from a distance
  bytes.push(ESC, 0x21, 0x10); // emphasized
  for (const item of items) {
    const name = item.menu_items?.name ?? "Item";
    bytes.push(...encode(`${item.quantity} x ${name}\n`));
  }
  bytes.push(ESC, 0x21, 0x00);

  bytes.push(...line("="));
  bytes.push(ESC, 0x61, 0x01);
  bytes.push(...encode(`${items.length} item(s) — fire now\n\n`));
  bytes.push(GS, 0x56, 0x42, 0x10); // partial cut with feed

  return new Uint8Array(bytes);
}

export function buildEscPosReceipt({
  order,
  items,
  hotelName = "SOHEILY GRAND HOTEL",
  footerNote = "Thank you — come again!",
}: ReceiptPayload): Uint8Array {
  const bytes: number[] = [];

  bytes.push(ESC, 0x40); // initialize
  bytes.push(ESC, 0x61, 0x01); // center
  bytes.push(ESC, 0x21, 0x30); // double height + width
  bytes.push(...encode(hotelName + "\n"));
  bytes.push(ESC, 0x21, 0x00); // normal
  bytes.push(...encode("Restaurant & Room Service\n"));
  bytes.push(...line("="));

  bytes.push(ESC, 0x61, 0x00); // left align
  bytes.push(...row(`Bill #${order.order_number}`, order.channel_type.replace("_", " ").toUpperCase()));
  bytes.push(...row("Date", new Date(order.created_at).toLocaleString("en-GB")));
  if (order.restaurant_tables) bytes.push(...row("Table", order.restaurant_tables.table_number));
  if (order.bookings) bytes.push(...row("Guest", order.bookings.guest_name));
  bytes.push(...line());

  for (const item of items) {
    const name = item.menu_items?.name ?? "Item";
    bytes.push(...encode(`${name}\n`));
    bytes.push(
      ...row(`  ${item.quantity} x ${item.unit_price.toFixed(2)}`, item.line_total.toFixed(2))
    );
  }

  bytes.push(...line());
  bytes.push(ESC, 0x21, 0x10); // emphasized
  bytes.push(...row("TOTAL (LKR)", order.total_amount.toFixed(2)));
  bytes.push(ESC, 0x21, 0x00);
  bytes.push(...line("="));

  bytes.push(ESC, 0x61, 0x01); // center
  bytes.push(...encode(footerNote + "\n\n"));

  bytes.push(GS, 0x56, 0x42, 0x10); // partial cut with feed

  return new Uint8Array(bytes);
}

interface UseThermalPrintResult {
  print: (payload: ReceiptPayload) => Promise<boolean>;
  printKot: (payload: KotPayload) => Promise<boolean>;
  printing: boolean;
  error: string | null;
}

export function useThermalPrint(): UseThermalPrintResult {
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Returns true when the bytes were handed to a device (or fallback ran). */
  const spool = useCallback(async (data: Uint8Array): Promise<boolean> => {
    setPrinting(true);
    setError(null);
    try {
      const nav = navigator as Navigator & {
        usb?: {
          requestDevice: (opts: { filters: { classCode: number }[] }) => Promise<USBLikeDevice>;
        };
      };

      if (!nav.usb) {
        window.print(); // graceful fallback for browsers without WebUSB
        return true;
      }

      const device = await nav.usb.requestDevice({ filters: [{ classCode: 7 }] });
      await device.open();
      if (device.configuration === null) await device.selectConfiguration(1);
      await device.claimInterface(0);

      const iface = device.configuration?.interfaces[0];
      const endpoint =
        iface?.alternate.endpoints.find((e) => e.direction === "out")?.endpointNumber ?? 1;

      await device.transferOut(endpoint, data);
      await device.close();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Printer connection failed");
      return false;
    } finally {
      setPrinting(false);
    }
  }, []);

  const print = useCallback(
    (payload: ReceiptPayload) => spool(buildEscPosReceipt(payload)),
    [spool]
  );

  const printKot = useCallback(
    (payload: KotPayload) => spool(buildKotTicket(payload)),
    [spool]
  );

  return { print, printKot, printing, error };
}

// Minimal WebUSB typing (kept local to avoid a global lib dependency)
interface USBLikeDevice {
  open: () => Promise<void>;
  close: () => Promise<void>;
  selectConfiguration: (n: number) => Promise<void>;
  claimInterface: (n: number) => Promise<void>;
  transferOut: (endpoint: number, data: Uint8Array) => Promise<unknown>;
  configuration: {
    interfaces: {
      alternate: { endpoints: { direction: string; endpointNumber: number }[] };
    }[];
  } | null;
}
