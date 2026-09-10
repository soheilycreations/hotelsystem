"use client";

import { useCallback, useState } from "react";
import type { OrderItem, RestaurantOrder } from "@/lib/types";
import { formatOrderNumber } from "@/lib/utils";

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

function line(char = "-", width = 48): number[] {
  return encode(char.repeat(width) + "\n");
}

function money(value: number): string {
  return value.toFixed(2);
}

function row(left: string, right: string, width = 48): number[] {
  const space = Math.max(1, width - left.length - right.length);
  return encode(left + " ".repeat(space) + right + "\n");
}

export interface ReceiptPayload {
  order: RestaurantOrder;
  items: OrderItem[];
  hotelName?: string;
  footerNote?: string;
  hotel?: HotelHeader;
}

/** Guest folio bill — room charge + extras + room-service orders, printed at checkout. */
export interface HotelHeader {
  name: string;
  address?: string | null;
  phonePrimary?: string | null;
  phoneSecondary?: string | null;
  reviewQrUrl?: string | null;
}

export interface FolioPayload {
  guestName: string;
  guestIdNumber?: string | null;
  roomNumber: string;
  roomTypeName?: string;
  checkInDate: string;
  checkOutDate: string;
  actualCheckIn?: string | null;
  actualCheckOut?: string | null;
  stayType?: "overnight" | "short_stay";
  durationHours?: number | null;
  planName?: string | null;
  nights: number;
  roomCharge: number;
  charges?: { description: string; amount: number }[];
  serviceOrders: {
    orderNumber: number;
    businessDate: string;
    amount: number;
    items?: { name: string; quantity: number; lineTotal: number }[];
  }[];
  total: number;
  hotel?: HotelHeader;
}

/** Converts an image URL into ESC/POS GS v 0 raster bitmap bytes (1-bit,
 * thresholded) — used to print the review QR as an actual bitmap rather
 * than attempting it as text. GS v 0 is one of the most broadly supported
 * ESC/POS commands, even on cheap clone printers. Returns [] on any
 * failure (offline, CORS, bad URL) so a bill never fails to print over a
 * QR code that didn't load. */
async function buildQrRasterBytes(url: string, targetWidthPx = 200): Promise<number[]> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);

    const widthBytes = Math.ceil(targetWidthPx / 8);
    const widthPx = widthBytes * 8;
    const heightPx = Math.max(1, Math.round((bitmap.height / bitmap.width) * widthPx));

    const canvas = document.createElement("canvas");
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, widthPx, heightPx);
    ctx.drawImage(bitmap, 0, 0, widthPx, heightPx);
    const { data } = ctx.getImageData(0, 0, widthPx, heightPx);

    const raster: number[] = [];
    for (let y = 0; y < heightPx; y++) {
      for (let xb = 0; xb < widthBytes; xb++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = xb * 8 + bit;
          const idx = (y * widthPx + x) * 4;
          const luminance = 0.299 * (data[idx] ?? 0) + 0.587 * (data[idx + 1] ?? 0) + 0.114 * (data[idx + 2] ?? 0);
          if (luminance < 128) byte |= 0x80 >> bit;
        }
        raster.push(byte);
      }
    }

    const xL = widthBytes & 0xff;
    const xH = (widthBytes >> 8) & 0xff;
    const yL = heightPx & 0xff;
    const yH = (heightPx >> 8) & 0xff;
    return [GS, 0x76, 0x30, 0x00, xL, xH, yL, yH, ...raster];
  } catch {
    return [];
  }
}

/** Appends the review QR (bitmap + caption) at the current print position,
 * if the hotel has one set. No-op (and no error) if it fails to load. */
async function pushReviewQr(bytes: number[], hotel: HotelHeader | undefined): Promise<void> {
  if (!hotel?.reviewQrUrl) return;
  const qrBytes = await buildQrRasterBytes(hotel.reviewQrUrl);
  if (qrBytes.length === 0) return;
  bytes.push(ESC, 0x61, 0x01); // center
  bytes.push(...qrBytes);
  bytes.push(...encode("\nScan to leave us a review!\n\n"));
}

