/** A4 PDF export for the Daily Summary report — separate from the A5 bill layout. */

const A4: [number, number] = [210, 297]; // mm
const MARGIN = 16;

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
}

async function newDoc(): Promise<PdfDoc> {
  const { jsPDF } = await import("jspdf");
  return new jsPDF({ unit: "mm", format: A4 }) as unknown as PdfDoc;
}

class ReportLayout {
  y = MARGIN;
  constructor(private doc: PdfDoc, private width = A4[0]) {}
  title(text: string, size = 16): void {
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(size);
    this.doc.text(text, MARGIN, this.y);
    this.y += size * 0.5 + 2;
  }
  subtitle(text: string, size = 10): void {
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(size);
    this.doc.text(text, MARGIN, this.y);
    this.y += size * 0.5 + 3;
  }
  sectionHeader(text: string): void {
    this.space(3);
    this.guard(10);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(12);
    this.doc.text(text, MARGIN, this.y);
    this.y += 5;
    this.doc.setDrawColor(60);
    this.doc.setLineWidth(0.3);
    this.doc.line(MARGIN, this.y, this.width - MARGIN, this.y);
    this.y += 5;
  }
  row(cols: { text: string; x: number; align?: "left" | "right" }[], size = 9, bold = false): void {
    this.guard();
    this.doc.setFont("helvetica", bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    for (const c of cols) {
      this.doc.text(c.text, c.x, this.y, c.align === "right" ? { align: "right" } : undefined);
    }
    this.y += size * 0.5 + 1.6;
  }
  divider(): void {
    this.guard();
    this.doc.setDrawColor(200);
    this.doc.setLineWidth(0.2);
    this.doc.line(MARGIN, this.y, this.width - MARGIN, this.y);
    this.y += 3;
  }
  space(mm = 3): void {
    this.y += mm;
  }
  private guard(extra = 0): void {
    if (this.y + extra > A4[1] - MARGIN) {
      this.doc.addPage();
      this.y = MARGIN;
    }
  }
}

export interface DailySummaryData {
  date: string; // YYYY-MM-DD
  hotelName: string;
  roomSales: {
    guestName: string;
    roomNumber: string;
    planName: string | null;
    amount: number;
  }[];
  roomRevenueTotal: number;
  itemSales: { name: string; qty: number; revenue: number }[];
  posSubtotal: number;
  posServiceCharge: number;
  posTotal: number;
  expenses: { category: string; description: string | null; amount: number }[];
  expensesTotal: number;
}

export async function generateDailySummaryPdf(data: DailySummaryData): Promise<Blob> {
  const doc = await newDoc();
  const l = new ReportLayout(doc);
  const W = A4[0];
  const colRight = W - MARGIN;

  l.title(data.hotelName);
  l.subtitle(`Daily Summary — ${new Date(data.date).toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`);
  l.divider();

  // Room sales
  l.sectionHeader("Room Sales");
  if (data.roomSales.length === 0) {
    l.row([{ text: "No checkouts recorded for this date.", x: MARGIN }], 9);
  } else {
    l.row(
      [
        { text: "Guest", x: MARGIN },
        { text: "Room", x: MARGIN + 60 },
        { text: "Plan", x: MARGIN + 85 },
        { text: "Amount", x: colRight, align: "right" },
      ],
      9,
      true
    );
    for (const r of data.roomSales) {
      l.row([
        { text: r.guestName, x: MARGIN },
        { text: r.roomNumber, x: MARGIN + 60 },
        { text: r.planName ?? "—", x: MARGIN + 85 },
        { text: fmt(r.amount), x: colRight, align: "right" },
      ]);
    }
  }
  l.divider();
  l.row(
    [
      { text: "Room revenue total", x: MARGIN },
      { text: fmt(data.roomRevenueTotal), x: colRight, align: "right" },
    ],
    10,
    true
  );

  // Item sales
  l.sectionHeader("Restaurant / POS Item Sales");
  if (data.itemSales.length === 0) {
    l.row([{ text: "No completed orders for this date.", x: MARGIN }], 9);
  } else {
    l.row(
      [
        { text: "Item", x: MARGIN },
        { text: "Qty", x: MARGIN + 110, align: "right" },
        { text: "Revenue", x: colRight, align: "right" },
      ],
      9,
      true
    );
    for (const it of data.itemSales) {
      l.row([
        { text: it.name, x: MARGIN },
        { text: String(it.qty), x: MARGIN + 110, align: "right" },
        { text: fmt(it.revenue), x: colRight, align: "right" },
      ]);
    }
  }
  l.divider();
  l.row([
    { text: "POS subtotal", x: MARGIN },
    { text: fmt(data.posSubtotal), x: colRight, align: "right" },
  ]);
  l.row([
    { text: "Service charge", x: MARGIN },
    { text: fmt(data.posServiceCharge), x: colRight, align: "right" },
  ]);
  l.row(
    [
      { text: "POS total", x: MARGIN },
      { text: fmt(data.posTotal), x: colRight, align: "right" },
    ],
    10,
    true
  );

  // Expenses
  l.sectionHeader("Expenses");
  if (data.expenses.length === 0) {
    l.row([{ text: "No expenses logged for this date.", x: MARGIN }], 9);
  } else {
    l.row(
      [
        { text: "Category", x: MARGIN },
        { text: "Description", x: MARGIN + 45 },
        { text: "Amount", x: colRight, align: "right" },
      ],
      9,
      true
    );
    for (const e of data.expenses) {
      l.row([
        { text: e.category, x: MARGIN },
        { text: (e.description ?? "—").slice(0, 45), x: MARGIN + 45 },
        { text: fmt(e.amount), x: colRight, align: "right" },
      ]);
    }
  }
  l.divider();
  l.row(
    [
      { text: "Expenses total", x: MARGIN },
      { text: fmt(data.expensesTotal), x: colRight, align: "right" },
    ],
    10,
    true
  );

  // Cash summary
  l.sectionHeader("Cash Summary");
  const totalRevenue = data.roomRevenueTotal + data.posTotal;
  const netCash = totalRevenue - data.expensesTotal;
  l.row([
    { text: "Total revenue (room + POS)", x: MARGIN },
    { text: fmt(totalRevenue), x: colRight, align: "right" },
  ]);
  l.row([
    { text: "Total expenses", x: MARGIN },
    { text: fmt(data.expensesTotal), x: colRight, align: "right" },
  ]);
  l.divider();
  l.row(
    [
      { text: "NET CASH BALANCE", x: MARGIN },
      { text: fmt(netCash), x: colRight, align: "right" },
    ],
    13,
    true
  );

  return doc.output("blob");
}

export function openPdfBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
