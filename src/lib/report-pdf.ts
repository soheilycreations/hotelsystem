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
    paymentMethod?: string;
  }[];
  roomRevenueTotal: number;
  itemSales: { name: string; qty: number; revenue: number }[];
  posSubtotal: number;
  posServiceCharge: number;
  posTotal: number;
  expenses: { category: string; description: string | null; amount: number; paymentMethod?: string }[];
  expensesTotal: number;
  roomExpenses: number;
  restaurantExpenses: number;
  roomLedger: { opening: number; todayIn: number; todayOut: number; closing: number };
  restaurantLedger: { opening: number; todayIn: number; todayOut: number; closing: number };
  todayCashMovements: { direction: string; category: string; description: string | null; amount: number }[];
  creditSales: { source: string; accountName: string; amount: number }[];
  creditAccountBalances: { accountName: string; balance: number }[];
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
        { text: "Room", x: MARGIN + 55 },
        { text: "Plan", x: MARGIN + 75 },
        { text: "Paid by", x: MARGIN + 135 },
        { text: "Amount", x: colRight, align: "right" },
      ],
      9,
      true
    );
    for (const r of data.roomSales) {
      const paidLabel =
        r.paymentMethod === "bank_transfer"
          ? "Bank Transfer"
          : r.paymentMethod === "card"
          ? "Card"
          : r.paymentMethod === "complimentary"
          ? "Complimentary"
          : "Cash";
      l.row([
        { text: r.guestName, x: MARGIN },
        { text: r.roomNumber, x: MARGIN + 55 },
        { text: r.planName ?? "—", x: MARGIN + 75 },
        { text: paidLabel, x: MARGIN + 135 },
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
      const bankNote = e.paymentMethod === "bank_transfer" ? " (owner bank transfer)" : "";
      l.row([
        { text: e.category, x: MARGIN },
        { text: `${(e.description ?? "—").slice(0, 40)}${bankNote}`.slice(0, 45), x: MARGIN + 45 },
        { text: fmt(e.amount), x: colRight, align: "right" },
      ]);
    }
  }
  l.divider();
  l.row(
    [
      { text: "Expenses total (all)", x: MARGIN },
      { text: fmt(data.expensesTotal), x: colRight, align: "right" },
    ],
    10,
    true
  );

  // Cash summary — bank-transfer expenses are the owner's own direct funds,
  // not money spent out of the hotel's revenue, so they're excluded here.
  const expensesAgainstRevenue = data.expenses
    .filter((e) => e.paymentMethod !== "bank_transfer")
    .reduce((sum, e) => sum + e.amount, 0);
  const bankTransferTotal = data.expensesTotal - expensesAgainstRevenue;

  l.sectionHeader("Cash Summary");
  const totalRevenue = data.roomRevenueTotal + data.posTotal;
  const netCash = totalRevenue - expensesAgainstRevenue;
  l.row([
    { text: "Total revenue (room + POS)", x: MARGIN },
    { text: fmt(totalRevenue), x: colRight, align: "right" },
  ]);
  l.row([
    { text: "Expenses (against revenue)", x: MARGIN },
    { text: fmt(expensesAgainstRevenue), x: colRight, align: "right" },
  ]);
  if (bankTransferTotal > 0) {
    l.row([
      { text: "Owner bank transfers (excluded)", x: MARGIN },
      { text: fmt(bankTransferTotal), x: colRight, align: "right" },
    ]);
  }
  l.divider();
  l.row(
    [
      { text: "NET CASH BALANCE", x: MARGIN },
      { text: fmt(netCash), x: colRight, align: "right" },
    ],
    13,
    true
  );

  // Room vs Restaurant
  const roomBalance = data.roomRevenueTotal - data.roomExpenses;
  const restaurantBalance = data.posTotal - data.restaurantExpenses;

  l.sectionHeader("Room vs Restaurant");
  l.row(
    [
      { text: "", x: MARGIN },
      { text: "Room", x: MARGIN + 90, align: "right" },
      { text: "Restaurant", x: colRight, align: "right" },
    ],
    9,
    true
  );
  l.row([
    { text: "Revenue", x: MARGIN },
    { text: fmt(data.roomRevenueTotal), x: MARGIN + 90, align: "right" },
    { text: fmt(data.posTotal), x: colRight, align: "right" },
  ]);
  l.row([
    { text: "Expenses", x: MARGIN },
    { text: fmt(data.roomExpenses), x: MARGIN + 90, align: "right" },
    { text: fmt(data.restaurantExpenses), x: colRight, align: "right" },
  ]);
  l.divider();
  l.row(
    [
      { text: "Balance", x: MARGIN },
      { text: fmt(roomBalance), x: MARGIN + 90, align: "right" },
      { text: fmt(restaurantBalance), x: colRight, align: "right" },
    ],
    11,
    true
  );

  // Room & Restaurant cash ledger — Inhand carried forward day to day
  l.sectionHeader("Room & Restaurant Ledger (cash)");
  l.row(
    [
      { text: "", x: MARGIN },
      { text: "Room", x: MARGIN + 90, align: "right" },
      { text: "Restaurant", x: colRight, align: "right" },
    ],
    9,
    true
  );
  l.row([
    { text: "Inhand (yesterday)", x: MARGIN },
    { text: fmt(data.roomLedger.opening), x: MARGIN + 90, align: "right" },
    { text: fmt(data.restaurantLedger.opening), x: colRight, align: "right" },
  ]);
  l.row([
    { text: "+ Today's cash in", x: MARGIN },
    { text: fmt(data.roomLedger.todayIn), x: MARGIN + 90, align: "right" },
    { text: fmt(data.restaurantLedger.todayIn), x: colRight, align: "right" },
  ]);
  l.row([
    { text: "- Today's cash out", x: MARGIN },
    { text: fmt(data.roomLedger.todayOut), x: MARGIN + 90, align: "right" },
    { text: fmt(data.restaurantLedger.todayOut), x: colRight, align: "right" },
  ]);
  l.divider();
  l.row(
    [
      { text: "Balance (carries to tomorrow)", x: MARGIN },
      { text: fmt(data.roomLedger.closing), x: MARGIN + 90, align: "right" },
      { text: fmt(data.restaurantLedger.closing), x: colRight, align: "right" },
    ],
    11,
    true
  );

  // Cash movements today — the individual float top-ups / deposits /
  // withdrawals folded into the Restaurant ledger above
  if (data.todayCashMovements.length > 0) {
    l.sectionHeader("Cash movements today");
    for (const m of data.todayCashMovements) {
      const sign = m.direction === "in" ? "+" : "-";
      l.row([
        { text: m.category.slice(0, 30), x: MARGIN },
        { text: (m.description ?? "").slice(0, 40), x: MARGIN + 70 },
        { text: `${sign}${fmt(m.amount)}`, x: colRight, align: "right" },
      ]);
    }
  }

  // Credit accounts — running balance, persists until settled
  if (data.creditAccountBalances.length > 0) {
    l.sectionHeader("Credit accounts — still owing");
    l.row(
      [
        { text: "Account", x: MARGIN },
        { text: "Balance", x: colRight, align: "right" },
      ],
      9,
      true
    );
    let outstandingTotal = 0;
    for (const a of data.creditAccountBalances) {
      outstandingTotal += a.balance;
      l.row([
        { text: a.accountName.slice(0, 40), x: MARGIN },
        { text: fmt(a.balance), x: colRight, align: "right" },
      ]);
    }
    l.divider();
    l.row(
      [
        { text: "Total outstanding", x: MARGIN },
        { text: fmt(outstandingTotal), x: colRight, align: "right" },
      ],
      10,
      true
    );
  }

  // Credit sales added today
  if (data.creditSales.length > 0) {
    l.sectionHeader("Credit — added today");
    l.row(
      [
        { text: "Account", x: MARGIN },
        { text: "Source", x: MARGIN + 70 },
        { text: "Amount", x: colRight, align: "right" },
      ],
      9,
      true
    );
    let creditTotal = 0;
    for (const c of data.creditSales) {
      creditTotal += c.amount;
      l.row([
        { text: c.accountName.slice(0, 28), x: MARGIN },
        { text: c.source.slice(0, 38), x: MARGIN + 70 },
        { text: fmt(c.amount), x: colRight, align: "right" },
      ]);
    }
    l.divider();
    l.row(
      [
        { text: "Total on credit today", x: MARGIN },
        { text: fmt(creditTotal), x: colRight, align: "right" },
      ],
      10,
      true
    );
  }

  return doc.output("blob");
}