function pushHotelHeader(bytes: number[], hotel: HotelHeader | undefined, fallback: string): void {
  bytes.push(ESC, 0x61, 0x01); // center
  bytes.push(ESC, 0x21, 0x30); // double size
  bytes.push(...encode(`${hotel?.name ?? fallback}\n`));
  bytes.push(ESC, 0x21, 0x00);
  if (hotel?.address) bytes.push(...encode(`${hotel.address}\n`));
  const phones = [hotel?.phonePrimary, hotel?.phoneSecondary].filter(Boolean).join(" / ");
  if (phones) bytes.push(...encode(`Tel: ${phones}\n`));
}

export async function buildFolioReceipt(payload: FolioPayload): Promise<Uint8Array> {
  const {
    guestName,
    guestIdNumber,
    roomNumber,
    roomTypeName,
    checkInDate,
    checkOutDate,
    actualCheckIn,
    actualCheckOut,
    stayType,
    durationHours,
    planName,
    nights,
    roomCharge,
    charges = [],
    serviceOrders,
    total,
    hotel,
  } = payload;
  const bytes: number[] = [];

  bytes.push(ESC, 0x40);
  pushHotelHeader(bytes, hotel, "SOHEILY PMS");
  bytes.push(...encode("GUEST FOLIO / ROOM BILL\n"));
  bytes.push(...line("="));

  bytes.push(ESC, 0x61, 0x00); // left
  bytes.push(...row("Guest", guestName));
  if (guestIdNumber) bytes.push(...row("NIC / Passport", guestIdNumber));
  bytes.push(...row("Room", `${roomNumber}${roomTypeName ? ` (${roomTypeName})` : ""}`));
  if (stayType === "short_stay") {
    bytes.push(...row("Stay", `${durationHours ?? "?"}h block`));
  }
  bytes.push(
    ...row(
      actualCheckIn ? "Checked in" : "Check-in",
      actualCheckIn
        ? new Date(actualCheckIn).toLocaleString("en-GB")
        : stayType === "short_stay"
        ? new Date(checkInDate).toLocaleString("en-GB")
        : new Date(checkInDate).toLocaleDateString("en-GB")
    )
  );
  bytes.push(
    ...row(
      actualCheckOut ? "Checked out" : stayType === "short_stay" ? "Until" : "Check-out",
      actualCheckOut
        ? new Date(actualCheckOut).toLocaleString("en-GB")
        : stayType === "short_stay"
        ? new Date(checkOutDate).toLocaleString("en-GB")
        : new Date(checkOutDate).toLocaleDateString("en-GB")
    )
  );
  bytes.push(...row("Printed", new Date().toLocaleString("en-GB")));
  bytes.push(...line());

  if (stayType === "short_stay") {
    bytes.push(...row(planName ?? `Short stay ${durationHours ?? "?"}h`, money(roomCharge)));
  } else {
    const nightly = nights > 0 ? roomCharge / nights : roomCharge;
    bytes.push(
      ...row(
        `${planName ?? "Room"} ${nights} night(s) x ${money(nightly)}`,
        money(roomCharge)
      )
    );
  }
  for (const c of charges) {
    bytes.push(...row(c.description, money(c.amount)));
  }
  for (const so of serviceOrders) {
    bytes.push(...row(`Room service #${formatOrderNumber(so.businessDate, so.orderNumber)}`, money(so.amount)));
    for (const item of so.items ?? []) {
      bytes.push(...encode(`  ${item.quantity} x ${item.name}\n`));
    }
  }
  bytes.push(...line());

  bytes.push(ESC, 0x21, 0x10);
  bytes.push(...row("TOTAL", money(total)));
  bytes.push(ESC, 0x21, 0x00);
  bytes.push(...line("="));

  bytes.push(ESC, 0x61, 0x01);
  bytes.push(...encode("Thank you for staying with us!\n\n"));
  await pushReviewQr(bytes, hotel);
  bytes.push(GS, 0x56, 0x42, 0x10);

  return new Uint8Array(bytes);
}

/** Kitchen (KOT) or bar (BOT) order ticket — only the pending items for that
 * station, no prices. Caller pre-splits items by station before calling. */
