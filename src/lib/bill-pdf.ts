/**
 * Paperless billing utilities — A5 PDF bills built client-side with jsPDF,
 * uploaded to the public "bills" storage bucket so a link can be WhatsApped.
 */
import { createClient } from "@/lib/supabase/client";
import type { FolioPayload, ReceiptPayload } from "@/hooks/useThermalPrint";

const A5: [number, number] = [148, 210]; // mm
const MARGIN = 14;

function fmt(n: number): string {
  return `Rs ${n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface PdfDoc {
  text: (t: string, x: number, y: number, o?: Record<string, unknown>) => void;
  setFont: (f: string, s: string) => void;
  setFontSize: (n: number) => void;
  setLineWidth: (n: number) => void;
  setDrawColor: (n: number) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  addPage: () => void;
  output: (t: "blob") => Blob;
  splitTextToSize: (t: string, w: number) => string[];
}

async function newDoc(): Promise<PdfDoc> {
  const { jsPDF } = await import("jspdf");
  return new jsPDF({ unit: "mm", format: A5 }) as unknown as PdfDoc;
}

class Layout {
  y = MARGIN;
  constructor(private doc: PdfDoc, private width = A5[0]) {}
  center(text: string, size: number, bold = false): void {
    this.doc.setFont("helvetica", bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    this.doc.text(text, this.width / 2, this.y, { align: "center" });
    this.y += size * 0.45 + 1.5;
  }
  row(left: string, right: string, size = 9, bold = false): void {
    this.guard();
    this.doc.setFont("helvetica", bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    this.doc.text(left, MARGIN, this.y);
    this.doc.text(right, this.width - MARGIN, this.y, { align: "right" });
    this.y += size * 0.5 + 1.8;
  }
  divider(): void {
    this.guard();
    this.doc.setDrawColor(150);
    this.doc.setLineWidth(0.2);
    this.doc.line(MARGIN, this.y, this.width - MARGIN, this.y);
    this.y += 4;
  }
  space(mm = 2): void {
    this.y += mm;
  }
  private guard(): void {
    if (this.y > A5[1] - MARGIN) {
      this.doc.addPage();
      this.y = MARGIN;
    }
  }
}

function header(l: Layout, hotel: FolioPayload["hotel"], subtitle: string): void {
  l.center(hotel?.name ?? "SOHEILY PMS", 15, true);
  if (hotel?.address) l.center(hotel.address, 8);
  const phones = [hotel?.phonePrimary, hotel?.phoneSecondary].filter(Boolean).join(" / ");
  if (phones) l.center(`Tel: ${phones}`, 8);
  l.space(1);
  l.center(subtitle, 10, true);
  l.divider();
}

export async function generateFolioPdf(payload: FolioPayload): Promise<Blob> {
  const doc = await newDoc();
  const l = new Layout(doc);

  header(l, payload.hotel, "GUEST FOLIO / ROOM BILL");

  l.row("Guest", payload.guestName);
  l.row(
    "Room",
    `${payload.roomNumber}${payload.roomTypeName ? ` (${payload.roomTypeName})` : ""}`
  );
  if (payload.stayType === "short_stay") {
    l.row("Stay", `${payload.durationHours ?? "?"}h block`);
  }
  if (payload.actualCheckIn) {
    l.row("Checked in", new Date(payload.actualCheckIn).toLocaleString("en-GB"));
  } else {
    l.row("Check-in", new Date(payload.checkInDate).toLocaleDateString("en-GB"));
  }
  if (payload.actualCheckOut) {
    l.row("Checked out", new Date(payload.actualCheckOut).toLocaleString("en-GB"));
  } else if (payload.stayType === "short_stay") {
    l.row("Until", new Date(payload.checkOutDate).toLocaleString("en-GB"));
  } else {
    l.row("Check-out", new Date(payload.checkOutDate).toLocaleDateString("en-GB"));
  }
  l.row("Printed", new Date().toLocaleString("en-GB"));
  l.divider();

  if (payload.stayType === "short_stay") {
    l.row(payload.planName ?? `Short stay ${payload.durationHours ?? "?"}h`, fmt(payload.roomCharge));
  } else {
    const nightly = payload.nights > 0 ? payload.roomCharge / payload.nights : payload.roomCharge;
    l.row(
      `${payload.planName ?? "Room"} — ${payload.nights} night(s) x ${fmt(nightly)}`,
      fmt(payload.roomCharge)
    );
  }
  for (const c of payload.charges ?? []) l.row(c.description, fmt(c.amount));
  for (const so of payload.serviceOrders) l.row(`Room service — bill #${so.orderNumber}`, fmt(so.amount));
  l.divider();
  l.row("TOTAL", fmt(payload.total), 12, true);
  l.divider();
  l.space(2);
  l.center("Thank you for staying with us!", 9);

  return doc.output("blob");
}

export async function generateReceiptPdf(payload: ReceiptPayload): Promise<Blob> {
  const doc = await newDoc();
  const l = new Layout(doc);
  const { order, items, hotel } = payload;

  header(l, hotel, "RESTAURANT BILL");

  l.row(`Bill #${order.order_number}`, order.channel_type.replace("_", " ").toUpperCase());
  l.row("Date", new Date(order.created_at).toLocaleString("en-GB"));
  if (order.restaurant_tables) l.row("Table", order.restaurant_tables.table_number);
  if (order.bookings) l.row("Guest", order.bookings.guest_name);
  l.divider();

  for (const item of items) {
    l.row(
      `${item.menu_items?.name ?? "Item"}  (${item.quantity} x ${Number(item.unit_price).toFixed(2)})`,
      fmt(Number(item.line_total))
    );
  }
  l.divider();

  const subtotal = Number(order.subtotal ?? order.total_amount);
  const sc = Number(order.service_charge ?? 0);
  if (sc > 0) {
    const pct = subtotal > 0 ? Math.round((sc / subtotal) * 100) : 0;
    l.row("Subtotal", fmt(subtotal));
    l.row(`Service charge ${pct}%`, fmt(sc));
  }
  l.row("TOTAL", fmt(Number(order.total_amount)), 12, true);
  l.divider();
  l.space(2);
  l.center("Thank you — come again!", 9);

  return doc.output("blob");
}

export function openPdf(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Uploads to the public "bills" bucket and returns a shareable URL. */
export async function uploadBillPdf(fileName: string, blob: Blob): Promise<string> {
  const supabase = createClient();
  const path = `${new Date().toISOString().slice(0, 10)}/${fileName}`;
  const { error } = await supabase.storage
    .from("bills")
    .upload(path, blob, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`Could not upload the bill PDF: ${error.message}`);
  const { data } = supabase.storage.from("bills").getPublicUrl(path);
  return data.publicUrl;
}

/** Normalise a Sri Lankan number and build a wa.me link with a prefilled message. */
export function buildWhatsAppUrl(phone: string, message: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = "94" + digits.slice(1);
  if (!digits.startsWith("94") && digits.length === 9) digits = "94" + digits;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
