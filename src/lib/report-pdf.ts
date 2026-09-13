/** A4 PDF export for the Daily Summary report — separate from the A5 bill layout. */

import { SI_DICT } from "./i18n/translations";
import { exportHtmlReport, escapeHtml } from "./html-pdf";
import { formatOrderNumber } from "./utils";

const A4: [number, number] = [210, 297]; // mm
const MARGIN = 16;

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

/** "Cash: Rs X   Owner / Boss: Rs Y   ..." — one line summing the day's
 * expenses by how they were paid, so it's obvious at a glance how much
 * actually came out of the till versus the owner's own pocket. */
function paymentBreakdownText(
  expenses: { amount: number; paymentMethod?: string }[],
  T: (text: string) => string
): string {
  const totals = expenses.reduce((acc: Record<string, number>, e) => {
    const key = e.paymentMethod ?? "cash";
    acc[key] = (acc[key] ?? 0) + e.amount;
    return acc;
  }, {});
  return Object.entries(totals)
    .map(([method, amount]) => `${T(PAYMENT_LABEL_PDF[method] ?? method)}: ${fmt(amount)}`)
    .join("   ");
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

/**
 * jsPDF's text() maps each character straight to a glyph with no OpenType
 * shaping — Sinhala needs real shaping (vowel-sign reordering, GSUB
 * conjuncts) or it renders as broken glyph soup, so this vector/text path
 * is English-only. A Sinhala export goes through generateDailySummaryPdfHtml
 * instead, which rasterizes real (correctly-shaped) browser-rendered HTML.
 */
export async function generateDailySummaryPdf(data: DailySummaryData): Promise<Blob> {
  if ((data.language ?? "en") === "si") return generateDailySummaryPdfHtml(data);
  return generateDailySummaryPdfVector(data);
}

async function generateDailySummaryPdfVector(data: DailySummaryData): Promise<Blob> {
  const lang: PdfLanguage = "en";
  const T = (text: string) => tr(text, lang);
  const doc = await newDoc();
  const l = new ReportLayout(doc);
  const W = A4[0];
  const colRight = W - MARGIN;

  l.title(data.hotelName);
  l.subtitle(
    `${T("Daily Summary")} — ${new Date(data.date).toLocaleDateString("en-GB", {
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
      const bankNote =
        e.paymentMethod === "bank_transfer" || e.paymentMethod === "owner_paid"
          ? ` (${T("owner funded")})`
          : "";
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
  if (data.expenses.length > 0) {
    l.row([{ text: paymentBreakdownText(data.expenses, T), x: MARGIN }], 8);
  }

  // Room and Restaurant are two separate cash pools — never combined into
  // one blended revenue/balance figure. Bank-transfer and owner-paid
  // expenses are the owner's own direct funds, not money spent out of the
  // hotel's revenue, so they're excluded from both balances (noted below,
  // not subtracted).
  const expensesAgainstRevenue = data.expenses
    .filter((e) => e.paymentMethod !== "bank_transfer" && e.paymentMethod !== "owner_paid")
    .reduce((sum, e) => sum + e.amount, 0);
  const bankTransferTotal = data.expensesTotal - expensesAgainstRevenue;
  const roomBalance = data.roomRevenueTotal - data.roomExpenses;
  const restaurantBalance = data.posTotal - data.restaurantExpenses;

  l.sectionHeader(T("Room vs Restaurant"));
  if (bankTransferTotal > 0) {
    l.row(
      [{ text: `${T("Owner-funded expenses excluded from both balances")}: ${fmt(bankTransferTotal)}`, x: MARGIN }],
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

function htmlSectionHeader(text: string): string {
  return `<div style="font-size:14px;font-weight:700;margin:16px 0 6px;padding-bottom:4px;border-bottom:1px solid #666;">${escapeHtml(
    text
  )}</div>`;
}

function htmlTable(headers: string[], rows: string[][]): string {
  const th = headers
    .map(
      (h, i) =>
        `<th style="text-align:${i === headers.length - 1 ? "right" : "left"};padding:3px 6px;border-bottom:1px solid #999;font-weight:700;">${escapeHtml(h)}</th>`
    )
    .join("");
  const trs = rows
    .map(
      (cols) =>
        `<tr>${cols
          .map(
            (c, i) =>
              `<td style="padding:3px 6px;text-align:${i === cols.length - 1 ? "right" : "left"};">${c}</td>`
          )
          .join("")}</tr>`
    )
    .join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:12px;">${
    th ? `<thead><tr>${th}</tr></thead>` : ""
  }<tbody>${trs}</tbody></table>`;
}

function htmlTotalRow(label: string, value: string, bold = false): string {
  return `<div style="display:flex;justify-content:space-between;padding:5px 6px;border-top:1px solid #ccc;font-weight:${
    bold ? 700 : 400
  };font-size:${bold ? 13 : 12}px;"><span>${escapeHtml(label)}</span><span>${value}</span></div>`;
}

function htmlTwoColTotal(label: string, room: string, restaurant: string, bold = false): string {
  return `<div style="display:flex;justify-content:space-between;padding:5px 6px;border-top:1px solid #ccc;font-weight:${
    bold ? 700 : 400
  };font-size:${bold ? 13 : 12}px;"><span style="flex:1;">${escapeHtml(
    label
  )}</span><span style="width:90px;text-align:right;">${room}</span><span style="width:90px;text-align:right;">${restaurant}</span></div>`;
}

/**
 * Same report as generateDailySummaryPdfVector, built as plain HTML and
 * rasterized via html2canvas — the browser shapes Sinhala correctly where
 * jsPDF's own text drawing can't (see comment above the vector function).
 */
async function generateDailySummaryPdfHtml(data: DailySummaryData): Promise<Blob> {
  const T = (text: string) => tr(text, "si");
  const dateLabel = new Date(`${data.date}T00:00:00`).toLocaleDateString("si-LK", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const paidLabelOf = (m?: string) =>
    m === "bank_transfer" ? T("Bank Transfer") : m === "card" ? T("Card") : m === "complimentary" ? T("Complimentary") : T("Cash");

  const expensesAgainstRevenue = data.expenses
    .filter((e) => e.paymentMethod !== "bank_transfer" && e.paymentMethod !== "owner_paid")
    .reduce((sum, e) => sum + e.amount, 0);
  const bankTransferTotal = data.expensesTotal - expensesAgainstRevenue;
  const roomBalance = data.roomRevenueTotal - data.roomExpenses;
  const restaurantBalance = data.posTotal - data.restaurantExpenses;

  let html = `<div style="font-family:'NotoSansSinhala',sans-serif;color:#111;padding:28px;">`;
  html += `<h1 style="font-size:22px;font-weight:700;margin:0 0 4px;">${escapeHtml(data.hotelName)}</h1>`;
  html += `<p style="margin:0 0 10px;color:#444;font-size:13px;">${escapeHtml(T("Daily Summary"))} — ${escapeHtml(dateLabel)}</p>`;
  html += `<hr style="border:none;border-top:1px solid #999;margin:10px 0 4px;">`;

  // Room sales
  html += htmlSectionHeader(T("Room Sales"));
  if (data.roomSales.length === 0) {
    html += `<p style="font-size:12px;color:#666;">${escapeHtml(T("No checkouts recorded for this date."))}</p>`;
  } else {
    html += htmlTable(
      [T("Guest"), T("Room"), T("Plan"), T("Paid by"), T("Amount")],
      data.roomSales.map((r) => [
        escapeHtml(r.guestName),
        escapeHtml(r.roomNumber),
        escapeHtml(r.planName ?? "—"),
        escapeHtml(paidLabelOf(r.paymentMethod)),
        fmt(r.amount),
      ])
    );
  }
  html += htmlTotalRow(T("Room revenue total"), fmt(data.roomRevenueTotal), true);

  // Item sales
  html += htmlSectionHeader(T("Restaurant / POS Item Sales"));
  if (data.itemSales.length === 0) {
    html += `<p style="font-size:12px;color:#666;">${escapeHtml(T("No completed orders for this date."))}</p>`;
  } else {
    html += htmlTable(
      [T("Item"), T("Qty"), T("Revenue")],
      data.itemSales.map((it) => [escapeHtml(it.name), String(it.qty), fmt(it.revenue)])
    );
  }
  html += htmlTotalRow(T("POS subtotal"), fmt(data.posSubtotal));
  html += htmlTotalRow(T("Service charge"), fmt(data.posServiceCharge));
  html += htmlTotalRow(T("POS total"), fmt(data.posTotal), true);

  // Expenses
  html += htmlSectionHeader(T("Expenses"));
  if (data.expenses.length === 0) {
    html += `<p style="font-size:12px;color:#666;">${escapeHtml(T("No expenses logged for this date."))}</p>`;
  } else {
    html += htmlTable(
      [T("Category"), T("Description"), T("Amount")],
      data.expenses.map((e) => [
        escapeHtml(e.category),
        escapeHtml(
          `${(e.description ?? "—").slice(0, 40)}${
            e.paymentMethod === "bank_transfer" || e.paymentMethod === "owner_paid" ? ` (${T("owner funded")})` : ""
          }`
        ),
        fmt(e.amount),
      ])
    );
  }
  html += htmlTotalRow(T("Expenses total (all)"), fmt(data.expensesTotal), true);
  if (data.expenses.length > 0) {
    html += `<p style="font-size:11px;color:#666;margin:0 0 6px;text-align:right;">${escapeHtml(
      paymentBreakdownText(data.expenses, T)
    )}</p>`;
  }

  // Room vs Restaurant
  html += htmlSectionHeader(T("Room vs Restaurant"));
  if (bankTransferTotal > 0) {
    html += `<p style="font-size:11px;color:#666;margin:0 0 6px;">${escapeHtml(
      T("Owner-funded expenses excluded from both balances")
    )}: ${fmt(bankTransferTotal)}</p>`;
  }
  html += `<div style="display:flex;justify-content:flex-end;gap:0;padding:2px 6px;font-size:12px;font-weight:700;"><span style="flex:1;"></span><span style="width:90px;text-align:right;">${escapeHtml(
    T("Room")
  )}</span><span style="width:90px;text-align:right;">${escapeHtml(T("Restaurant"))}</span></div>`;
  html += htmlTwoColTotal(T("Revenue"), fmt(data.roomRevenueTotal), fmt(data.posTotal));
  html += htmlTwoColTotal(T("Expenses"), fmt(data.roomExpenses), fmt(data.restaurantExpenses));
  html += htmlTwoColTotal(T("Balance"), fmt(roomBalance), fmt(restaurantBalance), true);

  // Room & Restaurant ledger
  html += htmlSectionHeader(T("Room & Restaurant Ledger (cash)"));
  html += `<div style="display:flex;justify-content:flex-end;gap:0;padding:2px 6px;font-size:12px;font-weight:700;"><span style="flex:1;"></span><span style="width:90px;text-align:right;">${escapeHtml(
    T("Room")
  )}</span><span style="width:90px;text-align:right;">${escapeHtml(T("Restaurant"))}</span></div>`;
  html += htmlTwoColTotal(T("Inhand (yesterday)"), fmt(data.roomLedger.opening), fmt(data.restaurantLedger.opening));
  html += htmlTwoColTotal(T("+ Today's cash in"), fmt(data.roomLedger.todayIn), fmt(data.restaurantLedger.todayIn));
  html += htmlTwoColTotal(T("- Today's cash out"), fmt(data.roomLedger.todayOut), fmt(data.restaurantLedger.todayOut));
  html += htmlTwoColTotal(
    T("Balance (carries to tomorrow)"),
    fmt(data.roomLedger.closing),
    fmt(data.restaurantLedger.closing),
    true
  );

  // Cash movements today
  if (data.todayCashMovements.length > 0) {
    html += htmlSectionHeader(T("Cash movements today"));
    html += htmlTable(
      [],
      data.todayCashMovements.map((m) => [
        escapeHtml(m.category.slice(0, 30)),
        escapeHtml((m.description ?? "").slice(0, 40)),
        `${m.direction === "in" ? "+" : "-"}${fmt(m.amount)}`,
      ])
    );
  }

  // Credit accounts
  if (data.creditAccountBalances.length > 0) {
    html += htmlSectionHeader(T("Credit accounts — still owing"));
    html += htmlTable(
      [T("Account"), T("Balance")],
      data.creditAccountBalances.map((a) => [escapeHtml(a.accountName.slice(0, 40)), fmt(a.balance)])
    );
    html += htmlTotalRow(
      T("Total outstanding"),
      fmt(data.creditAccountBalances.reduce((s, a) => s + a.balance, 0)),
      true
    );
  }

  // Credit sales added today
  if (data.creditSales.length > 0) {
    html += htmlSectionHeader(T("Credit — added today"));
    html += htmlTable(
      [T("Account"), T("Source"), T("Amount")],
      data.creditSales.map((c) => [escapeHtml(c.accountName.slice(0, 28)), escapeHtml(c.source.slice(0, 38)), fmt(c.amount)])
    );
    html += htmlTotalRow(T("Total on credit today"), fmt(data.creditSales.reduce((s, c) => s + c.amount, 0)), true);
  }

  html += `</div>`;

  return exportHtmlReport((root) => {
    root.innerHTML = html;
  });
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
  owner_paid: "Owner / Boss",
};

export async function generateExpensesReportPdf(data: ExpensesReportData): Promise<Blob> {
  const doc = await newDoc();
  const l = new ReportLayout(doc);
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
  const doc = await newDoc();
  const l = new ReportLayout(doc);
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
    l.sectionHeader(`Bill #${formatOrderNumber(data.date, b.orderNumber)} — ${b.channel} — ${b.reference}`);
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

export interface CreditStatementEntry {
  date: string;
  kind: "charge" | "adjustment" | "repayment";
  description: string;
  amount: number;
  balance: number;
  items?: { name: string; qty: number; unitPrice: number; lineTotal: number }[];
}

export interface CreditStatementData {
  hotelName: string;
  accountName: string;
  accountNotes?: string | null;
  balance: number;
  entries: CreditStatementEntry[];
}

const KIND_LABEL: Record<CreditStatementEntry["kind"], string> = {
  charge: "Bill",
  adjustment: "Adjustment",
  repayment: "Repayment",
};

/** Statement of account — every charge/adjustment/repayment in order with a
 * running balance, bill-type entries itemized underneath, for handing to
 * (or filing against) a credit customer. */
export async function generateCreditStatementPdf(data: CreditStatementData): Promise<Blob> {
  const doc = await newDoc();
  const l = new ReportLayout(doc);
  const W = A4[0];
  const colRight = W - MARGIN;

  l.title(data.hotelName);
  l.subtitle(`Credit Account Statement — ${data.accountName}`);
  if (data.accountNotes) l.subtitle(data.accountNotes, 9);
  l.subtitle(
    `Generated ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`,
    8.5
  );
  l.divider();

  if (data.entries.length === 0) {
    l.row([{ text: "No activity yet on this account.", x: MARGIN }], 10);
  }

  l.row(
    [
      { text: "Date", x: MARGIN },
      { text: "Type", x: MARGIN + 22 },
      { text: "Description", x: MARGIN + 50 },
      { text: "Amount", x: colRight - 45, align: "right" },
      { text: "Balance", x: colRight, align: "right" },
    ],
    9,
    true
  );
  l.divider();

  for (const e of data.entries) {
    l.row([
      { text: new Date(`${e.date}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), x: MARGIN },
      { text: KIND_LABEL[e.kind], x: MARGIN + 22 },
      { text: e.description.slice(0, 60), x: MARGIN + 50 },
      { text: `${e.amount >= 0 ? "+" : "-"}${fmt(Math.abs(e.amount))}`, x: colRight - 45, align: "right" },
      { text: fmt(e.balance), x: colRight, align: "right" },
    ]);
    if (e.items && e.items.length > 0) {
      for (const it of e.items) {
        l.row(
          [
            { text: `${it.qty} x ${it.name}`.slice(0, 65), x: MARGIN + 54 },
            { text: fmt(it.lineTotal), x: colRight, align: "right" },
          ],
          8
        );
      }
    }
  }

  l.divider();
  l.row(
    [
      { text: "Currently owes", x: MARGIN },
      { text: fmt(Math.max(0, data.balance)), x: colRight, align: "right" },
    ],
    12,
    true
  );

  return doc.output("blob");
}
