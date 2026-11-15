import { jsPDF } from "jspdf";
import type {
  AdvancePayment,
  InsuranceClaim,
  InsuranceCompany,
  JobCard,
  JobEstimate,
  JobPart,
  JobTask,
  Payslip,
  PettyCashEntry,
  SupplierPurchase,
  WorkerProfile,
  WorkshopSettings,
} from "../types";
import {
  driverCommissionFor,
  estimateDisplayNumber,
  formatQty,
  money,
  normalizePhone,
  partIssueQty,
  shortDate,
} from "./utils";
import { COPYRIGHT, DEVELOPER } from "./developer";
import { CLIENT_CUSTOMISATION } from "../custom";

const PAGE_WIDTH = 210;
const MARGIN = 10;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const RIGHT = PAGE_WIDTH - MARGIN;

type LineKind = "Labour" | "Part";

export interface IrdLine {
  description: string;
  qty: number;
  unitPrice: number;
  kind: LineKind;
}

export interface IrdSection {
  title: string;
  lines: IrdLine[];
}

export interface IrdTotals {
  supply: number;
  discount: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  advance: number;
  balance: number;
}

export interface IrdPurchaser {
  name: string;
  address: string;
  phone: string;
  tin?: string;
}

export interface IrdDocument {
  title: string;
  referenceLabel: string;
  reference: string;
  invoiceDate: string;
  supplyDate: string;
  purchaser: IrdPurchaser;
  additionalInfo: string;
  sections: IrdSection[];
  totals: IrdTotals;
  paymentMode: string;
  notes: string[];
  signatureBoxes: string[];
  /** Bold document number shown in the masthead. Falls back to reference. */
  documentNumber?: string;
  /** Label for the first grid row. Defaults to "Date of Invoice". */
  dateLabel?: string;
  /** Bold vehicle / job / estimate identifiers rendered without a label. */
  vehicleStrip?: { label: string; value: string }[];
  /** Estimates intentionally omit the Date of Supply / Place of Supply row. */
  hideSupplyRow?: boolean;
}

export interface InvoiceTotalsInput {
  labor: number;
  parts: number;
  subtotal: number;
  discount: number;
  total: number;
}

export interface InvoiceDocumentOptions {
  advancePaid?: number;
  customerTin?: string;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function numericDate(iso?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function roundCurrency(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const SCALES = ["", "Thousand", "Million", "Billion"];

function underThousand(value: number): string {
  if (value < 20) return ONES[value];
  if (value < 100) {
    const tens = Math.floor(value / 10);
    const ones = value % 10;
    return `${TENS[tens]}${ones ? ` ${ONES[ones]}` : ""}`;
  }
  const hundreds = Math.floor(value / 100);
  const remainder = value % 100;
  return `${ONES[hundreds]} Hundred${remainder ? ` ${underThousand(remainder)}` : ""}`;
}

export function amountInWords(value: number): string {
  const safe = Math.max(0, roundCurrency(value));
  const rupees = Math.floor(safe);
  const cents = Math.round((safe - rupees) * 100);
  if (rupees === 0 && cents === 0) return "Rupees Zero Only";

  const chunks: string[] = [];
  let remaining = rupees;
  let scale = 0;
  while (remaining > 0 && scale < SCALES.length) {
    const chunk = remaining % 1000;
    if (chunk > 0) {
      chunks.unshift(`${underThousand(chunk)}${SCALES[scale] ? ` ${SCALES[scale]}` : ""}`);
    }
    remaining = Math.floor(remaining / 1000);
    scale += 1;
  }

  let words = `Rupees ${chunks.join(" ")}`;
  if (cents > 0) {
    words += ` and Cents ${underThousand(cents)}`;
  }
  return `${words} Only`;
}

function jobVat(job: JobCard, settings: WorkshopSettings, taxable: number): {
  rate: number;
  amount: number;
} {
  const rate = Math.max(
    0,
    job.vatRateApplied ?? (job.isVatInvoice ? settings.defaultVatRate ?? 18 : 0),
  );
  if (!job.isVatInvoice) return { rate: 0, amount: 0 };
  const amount =
    job.vatAmount !== undefined && job.vatAmount > 0
      ? roundCurrency(job.vatAmount)
      : roundCurrency((taxable * rate) / 100);
  return { rate, amount };
}

function paymentModeLabel(job: JobCard): string {
  switch (job.paymentMethod) {
    case "Credit":
      return "Credit / Insurance Claim";
    case "Insurance":
      return "Insurance Claim";
    case "Cheque":
      return "Dated Cheque";
    case "Card":
      return "Card";
    case "Cash":
      return "Cash";
    default:
      return job.paymentMethod ?? "Cash";
  }
}

function supplierAddress(settings: WorkshopSettings): string {
  return settings.placeOfSupply?.trim() || settings.address || "";
}

function hexToRgb(hex?: string): [number, number, number] {
  const clean = (hex || "#0f766e").replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full || "0f766e", 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function logoImage(logo?: string): string | null {
  if (!logo) return null;
  return /^data:image\/(png|jpe?g|webp);base64,/i.test(logo) ? logo : null;
}

function drawMasthead(
  doc: jsPDF,
  title: string,
  documentNumber: string,
  settings: WorkshopSettings,
): number {
  const top = 10;
  const [r, g, b] = hexToRgb(settings.brandColor);
  const logo = logoImage(settings.logo);
  const badgeX = 128;
  const badgeWidth = RIGHT - badgeX;
  const logoHeight = 17; // ~64px at print resolution
  let leftX = MARGIN;
  let logoWidth = 0;

  if (logo) {
    try {
      const properties = doc.getImageProperties(logo);
      const ratio = properties.height > 0 ? properties.width / properties.height : 1;
      logoWidth = Math.min(42, logoHeight * ratio);
      doc.addImage(logo, MARGIN, top, logoWidth, logoHeight);
      leftX = MARGIN + logoWidth + 5;
    } catch {
      leftX = MARGIN;
    }
  }

  const nameWidth = Math.max(40, badgeX - leftX - 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(20, 30, 45);
  const nameLines = doc.splitTextToSize(
    settings.companyName || "Workshop",
    nameWidth,
  ) as string[];
  nameLines.slice(0, 2).forEach((line, index) => {
    doc.text(line, leftX, top + 8 + index * 6.2);
  });

  doc.setFillColor(r, g, b);
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.3);
  doc.rect(badgeX, top, badgeWidth, 10.5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), badgeX + badgeWidth / 2, top + 6.8, {
    align: "center",
    maxWidth: badgeWidth - 4,
  });

  doc.setTextColor(20, 30, 45);
  doc.setFontSize(11);
  doc.text(documentNumber, RIGHT, top + 18.5, { align: "right" });
  doc.setTextColor(0, 0, 0);

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, top + logoHeight + 4, RIGHT, top + logoHeight + 4);
  return top + logoHeight + 7;
}

function drawTwoCellRow(
  doc: jsPDF,
  y: number,
  minHeight: number,
  left: { label: string; value: string },
  right: { label: string; value: string },
): number {
  const half = CONTENT_WIDTH / 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const leftLines = doc.splitTextToSize(left.value || "—", half - 4) as string[];
  const rightLines = doc.splitTextToSize(right.value || "—", half - 4) as string[];
  const height = Math.max(
    minHeight,
    8 + Math.max(leftLines.length, rightLines.length) * 3.6,
  );
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, y, half, height);
  doc.rect(MARGIN + half, y, half, height);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.text(`${left.label}:`, MARGIN + 2, y + 4);
  doc.text(`${right.label}:`, MARGIN + half + 2, y + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  leftLines.forEach((line, index) => {
    doc.text(line, MARGIN + 2, y + 8 + index * 3.6);
  });
  rightLines.forEach((line, index) => {
    doc.text(line, MARGIN + half + 2, y + 8 + index * 3.6);
  });
  return y + height;
}

interface PartyCellInput {
  heading: string;
  tin: string;
  name: string;
  address: string;
  phone: string;
  extra?: string;
}

function partyCellLines(doc: jsPDF, width: number, data: PartyCellInput) {
  const valueWidth = width - 28;
  return {
    name: doc.splitTextToSize(data.name || "—", valueWidth) as string[],
    address: doc.splitTextToSize(data.address || "—", valueWidth) as string[],
    extra: data.extra
      ? (doc.splitTextToSize(data.extra, valueWidth) as string[])
      : [],
  };
}

function partyCellHeight(doc: jsPDF, width: number, data: PartyCellInput): number {
  const lines = partyCellLines(doc, width, data);
  return (
    11 +
    lines.name.length * 3.9 +
    lines.address.length * 3.9 +
    4 +
    lines.extra.length * 3.9 +
    3
  );
}

function drawPartyCell(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  data: PartyCellInput,
): void {
  doc.setLineWidth(0.3);
  doc.setDrawColor(0, 0, 0);
  doc.rect(x, y, width, height);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.4);
  doc.text(data.heading, x + 3, y + 4.6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);

  const labelX = x + 3;
  const valueX = x + 25;
  const valueWidth = width - 28;
  const lines = partyCellLines(doc, width, data);
  let lineY = y + 9.4;

  doc.text("TIN No.", labelX, lineY);
  doc.text(data.tin || "—", valueX, lineY, { maxWidth: valueWidth });
  lineY += 4;

  doc.text("Name", labelX, lineY);
  doc.setFont("helvetica", "bold");
  lines.name.forEach((line) => {
    doc.text(line, valueX, lineY);
    lineY += 3.9;
  });
  doc.setFont("helvetica", "normal");

  doc.text("Address", labelX, lineY);
  lines.address.forEach((line) => {
    doc.text(line, valueX, lineY);
    lineY += 3.9;
  });

  doc.text("Telephone", labelX, lineY);
  doc.text(data.phone || "—", valueX, lineY, { maxWidth: valueWidth });
  lineY += 4;

  if (data.extra) {
    doc.text("VAT", labelX, lineY);
    lines.extra.forEach((line) => {
      doc.text(line, valueX, lineY);
      lineY += 3.9;
    });
  }
}

function drawPartyCells(
  doc: jsPDF,
  y: number,
  left: PartyCellInput,
  right: PartyCellInput,
): number {
  const half = CONTENT_WIDTH / 2;
  const height = Math.max(
    42,
    partyCellHeight(doc, half, left),
    partyCellHeight(doc, half, right),
  );
  drawPartyCell(doc, MARGIN, y, half, height, left);
  drawPartyCell(doc, MARGIN + half, y, half, height, right);
  return y + height;
}

function drawVehicleStrip(
  doc: jsPDF,
  y: number,
  items: { label: string; value: string }[],
  fallback: string,
): number {
  const segments = (
    items.length > 0
      ? items
      : [{ label: "Details", value: fallback || "—" }]
  ).map((item) => ({ text: `${item.label}: ${item.value}` }));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.3);
  const measured = segments.map((segment) => ({
    ...segment,
    width: doc.getTextWidth(segment.text),
  }));
  const maxWidth = CONTENT_WIDTH - 6;
  const lines: { text: string; width: number }[][] = [];
  let current: { text: string; width: number }[] = [];
  let currentWidth = 0;
  measured.forEach((segment) => {
    const separator = current.length > 0 ? 5 : 0;
    if (current.length > 0 && currentWidth + separator + segment.width > maxWidth) {
      lines.push(current);
      current = [];
      currentWidth = 0;
    }
    if (current.length > 0) currentWidth += 5;
    current.push(segment);
    currentWidth += segment.width;
  });
  if (current.length > 0) lines.push(current);
  const height = Math.max(9, 4.4 + lines.length * 4.2);
  doc.setLineWidth(0.3);
  doc.setDrawColor(0, 0, 0);
  doc.rect(MARGIN, y, CONTENT_WIDTH, height);
  lines.forEach((line, lineIndex) => {
    let x = MARGIN + 3;
    const lineY = y + 5.2 + lineIndex * 4.2;
    line.forEach((segment, segmentIndex) => {
      if (segmentIndex > 0) {
        doc.setFont("helvetica", "normal");
        doc.text("|", x, lineY);
        x += 3.4;
      }
      doc.setFont("helvetica", "bold");
      doc.text(segment.text, x, lineY);
      x += segment.width + 1.6;
    });
  });
  return y + height;
}