export interface CashBookLedgerEntry {
  date: string;
  description: string;
  direction: "in" | "out";
  amount: number;
  runningBalance: number;
}

export interface CashBookData {
  hotelName: string;
  fromDate: string;
  toDate: string;
  openingBalance: number;
  closingBalance: number;
  totalIn: number;
  totalOut: number;
  ledger: CashBookLedgerEntry[];
  roomRevenue: number;
  roomExpenses: number;
  restaurantRevenue: number;
  restaurantExpenses: number;
}

export async function generateCashBookPdf(data: CashBookData): Promise<Blob> {
  const doc = await newDoc();
  const l = new ReportLayout(doc);
  const W = A4[0];
  const colRight = W - MARGIN;

  const prettyDate = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  l.title(data.hotelName);
  l.subtitle(`Cash Book — ${prettyDate(data.fromDate)} to ${prettyDate(data.toDate)}`);
  l.divider();

  l.row(
    [
      { text: "Opening balance", x: MARGIN },
      { text: fmt(data.openingBalance), x: colRight, align: "right" },
    ],
    10,
    true
  );
  l.space(2);

  l.sectionHeader("Ledger");
  l.row(
    [
      { text: "Date", x: MARGIN },
      { text: "Description", x: MARGIN + 28 },
      { text: "In", x: MARGIN + 122, align: "right" },
      { text: "Out", x: MARGIN + 150, align: "right" },
      { text: "Balance", x: colRight, align: "right" },
    ],
    9,
    true
  );
  if (data.ledger.length === 0) {
    l.row([{ text: "No cash movements in this range.", x: MARGIN }], 9);
  } else {
    for (const e of data.ledger) {
      l.row([
        { text: new Date(`${e.date}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), x: MARGIN },
        { text: e.description.slice(0, 46), x: MARGIN + 28 },
        { text: e.direction === "in" ? fmt(e.amount) : "", x: MARGIN + 122, align: "right" },
        { text: e.direction === "out" ? fmt(e.amount) : "", x: MARGIN + 150, align: "right" },
        { text: fmt(e.runningBalance), x: colRight, align: "right" },
      ]);
    }
  }

  l.divider();
  l.row([
    { text: "Total cash in", x: MARGIN },
    { text: fmt(data.totalIn), x: colRight, align: "right" },
  ]);
  l.row([
    { text: "Total cash out", x: MARGIN },
    { text: fmt(data.totalOut), x: colRight, align: "right" },
  ]);
  l.divider();
  l.row(
    [
      { text: "CLOSING BALANCE", x: MARGIN },
      { text: fmt(data.closingBalance), x: colRight, align: "right" },
    ],
    13,
    true
  );

  // Room vs Restaurant (cash only, this range)
  const roomBalance = data.roomRevenue - data.roomExpenses;
  const restaurantBalance = data.restaurantRevenue - data.restaurantExpenses;

  l.sectionHeader("Room vs Restaurant (cash, this range)");
  l.row(
    [
      { text: "", x: MARGIN },
      { text: "Room", x: MARGIN + 90, align: "right" },
      { text: "Restaurant", x: colRight, align: "right" },
    ],
    9,
    true
  );
  l.row([
    { text: "Cash in", x: MARGIN },
    { text: fmt(data.roomRevenue), x: MARGIN + 90, align: "right" },
    { text: fmt(data.restaurantRevenue), x: colRight, align: "right" },
  ]);
  l.row([
    { text: "Cash out", x: MARGIN },
    { text: fmt(data.roomExpenses), x: MARGIN + 90, align: "right" },
    { text: fmt(data.restaurantExpenses), x: colRight, align: "right" },
  ]);
  l.divider();
  l.row(
    [
      { text: "Balance", x: MARGIN },
      { text: fmt(roomBalance), x: MARGIN + 90, align: "right" },
      { text: fmt(restaurantBalance), x: colRight, align: "right" },
    ],
    11,
    true
  );

  return doc.output("blob");
}

export function openPdfBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
