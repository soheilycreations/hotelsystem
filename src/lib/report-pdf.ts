/** A4 PDF export for the Daily Summary report — separate from the A5 bill layout. */

import { SI_DICT } from "./i18n/translations";

const A4: [number, number] = [210, 297]; // mm
const MARGIN = 16;
const SINHALA_FONT_URL = "/fonts/NotoSansSinhala-Regular.ttf";
const SINHALA_FONT_NAME = "NotoSansSinhala";

export type PdfLanguage = "en" | "si";

function fmt(n: number): string {
  return `Rs ${n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** Looks text up in the Sinhala dictionary (same one the on-screen UI uses)
 * — falls back to the English text untranslated so an export never breaks
 * or blanks out a line just because that phrase hasn't been added yet. */
function tr(text: string, language: PdfLanguage): string {
  if (language !== "si") return text;
  return SI_DICT[text] ?? text;
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
  addFileToVFS: (path: string, data: string) => void;
  addFont: (path: string, name: string, style: string) => void;
}

let sinhalaFontBase64: Promise<string> | null = null;

/** Fetches the Sinhala TTF from /public once per page load and caches the
 * base64 — jsPDF's built-in fonts (helvetica etc.) have no Sinhala glyphs,
 * so exporting a Sinhala report needs this font registered on the doc. */
function loadSinhalaFontBase64(): Promise<string> {
  if (!sinhalaFontBase64) {
    sinhalaFontBase64 = fetch(SINHALA_FONT_URL)
      .then((res) => res.arrayBuffer())
      .then((buf) => {
        const bytes = new Uint8Array(buf);
        let binary = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        return btoa(binary);
      });
  }
  return sinhalaFontBase64;
}

async function registerSinhalaFont(doc: PdfDoc): Promise<void> {
  const base64 = await loadSinhalaFontBase64();
  const fileName = "NotoSansSinhala-Regular.ttf";
  doc.addFileToVFS(fileName, base64);
  // Only one weight is embedded — register it for both styles so a
  // sectionHeader/row asking for "bold" doesn't hit a missing-font error.
  doc.addFont(fileName, SINHALA_FONT_NAME, "normal");
  doc.addFont(fileName, SINHALA_FONT_NAME, "bold");
}

async function newDoc(language: PdfLanguage = "en"): Promise<{ doc: PdfDoc; fontFamily: string }> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: A4 }) as unknown as PdfDoc;
  if (language === "si") {
    await registerSinhalaFont(doc);
    return { doc, fontFamily: SINHALA_FONT_NAME };
  }
  return { doc, fontFamily: "helvetica" };
}

class ReportLayout {
  y = MARGIN;
  constructor(private doc: PdfDoc, private width = A4[0], private fontFamily = "helvetica") {}
  title(text: string, size = 16): void {
    this.doc.setFont(this.fontFamily, "bold");
    this.doc.setFontSize(size);
    this.doc.text(text, MARGIN, this.y);
    this.y += size * 0.5 + 2;
  }
  subtitle(text: string, size = 10): void {
    this.doc.setFont(this.fontFamily, "normal");
    this.doc.setFontSize(size);
    this.doc.text(text, MARGIN, this.y);
    this.y += size * 0.5 + 3;
  }
  sectionHeader(text: string): void {
    this.space(3);
    this.guard(10);
    this.doc.setFont(this.fontFamily, "bold");
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
    this.doc.setFont(this.fontFamily, bold ? "bold" : "normal");
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
  language?: PdfLanguage;
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
  const lang: PdfLanguage = data.language ?? "en";
  const T = (text: string) => tr(text, lang);
  const { doc, fontFamily } = await newDoc(lang);
  const l = new ReportLayout(doc, A4[0], fontFamily);
  const W = A4[0];
  const colRight = W - MARGIN;

  l.title(data.hotelName);
  l.subtitle(
    `${T("Daily Summary")} — ${new Date(data.date).toLocaleDateString(lang === "si" ? "si-LK" : "en-GB", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })}`
  );
  l.divider();

  // Room sales
  l.sectionHeader(T("Room Sales"));
  if (data.roomSales.length === 0) {
    l.row([{ text: T("No checkouts recorded for this date."), x: MARGIN }], 9);
  } else {
    l.row(
      [
        { text: T("Guest"), x: MARGIN },
        { text: T("Room"), x: MARGIN + 55 },
        { text: T("Plan"), x: MARGIN + 75 },
        { text: T("Paid by"), x: MARGIN + 135 },
        { text: T("Amount"), x: colRight, align: "right" },
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
        { text: T(paidLabel), x: MARGIN + 135 },
        { text: fmt(r.amount), x: colRight, align: "right" },
      ]);
    }
  }
  l.divider();
  l.row(
    [
      { text: T("Room revenue total"), x: MARGIN },
      { text: fmt(data.roomRevenueTotal), x: colRight, align: "right" },
    ],
    10,
    true
  );

  // Item sales
  l.sectionHeader(T("Restaurant / POS Item Sales"));
  if (data.itemSales.length === 0) {
    l.row([{ text: T("No completed orders for this date."), x: MARGIN }], 9);
  } else {
    l.row(
      [
        { text: T("Item"), x: MARGIN },
        { text: T("Qty"), x: MARGIN + 110, align: "right" },
        { text: T("Revenue"), x: colRight, align: "right" },
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
    { text: T("POS subtotal"), x: MARGIN },
    { text: fmt(data.posSubtotal), x: colRight, align: "right" },
  ]);
  l.row([
    { text: T("Service charge"), x: MARGIN },
    { text: fmt(data.posServiceCharge), x: colRight, align: "right" },
  ]);
  l.row(
    [
      { text: T("POS total"), x: MARGIN },
      { text: fmt(data.posTotal), x: colRight, align: "right" },
    ],
    10,
    true
  );

  // Expenses
  l.sectionHeader(T("Expenses"));
  if (data.expenses.length === 0) {
    l.row([{ text: T("No expenses logged for this date."), x: MARGIN }], 9);
  } else {
    l.row(
      [
        { text: T("Category"), x: MARGIN },
        { text: T("Description"), x: MARGIN + 45 },
        { text: T("Amount"), x: colRight, align: "right" },
      ],
      9,
      true
    );
    for (const e of data.expenses) {
      const bankNote = e.paymentMethod === "bank_transfer" ? ` (${T("owner bank transfer")})` : "";
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
      { text: T("Expenses total (all)"), x: MARGIN },
      { text: fmt(data.expensesTotal), x: colRight, align: "right" },
    ],
    10,
    true
  );

  // Room and Restaurant are two separate cash pools — never combined into
  // one blended revenue/balance figure. Bank-transfer expenses are the
  // owner's own direct funds, not money spent out of the hotel's revenue,
  // so they're excluded from both balances (noted below, not subtracted).
  const expensesAgainstRevenue = data.expenses
    .filter((e) => e.paymentMethod !== "bank_transfer")
    .reduce((sum, e) => sum + e.amount, 0);
  const bankTransferTotal = data.expensesTotal - expensesAgainstRevenue;
  const roomBalance = data.roomRevenueTotal - data.roomExpenses;
  const restaurantBalance = data.posTotal - data.restaurantExpenses;

  l.sectionHeader(T("Room vs Restaurant"));
  if (bankTransferTotal > 0) {
    l.row(
      [{ text: `${T("Owner bank transfers excluded from both balances")}: ${fmt(bankTransferTotal)}`, x: MARGIN }],
      8
    );
  }
  l.row(
    [
      { text: "", x: MARGIN },
      { text: T("Room"), x: MARGIN + 90, align: "right" },
      { text: T("Restaurant"), x: colRight, align: "right" },
    ],
    9,
    true
  );
  l.row([
    { text: T("Revenue"), x: MARGIN },
    { text: fmt(data.roomRevenueTotal), x: MARGIN + 90, align: "right" },
    { text: fmt(data.posTotal), x: colRight, align: "right" },
  ]);
  l.row([
    { text: T("Expenses"), x: MARGIN },
    { text: fmt(data.roomExpenses), x: MARGIN + 90, align: "right" },
    { text: fmt(data.restaurantExpenses), x: colRight, align: "right" },
  ]);
  l.divider();
  l.row(
    [
      { text: T("Balance"), x: MARGIN },
      { text: fmt(roomBalance), x: MARGIN + 90, align: "right" },
      { text: fmt(restaurantBalance), x: colRight, align: "right" },
    ],
    11,
    true
  );

  // Room & Restaurant cash ledger — Inhand carried forward day to day
  l.sectionHeader(T("Room & Restaurant Ledger (cash)"));
  l.row(
    [
      { text: "", x: MARGIN },
      { text: T("Room"), x: MARGIN + 90, align: "right" },
      { text: T("Restaurant"), x: colRight, align: "right" },
    ],
    9,
    true
  );
  l.row([
    { text: T("Inhand (yesterday)"), x: MARGIN },
    { text: fmt(data.roomLedger.opening), x: MARGIN + 90, align: "right" },
    { text: fmt(data.restaurantLedger.opening), x: colRight, align: "right" },
  ]);
  l.row([
    { text: T("+ Today's cash in"), x: MARGIN },
    { text: fmt(data.roomLedger.todayIn), x: MARGIN + 90, align: "right" },
    { text: fmt(data.restaurantLedger.todayIn), x: colRight, align: "right" },
  ]);
  l.row([
    { text: T("- Today's cash out"), x: MARGIN },
    { text: fmt(data.roomLedger.todayOut), x: MARGIN + 90, align: "right" },
    { text: fmt(data.restaurantLedger.todayOut), x: colRight, align: "right" },
  ]);
  l.divider();
  l.row(
    [
      { text: T("Balance (carries to tomorrow)"), x: MARGIN },
      { text: fmt(data.roomLedger.closing), x: MARGIN + 90, align: "right" },
      { text: fmt(data.restaurantLedger.closing), x: colRight, align: "right" },
    ],
    11,
    true
  );

  // Cash movements today — the individual float top-ups / deposits /
  // withdrawals folded into the Restaurant ledger above
  if (data.todayCashMovements.length > 0) {
    l.sectionHeader(T("Cash movements today"));
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
    l.sectionHeader(T("Credit accounts — still owing"));
    l.row(
      [
        { text: T("Account"), x: MARGIN },
        { text: T("Balance"), x: colRight, align: "right" },
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
        { text: T("Total outstanding"), x: MARGIN },
        { text: fmt(outstandingTotal), x: colRight, align: "right" },
      ],
      10,
      true
    );
  }

  // Credit sales added today
  if (data.creditSales.length > 0) {
    l.sectionHeader(T("Credit — added today"));
    l.row(
      [
        { text: T("Account"), x: MARGIN },
        { text: T("Source"), x: MARGIN + 70 },
        { text: T("Amount"), x: colRight, align: "right" },
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
        { text: T("Total on credit today"), x: MARGIN },
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
  const { doc, fontFamily } = await newDoc();
  const l = new ReportLayout(doc, A4[0], fontFamily);
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

export interface ExpensesReportEntry {
  date: string;
  category: string;
  description: string | null;
  division: string;
  paymentMethod: string;
  amount: number;
  loggedBy: string | null;
}

export interface ExpensesReportData {
  hotelName: string;
  fromDate: string;
  toDate: string;
  entries: ExpensesReportEntry[];
}

const DIVISION_LABEL: Record<string, string> = { room: "Room", restaurant: "Restaurant" };
const PAYMENT_LABEL_PDF: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank Transfer",
  complimentary: "Complimentary",
  credit: "Credit",
};

export async function generateExpensesReportPdf(data: ExpensesReportData): Promise<Blob> {
  const { doc, fontFamily } = await newDoc();
  const l = new ReportLayout(doc, A4[0], fontFamily);
  const W = A4[0];
  const colRight = W - MARGIN;

  const pretty = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  l.title(data.hotelName);
  l.subtitle(`Expenses — ${pretty(data.fromDate)} to ${pretty(data.toDate)}`);
  l.divider();

  l.row(
    [
      { text: "Date", x: MARGIN },
      { text: "Category", x: MARGIN + 20 },
      { text: "Description", x: MARGIN + 55 },
      { text: "Division", x: MARGIN + 122 },
      { text: "Paid by", x: MARGIN + 148 },
      { text: "Amount", x: colRight, align: "right" },
    ],
    9,
    true
  );

  let total = 0;
  const byCategory = new Map<string, number>();
  const byDivision = new Map<string, number>();

  for (const e of data.entries) {
    total += e.amount;
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
    const divisionLabel = DIVISION_LABEL[e.division] ?? e.division;
    byDivision.set(divisionLabel, (byDivision.get(divisionLabel) ?? 0) + e.amount);

    l.row([
      { text: new Date(`${e.date}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), x: MARGIN },
      { text: e.category.slice(0, 18), x: MARGIN + 20 },
      { text: (e.description ?? "—").slice(0, 32), x: MARGIN + 55 },
      { text: divisionLabel, x: MARGIN + 122 },
      { text: PAYMENT_LABEL_PDF[e.paymentMethod] ?? e.paymentMethod, x: MARGIN + 148 },
      { text: fmt(e.amount), x: colRight, align: "right" },
    ]);
  }

  if (data.entries.length === 0) {
    l.row([{ text: "No expenses logged in this range.", x: MARGIN }], 9);
  }

  l.divider();
  l.row(
    [
      { text: `Total (${data.entries.length} entries)`, x: MARGIN },
      { text: fmt(total), x: colRight, align: "right" },
    ],
    11,
    true
  );

  l.sectionHeader("By category");
  for (const [category, amount] of Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1])) {
    l.row([
      { text: category, x: MARGIN },
      { text: fmt(amount), x: colRight, align: "right" },
    ]);
  }

  l.sectionHeader("By division");
  for (const [division, amount] of Array.from(byDivision.entries())) {
    l.row([
      { text: division, x: MARGIN },
      { text: fmt(amount), x: colRight, align: "right" },
    ]);
  }

  return doc.output("blob");
}