function drawTableHeader(doc: jsPDF, y: number): number {
  const columns = [
    { x: MARGIN, w: 14, label: "Ref." },
    { x: MARGIN + 14, w: 94, label: "Description of Goods or Services" },
    { x: MARGIN + 108, w: 16, label: "Qty" },
    { x: MARGIN + 124, w: 28, label: "Unit Price" },
    { x: MARGIN + 152, w: CONTENT_WIDTH - 152, label: "Amount (Rs.)" },
  ];
  doc.setFillColor(235, 238, 242);
  doc.rect(MARGIN, y, CONTENT_WIDTH, 7, "F");
  doc.setLineWidth(0.25);
  doc.setDrawColor(0, 0, 0);
  doc.rect(MARGIN, y, CONTENT_WIDTH, 7);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  columns.forEach((column) => {
    if (column.x > MARGIN) doc.line(column.x, y, column.x, y + 7);
    const alignRight = column.label === "Qty" || column.label === "Unit Price" || column.label === "Amount (Rs.)";
    doc.text(
      column.label,
      alignRight ? column.x + column.w - 2 : column.x + 2,
      y + 4.6,
      { align: alignRight ? "right" : "left", maxWidth: column.w - 3 },
    );
  });
  return y + 7;
}

function drawSectionRow(doc: jsPDF, y: number, title: string): number {
  doc.setFillColor(226, 232, 240);
  doc.rect(MARGIN, y, CONTENT_WIDTH, 5.5, "F");
  doc.setLineWidth(0.25);
  doc.rect(MARGIN, y, CONTENT_WIDTH, 5.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text(title, MARGIN + 2, y + 3.9);
  return y + 5.5;
}

function drawLineRow(
  doc: jsPDF,
  y: number,
  reference: string,
  line: IrdLine,
): number {
  const descriptionWidth = 90;
  const descriptionLines = doc.splitTextToSize(
    line.description || "—",
    descriptionWidth,
  ) as string[];
  const height = Math.max(6.5, descriptionLines.length * 3.7 + 2.4);
  doc.setLineWidth(0.25);
  doc.rect(MARGIN, y, CONTENT_WIDTH, height);
  const columns = [MARGIN + 14, MARGIN + 108, MARGIN + 124, MARGIN + 152];
  columns.forEach((x) => doc.line(x, y, x, y + height));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.text(reference, MARGIN + 2, y + 4.1);
  descriptionLines.forEach((textLine, index) => {
    doc.text(textLine, MARGIN + 16, y + 4.1 + index * 3.7);
  });
  const qty = line.kind === "Part" ? line.qty.toFixed(2) : String(line.qty);
  doc.text(qty, MARGIN + 122, y + 4.1, { align: "right" });
  doc.text(money(line.unitPrice, 2), MARGIN + 150, y + 4.1, { align: "right" });
  doc.text(money(line.qty * line.unitPrice, 2), RIGHT - 2, y + 4.1, {
    align: "right",
  });
  return y + height;
}

function drawTotalRow(
  doc: jsPDF,
  y: number,
  label: string,
  value: number,
  strong = false,
): number {
  const height = strong ? 8 : 6.5;
  doc.setLineWidth(0.25);
  doc.rect(MARGIN, y, CONTENT_WIDTH, height);
  doc.setFont("helvetica", strong ? "bold" : "normal");
  doc.setFontSize(strong ? 9.5 : 8);
  doc.text(label, MARGIN + 2, y + (strong ? 5.4 : 4.3));
  doc.text(money(value, 2), RIGHT - 2, y + (strong ? 5.4 : 4.3), {
    align: "right",
  });
  return y + height;
}

function drawFullRow(
  doc: jsPDF,
  y: number,
  label: string,
  value: string,
  minHeight = 8,
): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const lines = doc.splitTextToSize(value || "—", CONTENT_WIDTH - 4) as string[];
  const height = Math.max(minHeight, 7.2 + lines.length * 3.6);
  doc.setLineWidth(0.25);
  doc.rect(MARGIN, y, CONTENT_WIDTH, height);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.4);
  doc.text(label, MARGIN + 2, y + 4.2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  lines.forEach((line, index) => {
    doc.text(line, MARGIN + 2, y + 7.7 + index * 3.6);
  });
  return y + height;
}