export interface KotPayload {
  order: RestaurantOrder;
  items: OrderItem[]; // pass ONLY the lines not yet sent for this station
  station?: "kitchen" | "bar"; // defaults to "kitchen"
  kotNumber?: number;
}

export function buildKotTicket({ order, items, station = "kitchen", kotNumber }: KotPayload): Uint8Array {
  const bytes: number[] = [];
  const heading = station === "bar" ? "*** BOT ***" : "*** KOT ***";
  const ticketLabel = station === "bar" ? "BOT" : "KOT";

  bytes.push(ESC, 0x40); // initialize
  bytes.push(ESC, 0x61, 0x01); // center
  bytes.push(ESC, 0x21, 0x30); // double height + width
  bytes.push(...encode(`${heading}\n`));
  bytes.push(ESC, 0x21, 0x00);
  bytes.push(...line("="));

  bytes.push(ESC, 0x61, 0x00); // left
  bytes.push(
    ...row(
      `Order #${formatOrderNumber(order.business_date, order.order_number)}${kotNumber ? ` / ${ticketLabel} ${kotNumber}` : ""}`,
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

export async function buildEscPosReceipt({
  order,
  items,
  hotelName = "SOHEILY GRAND HOTEL",
  footerNote = "Thank you — come again!",
  hotel,
}: ReceiptPayload): Promise<Uint8Array> {
  const bytes: number[] = [];

  bytes.push(ESC, 0x40); // initialize
  pushHotelHeader(bytes, hotel, hotelName);
  bytes.push(...encode("Restaurant & Room Service\n"));
  bytes.push(...line("="));

  bytes.push(ESC, 0x61, 0x00); // left align
  bytes.push(
    ...row(
      `Bill #${formatOrderNumber(order.business_date, order.order_number)}`,
      order.channel_type.replace("_", " ").toUpperCase()
    )
  );
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
  const subtotal = Number(order.subtotal ?? order.total_amount);
  const serviceCharge = Number(order.service_charge ?? 0);
  if (serviceCharge > 0) {
    const pct = subtotal > 0 ? Math.round((serviceCharge / subtotal) * 100) : 0;
    bytes.push(...row("Subtotal", subtotal.toFixed(2)));
    bytes.push(...row(`Service charge ${pct}%`, serviceCharge.toFixed(2)));
    bytes.push(...line());
  }
  bytes.push(ESC, 0x21, 0x10); // emphasized
  bytes.push(...row("TOTAL (LKR)", order.total_amount.toFixed(2)));
  bytes.push(ESC, 0x21, 0x00);
  bytes.push(...line("="));

  bytes.push(ESC, 0x61, 0x01); // center
  bytes.push(...encode(footerNote + "\n\n"));
  await pushReviewQr(bytes, hotel);

  bytes.push(GS, 0x56, 0x42, 0x10); // partial cut with feed

  return new Uint8Array(bytes);
}

interface UseThermalPrintResult {
  print: (payload: ReceiptPayload) => Promise<boolean>;
  printKot: (payload: KotPayload) => Promise<boolean>;
  printFolio: (payload: FolioPayload) => Promise<boolean>;
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
          getDevices: () => Promise<USBLikeDevice[]>;
          requestDevice: (opts: { filters: { classCode: number }[] }) => Promise<USBLikeDevice>;
        };
      };

      if (!nav.usb) {
        window.print(); // graceful fallback for browsers without WebUSB
        return true;
      }

      // Reuse a printer the user already granted access to — getDevices()
      // never shows a permission prompt. Only fall back to requestDevice()
      // (which does show the chooser) the very first time, or if the
      // browser has forgotten the grant (e.g. site data was cleared).
      const known = await nav.usb.getDevices();
      const device = known[0] ?? (await nav.usb.requestDevice({ filters: [{ classCode: 7 }] }));

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
    async (payload: ReceiptPayload) => spool(await buildEscPosReceipt(payload)),
    [spool]
  );

  const printKot = useCallback(
    (payload: KotPayload) => spool(buildKotTicket(payload)),
    [spool]
  );

  const printFolio = useCallback(
    async (payload: FolioPayload) => spool(await buildFolioReceipt(payload)),
    [spool]
  );

  return { print, printKot, printFolio, printing, error };
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