export interface BillDetailPdfRow {
  orderNumber: number;
  channel: string;
  reference: string;
  openedAt: string;
  settledAt: string | null;
  paymentMethod: string | null;
  cashierName: string | null;
  subtotal: number;
  serviceCharge: number;
  amount: number;
  items: { name: string; qty: number; unitPrice: number; lineTotal: number }[];
}

export interface BillsReportData {
  date: string; // YYYY-MM-DD
  hotelName: string;
  bills: BillDetailPdfRow[];
}

/** Full bill-by-bill export — every settled bill for the day with its line
 * items expanded, for reconciling the till in detail (not just totals). */
export async function generateBillsReportPdf(data: BillsReportData): Promise<Blob> {
  const { doc, fontFamily } = await newDoc();
  const l = new ReportLayout(doc, A4[0], fontFamily);
  const W = A4[0];
  const colRight = W - MARGIN;

  l.title(data.hotelName);
  l.subtitle(
    `All Bills — ${new Date(`${data.date}T00:00:00`).toLocaleDateString("en-GB", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })}`
  );
  l.subtitle(`${data.bills.length} bill(s)`, 9);
  l.divider();

  if (data.bills.length === 0) {
    l.row([{ text: "No bills settled for this date.", x: MARGIN }], 10);
  }

  for (const b of data.bills) {
    l.sectionHeader(`Bill #${b.orderNumber} — ${b.channel} — ${b.reference}`);
    const paidLabel = b.paymentMethod ? PAYMENT_LABEL_PDF[b.paymentMethod] ?? b.paymentMethod : "—";
    l.row(
      [
        {
          text: `Opened ${fmtTime(b.openedAt)}  ·  Settled ${b.settledAt ? fmtTime(b.settledAt) : "—"}  ·  ${paidLabel}  ·  Cashier: ${b.cashierName ?? "—"}`,
          x: MARGIN,
        },
      ],
      8.5
    );
    l.space(1.5);

    if (b.items.length > 0) {
      l.row(
        [
          { text: "Item", x: MARGIN + 2 },
          { text: "Qty", x: MARGIN + 120, align: "right" },
          { text: "Price", x: MARGIN + 148, align: "right" },
          { text: "Total", x: colRight, align: "right" },
        ],
        8,
        true
      );
      for (const it of b.items) {
        l.row([
          { text: it.name.slice(0, 55), x: MARGIN + 2 },
          { text: String(it.qty), x: MARGIN + 120, align: "right" },
          { text: fmt(it.unitPrice), x: MARGIN + 148, align: "right" },
          { text: fmt(it.lineTotal), x: colRight, align: "right" },
        ]);
      }
    }

    l.row([
      { text: "Subtotal", x: MARGIN + 2 },
      { text: fmt(b.subtotal), x: colRight, align: "right" },
    ]);
    if (b.serviceCharge > 0) {
      l.row([
        { text: "Service charge", x: MARGIN + 2 },
        { text: fmt(b.serviceCharge), x: colRight, align: "right" },
      ]);
    }
    l.row(
      [
        { text: "TOTAL", x: MARGIN + 2 },
        { text: fmt(b.amount), x: colRight, align: "right" },
      ],
      10,
      true
    );
    l.space(4);
  }

  if (data.bills.length > 0) {
    const grandTotal = data.bills.reduce((sum, b) => sum + b.amount, 0);
    l.divider();
    l.row(
      [
        { text: `Grand total (${data.bills.length} bills)`, x: MARGIN },
        { text: fmt(grandTotal), x: colRight, align: "right" },
      ],
      12,
      true
    );
  }

  return doc.output("blob");
}