export function drawIrdDocument(
  doc: jsPDF,
  settings: WorkshopSettings,
  data: IrdDocument,
): void {
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  let y = drawMasthead(
    doc,
    data.title,
    data.documentNumber ?? data.reference,
    settings,
  );

  y = drawTwoCellRow(
    doc,
    y,
    8,
    { label: data.dateLabel ?? "Date of Invoice", value: numericDate(data.invoiceDate) },
    { label: "Document Ref", value: data.reference },
  );

  if (!data.hideSupplyRow) {
    y = drawTwoCellRow(
      doc,
      y,
      8,
      { label: "Date of Supply", value: numericDate(data.supplyDate) },
      { label: "Place of Supply", value: supplierAddress(settings) },
    );
  }

  y = drawPartyCells(
    doc,
    y,
    {
      heading: "SUPPLIER",
      tin: settings.tinNumber ?? "",
      name: settings.companyName,
      address: settings.address,
      phone: settings.phone,
      extra: settings.vatRegNumber ? `Reg No: ${settings.vatRegNumber}` : undefined,
    },
    {
      heading: "PURCHASER",
      tin: data.purchaser.tin ?? "",
      name: data.purchaser.name,
      address: data.purchaser.address,
      phone: data.purchaser.phone,
    },
  );

  y = drawVehicleStrip(doc, y, data.vehicleStrip ?? [], data.additionalInfo);

  y += 2;
  y = drawTableHeader(doc, y);

  let reference = 0;
  data.sections.forEach((section) => {
    if (y + 12 > 258) {
      doc.addPage();
      y = 16;
      y = drawTableHeader(doc, y);
    }
    y = drawSectionRow(doc, y, section.title);
    section.lines.forEach((line) => {
      reference += 1;
      const estimatedHeight = Math.max(
        6.5,
        (doc.splitTextToSize(line.description || "—", 90) as string[]).length * 3.7 + 2.4,
      );
      if (y + estimatedHeight > 258) {
        doc.addPage();
        y = 16;
        y = drawTableHeader(doc, y);
      }
      y = drawLineRow(
        doc,
        y,
        String(reference).padStart(2, "0"),
        line,
      );
    });
  });

  if (y + 54 > 282) {
    doc.addPage();
    y = 16;
  }
  y += 2;
  y = drawTotalRow(
    doc,
    y,
    "Subtotal",
    data.totals.supply + data.totals.discount,
  );
  if (data.totals.discount > 0) {
    y = drawTotalRow(doc, y, "Less: Discount", data.totals.discount);
  }
  y = drawTotalRow(doc, y, "Total Value of Supply", data.totals.supply);
  if (data.totals.vatAmount > 0) {
    y = drawTotalRow(
      doc,
      y,
      `VAT @ ${data.totals.vatRate.toFixed(2)}%`,
      data.totals.vatAmount,
    );
    y = drawTotalRow(
      doc,
      y,
      "Total Value Including VAT (Rs.)",
      data.totals.total,
      true,
    );
  } else {
    y = drawTotalRow(doc, y, "Total Value (Rs.)", data.totals.total, true);
  }
  if (data.totals.advance > 0) {
    y = drawTotalRow(doc, y, "Less: Advance Paid", data.totals.advance);
    y = drawTotalRow(
      doc,
      y,
      "Net Balance Payable (Rs.)",
      data.totals.balance,
      true,
    );
  }

  y = drawFullRow(
    doc,
    y,
    "Total Amount in words",
    amountInWords(data.totals.balance > 0 ? data.totals.balance : data.totals.total),
    9,
  );
  y = drawFullRow(doc, y, "Mode of Payment", data.paymentMode, 8);

  data.notes.filter(Boolean).forEach((note) => {
    if (y + 18 > 270) {
      doc.addPage();
      y = 16;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(70, 80, 95);
    const lines = doc.splitTextToSize(note, CONTENT_WIDTH) as string[];
    lines.forEach((textLine) => {
      doc.text(textLine, MARGIN, y + 4);
      y += 3.5;
    });
    doc.setTextColor(0, 0, 0);
    y += 2;
  });

  const signatureHeight = 19;
  const footerHeight = 10;
  if (y + footerHeight + 6 + signatureHeight + 8 > 285) {
    doc.addPage();
    y = 16;
  }
  y += 6;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  const footerLine =
    settings.footerInquiryLine?.trim() ||
    "Any inquiry, please call our workshop hotline.";
  const complaintLine =
    settings.footerComplaintLine?.trim() ||
    "Any suggestion or complaint regarding your vehicle or job, please contact management.";
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.3);
  doc.text(footerLine, MARGIN, y + 3, { maxWidth: CONTENT_WIDTH });
  doc.text(complaintLine, MARGIN, y + 7, { maxWidth: CONTENT_WIDTH });

  y += footerHeight + 4;
  const boxes = data.signatureBoxes.length
    ? data.signatureBoxes
    : ["AUTHORIZATION"];
  const gap = 4;
  const boxWidth = Math.min(
    52,
    (CONTENT_WIDTH - gap * (boxes.length - 1)) / boxes.length,
  );
  const startX = RIGHT - boxes.length * boxWidth - gap * (boxes.length - 1);
  boxes.forEach((label, index) => {
    const x = startX + index * (boxWidth + gap);
    doc.rect(x, y, boxWidth, signatureHeight);
    doc.setFontSize(6.8);
    doc.text(label, x + boxWidth / 2, y + signatureHeight - 3.5, {
      align: "center",
      maxWidth: boxWidth - 4,
    });
    doc.line(x + 6, y + signatureHeight - 8, x + boxWidth - 6, y + signatureHeight - 8);
  });

  y += signatureHeight + 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.7);
  doc.setTextColor(90, 100, 115);
  doc.text(
    `Powered by ${DEVELOPER.name} · ${DEVELOPER.email} · ${DEVELOPER.phoneDisplay} · ${COPYRIGHT}`,
    PAGE_WIDTH / 2,
    Math.min(291, y),
    { align: "center", maxWidth: CONTENT_WIDTH },
  );
}

function invoiceDocument(
  job: JobCard,
  tasks: JobTask[],
  parts: JobPart[],
  settings: WorkshopSettings,
  totals: InvoiceTotalsInput,
  insurance?: { claim: InsuranceClaim; insurer?: InsuranceCompany },
  options: InvoiceDocumentOptions = {},
): IrdDocument {
  const issuedParts = parts.filter(
    (part) =>
      part.status === "Issued" &&
      part.sellingPrice > 0 &&
      !part.includedInLabor &&
      part.partSource !== "Customer_Brought",
  );
  const supply = roundCurrency(Math.max(0, totals.subtotal - totals.discount));
  const vat = jobVat(job, settings, supply);
  const total = roundCurrency(supply + vat.amount);
  const advance = roundCurrency(options.advancePaid ?? 0);
  const balance = roundCurrency(Math.max(0, total - advance));
  const insuranceInfo = insurance
    ? ` | Policy No: ${insurance.claim.policyNo} | Claim No: ${insurance.claim.claimNo}`
    : "";

  return {
    title: job.isVatInvoice ? "TAX INVOICE" : "INVOICE",
    referenceLabel: job.isVatInvoice ? "Tax Invoice No" : "Invoice No",
    reference: job.id,
    documentNumber: `No: ${job.id}`,
    dateLabel: "Date of Invoice",
    invoiceDate: job.paidAt ?? new Date().toISOString(),
    supplyDate: job.acceptedAt ?? job.createdAt,
    purchaser: {
      name: job.customerName,
      address: job.customerAddress?.trim() || "—",
      phone: `+${normalizePhone(job.phone)}`,
      tin: options.customerTin ?? job.customerTinNumber ?? "",
    },
    additionalInfo: `Vehicle No: ${job.vehicleNo} (${job.make} ${job.model}) | Job No: ${job.id} | Meter Reading: ${job.mileage.toLocaleString()} km${insuranceInfo}`,
    vehicleStrip: [
      { label: "Vehicle No", value: `${job.vehicleNo} (${job.make} ${job.model})` },
      { label: "Job Card", value: job.id },
      { label: "Invoice No", value: job.id },
      { label: "Meter", value: `${job.mileage.toLocaleString()} km` },
      ...(insurance
        ? [
            { label: "Policy No", value: insurance.claim.policyNo },
            { label: "Claim No", value: insurance.claim.claimNo },
          ]
        : []),
    ],
    sections: [
      {
        title: "Done Jobs",
        lines: tasks.map((task) => ({
          description: task.name,
          qty: 1,
          unitPrice: task.laborCost,
          kind: "Labour" as const,
        })),
      },
      {
        title: "Added Items",
        lines: issuedParts.map((part) => ({
          description: part.itemName,
          qty: partIssueQty(part),
          unitPrice: part.sellingPrice,
          kind: "Part" as const,
        })),
      },
    ],
    totals: {
      supply,
      discount: roundCurrency(totals.discount),
      vatRate: vat.rate,
      vatAmount: vat.amount,
      total,
      advance,
      balance,
    },
    paymentMode: paymentModeLabel(job),
    notes: [
      job.paymentMethod === "Credit" && job.creditGraceDays
        ? `Credit terms: payment due within ${job.creditGraceDays} days.`
        : "",
      job.paymentMethod === "Cheque"
        ? "Payment received by dated cheque. Funds are released only after realisation."
        : "",
      "This is a computer-generated document. Parts carry the supplier warranty stated at issue.",
      CLIENT_CUSTOMISATION.invoiceNote?.trim() ?? "",
    ],
    signatureBoxes: ["AUTHORIZATION"],
  };
}

export function buildIrdInvoicePdf(
  job: JobCard,
  tasks: JobTask[],
  parts: JobPart[],
  settings: WorkshopSettings,
  totals: InvoiceTotalsInput,
  insurance?: { claim: InsuranceClaim; insurer?: InsuranceCompany },
  options: InvoiceDocumentOptions = {},
): { blob: Blob; filename: string } {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  drawIrdDocument(doc, settings, invoiceDocument(job, tasks, parts, settings, totals, insurance, options));
  const filename = `Invoice_${job.id}_${job.vehicleNo.replace(/\s+/g, "-")}.pdf`;
  return { blob: doc.output("blob"), filename };
}

