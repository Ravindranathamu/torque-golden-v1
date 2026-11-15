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
  WagePayout,
  WorkerProfile,
  WorkshopSettings,
} from "../types";
import {
  estimateDisplayNumber,
  formatQty,
  isDemoMode,
  money,
  normalizePhone,
  partIssueQty,
  shortDate,
  waLink,
  type JobTotals,
} from "./utils";
import { COPYRIGHT, DEVELOPER } from "./developer";
import { autoWhatsAppEnabled, sendWhatsAppDocument } from "./whatsapp";
import {
  buildIrdEstimatePdf,
  buildIrdInsuranceBillPdf,
  buildIrdInsuranceEstimatePdf,
  buildIrdInvoicePdf,
  printA4AdvanceReceipt,
  printIrdInvoice,
  printThermalAdvanceReceipt,
  printThermalInvoice,
  type InvoiceDocumentOptions,
} from "./ird";

type Totals = {
  labor: number;
  parts: number;
  subtotal: number;
  discount: number;
  total: number;
};

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full || "0f766e", 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function buildLegacyInvoicePdf(
  job: JobCard,
  tasks: JobTask[],
  parts: JobPart[],
  workers: WorkerProfile[],
  settings: WorkshopSettings,
  totals: Totals,
  creditDue?: string,
  insurance?: { claim: InsuranceClaim; insurer?: InsuranceCompany },
): { blob: Blob; filename: string } {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = 210;
  const margin = 18;
  const right = pageWidth - margin;
  const [r, g, b] = hexToRgb(settings.brandColor);
  let y = 0;

  doc.setFillColor(r, g, b);
  doc.rect(0, 0, pageWidth, 34, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text(settings.companyName || "Workshop", margin, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(settings.address || "", margin, 21, { maxWidth: 130 });
  doc.text(`${settings.phone || ""}  ·  ${settings.email || ""}`, margin, 27);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("INVOICE", right, 15, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(job.id, right, 22, { align: "right" });
  doc.text(shortDate(job.paidAt ?? new Date().toISOString()), right, 27, { align: "right" });

  y = 44;
  doc.setTextColor(30, 41, 59);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("BILL TO", margin, y);
  doc.text("VEHICLE", 112, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  y += 6;
  doc.text(job.customerName, margin, y);
  doc.text(`${job.vehicleNo}`, 112, y);
  y += 5;
  doc.text(`+${normalizePhone(job.phone)}`, margin, y);
  doc.text(`${job.make} ${job.model}`, 112, y);
  y += 5;
  if (job.safetyNotes) {
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(job.safetyNotes, margin, y, { maxWidth: 174 });
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(9.5);
  }

  if (insurance) {
    y += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("INSURER / CLAIM", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(`${insurance.insurer?.name ?? "Insurance company"} · ${insurance.insurer?.hotline ?? ""}`, margin, y);
    doc.text(`Policy ${insurance.claim.policyNo} · Claim ${insurance.claim.claimNo}`, 112, y);
    y += 4.5;
    doc.text(insurance.insurer?.address ?? "", margin, y, { maxWidth: 90 });
    doc.text(`Claims ${insurance.insurer?.email ?? "—"}`, 112, y);
    y += 4;
    doc.text(`Assessor ${insurance.claim.assessorName ?? "—"}`, 112, y);
    doc.setTextColor(30, 41, 59);
    y += 6;
  }

  y += 10;
  const tableTop = y;
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, tableTop, pageWidth - margin * 2, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("DESCRIPTION", margin + 3, tableTop + 5.5);
  doc.text("QTY", 130, tableTop + 5.5, { align: "right" });
  doc.text("UNIT PRICE", 156, tableTop + 5.5, { align: "right" });
  doc.text("AMOUNT", right - 3, tableTop + 5.5, { align: "right" });
  y = tableTop + 13;
  doc.setFont("helvetica", "normal");

  const ensureSpace = (needed: number) => {
    if (y + needed > 270) {
      doc.addPage();
      y = 20;
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Parts & materials", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");

  parts
    .filter((p) => p.status === "Issued" && p.sellingPrice > 0 && !p.includedInLabor)
    .forEach((part) => {
      ensureSpace(12);
      const qty = partIssueQty(part);
      doc.setFontSize(9);
      doc.text(part.itemName, margin + 2, y, { maxWidth: 100 });
      doc.text(formatQty(qty), 130, y, { align: "right" });
      doc.text(money(part.sellingPrice, 2), 156, y, { align: "right" });
      doc.text(money(part.sellingPrice * qty, 2), right - 3, y, { align: "right" });
      y += 6;
    });

  y += 3;
  doc.setFont("helvetica", "bold");
  doc.text("Labour & repair tasks", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  tasks.forEach((task) => {
    ensureSpace(10);
    const worker = workers.find((w) => w.id === task.workerId);
    doc.setFontSize(9);
    doc.text(task.name, margin + 2, y, { maxWidth: 110 });
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    if (worker) doc.text(`Technician: ${worker.fullName}`, margin + 2, y + 4);
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(9);
    doc.text(money(task.laborCost, 2), right - 3, y, { align: "right" });
    y += 9;
  });

  ensureSpace(50);
  y += 4;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, right, y);
  y += 8;
  const totalsRows: [string, string, boolean?][] = [
    ["Labour", money(totals.labor, 2)],
    ["Parts & materials", money(totals.parts, 2)],
    ["Subtotal", money(totals.subtotal, 2)],
  ];
  if (totals.discount > 0) totalsRows.push(["Discount", `- ${money(totals.discount, 2)}`]);
  totalsRows.push(["NET TOTAL", money(totals.total, 2), true]);
  if (insurance) {
    const insurerShare = insurance.claim.insuranceBillAmount ?? totals.total;
    const customerShare =
      insurance.claim.customerBillAmount ?? Math.max(0, totals.total - insurerShare);
    totalsRows.push(["Insurer payable", money(insurerShare, 2)]);
    totalsRows.push(["Customer payable", money(customerShare, 2)]);
  }
  totalsRows.forEach(([label, value, strong]) => {
    doc.setFont("helvetica", strong ? "bold" : "normal");
    doc.setFontSize(strong ? 12 : 9.5);
    doc.text(label, right - 65, y, { align: "right" });
    doc.text(value, right - 3, y, { align: "right" });
    y += strong ? 9 : 6;
  });

  y += 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Payment method: ${job.paymentMethod ?? "Cash"}`, margin, y);
  if (job.paymentMethod === "Credit" && creditDue) {
    y += 5;
    doc.setTextColor(185, 28, 28);
    doc.text(`Credit terms — balance due ${shortDate(creditDue)}`, margin, y);
    doc.setTextColor(30, 41, 59);
  }

  y += 12;
  if (y > 250) {
    doc.addPage();
    y = 25;
  }
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, right, y);
  y += 7;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    "Thank you for choosing us. Drive safely!",
    pageWidth / 2,
    y,
    { align: "center" },
  );
  if (settings.googleReviewUrl) {
    y += 5;
    doc.text(`Review us on Google: ${settings.googleReviewUrl}`, pageWidth / 2, y, {
      align: "center",
      maxWidth: 170,
    });
  }
  y += 5;
  doc.text(
    "This is a computer-generated invoice. Parts carry the supplier warranty stated at issue.",
    pageWidth / 2,
    y,
    { align: "center", maxWidth: 170 },
  );
  y += 5;
  if (y > 275) {
    doc.addPage();
    y = 25;
  }
  doc.setFontSize(7.5);
  doc.text(
    `Powered by ${DEVELOPER.name} · ${DEVELOPER.email} · ${DEVELOPER.phoneDisplay}`,
    pageWidth / 2,
    y,
    { align: "center", maxWidth: 174 },
  );
  y += 4;
  doc.text(COPYRIGHT, pageWidth / 2, y, { align: "center" });

  const filename = `Invoice_${job.id}_${job.vehicleNo.replace(/\s+/g, "-")}.pdf`;
  return { blob: doc.output("blob"), filename };
}

export function buildInvoicePdf(
  job: JobCard,
  tasks: JobTask[],
  parts: JobPart[],
  _workers: WorkerProfile[],
  settings: WorkshopSettings,
  totals: Totals,
  _creditDue?: string,
  insurance?: { claim: InsuranceClaim; insurer?: InsuranceCompany },
  options: InvoiceDocumentOptions = {},
): { blob: Blob; filename: string } {
  return buildIrdInvoicePdf(job, tasks, parts, settings, totals, insurance, options);
}

export async function downloadInvoice(
  job: JobCard,
  tasks: JobTask[],
  parts: JobPart[],
  workers: WorkerProfile[],
  settings: WorkshopSettings,
  totals: Totals,
  creditDue?: string,
  insurance?: { claim: InsuranceClaim; insurer?: InsuranceCompany },
  options: InvoiceDocumentOptions = {},
) {
  const { blob, filename } = buildInvoicePdf(job, tasks, parts, workers, settings, totals, creditDue, insurance, options);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function shareInvoiceWhatsApp(
  job: JobCard,
  tasks: JobTask[],
  parts: JobPart[],
  workers: WorkerProfile[],
  settings: WorkshopSettings,
  totals: Totals,
  message: string,
  creditDue?: string,
  insurance?: { claim: InsuranceClaim; insurer?: InsuranceCompany },
  options: InvoiceDocumentOptions = {},
): Promise<"shared" | "downloaded" | "opened" | "queued"> {
  const { blob, filename } = buildInvoicePdf(job, tasks, parts, workers, settings, totals, creditDue, insurance, options);
  const file = new File([blob], filename, { type: "application/pdf" });
  const url = waLink(job.phone, message);

  if (autoWhatsAppEnabled(settings)) {
    const sent = await sendWhatsAppDocument(job.phone, blob, filename, message, settings);
    if (sent.ok) return "queued";
  }

  try {
    const nav = navigator as Navigator & {
      canShare?: (data?: ShareData) => boolean;
      share?: (data?: ShareData) => Promise<void>;
    };
    if (!isDemoMode() && nav.canShare?.({ files: [file] }) && nav.share) {
      await nav.share({
        files: [file],
        title: `Invoice ${job.id}`,
        text: message,
      });
      return "shared";
    }
  } catch {
    // fall through to download + wa.me
  }

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
  window.open(url, "_blank", "noopener,noreferrer");
  return "downloaded";
}

async function sharePdfToWhatsApp(
  blob: Blob,
  filename: string,
  phone: string,
  message: string,
  title: string,
  settings: WorkshopSettings,
): Promise<"shared" | "downloaded" | "opened" | "queued"> {
  const file = new File([blob], filename, { type: "application/pdf" });
  const url = waLink(phone, message);

  if (autoWhatsAppEnabled(settings)) {
    const sent = await sendWhatsAppDocument(phone, blob, filename, message, settings);
    if (sent.ok) return "queued";
  }

  try {
    const nav = navigator as Navigator & {
      canShare?: (data?: ShareData) => boolean;
      share?: (data?: ShareData) => Promise<void>;
    };
    if (!isDemoMode() && nav.canShare?.({ files: [file] }) && nav.share) {
      await nav.share({ files: [file], title, text: message });
      return "shared";
    }
  } catch {
    // fall through to download + wa.me
  }
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
  window.open(url, "_blank", "noopener,noreferrer");
  return "downloaded";
}

function pdfBrandHeader(
  doc: jsPDF,
  settings: WorkshopSettings,
  title: string,
  reference: string,
  date: string,
): number {
  const [r, g, b] = hexToRgb(settings.brandColor);
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, 210, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(settings.companyName || "Workshop", 18, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(settings.address || "", 18, 20, { maxWidth: 120 });
  doc.text(`${settings.phone || ""}  ·  ${settings.email || ""}`, 18, 26);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title.toUpperCase(), 192, 14, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(reference, 192, 21, { align: "right" });
  doc.text(shortDate(date), 192, 27, { align: "right" });
  doc.setTextColor(30, 41, 59);
  return 42;
}

function pdfFooter(doc: jsPDF) {
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Powered by ${DEVELOPER.name} · ${DEVELOPER.email} · ${DEVELOPER.phoneDisplay}`,
    105,
    287,
    { align: "center", maxWidth: 174 },
  );
  doc.text(COPYRIGHT, 105, 291, { align: "center" });
}

export function buildAdvanceReceiptPdf(
  advance: AdvancePayment,
  settings: WorkshopSettings,
  balanceAfter?: number,
): { blob: Blob; filename: string } {
  const doc = new jsPDF({ unit: "mm", format: "a5" });
  const y0 = pdfBrandHeader(doc, settings, "Advance receipt", advance.receiptNo, advance.createdAt);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("RECEIVED FROM", 14, y0);
  doc.text("JOB / VEHICLE", 108, y0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(advance.customerName, 14, y0 + 6);
  doc.text(advance.jobCardId, 108, y0 + 6);
  doc.text(`+${normalizePhone(advance.phone)}`, 14, y0 + 11);
  doc.text(advance.vehicleNo, 108, y0 + 11);

  const boxTop = y0 + 22;
  doc.setFillColor(240, 253, 250);
  doc.roundedRect(14, boxTop, 182, 32, 3, 3, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text("Advance amount", 20, boxTop + 9);
  doc.setTextColor(15, 118, 110);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(money(advance.amount, 2), 20, boxTop + 22);
  doc.setTextColor(30, 41, 59);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Method: ${advance.method}`, 130, boxTop + 10);
  if (balanceAfter !== undefined) {
    doc.text(`Balance after: ${money(Math.max(0, balanceAfter), 2)}`, 130, boxTop + 18);
  }

  let y = boxTop + 44;
  doc.setFont("helvetica", "bold");
  doc.text("Note", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(advance.note || "Advance against repair job.", 14, y + 6, { maxWidth: 182 });
  y += 20;
  doc.setDrawColor(226, 232, 240);
  doc.line(14, y, 196, y);
  y += 8;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Recorded by: ${advance.recordedBy ?? "—"}`, 14, y);
  doc.text("Customer signature: ______________________", 108, y);
  y += 10;
  doc.text(
    "This advance is credited against the final invoice. It is not a tax invoice.",
    14,
    y,
    { maxWidth: 180 },
  );
  pdfFooter(doc);
  const filename = `Advance_${advance.receiptNo}_${advance.vehicleNo.replace(/\s+/g, "-")}.pdf`;
  return { blob: doc.output("blob"), filename };
}

export async function shareAdvanceReceiptWhatsApp(
  advance: AdvancePayment,
  settings: WorkshopSettings,
  message: string,
  balanceAfter?: number,
): Promise<"shared" | "downloaded" | "opened" | "queued"> {
  const { blob, filename } = buildAdvanceReceiptPdf(advance, settings, balanceAfter);
  return sharePdfToWhatsApp(
    blob,
    filename,
    advance.phone,
    message,
    `Advance ${advance.receiptNo}`,
    settings,
  );
}

export function printLegacyAdvanceReceipt(
  advance: AdvancePayment,
  settings: WorkshopSettings,
  balanceAfter?: number,
) {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(advance.receiptNo)} — ${esc(settings.companyName)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:'Courier New',monospace;background:#eef2f4;margin:0;padding:20px;color:#111}
  .receipt{max-width:400px;background:#fff;margin:0 auto;padding:22px;box-shadow:0 10px 30px rgba(0,0,0,.12)}
  .center{text-align:center}.right{text-align:right}.bold{font-weight:700}
  .logo{max-width:74px;max-height:74px;object-fit:contain;margin-bottom:6px}
  h1{font-size:18px;margin:0 0 2px}
  .muted{font-size:11px;color:#475569;line-height:1.45}
  .dash{border-top:1px dashed #111;margin:10px 0}
  table{width:100%;border-collapse:collapse;font-size:12px}
  td{padding:3px 0;vertical-align:top}
  .amount{font-size:24px;font-weight:700;text-align:center;margin:12px 0}
  @media print{body{background:#fff;padding:0}.receipt{box-shadow:none;max-width:100%;padding:0}@page{size:auto;margin:4mm}}
</style></head>
<body>
<div class="receipt">
  <div class="center">
    ${settings.logo ? `<img class="logo" src="${settings.logo}" alt="logo">` : ""}
    <h1>${esc(settings.companyName)}</h1>
    <div class="muted">${esc(settings.address)}<br>${esc(settings.phone)}</div>
  </div>
  <div class="dash"></div>
  <div class="center bold" style="font-size:14px">ADVANCE RECEIPT</div>
  <div class="muted">
    <div style="display:flex;justify-content:space-between"><span>Receipt</span><span class="bold">${esc(advance.receiptNo)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Date</span><span>${esc(shortDate(advance.createdAt))}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Customer</span><span>${esc(advance.customerName)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Phone</span><span>+${normalizePhone(advance.phone)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Job</span><span class="bold">${esc(advance.jobCardId)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Vehicle</span><span>${esc(advance.vehicleNo)}</span></div>
  </div>
  <div class="dash"></div>
  <div class="muted center">ADVANCE RECEIVED</div>
  <div class="amount">${money(advance.amount, 2)}</div>
  <div class="muted center">Method: ${esc(advance.method)}${balanceAfter !== undefined ? `<br>Balance after advance: ${money(Math.max(0, balanceAfter), 2)}` : ""}</div>
  <div class="dash"></div>
  ${advance.note ? `<div class="muted">${esc(advance.note)}</div><div class="dash"></div>` : ""}
  <div class="muted center">
    This advance is credited against the final invoice.<br>
    Recorded by ${esc(advance.recordedBy ?? "—")}<br><br>
    <div style="margin-top:10px;font-size:10px">Powered by ${esc(DEVELOPER.name)}<br>${esc(DEVELOPER.email)} · ${esc(DEVELOPER.phoneDisplay)}<br>${esc(COPYRIGHT)}</div>
  </div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`;
  const w = window.open("", "_blank", "width=520,height=760");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export function printAdvanceReceipt(
  advance: AdvancePayment,
  settings: WorkshopSettings,
  balanceAfter?: number,
  format: "thermal" | "a4" = settings.printerMode === "Standard_PC" ? "a4" : "thermal",
) {
  if (format === "a4") {
    printA4AdvanceReceipt(advance, settings, balanceAfter);
    return;
  }
  printThermalAdvanceReceipt(advance, settings, balanceAfter);
}

export function printWageReceipt(
  payout: WagePayout,
  worker: WorkerProfile,
  settings: WorkshopSettings,
) {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(payout.receiptNo)} — ${esc(settings.companyName)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:'Courier New',monospace;background:#eef2f4;margin:0;padding:20px;color:#111}
  .receipt{max-width:400px;background:#fff;margin:0 auto;padding:22px;box-shadow:0 10px 30px rgba(0,0,0,.12)}
  .center{text-align:center}.right{text-align:right}.bold{font-weight:700}
  .logo{max-width:74px;max-height:74px;object-fit:contain;margin-bottom:6px}
  h1{font-size:18px;margin:0 0 2px}
  .muted{font-size:11px;color:#475569;line-height:1.45}
  .dash{border-top:1px dashed #111;margin:10px 0}
  table{width:100%;border-collapse:collapse;font-size:12px}
  td{padding:3px 0;vertical-align:top}
  .amount{font-size:24px;font-weight:700;text-align:center;margin:12px 0}
  @media print{body{background:#fff;padding:0}.receipt{box-shadow:none;max-width:100%;padding:0}@page{size:auto;margin:4mm}}
</style></head>
<body>
<div class="receipt">
  <div class="center">
    ${settings.logo ? `<img class="logo" src="${settings.logo}" alt="logo">` : ""}
    <h1>${esc(settings.companyName)}</h1>
    <div class="muted">${esc(settings.address)}<br>${esc(settings.phone)}</div>
  </div>
  <div class="dash"></div>
  <div class="center bold" style="font-size:14px">DAILY WAGE RECEIPT</div>
  <div class="muted">
    <div style="display:flex;justify-content:space-between"><span>Receipt</span><span class="bold">${esc(payout.receiptNo)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Paid on</span><span>${esc(shortDate(payout.paidAt))}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Worker</span><span>${esc(worker.fullName)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Phone</span><span>+${normalizePhone(worker.phone)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Days paid</span><span>${payout.days}</span></div>
  </div>
  <div class="dash"></div>
  <table>
    <tr><td>Daily wage (${payout.days} day${payout.days === 1 ? "" : "s"})</td><td class="right">${money(payout.baseAmount, 2)}</td></tr>
    <tr><td>Commission${payout.commissionIncluded ? "" : " (excluded)"}</td><td class="right">${money(payout.commissionAmount, 2)}</td></tr>
  </table>
  <div class="dash"></div>
  <div class="muted center">TOTAL PAID</div>
  <div class="amount">${money(payout.amount, 2)}</div>
  <div class="muted center">Paid by ${esc(payout.paidBy ?? "—")}</div>
  <div class="dash"></div>
  <div class="muted center">
    This receipt confirms the daily wage payment shown above.<br><br>
    <div style="margin-top:10px;font-size:10px">Powered by ${esc(DEVELOPER.name)}<br>${esc(DEVELOPER.email)} · ${esc(DEVELOPER.phoneDisplay)}<br>${esc(COPYRIGHT)}</div>
  </div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`;
  const w = window.open("", "_blank", "width=520,height=760");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export function buildPayslipPdf(
  payslip: Payslip,
  worker: WorkerProfile,
  settings: WorkshopSettings,
): { blob: Blob; filename: string } {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const y0 = pdfBrandHeader(
    doc,
    settings,
    "Payslip",
    worker.fullName,
    payslip.paidAt,
  );
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("EMPLOYEE", 18, y0);
  doc.text("PAY PERIOD", 120, y0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(worker.fullName, 18, y0 + 6);
  doc.text(`${shortDate(payslip.periodStart)} — ${shortDate(payslip.periodEnd)}`, 120, y0 + 6);
  doc.text(worker.nic ? `NIC ${worker.nic}` : "", 18, y0 + 11);
  doc.text(`${payslip.workedDays} of ${payslip.workingDays} working days`, 120, y0 + 11);
  doc.text(worker.bankName ? `${worker.bankName} · ${worker.accountNumber}` : "", 18, y0 + 16);

  let y = y0 + 28;
  const row = (label: string, value: string, strong = false) => {
    doc.setFont("helvetica", strong ? "bold" : "normal");
    doc.setFontSize(strong ? 10.5 : 9.5);
    doc.text(label, 22, y, { align: "left" });
    doc.text(value, 188, y, { align: "right" });
    y += 7;
  };
  doc.setFillColor(241, 245, 249);
  doc.rect(18, y - 5, 174, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("EARNINGS", 22, y);
  doc.text("AMOUNT (LKR)", 188, y, { align: "right" });
  y += 10;
  row("Basic salary", money(payslip.basic, 2));
  row("Labour commission", money(payslip.commission, 2));
  row("Gross pay", money(payslip.gross, 2), true);

  y += 3;
  doc.setFillColor(241, 245, 249);
  doc.rect(18, y - 5, 174, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.text("DEDUCTIONS", 22, y);
  doc.text("AMOUNT (LKR)", 188, y, { align: "right" });
  y += 10;
  row(`EPF employee (${settings.epfEmployeeRate}%)`, money(payslip.epfEmployee, 2));
  row("Staff loan / salary advance", money(payslip.loanDeduction, 2));
  row("Other deductions", money(payslip.otherDeductions, 2));
  y += 2;
  doc.setDrawColor(226, 232, 240);
  doc.line(18, y, 192, y);
  y += 8;
  row("NET PAY", money(payslip.net, 2), true);

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Employer contributions (not deducted from pay)", 18, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(
    `EPF employer ${settings.epfEmployerRate}%: ${money(payslip.epfEmployer, 2)}   ·   ETF ${settings.etfRate}%: ${money(payslip.etfEmployer, 2)}`,
    18,
    y,
  );
  y += 10;
  if (payslip.note) {
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(payslip.note, 18, y, { maxWidth: 174 });
    y += 8;
  }
  doc.setFontSize(8);
  doc.text(`Paid on ${shortDate(payslip.paidAt)} by ${payslip.paidBy ?? "—"}.`, 18, y);
  doc.text("Employee signature: ______________________", 120, y + 12);
  pdfFooter(doc);
  const filename = `Payslip_${worker.fullName.replace(/\s+/g, "-")}_${payslip.periodStart.slice(0, 7)}.pdf`;
  return { blob: doc.output("blob"), filename };
}

export async function sharePayslipWhatsApp(
  payslip: Payslip,
  worker: WorkerProfile,
  settings: WorkshopSettings,
  message: string,
): Promise<"shared" | "downloaded" | "opened" | "queued"> {
  const { blob, filename } = buildPayslipPdf(payslip, worker, settings);
  return sharePdfToWhatsApp(
    blob,
    filename,
    worker.phone,
    message,
    `Payslip ${worker.fullName}`,
    settings,
  );
}

export function buildLegacyInsuranceBillPdf(
  job: JobCard,
  claim: InsuranceClaim,
  insurer: InsuranceCompany | undefined,
  settings: WorkshopSettings,
  lines: { labor: number; parts: number; total: number },
): { blob: Blob; filename: string } {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const y0 = pdfBrandHeader(doc, settings, "Insurance bill", claim.claimNo, new Date().toISOString());
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("INSURER", 18, y0);
  doc.text("VEHICLE / JOB", 112, y0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(insurer?.name ?? "Insurance company", 18, y0 + 6);
  doc.text(`${job.vehicleNo} · ${job.id}`, 112, y0 + 6);
  doc.text(insurer?.address ?? "", 18, y0 + 11, { maxWidth: 88 });
  doc.text(`${job.make} ${job.model}`, 112, y0 + 11);
  doc.text(insurer?.hotline ?? "", 18, y0 + 16);
  doc.text(`Policy ${claim.policyNo}`, 112, y0 + 16);
  doc.text(`Claim ${claim.claimNo}`, 112, y0 + 21);
  doc.text(`Assessor ${claim.assessorName ?? "—"}`, 112, y0 + 26);

  let y = y0 + 38;
  doc.setFillColor(241, 245, 249);
  doc.rect(18, y - 5, 174, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("DESCRIPTION", 22, y);
  doc.text("AMOUNT (LKR)", 188, y, { align: "right" });
  y += 10;
  const row = (label: string, value: string, strong = false) => {
    doc.setFont("helvetica", strong ? "bold" : "normal");
    doc.setFontSize(strong ? 10.5 : 9.5);
    doc.text(label, 22, y);
    doc.text(value, 188, y, { align: "right" });
    y += 7;
  };
  row("Labour and repair charges", money(lines.labor, 2));
  row("Parts and materials", money(lines.parts, 2));
  y += 1;
  doc.setDrawColor(226, 232, 240);
  doc.line(18, y, 192, y);
  y += 8;
  row("TOTAL CLAIM", money(lines.total, 2), true);
  y += 5;

  const statusRows: [string, string][] = [
    ["Estimate", claim.estimateStatus],
    ["Parts approval", claim.partsStatus],
    ["Salvage", claim.salvageStatus],
    ["Claim status", claim.status],
  ];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Approval trail", 18, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  statusRows.forEach(([label, value]) => {
    doc.text(label, 22, y);
    doc.text(value, 90, y);
    y += 6;
  });
  y += 8;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    "This bill is submitted to the insurer for settlement. Payment is due on receipt of the insurer cheque.",
    18,
    y,
    { maxWidth: 174 },
  );
  pdfFooter(doc);
  const filename = `Insurance_Bill_${claim.claimNo.replace(/[^\w-]+/g, "-")}_${job.vehicleNo.replace(/\s+/g, "-")}.pdf`;
  return { blob: doc.output("blob"), filename };
}

export function buildInsuranceBillPdf(
  job: JobCard,
  claim: InsuranceClaim,
  insurer: InsuranceCompany | undefined,
  settings: WorkshopSettings,
  lines: { labor: number; parts: number; total: number },
  detail?: { tasks?: JobTask[]; parts?: JobPart[] },
): { blob: Blob; filename: string } {
  return buildIrdInsuranceBillPdf(job, claim, insurer, settings, lines, detail);
}

export async function shareInsuranceBillWhatsApp(
  job: JobCard,
  claim: InsuranceClaim,
  insurer: InsuranceCompany | undefined,
  settings: WorkshopSettings,
  lines: { labor: number; parts: number; total: number },
  message: string,
  detail?: { tasks?: JobTask[]; parts?: JobPart[] },
): Promise<"shared" | "downloaded" | "opened" | "queued"> {
  const { blob, filename } = buildInsuranceBillPdf(
    job,
    claim,
    insurer,
    settings,
    lines,
    detail,
  );
  return sharePdfToWhatsApp(
    blob,
    filename,
    job.phone,
    message,
    `Insurance bill ${claim.claimNo}`,
    settings,
  );
}

export function buildLegacyInsuranceEstimatePdf(
  job: JobCard,
  estimate: JobEstimate,
  claim: InsuranceClaim,
  insurer: InsuranceCompany | undefined,
  settings: WorkshopSettings,
): { blob: Blob; filename: string } {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const y0 = pdfBrandHeader(
    doc,
    settings,
    "Insurance estimate",
    `${estimateDisplayNumber(estimate)}`,
    estimate.updatedAt ?? estimate.createdAt,
  );
  const labourLines = estimate.lines.filter((line) => line.type === "Labour");
  const partLines = estimate.lines.filter((line) => line.type === "Part");
  const labourTotal = labourLines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
  const partsTotal = partLines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
  const estimateTotal = labourTotal + partsTotal;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("INSURER", 18, y0);
  doc.text("CLAIM & VEHICLE", 112, y0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(insurer?.name ?? "Insurance company", 18, y0 + 6);
  doc.text(`${job.vehicleNo} · ${job.id}`, 112, y0 + 6);
  doc.text(insurer?.address ?? "", 18, y0 + 11, { maxWidth: 88 });
  doc.text(`${job.make} ${job.model}`, 112, y0 + 11);
  doc.text(`Hotline ${insurer?.hotline ?? "—"}`, 18, y0 + 19);
  doc.text(`Claims ${insurer?.email ?? "—"}`, 18, y0 + 24);
  doc.text(`Policy ${claim.policyNo}`, 112, y0 + 16);
  doc.text(`Claim ${claim.claimNo}`, 112, y0 + 21);
  doc.text(`Owner ${job.customerName}`, 112, y0 + 26);
  doc.text(`Phone +${normalizePhone(job.phone)}`, 112, y0 + 31);

  let y = y0 + 43;
  const ensure = (needed: number) => {
    if (y + needed > 268) {
      doc.addPage();
      y = 22;
    }
  };
  const section = (title: string) => {
    ensure(16);
    doc.setFillColor(241, 245, 249);
    doc.rect(18, y - 5, 174, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(title, 21, y);
    doc.text("QTY", 130, y, { align: "right" });
    doc.text("UNIT PRICE", 158, y, { align: "right" });
    doc.text("AMOUNT (LKR)", 188, y, { align: "right" });
    y += 9;
    doc.setFont("helvetica", "normal");
  };
  const lineRow = (description: string, qty: number, unitPrice: number) => {
    ensure(12);
    doc.setFontSize(9);
    doc.text(description, 21, y, { maxWidth: 100 });
    doc.text(String(qty), 130, y, { align: "right" });
    doc.text(money(unitPrice, 2), 158, y, { align: "right" });
    doc.text(money(qty * unitPrice, 2), 188, y, { align: "right" });
    y += 7;
  };

  section("PARTS & MATERIALS");
  if (partLines.length === 0) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text("No parts on this estimate.", 21, y);
    doc.setTextColor(30, 41, 59);
    y += 7;
  } else {
    partLines.forEach((line) => lineRow(line.description, line.qty, line.unitPrice));
  }

  y += 4;
  section("LABOUR & REPAIR");
  if (labourLines.length === 0) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text("No labour on this estimate.", 21, y);
    doc.setTextColor(30, 41, 59);
    y += 7;
  } else {
    labourLines.forEach((line) => lineRow(line.description, line.qty, line.unitPrice));
  }

  ensure(32);
  y += 3;
  doc.setDrawColor(226, 232, 240);
  doc.line(18, y, 192, y);
  y += 8;
  const totalRow = (label: string, value: number, strong = false) => {
    doc.setFont("helvetica", strong ? "bold" : "normal");
    doc.setFontSize(strong ? 11 : 9.5);
    doc.text(label, 21, y);
    doc.text(money(value, 2), 188, y, { align: "right" });
    y += strong ? 9 : 7;
  };
  totalRow("Parts subtotal", partsTotal);
  totalRow("Labour subtotal", labourTotal);
  totalRow("ESTIMATE TOTAL", estimateTotal, true);

  if (estimate.notes.trim()) {
    ensure(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Notes", 18, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(estimate.notes.trim(), 18, y, { maxWidth: 174 });
    doc.setTextColor(30, 41, 59);
    y += 12;
  }

  ensure(42);
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    "This is an estimate only, not a tax invoice. Work starts after the insurer approves the estimate. Parts and labour are billed separately and the final invoice may vary if additional damage is found.",
    18,
    y,
    { maxWidth: 174 },
  );
  doc.setTextColor(30, 41, 59);
  y += 16;
  const boxWidth = 54;
  [18, 78, 138].forEach((x, index) => {
    doc.setDrawColor(148, 163, 184);
    doc.rect(x, y, boxWidth, 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      ["Workshop signature", "Assessor signature", "Insurer approval"][index],
      x + 3,
      y + 14,
    );
  });

  pdfFooter(doc);
  const filename = `Insurance_Estimate_${estimate.number.replace(/[^\w-]+/g, "-")}_${job.vehicleNo.replace(/\s+/g, "-")}.pdf`;
  return { blob: doc.output("blob"), filename };
}

export function buildInsuranceEstimatePdf(
  job: JobCard,
  estimate: JobEstimate,
  claim: InsuranceClaim,
  insurer: InsuranceCompany | undefined,
  settings: WorkshopSettings,
): { blob: Blob; filename: string } {
  return buildIrdInsuranceEstimatePdf(job, estimate, claim, insurer, settings);
}

export function buildEstimatePdf(
  job: JobCard,
  estimate: JobEstimate,
  settings: WorkshopSettings,
): { blob: Blob; filename: string } {
  return buildIrdEstimatePdf(job, estimate, settings);
}

export async function shareEstimateWhatsApp(
  job: JobCard,
  estimate: JobEstimate,
  settings: WorkshopSettings,
  message: string,
): Promise<"shared" | "downloaded" | "opened" | "queued"> {
  const { blob, filename } = buildEstimatePdf(job, estimate, settings);
  return sharePdfToWhatsApp(
    blob,
    filename,
    job.phone,
    message,
    `Estimate ${estimate.number}`,
    settings,
  );
}

export async function shareInsuranceEstimateWhatsApp(
  job: JobCard,
  estimate: JobEstimate,
  claim: InsuranceClaim,
  insurer: InsuranceCompany | undefined,
  settings: WorkshopSettings,
  message: string,
): Promise<"shared" | "downloaded" | "opened" | "queued"> {
  const { blob, filename } = buildInsuranceEstimatePdf(
    job,
    estimate,
    claim,
    insurer,
    settings,
  );
  return sharePdfToWhatsApp(
    blob,
    filename,
    job.phone,
    message,
    `Insurance estimate ${estimate.number}`,
    settings,
  );
}

export function printReleaseOrder(
  job: JobCard,
  claim: InsuranceClaim | undefined,
  insurer: InsuranceCompany | undefined,
  settings: WorkshopSettings,
) {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Release order ${esc(job.id)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;background:#eef2f4;margin:0;padding:24px;color:#111}
  .sheet{max-width:720px;background:#fff;margin:0 auto;padding:34px;box-shadow:0 10px 30px rgba(0,0,0,.12)}
  h1{font-size:20px;margin:0} h2{font-size:15px;margin:24px 0 8px}
  .head{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #0f766e;padding-bottom:14px}
  .muted{font-size:12px;color:#475569;line-height:1.5}
  .box{border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-top:10px;font-size:13px;line-height:1.6}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .sign{margin-top:48px;display:grid;grid-template-columns:1fr 1fr;gap:40px;font-size:12px}
  .line{border-top:1px solid #111;margin-top:36px;padding-top:6px}
  @media print{body{background:#fff;padding:0}.sheet{box-shadow:none;max-width:100%;padding:0}@page{size:A4;margin:14mm}}
</style></head>
<body>
<div class="sheet">
  <div class="head">
    <div><h1>${esc(settings.companyName)}</h1><div class="muted">${esc(settings.address)}<br>${esc(settings.phone)} · ${esc(settings.email)}</div></div>
    <div style="text-align:right"><strong>VEHICLE RELEASE ORDER</strong><div class="muted">${esc(job.id)} · ${esc(shortDate(new Date().toISOString()))}</div></div>
  </div>
  <div class="grid" style="margin-top:18px">
    <div class="box"><strong>Vehicle</strong><br>${esc(job.vehicleNo)}<br>${esc(job.make)} ${esc(job.model)}<br>Mileage ${job.mileage.toLocaleString()} km</div>
    <div class="box"><strong>Customer</strong><br>${esc(job.customerName)}<br>+${normalizePhone(job.phone)}</div>
  </div>
  ${claim ? `<div class="box"><strong>Insurance claim</strong><br>${esc(insurer?.name ?? "Insurer")} · Claim ${esc(claim.claimNo)} · Policy ${esc(claim.policyNo)}<br>Status: ${esc(claim.status)} · Salvage: ${esc(claim.salvageStatus)}</div>` : ""}
  <h2>Release authorisation</h2>
  <div class="box">
    The above vehicle is released to the customer${claim ? " on the authority of the insurer release note" : ""}.
    ${claim ? "The insurer release note has been verified and the salvage parts submission remains a workshop obligation." : ""}
    Payment of any customer balance is acknowledged separately.
  </div>
  <div class="sign">
    <div><div class="line">Authorised by (workshop)</div></div>
    <div><div class="line">Customer signature / NIC</div></div>
  </div>
  <div class="muted" style="margin-top:28px;font-size:10px">Powered by ${esc(DEVELOPER.name)} · ${esc(DEVELOPER.email)} · ${esc(DEVELOPER.phoneDisplay)}<br>${esc(COPYRIGHT)}</div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`;
  const w = window.open("", "_blank", "width=820,height=1000");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function printLegacyInvoice(
  job: JobCard,
  tasks: JobTask[],
  parts: JobPart[],
  workers: WorkerProfile[],
  settings: WorkshopSettings,
  totals: Totals,
  creditDue?: string,
  insurance?: { claim: InsuranceClaim; insurer?: InsuranceCompany },
) {
  const insurerBlock = insurance
    ? `<div class="dash"></div>
  <div class="bold" style="font-size:12px">INSURER / CLAIM</div>
  <div class="muted">
    <div style="display:flex;justify-content:space-between"><span>Insurer</span><span class="bold">${esc(insurance.insurer?.name ?? "—")}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Hotline</span><span>${esc(insurance.insurer?.hotline ?? "—")}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Claims email</span><span>${esc(insurance.insurer?.email ?? "—")}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Address</span><span style="text-align:right;max-width:60%">${esc(insurance.insurer?.address ?? "—")}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Policy</span><span>${esc(insurance.claim.policyNo)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Claim</span><span>${esc(insurance.claim.claimNo)}</span></div>
  </div>`
    : "";
  const insurerTotals = insurance
    ? (() => {
        const insurerShare = insurance.claim.insuranceBillAmount ?? totals.total;
        const customerShare =
          insurance.claim.customerBillAmount ?? Math.max(0, totals.total - insurerShare);
        return `<tr><td>Insurer payable</td><td class="right bold">${money(insurerShare, 2)}</td></tr>
    <tr><td>Customer payable</td><td class="right bold">${money(customerShare, 2)}</td></tr>`;
      })()
    : "";
  const rows = parts
    .filter((p) => p.status === "Issued" && p.sellingPrice > 0 && !p.includedInLabor)
    .map((p) => {
      const qty = partIssueQty(p);
      return `<tr><td>${esc(p.itemName)}<br><small>Qty ${formatQty(qty)} × ${money(p.sellingPrice, 2)}</small></td><td class="right">${money(p.sellingPrice * qty, 2)}</td></tr>`;
    })
    .join("");
  const taskRows = tasks
    .map((task) => {
      const worker = workers.find((w) => w.id === task.workerId);
      return `<tr><td>${esc(task.name)}<br><small>${esc(worker?.fullName ?? "")}</small></td><td class="right">${money(task.laborCost, 2)}</td></tr>`;
    })
    .join("");
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(job.id)} — ${esc(settings.companyName)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:'Courier New',monospace;background:#eef2f4;margin:0;padding:20px;color:#111}
  .receipt{max-width:400px;background:#fff;margin:0 auto;padding:22px;box-shadow:0 10px 30px rgba(0,0,0,.12)}
  .center{text-align:center}.right{text-align:right}.bold{font-weight:700}
  .logo{max-width:74px;max-height:74px;object-fit:contain;margin-bottom:6px}
  h1{font-size:18px;margin:0 0 2px}
  .muted{font-size:11px;color:#475569;line-height:1.45}
  .dash{border-top:1px dashed #111;margin:10px 0}
  table{width:100%;border-collapse:collapse;font-size:12px}
  td{padding:3px 0;vertical-align:top}
  small{font-size:10px;color:#475569}
  .total{font-size:16px}
  @media print{body{background:#fff;padding:0}.receipt{box-shadow:none;max-width:100%;padding:0}@page{size:auto;margin:4mm}}
</style></head>
<body>
<div class="receipt">
  <div class="center">
    ${settings.logo ? `<img class="logo" src="${settings.logo}" alt="logo">` : ""}
    <h1>${esc(settings.companyName)}</h1>
    <div class="muted">${esc(settings.address)}<br>${esc(settings.phone)}</div>
  </div>
  <div class="dash"></div>
  <div class="muted">
    <div style="display:flex;justify-content:space-between"><span>Invoice</span><span class="bold">${esc(job.id)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Date</span><span>${esc(shortDate(job.paidAt ?? new Date().toISOString()))}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Vehicle</span><span class="bold">${esc(job.vehicleNo)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Make / model</span><span>${esc(job.make)} ${esc(job.model)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Mileage</span><span>${job.mileage.toLocaleString()} km</span></div>
    <div style="display:flex;justify-content:space-between"><span>Customer</span><span>${esc(job.customerName)}</span></div>
  </div>
  ${insurerBlock}
  <div class="dash"></div>
  <div class="bold" style="font-size:12px">PARTS &amp; MATERIALS</div>
  <table>${rows || '<tr><td colspan="2"><small>No parts used</small></td></tr>'}</table>
  <div class="dash"></div>
  <div class="bold" style="font-size:12px">LABOUR &amp; REPAIR TASKS</div>
  <table>${taskRows || '<tr><td colspan="2"><small>No labour tasks</small></td></tr>'}</table>
  <div class="dash"></div>
  <table>
    <tr><td>Labour</td><td class="right">${money(totals.labor, 2)}</td></tr>
    <tr><td>Parts</td><td class="right">${money(totals.parts, 2)}</td></tr>
    <tr><td>Subtotal</td><td class="right">${money(totals.subtotal, 2)}</td></tr>
    ${totals.discount > 0 ? `<tr><td>Discount</td><td class="right">- ${money(totals.discount, 2)}</td></tr>` : ""}
    <tr class="bold total"><td>NET TOTAL</td><td class="right">${money(totals.total, 2)}</td></tr>
    ${insurerTotals}
    <tr><td>Payment</td><td class="right bold">${esc(job.paymentMethod ?? "Cash")}</td></tr>
    ${job.paymentMethod === "Credit" && creditDue ? `<tr><td>Due date</td><td class="right bold">${esc(shortDate(creditDue))}</td></tr>` : ""}
  </table>
  <div class="dash"></div>
  <div class="center muted">
    Thank you for choosing ${esc(settings.companyName)}!<br>Drive safely.<br><br>
    ${settings.googleReviewUrl ? `Leave us a 5-star review:<br><span style="word-break:break-all">${esc(settings.googleReviewUrl)}</span>` : ""}
    <div style="margin-top:10px;font-size:10px">Powered by ${esc(DEVELOPER.name)}<br>${esc(DEVELOPER.email)} · ${esc(DEVELOPER.phoneDisplay)}<br>${esc(COPYRIGHT)}</div>
  </div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`;
  const w = window.open("", "_blank", "width=520,height=760");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export type InvoicePrintOptions = InvoiceDocumentOptions & {
  format?: "thermal" | "a4";
};

export function printInvoice(
  job: JobCard,
  tasks: JobTask[],
  parts: JobPart[],
  _workers: WorkerProfile[],
  settings: WorkshopSettings,
  totals: Totals,
  creditDue?: string,
  insurance?: { claim: InsuranceClaim; insurer?: InsuranceCompany },
  options: InvoicePrintOptions = {},
) {
  const format =
    options.format ?? (settings.printerMode === "Standard_PC" ? "a4" : "thermal");
  if (format === "a4") {
    printIrdInvoice(job, tasks, parts, settings, totals, insurance, options);
    return;
  }
  printThermalInvoice(job, tasks, parts, settings, totals, creditDue, insurance, options);
}

export function totalsForInvoice(t: JobTotals): Totals {
  return {
    labor: t.labor,
    parts: t.parts,
    subtotal: t.subtotal,
    discount: t.discount,
    total: t.total,
  };
}

export { printDriverCommissionChit, printPrinterTest } from "./ird";