export function buildIrdInsuranceBillPdf(
  job: JobCard,
  claim: InsuranceClaim,
  insurer: InsuranceCompany | undefined,
  settings: WorkshopSettings,
  lines: { labor: number; parts: number; total: number },
  detail?: { tasks?: JobTask[]; parts?: JobPart[] },
): { blob: Blob; filename: string } {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const vatAmount = roundCurrency(
    claim.vatAmount ??
      job.vatAmount ??
      (job.isVatInvoice
        ? (lines.total * (claim.vatRateApplied ?? settings.defaultVatRate ?? 18)) / 100
        : 0),
  );
  const supply = roundCurrency(Math.max(0, lines.total - vatAmount));
  const data: IrdDocument = {
    title: job.isVatInvoice ? "INSURANCE TAX INVOICE" : "INSURANCE INVOICE",
    referenceLabel: "Invoice No",
    reference: claim.insuranceBillNo || job.id,
    documentNumber: `No: ${claim.insuranceBillNo || job.id}`,
    dateLabel: "Date of Invoice",
    invoiceDate: claim.insuranceBillAt ?? new Date().toISOString(),
    supplyDate: job.acceptedAt ?? job.createdAt,
    purchaser: {
      name: insurer?.name ?? "Insurance company",
      address: claim.branchAddressOverride?.trim() || insurer?.address || "—",
      phone: insurer?.hotline || "—",
      tin: insurer?.tinNumber ?? "",
    },
    additionalInfo: `Vehicle No: ${job.vehicleNo} (${job.make} ${job.model}) | Job No: ${job.id} | Meter Reading: ${job.mileage.toLocaleString()} km | Policy No: ${claim.policyNo} | Claim No: ${claim.claimNo}${claim.releaseOrderNo ? ` | Release Order: ${claim.releaseOrderNo}` : ""}`,
    vehicleStrip: [
      { label: "Vehicle No", value: `${job.vehicleNo} (${job.make} ${job.model})` },
      { label: "Job Card", value: job.id },
      { label: "Invoice No", value: claim.insuranceBillNo || job.id },
      { label: "Policy No", value: claim.policyNo },
      { label: "Claim No", value: claim.claimNo },
      ...(claim.releaseOrderNo
        ? [{ label: "Release Order", value: claim.releaseOrderNo }]
        : []),
    ],
    sections: [
      {
        title: "Labour & repair charges",
        lines:
          detail?.tasks && detail.tasks.length > 0
            ? detail.tasks.map((task) => ({
                description: task.name,
                qty: 1,
                unitPrice: task.laborCost,
                kind: "Labour" as const,
              }))
            : [
                {
                  description: "Labour and repair charges",
                  qty: 1,
                  unitPrice: lines.labor,
                  kind: "Labour" as const,
                },
              ],
      },
      {
        title: "Parts & materials",
        lines:
          detail?.parts && detail.parts.length > 0
            ? detail.parts.map((part) => ({
                description:
                  part.partSource === "Customer_Brought"
                    ? `${part.itemName} (customer supplied)`
                    : part.itemName,
                qty: partIssueQty(part),
                unitPrice: part.sellingPrice,
                kind: "Part" as const,
              }))
            : [
                {
                  description: "Parts and materials",
                  qty: 1,
                  unitPrice: lines.parts,
                  kind: "Part" as const,
                },
              ],
      },
    ],
    totals: {
      supply,
      discount: 0,
      vatRate: claim.vatRateApplied ?? (job.isVatInvoice ? settings.defaultVatRate ?? 18 : 0),
      vatAmount,
      total: roundCurrency(lines.total),
      advance: 0,
      balance: roundCurrency(lines.total),
    },
    paymentMode: "Insurance Claim Settlement",
    notes: [
      "Billed to the insurance company for the approved claim balance. Policy excess, depreciation and non-covered items are billed separately to the vehicle owner.",
      "Payment is due on receipt of the insurer cheque. This bill is not a customer receipt.",
    ],
    signatureBoxes: ["AUTHORIZATION"],
  };
  drawIrdDocument(doc, settings, data);
  const filename = `Insurance_Bill_${claim.claimNo.replace(/[^\w-]+/g, "-")}_${job.vehicleNo.replace(/\s+/g, "-")}.pdf`;
  return { blob: doc.output("blob"), filename };
}

export function buildIrdInsuranceEstimatePdf(
  job: JobCard,
  estimate: JobEstimate,
  claim: InsuranceClaim,
  insurer: InsuranceCompany | undefined,
  settings: WorkshopSettings,
): { blob: Blob; filename: string } {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const labourLines = estimate.lines.filter((line) => line.type === "Labour");
  const partLines = estimate.lines.filter((line) => line.type === "Part");
  const supply = roundCurrency(
    estimate.lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0),
  );
  const vatRate = job.isVatInvoice ? settings.defaultVatRate ?? 18 : 0;
  const vatAmount = roundCurrency((supply * vatRate) / 100);
  const data: IrdDocument = {
    title: job.isVatInvoice
      ? "TAX ESTIMATE"
      : estimate.kind === "Supplementary"
        ? "SUPPLEMENTARY ESTIMATE"
        : "REPAIR ESTIMATE",
    referenceLabel: "Estimate No",
    reference: estimateDisplayNumber(estimate),
    documentNumber: `No: ${estimateDisplayNumber(estimate)}`,
    dateLabel: "Date of Estimate",
    invoiceDate: estimate.updatedAt ?? estimate.createdAt,
    supplyDate: job.acceptedAt ?? job.createdAt,
    purchaser: {
      name: insurer?.name ?? "Insurance company",
      address: claim.branchAddressOverride?.trim() || insurer?.address || "—",
      phone: insurer?.hotline || "—",
      tin: insurer?.tinNumber ?? "",
    },
    additionalInfo: `Vehicle No: ${job.vehicleNo} (${job.make} ${job.model}) | Job No: ${job.id} | Meter Reading: ${job.mileage.toLocaleString()} km | Policy No: ${claim.policyNo} | Claim No: ${claim.claimNo}${claim.assessorName ? ` | Assessor: ${claim.assessorName}` : ""}`,
    vehicleStrip: [
      { label: "Vehicle No", value: `${job.vehicleNo} (${job.make} ${job.model})` },
      { label: "Job Card", value: job.id },
      { label: "Estimate No", value: estimateDisplayNumber(estimate) },
      { label: "Meter", value: `${job.mileage.toLocaleString()} km` },
      { label: "Policy No", value: claim.policyNo },
      { label: "Claim No", value: claim.claimNo },
    ],
    sections: [
      {
        title: "Done Jobs",
        lines: labourLines.map((line) => ({
          description: line.description,
          qty: line.qty,
          unitPrice: line.unitPrice,
          kind: "Labour" as const,
        })),
      },
      {
        title: "Added Items",
        lines: partLines.map((line) => ({
          description: line.description,
          qty: line.qty,
          unitPrice: line.unitPrice,
          kind: "Part" as const,
        })),
      },
    ],
    totals: {
      supply,
      discount: 0,
      vatRate,
      vatAmount,
      total: roundCurrency(supply + vatAmount),
      advance: 0,
      balance: roundCurrency(supply + vatAmount),
    },
    paymentMode: "Estimate only — not a tax invoice",
    notes: [
      estimate.notes.trim(),
      "This is an estimate, not a tax invoice. Work starts after the insurer approves it. Parts and labour are billed separately and the final invoice may vary if additional damage is found.",
      CLIENT_CUSTOMISATION.estimateNote?.trim() ?? "",
    ].filter(Boolean),
    signatureBoxes: ["Workshop signature", "Assessor signature", "Insurer approval"],
    hideSupplyRow: true,
  };
  drawIrdDocument(doc, settings, data);
  const filename = `Insurance_Estimate_${estimate.number.replace(/[^\w-]+/g, "-")}_${job.vehicleNo.replace(/\s+/g, "-")}.pdf`;
  return { blob: doc.output("blob"), filename };
}

export function buildIrdEstimatePdf(
  job: JobCard,
  estimate: JobEstimate,
  settings: WorkshopSettings,
): { blob: Blob; filename: string } {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const labourLines = estimate.lines.filter((line) => line.type === "Labour");
  const partLines = estimate.lines.filter((line) => line.type === "Part");
  const supply = roundCurrency(
    estimate.lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0),
  );
  const vatRate = job.isVatInvoice ? settings.defaultVatRate ?? 18 : 0;
  const vatAmount = roundCurrency((supply * vatRate) / 100);
  const data: IrdDocument = {
    title: job.isVatInvoice
      ? "TAX ESTIMATE"
      : estimate.kind === "Supplementary"
        ? "SUPPLEMENTARY ESTIMATE"
        : "REPAIR ESTIMATE",
    referenceLabel: "Estimate No",
    reference: estimateDisplayNumber(estimate),
    documentNumber: `No: ${estimateDisplayNumber(estimate)}`,
    dateLabel: "Date of Estimate",
    invoiceDate: estimate.updatedAt ?? estimate.createdAt,
    supplyDate: job.acceptedAt ?? job.createdAt,
    purchaser: {
      name: job.customerName,
      address: job.customerAddress?.trim() || "—",
      phone: `+${normalizePhone(job.phone)}`,
      tin: job.customerTinNumber ?? "",
    },
    additionalInfo: `Vehicle No: ${job.vehicleNo} (${job.make} ${job.model}) | Job No: ${job.id} | Meter Reading: ${job.mileage.toLocaleString()} km`,
    vehicleStrip: [
      { label: "Vehicle No", value: `${job.vehicleNo} (${job.make} ${job.model})` },
      { label: "Job Card", value: job.id },
      { label: "Estimate No", value: estimateDisplayNumber(estimate) },
      { label: "Meter", value: `${job.mileage.toLocaleString()} km` },
    ],
    sections: [
      {
        title: "Done Jobs",
        lines: labourLines.map((line) => ({
          description: line.description,
          qty: line.qty,
          unitPrice: line.unitPrice,
          kind: "Labour" as const,
        })),
      },
      {
        title: "Added Items",
        lines: partLines.map((line) => ({
          description: line.description,
          qty: line.qty,
          unitPrice: line.unitPrice,
          kind: "Part" as const,
        })),
      },
    ],
    totals: {
      supply,
      discount: 0,
      vatRate,
      vatAmount,
      total: roundCurrency(supply + vatAmount),
      advance: 0,
      balance: roundCurrency(supply + vatAmount),
    },
    paymentMode: "Estimate only — not a tax invoice",
    notes: [
      estimate.notes.trim(),
      "This is an estimate, not a tax invoice. Work starts after your approval. Parts and labour are billed together on the final invoice, which may vary if additional damage is found.",
      CLIENT_CUSTOMISATION.estimateNote?.trim() ?? "",
    ].filter(Boolean),
    signatureBoxes: ["Workshop signature", "Customer approval"],
    hideSupplyRow: true,
  };
  drawIrdDocument(doc, settings, data);
  const filename = `Estimate_${estimate.number.replace(/[^\w-]+/g, "-")}_${job.vehicleNo.replace(/\s+/g, "-")}.pdf`;
  return { blob: doc.output("blob"), filename };
}

function renderIrdHtml(settings: WorkshopSettings, data: IrdDocument): string {
  const lineRows = (line: IrdLine, reference: string) => `
    <tr>
      <td class="ref">${reference}</td>
      <td>${esc(line.description)}</td>
      <td class="num">${line.kind === "Part" ? line.qty.toFixed(2) : line.qty}</td>
      <td class="num">${money(line.unitPrice, 2)}</td>
      <td class="num">${money(line.qty * line.unitPrice, 2)}</td>
    </tr>`;

  let reference = 0;
  const sectionRows = data.sections
    .map((section) => {
      const rows = section.lines
        .map((line) => {
          reference += 1;
          return lineRows(line, String(reference).padStart(2, "0"));
        })
        .join("");
      return `<tr class="section"><td colspan="5">${esc(section.title)}</td></tr>${rows}`;
    })
    .join("");

  const totalRows = [
    `<tr><td colspan="4" class="label">Subtotal</td><td class="num">${money(data.totals.supply + data.totals.discount, 2)}</td></tr>`,
    data.totals.discount > 0
      ? `<tr><td colspan="4" class="label">Less: Discount</td><td class="num">${money(data.totals.discount, 2)}</td></tr>`
      : "",
    `<tr><td colspan="4" class="label">Total Value of Supply</td><td class="num">${money(data.totals.supply, 2)}</td></tr>`,
    data.totals.vatAmount > 0
      ? `<tr><td colspan="4" class="label">VAT @ ${data.totals.vatRate.toFixed(2)}%</td><td class="num">${money(data.totals.vatAmount, 2)}</td></tr>
         <tr class="strong"><td colspan="4" class="label">Total Value Including VAT (Rs.)</td><td class="num">${money(data.totals.total, 2)}</td></tr>`
      : `<tr class="strong"><td colspan="4" class="label">Total Value (Rs.)</td><td class="num">${money(data.totals.total, 2)}</td></tr>`,
    data.totals.advance > 0
      ? `<tr><td colspan="4" class="label">Less: Advance Paid</td><td class="num">${money(data.totals.advance, 2)}</td></tr>
         <tr class="strong"><td colspan="4" class="label">Net Balance Payable (Rs.)</td><td class="num">${money(data.totals.balance, 2)}</td></tr>`
      : "",
  ].join("");

  const signatureBoxes = (data.signatureBoxes.length
    ? data.signatureBoxes
    : ["AUTHORIZATION"])
    .map((label) => `<div class="sign-box"><span>${esc(label)}</span><i></i></div>`)
    .join("");

  const stripItems =
    data.vehicleStrip && data.vehicleStrip.length > 0
      ? data.vehicleStrip
      : [{ label: "Details", value: data.additionalInfo }];
  const vehicleStrip = stripItems
    .map(
      (item) =>
        `<span><b>${esc(item.label)}:</b> ${esc(item.value)}</span>`,
    )
    .join('<span class="sep">|</span>');

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(data.reference)} — ${esc(settings.companyName)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;background:#eef2f4;margin:0;padding:16px;color:#000}
  .sheet{width:190mm;min-height:277mm;background:#fff;margin:0 auto;padding:0;box-shadow:0 8px 24px rgba(0,0,0,.12)}
  .masthead{display:flex;justify-content:space-between;align-items:flex-start;gap:6mm;margin:10mm 10mm 0;padding-bottom:3mm;border-bottom:1px solid #000}
  .brand{display:flex;align-items:center;gap:4mm;min-width:0}
  .brand-logo{max-height:17mm;max-width:42mm;object-fit:contain}
  .brand-name{font-size:15px;font-weight:700;line-height:1.2}
  .doc{text-align:right;flex-shrink:0}
  .doc-badge{display:inline-block;background:${esc(settings.brandColor || "#0f766e")};color:#fff;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:2mm 3mm}
  .doc-no{font-size:11px;font-weight:700;margin-top:2.2mm}
  .grid{display:grid;grid-template-columns:1fr 1fr;border-left:1px solid #000;margin:3mm 10mm 0}
  .cell{border-right:1px solid #000;border-bottom:1px solid #000;padding:1.8mm 2mm;font-size:8.5px;line-height:1.45;min-height:8mm}
  .cell b{display:block;font-size:7.5px;text-transform:uppercase;margin-bottom:.8mm}
  .party{padding:2mm 2.4mm;min-height:38mm;font-size:8px;line-height:1.55}
  .party b{font-size:7.4px;letter-spacing:.06em}
  .party .row{display:flex;gap:2mm;margin-top:.7mm}
  .party .row .k{width:16mm;flex-shrink:0}
  .party .row .v{flex:1;min-width:0}
  .party .name{font-weight:700}
  .strip{display:flex;flex-wrap:wrap;gap:2mm 4mm;align-items:center;border:1px solid #000;border-top:0;margin:0 10mm;padding:2.2mm 2.4mm;font-size:8.2px;font-weight:700}
  .strip .sep{font-weight:400;color:#64748b}
  table.items{width:calc(100% - 20mm);margin:2mm 10mm 0;border-collapse:collapse;font-size:8px}
  table.items th,table.items td{border:1px solid #000;padding:1.4mm 1.8mm;vertical-align:top}
  table.items th{background:#eef1f4;font-size:7.5px;text-align:left}
  table.items .num,table.totals .num{text-align:right;white-space:nowrap}
  table.items .ref{width:11mm}
  table.items .section td{background:#e2e8f0;font-weight:700}
  table.totals{width:calc(100% - 20mm);margin:0 10mm;border-collapse:collapse;font-size:8.5px}
  table.totals td{border:1px solid #000;padding:1.6mm 2mm}
  table.totals .label{font-weight:400}
  table.totals .strong td{font-weight:700;font-size:9.5px}
  .words{border:1px solid #000;border-top:0;margin:0 10mm;padding:1.8mm 2mm;font-size:8.5px}
  .words b{display:block;font-size:7.5px;text-transform:uppercase;margin-bottom:.8mm}
  .notes{margin:3mm 10mm 0;font-size:7.5px;color:#334155;line-height:1.5}
  .foot{display:flex;justify-content:space-between;gap:8mm;margin:8mm 10mm 0;align-items:flex-end;break-inside:avoid;page-break-inside:avoid}
  .foot .contacts{font-size:7.5px;line-height:1.5;max-width:96mm}
  .signs{display:flex;gap:4mm;break-inside:avoid;page-break-inside:avoid}
  .sign-box{border:1px solid #000;width:52mm;height:22mm;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;padding-bottom:2mm;font-size:6.8px;break-inside:avoid;page-break-inside:avoid}
  .sign-box i{display:block;border-top:1px solid #000;width:38mm;margin-bottom:1.2mm}
  .powered{margin:4mm 10mm 0;text-align:center;font-size:6.5px;color:#64748b}
  @media print{body{background:#fff;padding:0}.sheet{box-shadow:none;width:auto;min-height:auto}@page{size:A4 portrait;margin:8mm}}
</style></head>
<body>
<div class="sheet">
  <div class="masthead">
    <div class="brand">
      ${settings.logo && /^data:image\//i.test(settings.logo) ? `<img class="brand-logo" src="${esc(settings.logo)}" alt="logo">` : ""}
      <div class="brand-name">${esc(settings.companyName)}</div>
    </div>
    <div class="doc">
      <div class="doc-badge">${esc(data.title)}</div>
      <div class="doc-no">${esc(data.documentNumber ?? data.reference)}</div>
    </div>
  </div>
  <div class="grid">
    <div class="cell"><b>${esc(data.dateLabel ?? "Date of Invoice")}</b>${esc(numericDate(data.invoiceDate))}</div>
    <div class="cell"><b>Document Ref</b>${esc(data.reference)}</div>
    <div class="cell party"><b>Supplier</b>
      <div class="row"><span class="k">TIN No.</span><span class="v">${esc(settings.tinNumber || "—")}</span></div>
      <div class="row"><span class="k">Name</span><span class="v name">${esc(settings.companyName)}</span></div>
      <div class="row"><span class="k">Address</span><span class="v">${esc(settings.address)}</span></div>
      <div class="row"><span class="k">Telephone</span><span class="v">${esc(settings.phone)}</span></div>
      ${settings.vatRegNumber ? `<div class="row"><span class="k">VAT</span><span class="v">Reg No: ${esc(settings.vatRegNumber)}</span></div>` : ""}
    </div>
    <div class="cell party"><b>Purchaser</b>
      <div class="row"><span class="k">TIN No.</span><span class="v">${esc(data.purchaser.tin || "—")}</span></div>
      <div class="row"><span class="k">Name</span><span class="v name">${esc(data.purchaser.name)}</span></div>
      <div class="row"><span class="k">Address</span><span class="v">${esc(data.purchaser.address)}</span></div>
      <div class="row"><span class="k">Telephone</span><span class="v">${esc(data.purchaser.phone)}</span></div>
    </div>
    ${data.hideSupplyRow ? "" : `<div class="cell"><b>Date of Supply</b>${esc(numericDate(data.supplyDate))}</div>
    <div class="cell"><b>Place of Supply</b>${esc(supplierAddress(settings))}</div>`}
  </div>
  <div class="strip">${vehicleStrip}</div>
  <table class="items">
    <thead><tr><th>Ref.</th><th>Description of Goods or Services</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Amount (Rs.)</th></tr></thead>
    <tbody>${sectionRows}</tbody>
  </table>
  <table class="totals">${totalRows}</table>
  <div class="words"><b>Total Amount in words</b>${esc(amountInWords(data.totals.balance > 0 ? data.totals.balance : data.totals.total))}</div>
  <div class="words"><b>Mode of Payment</b>${esc(data.paymentMode)}</div>
  ${data.notes.filter(Boolean).map((note) => `<div class="notes">${esc(note)}</div>`).join("")}
  <div class="foot">
    <div class="contacts">${esc(settings.footerInquiryLine || "Any inquiry, please call our workshop hotline.")}<br>${esc(settings.footerComplaintLine || "Any suggestion or complaint regarding your vehicle or job, please contact management.")}</div>
    <div class="signs">${signatureBoxes}</div>
  </div>
  <div class="powered">Powered by ${esc(DEVELOPER.name)} · ${esc(DEVELOPER.email)} · ${esc(DEVELOPER.phoneDisplay)}<br>${esc(COPYRIGHT)}</div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},320)}</script>
</body></html>`;
}

export function printIrdInvoice(
  job: JobCard,
  tasks: JobTask[],
  parts: JobPart[],
  settings: WorkshopSettings,
  totals: InvoiceTotalsInput,
  insurance?: { claim: InsuranceClaim; insurer?: InsuranceCompany },
  options: InvoiceDocumentOptions = {},
): void {
  const html = renderIrdHtml(
    settings,
    invoiceDocument(job, tasks, parts, settings, totals, insurance, options),
  );
  const win = window.open("", "_blank", "width=980,height=1100");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function receiptWidth(settings: WorkshopSettings): string {
  return settings.thermalPaperWidth === "58mm" ? "58mm" : "80mm";
}

function thermalStyles(settings: WorkshopSettings): string {
  const width = receiptWidth(settings);
  return `
  *{box-sizing:border-box}
  body{font-family:'Courier New',monospace;background:#eef2f4;margin:0;padding:14px;color:#111}
  .receipt{width:${width};max-width:100%;background:#fff;margin:0 auto;padding:4mm 3mm;box-shadow:0 8px 24px rgba(0,0,0,.12)}
  .center{text-align:center}.right{text-align:right}.bold{font-weight:700}
  .logo{max-width:16mm;max-height:16mm;object-fit:contain;margin-bottom:1mm}
  h1{font-size:13px;margin:0 0 1mm;line-height:1.2}
  .muted{font-size:8.5px;line-height:1.45}
  .dash{border-top:1px dashed #111;margin:2mm 0}
  table{width:100%;border-collapse:collapse;font-size:8.5px}
  td{padding:1mm 0;vertical-align:top}
  small{font-size:7.5px;color:#475569}
  .total{font-size:11px}
  @media print{body{background:#fff;padding:0}.receipt{box-shadow:none;width:${width};padding:0}@page{size:${width} auto;margin:2mm}}
  `;
}

export function printThermalInvoice(
  job: JobCard,
  tasks: JobTask[],
  parts: JobPart[],
  settings: WorkshopSettings,
  totals: InvoiceTotalsInput,
  creditDue?: string,
  insurance?: { claim: InsuranceClaim; insurer?: InsuranceCompany },
  options: InvoiceDocumentOptions = {},
): void {
  const issuedParts = parts.filter(
    (part) =>
      part.status === "Issued" &&
      part.sellingPrice > 0 &&
      !part.includedInLabor &&
      part.partSource !== "Customer_Brought",
  );
  const supply = roundCurrency(Math.max(0, totals.subtotal - totals.discount));
  const vat = jobVat(job, settings, supply);
  const total = roundCurrency(supply + vat.amount);
  const advance = roundCurrency(options.advancePaid ?? 0);
  const balance = roundCurrency(Math.max(0, total - advance));
  const partRows = issuedParts
    .map((part) => {
      const qty = partIssueQty(part);
      return `<tr><td>${esc(part.itemName)}<br><small>${formatQty(qty)} × ${money(part.sellingPrice, 2)}</small></td><td class="right">${money(qty * part.sellingPrice, 2)}</td></tr>`;
    })
    .join("");
  const taskRows = tasks
    .map(
      (task) =>
        `<tr><td>${esc(task.name)}</td><td class="right">${money(task.laborCost, 2)}</td></tr>`,
    )
    .join("");
  const insurerRows = insurance
    ? `<div class="dash"></div><div class="muted"><span class="bold">INSURER</span><br>${esc(insurance.insurer?.name ?? "—")}<br>${esc(insurance.insurer?.address ?? "")}<br>Hotline: ${esc(insurance.insurer?.hotline ?? "—")}<br>Policy ${esc(insurance.claim.policyNo)} · Claim ${esc(insurance.claim.claimNo)}</div>`
    : "";
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(job.id)} — ${esc(settings.companyName)}</title>
<style>${thermalStyles(settings)}</style></head>
<body>
<div class="receipt">
  <div class="center">
    ${settings.logo ? `<img class="logo" src="${settings.logo}" alt="logo">` : ""}
    <h1>${esc(settings.companyName)}</h1>
    <div class="muted">${esc(settings.address)}<br>${esc(settings.phone)}</div>
    ${settings.tinNumber ? `<div class="muted">TIN: ${esc(settings.tinNumber)}</div>` : ""}
  </div>
  <div class="dash"></div>
  <div class="center bold" style="font-size:10px">${job.isVatInvoice ? "TAX INVOICE" : "INVOICE"}</div>
  <div class="muted">
    <div style="display:flex;justify-content:space-between"><span>Invoice</span><span class="bold">${esc(job.id)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Date</span><span>${esc(shortDate(job.paidAt ?? new Date().toISOString()))}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Vehicle</span><span class="bold">${esc(job.vehicleNo)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Make / model</span><span>${esc(job.make)} ${esc(job.model)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Mileage</span><span>${job.mileage.toLocaleString()} km</span></div>
    <div style="display:flex;justify-content:space-between"><span>Customer</span><span>${esc(job.customerName)}</span></div>
    ${job.customerTinNumber ? `<div style="display:flex;justify-content:space-between"><span>Customer TIN</span><span>${esc(job.customerTinNumber)}</span></div>` : ""}
  </div>
  ${insurerRows}
  <div class="dash"></div>
  <div class="bold" style="font-size:9px">DONE JOBS</div>
  <table>${taskRows || '<tr><td colspan="2"><small>No labour tasks</small></td></tr>'}</table>
  <div class="dash"></div>
  <div class="bold" style="font-size:9px">ADDED ITEMS</div>
  <table>${partRows || '<tr><td colspan="2"><small>No parts used</small></td></tr>'}</table>
  <div class="dash"></div>
  <table>
    <tr><td>Subtotal</td><td class="right">${money(totals.subtotal, 2)}</td></tr>
    ${totals.discount > 0 ? `<tr><td>Discount</td><td class="right">- ${money(totals.discount, 2)}</td></tr>` : ""}
    ${vat.amount > 0 ? `<tr><td>VAT @ ${vat.rate}%</td><td class="right">${money(vat.amount, 2)}</td></tr>` : ""}
    <tr class="bold total"><td>TOTAL</td><td class="right">${money(total, 2)}</td></tr>
    ${advance > 0 ? `<tr><td>Advance paid</td><td class="right">- ${money(advance, 2)}</td></tr><tr class="bold"><td>BALANCE</td><td class="right">${money(balance, 2)}</td></tr>` : ""}
    <tr><td>Payment</td><td class="right bold">${esc(job.paymentMethod ?? "Cash")}</td></tr>
    ${job.paymentMethod === "Credit" && creditDue ? `<tr><td>Due date</td><td class="right bold">${esc(shortDate(creditDue))}</td></tr>` : ""}
  </table>
  <div class="dash"></div>
  <div class="center muted">
    ${vat.amount > 0 ? `<div class="bold" style="font-size:8.5px">${esc(amountInWords(balance))}</div><br>` : ""}
    Thank you for choosing ${esc(settings.companyName)}!<br>Drive safely.<br><br>
    ${settings.googleReviewUrl ? `Leave us a 5-star review:<br><span style="word-break:break-all">${esc(settings.googleReviewUrl)}</span>` : ""}
    ${CLIENT_CUSTOMISATION.invoiceNote ? `<div style="margin-top:2mm;font-size:7.5px">${esc(CLIENT_CUSTOMISATION.invoiceNote)}</div>` : ""}
    <div style="margin-top:2mm;font-size:7px">Powered by ${esc(DEVELOPER.name)}<br>${esc(DEVELOPER.email)} · ${esc(DEVELOPER.phoneDisplay)}<br>${esc(COPYRIGHT)}</div>
  </div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`;
  const win = window.open("", "_blank", "width=520,height=760");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

export function printThermalPayslip(
  payslip: Payslip,
  worker: WorkerProfile,
  settings: WorkshopSettings,
): void {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Payslip ${esc(worker.fullName)}</title>
<style>${thermalStyles(settings)}</style></head>
<body>
<div class="receipt">
  <div class="center">
    ${settings.logo ? `<img class="logo" src="${settings.logo}" alt="logo">` : ""}
    <h1>${esc(settings.companyName)}</h1>
    <div class="muted">${esc(settings.address)}<br>${esc(settings.phone)}</div>
  </div>
  <div class="dash"></div>
  <div class="center bold" style="font-size:10px">PAYSLIP</div>
  <div class="muted">
    <div style="display:flex;justify-content:space-between"><span>Employee</span><span class="bold">${esc(worker.fullName)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Worker ID</span><span>${esc(worker.id)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Period</span><span>${esc(shortDate(payslip.periodStart))} — ${esc(shortDate(payslip.periodEnd))}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Attendance</span><span>${payslip.workedDays}/${payslip.workingDays} days</span></div>
    <div style="display:flex;justify-content:space-between"><span>Paid</span><span>${esc(shortDate(payslip.paidAt))}</span></div>
  </div>
  <div class="dash"></div>
  <div class="bold" style="font-size:9px">EARNINGS</div>
  <table>
    <tr><td>Basic salary</td><td class="right">${money(payslip.basic, 2)}</td></tr>
    <tr><td>Commission</td><td class="right">${money(payslip.commission, 2)}</td></tr>
    <tr class="bold"><td>Gross pay</td><td class="right">${money(payslip.gross, 2)}</td></tr>
  </table>
  <div class="dash"></div>
  <div class="bold" style="font-size:9px">DEDUCTIONS</div>
  <table>
    <tr><td>EPF (employee)</td><td class="right">${money(payslip.epfEmployee, 2)}</td></tr>
    <tr><td>Salary loan</td><td class="right">${money(payslip.loanDeduction, 2)}</td></tr>
    <tr><td>Other</td><td class="right">${money(payslip.otherDeductions, 2)}</td></tr>
    <tr class="bold total"><td>NET PAY</td><td class="right">${money(payslip.net, 2)}</td></tr>
  </table>
  <div class="dash"></div>
  <div class="muted" style="font-size:7.5px">
    Employer EPF ${money(payslip.epfEmployer, 2)} and ETF ${money(payslip.etfEmployer, 2)} are paid by the employer and shown in the owner P&amp;L.
    ${payslip.note ? `<br><br>${esc(payslip.note)}` : ""}
  </div>
  <div class="dash"></div>
  <div class="muted" style="margin-top:3mm">
    Employee signature: __________________<br><br>
    Authorised by: ${esc(payslip.paidBy ?? "—")} ______________
  </div>
  <div class="dash"></div>
  <div class="center muted" style="font-size:7px">Confidential payroll document · ${esc(COPYRIGHT)}</div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`;
  const win = window.open("", "_blank", "width=520,height=760");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

export function printThermalSupplierPaymentVoucher(
  purchase: SupplierPurchase,
  supplierName: string,
  settings: WorkshopSettings,
  bankAccountName?: string,
): void {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Supplier payment ${esc(purchase.invoiceNo)}</title>
<style>${thermalStyles(settings)}</style></head>
<body>
<div class="receipt">
  <div class="center">
    ${settings.logo ? `<img class="logo" src="${settings.logo}" alt="logo">` : ""}
    <h1>${esc(settings.companyName)}</h1>
    <div class="muted">${esc(settings.address)}<br>${esc(settings.phone)}</div>
  </div>
  <div class="dash"></div>
  <div class="center bold" style="font-size:10px">SUPPLIER PAYMENT VOUCHER</div>
  <div class="muted">
    <div style="display:flex;justify-content:space-between"><span>Voucher</span><span class="bold">PAY-${esc(purchase.id)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Date</span><span>${esc(shortDate(purchase.paidAt ?? new Date().toISOString()))}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Supplier</span><span class="bold">${esc(supplierName)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Invoice</span><span>${esc(purchase.invoiceNo)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Purchase date</span><span>${esc(shortDate(purchase.purchaseDate))}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Payment</span><span>${esc(purchase.paymentMethod ?? purchase.type)}</span></div>
    ${bankAccountName ? `<div style="display:flex;justify-content:space-between"><span>Account</span><span>${esc(bankAccountName)}</span></div>` : ""}
  </div>
  <div class="dash"></div>
  <table>
    <tr class="bold total"><td>AMOUNT PAID</td><td class="right">${money(purchase.amount, 2)}</td></tr>
  </table>
  <div class="dash"></div>
  <div class="muted">${esc(purchase.description || "Supplier invoice settlement.")}</div>
  <div class="dash"></div>
  <div class="muted" style="margin-top:3mm">
    Prepared by: ${esc(purchase.paidBy ?? "—")} ______________<br><br>
    Supplier signature: __________________
  </div>
  <div class="dash"></div>
  <div class="center muted" style="font-size:7px">Internal payment voucher · not a tax invoice</div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`;
  const win = window.open("", "_blank", "width=520,height=760");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

export function printThermalPettyCashVoucher(
  entry: PettyCashEntry,
  settings: WorkshopSettings,
): void {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Petty cash ${esc(entry.voucherNo ?? entry.receiptNo)}</title>
<style>${thermalStyles(settings)}</style></head>
<body>
<div class="receipt">
  <div class="center">
    ${settings.logo ? `<img class="logo" src="${settings.logo}" alt="logo">` : ""}
    <h1>${esc(settings.companyName)}</h1>
    <div class="muted">${esc(settings.address)}<br>${esc(settings.phone)}</div>
  </div>
  <div class="dash"></div>
  <div class="center bold" style="font-size:10px">PETTY CASH VOUCHER</div>
  <div class="muted">
    <div style="display:flex;justify-content:space-between"><span>Voucher</span><span class="bold">${esc(entry.voucherNo ?? entry.receiptNo)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Date</span><span>${esc(shortDate(entry.date))}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Category</span><span>${esc(entry.category)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Paid to</span><span>${esc(entry.paidTo || "—")}</span></div>
  </div>
  <div class="dash"></div>
  <table>
    <tr class="bold total"><td>AMOUNT</td><td class="right">${money(entry.amount, 2)}</td></tr>
  </table>
  <div class="dash"></div>
  <div class="muted">${esc(entry.description)}<br><br>Recorded by ${esc(entry.recordedBy ?? "—")}</div>
  <div class="dash"></div>
  <div class="muted" style="margin-top:3mm">
    Cashier signature: __________________<br><br>
    Received by: _______________________
  </div>
  <div class="dash"></div>
  <div class="center muted" style="font-size:7px">Internal petty cash voucher · not a tax invoice</div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`;
  const win = window.open("", "_blank", "width=520,height=760");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

export function printThermalAdvanceReceipt(
  advance: AdvancePayment,
  settings: WorkshopSettings,
  balanceAfter?: number,
): void {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(advance.receiptNo)} — ${esc(settings.companyName)}</title>
<style>${thermalStyles(settings)}</style></head>
<body>
<div class="receipt">
  <div class="center">
    ${settings.logo ? `<img class="logo" src="${settings.logo}" alt="logo">` : ""}
    <h1>${esc(settings.companyName)}</h1>
    <div class="muted">${esc(settings.address)}<br>${esc(settings.phone)}</div>
  </div>
  <div class="dash"></div>
  <div class="center bold" style="font-size:10px">ADVANCE PAYMENT RECEIPT</div>
  <div class="muted">
    <div style="display:flex;justify-content:space-between"><span>Receipt</span><span class="bold">${esc(advance.receiptNo)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Date</span><span>${esc(shortDate(advance.createdAt))}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Job</span><span class="bold">${esc(advance.jobCardId)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Vehicle</span><span>${esc(advance.vehicleNo)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Customer</span><span>${esc(advance.customerName)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Method</span><span>${esc(advance.method)}</span></div>
  </div>
  <div class="dash"></div>
  <table>
    <tr class="bold total"><td>ADVANCE PAID</td><td class="right">${money(advance.amount, 2)}</td></tr>
    ${balanceAfter !== undefined ? `<tr><td>Balance after</td><td class="right">${money(Math.max(0, balanceAfter), 2)}</td></tr>` : ""}
  </table>
  <div class="dash"></div>
  <div class="muted">${esc(advance.note || "Advance against repair job.")}<br><br>This amount is deducted from the final invoice. It is not a tax invoice.</div>
  <div class="dash"></div>
  <div class="muted">
    <div style="display:flex;justify-content:space-between"><span>Cashier</span><span class="bold">${esc(advance.recordedBy ?? "—")}</span></div>
    <div style="margin-top:4mm">Cashier signature: __________________</div>
    <div style="margin-top:4mm">Customer signature: ________________</div>
  </div>
  <div class="dash"></div>
  <div class="center muted">Thank you — ${esc(settings.companyName)}</div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`;
  const win = window.open("", "_blank", "width=520,height=760");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

export function printA4AdvanceReceipt(
  advance: AdvancePayment,
  settings: WorkshopSettings,
  balanceAfter?: number,
): void {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(advance.receiptNo)} — ${esc(settings.companyName)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;background:#eef2f4;margin:0;padding:18px;color:#111}
  .sheet{max-width:190mm;min-height:270mm;background:#fff;margin:0 auto;padding:14mm;box-shadow:0 8px 24px rgba(0,0,0,.12)}
  .head{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #0f766e;padding-bottom:8px}
  h1{font-size:22px;margin:0}
  .muted{font-size:11px;color:#475569;line-height:1.5}
  .title{text-align:center;border:1px solid #111;padding:8px;font-weight:700;letter-spacing:.1em;margin:18px 0}
  .grid{display:grid;grid-template-columns:1fr 1fr;border-left:1px solid #111}
  .cell{border-right:1px solid #111;border-bottom:1px solid #111;padding:8px;font-size:12px;line-height:1.5}
  .cell b{display:block;font-size:9px;text-transform:uppercase;margin-bottom:2px}
  .amount{border:1px solid #111;border-top:0;padding:14px;font-size:22px;font-weight:700;text-align:right}
  .box{border:1px solid #111;padding:12px;font-size:11px;line-height:1.6}
  .sign{margin-top:44px;display:grid;grid-template-columns:1fr 1fr;gap:40px;font-size:11px}
  .line{border-top:1px solid #111;margin-top:34px;padding-top:5px}
  @media print{body{background:#fff;padding:0}.sheet{box-shadow:none;max-width:100%;min-height:auto;padding:0}@page{size:A4 portrait;margin:12mm}}
</style></head>
<body>
<div class="sheet">
  <div class="head">
    <div><h1>${esc(settings.companyName)}</h1><div class="muted">${esc(settings.address)}<br>${esc(settings.phone)} · ${esc(settings.email)}${settings.tinNumber ? `<br>TIN: ${esc(settings.tinNumber)}` : ""}</div></div>
    <div style="text-align:right"><strong>ADVANCE PAYMENT RECEIPT</strong><div class="muted">${esc(advance.receiptNo)}<br>${esc(shortDate(advance.createdAt))}</div></div>
  </div>
  <div class="title">ADVANCE PAYMENT RECEIPT</div>
  <div class="grid">
    <div class="cell"><b>Received from</b>${esc(advance.customerName)}<br>+${esc(normalizePhone(advance.phone))}</div>
    <div class="cell"><b>Job / vehicle</b>${esc(advance.jobCardId)}<br>${esc(advance.vehicleNo)}</div>
    <div class="cell"><b>Payment method</b>${esc(advance.method)}</div>
    <div class="cell"><b>Received by</b>${esc(advance.recordedBy ?? "—")}</div>
  </div>
  <div class="amount">${money(advance.amount, 2)}</div>
  ${balanceAfter !== undefined ? `<div class="box">Balance after this advance: <strong>${money(Math.max(0, balanceAfter), 2)}</strong></div>` : ""}
  <div class="box" style="margin-top:8px">${esc(advance.note || "Advance against repair job.")}<br><br>This advance is credited against the final invoice. It is not a tax invoice.</div>
  <div class="sign">
    <div><div class="line">Customer signature</div></div>
    <div><div class="line">Authorised cashier</div></div>
  </div>
  <div class="muted" style="margin-top:26px;font-size:9px">Powered by ${esc(DEVELOPER.name)} · ${esc(DEVELOPER.email)} · ${esc(DEVELOPER.phoneDisplay)}<br>${esc(COPYRIGHT)}</div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},320)}</script>
</body></html>`;
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

export function printDriverCommissionChit(
  job: JobCard,
  settings: WorkshopSettings,
  totals: { labor: number; total: number },
): void {
  const commission = driverCommissionFor(job, {
    labor: totals.labor,
    total: totals.total,
  });
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Driver commission ${esc(job.id)}</title>
<style>${thermalStyles(settings)}</style></head>
<body>
<div class="receipt">
  <div class="center">
    <h1>${esc(settings.companyName)}</h1>
    <div class="muted">${esc(settings.address)}<br>${esc(settings.phone)}</div>
  </div>
  <div class="dash"></div>
  <div class="center bold" style="font-size:10px">DRIVER COMMISSION VOUCHER</div>
  <div class="muted">
    <div style="display:flex;justify-content:space-between"><span>Voucher</span><span class="bold">DC-${esc(job.id)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Date</span><span>${esc(shortDate(new Date().toISOString()))}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Job</span><span class="bold">${esc(job.id)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Vehicle</span><span>${esc(job.vehicleNo)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Driver</span><span class="bold">${esc(job.driver?.name ?? "—")}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Phone</span><span>${esc(job.driver?.phone ?? "—")}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Basis</span><span>${esc(job.driver?.basis ?? "—")} · ${esc(job.driver?.type ?? "—")} ${job.driver?.value ?? 0}${job.driver?.type === "Percentage" ? "%" : ""}</span></div>
  </div>
  <div class="dash"></div>
  <table><tr class="bold total"><td>TOTAL PAID</td><td class="right">${money(commission, 2)}</td></tr></table>
  <div class="dash"></div>
  <div class="muted" style="margin-top:5mm">Driver signature: ______________________<br><br>Authorised cashier: ______________________</div>
  <div style="height:8mm"></div>
  <div class="center muted" style="font-size:7px">Internal commission voucher. Not a customer invoice.</div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`;
  const win = window.open("", "_blank", "width=520,height=760");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

export function printPrinterTest(settings: WorkshopSettings): void {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Printer test — ${esc(settings.companyName)}</title>
<style>${thermalStyles(settings)}</style></head>
<body>
<div class="receipt">
  <div class="center"><h1>${esc(settings.companyName)}</h1><div class="muted">Thermal printer test</div></div>
  <div class="dash"></div>
  <div class="muted">
    <div style="display:flex;justify-content:space-between"><span>Mode</span><span>${esc(settings.printerMode ?? "Both")}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Roll width</span><span>${esc(settings.thermalPaperWidth ?? "80mm")}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Standard paper</span><span>${esc(settings.standardPaperSize ?? "A4")}</span></div>
  </div>
  <div class="dash"></div>
  <div class="muted">1234567890 · ABCDEFGHIJ<br>Character width test for this roll.<br>Item ..................... LKR 1,250.00</div>
  <div class="dash"></div>
  <div class="center muted">If this prints without clipping, the roll width is correct.</div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`;
  const win = window.open("", "_blank", "width=520,height=760");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}
