import type { AppState, CustomerCredit } from "../types";
import { payrollForRange } from "./analytics";

/**
 * Period reports for Accounting. Everything is derived from the live
 * operational records; the trial balance exposes a balancing capital line so
 * the report stays useful even where the workshop does not keep full
 * double-entry books.
 */

export type ReportPreset = "today" | "month" | "last-month" | "year" | "custom";

export interface ReportRange {
  preset: ReportPreset;
  start: string;
  end: string;
  label: string;
}

function localDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function validDay(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function readableReportDate(day: string): string {
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function resolveReportRange(
  preset: ReportPreset,
  customStart?: string,
  customEnd?: string,
): ReportRange {
  const now = new Date();
  let start = localDay(now);
  let end = start;
  if (preset === "month") {
    start = localDay(new Date(now.getFullYear(), now.getMonth(), 1));
    end = localDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  } else if (preset === "last-month") {
    start = localDay(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    end = localDay(new Date(now.getFullYear(), now.getMonth(), 0));
  } else if (preset === "year") {
    start = localDay(new Date(now.getFullYear(), 0, 1));
    end = localDay(new Date(now.getFullYear(), 11, 31));
  } else if (preset === "custom") {
    const fallbackStart = localDay(new Date(now.getFullYear(), now.getMonth(), 1));
    const fallbackEnd = localDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    start = validDay(customStart) ? customStart : fallbackStart;
    end = validDay(customEnd) ? customEnd : fallbackEnd;
    if (start > end) [start, end] = [end, start];
  }
  return {
    preset,
    start,
    end,
    label: `${readableReportDate(start)} — ${readableReportDate(end)}`,
  };
}

export function inReportRange(iso: string, range: ReportRange): boolean {
  const day = iso.slice(0, 10);
  return day >= range.start && day <= range.end;
}

function dayNumber(day: string): number {
  const value = new Date(`${day.slice(0, 10)}T12:00:00`).getTime();
  return Number.isNaN(value) ? 0 : value;
}

export function daysBetween(from: string, to: string): number {
  return Math.max(
    0,
    Math.floor((dayNumber(to) - dayNumber(from)) / 86_400_000),
  );
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((Number.isFinite(value) ? value : 0) * factor) / factor;
}

type StockPriced = {
  type: string;
  packSize?: number;
  lastCostPrice?: number;
  lastSellingPrice?: number;
};

/** Consumable pack prices are stored per pack, while stock is held in base units. */
function stockUnitCost(item: StockPriced): number {
  if (item.type === "Consumable" && item.packSize) {
    if (item.lastCostPrice) return item.lastCostPrice / item.packSize;
    return ((item.lastSellingPrice ?? 0) / 1.2) / item.packSize;
  }
  if (item.lastCostPrice) return item.lastCostPrice;
  return (item.lastSellingPrice ?? 0) / 1.2;
}

function stockUnitRetail(item: StockPriced): number {
  if (item.type === "Consumable" && item.packSize) {
    return (item.lastSellingPrice ?? 0) / item.packSize;
  }
  return item.lastSellingPrice ?? 0;
}

/* ------------------------------------------------------------------ */
/* Stock                                                              */
/* ------------------------------------------------------------------ */

export interface StockReportRow {
  id: string;
  code: string;
  name: string;
  type: string;
  unit: string;
  supplierName: string;
  openingQty: number;
  inQty: number;
  outQty: number;
  closingQty: number;
  minStock: number;
  unitCost: number;
  closingValue: number;
  retailValue: number;
  status: "OK" | "Low" | "Out";
}

export interface StockReport {
  rows: StockReportRow[];
  totalItems: number;
  totalClosingValue: number;
  totalRetailValue: number;
  lowStock: number;
  outOfStock: number;
  movementIn: number;
  movementOut: number;
}

export function stockReport(state: AppState, range: ReportRange): StockReport {
  const movementsBeforeEnd = state.stockMovements.filter(
    (movement) => movement.date.slice(0, 10) > range.end,
  );
  const futureNet = new Map<string, number>();
  movementsBeforeEnd.forEach((movement) => {
    futureNet.set(
      movement.itemId,
      (futureNet.get(movement.itemId) ?? 0) + movement.qty,
    );
  });
  const periodMovements = state.stockMovements.filter((movement) =>
    inReportRange(movement.date, range),
  );
  const periodByItem = new Map<string, { inQty: number; outQty: number }>();
  periodMovements.forEach((movement) => {
    const entry = periodByItem.get(movement.itemId) ?? { inQty: 0, outQty: 0 };
    if (movement.qty >= 0) entry.inQty += movement.qty;
    else entry.outQty += Math.abs(movement.qty);
    periodByItem.set(movement.itemId, entry);
  });

  const rows = state.inventory
    .map((item) => {
      const current = item.stock;
      const closingQty = round(current - (futureNet.get(item.id) ?? 0), 3);
      const period = periodByItem.get(item.id) ?? { inQty: 0, outQty: 0 };
      const openingQty = round(closingQty - period.inQty + period.outQty, 3);
      const unitCost = stockUnitCost(item);
      const retail = stockUnitRetail(item);
      const status: StockReportRow["status"] =
        closingQty <= 0 ? "Out" : closingQty < item.minStock ? "Low" : "OK";
      return {
        id: item.id,
        code: item.code,
        name: item.name,
        type: item.type,
        unit: item.unit,
        supplierName:
          state.suppliers.find((supplier) => supplier.id === item.supplierId)?.name ??
          "—",
        openingQty,
        inQty: round(period.inQty, 3),
        outQty: round(period.outQty, 3),
        closingQty,
        minStock: item.minStock,
        unitCost,
        closingValue: round(closingQty * unitCost),
        retailValue: round(closingQty * retail),
        status,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    rows,
    totalItems: rows.length,
    totalClosingValue: round(rows.reduce((sum, row) => sum + row.closingValue, 0)),
    totalRetailValue: round(rows.reduce((sum, row) => sum + row.retailValue, 0)),
    lowStock: rows.filter((row) => row.status === "Low").length,
    outOfStock: rows.filter((row) => row.status === "Out").length,
    movementIn: round(rows.reduce((sum, row) => sum + row.inQty, 0), 3),
    movementOut: round(rows.reduce((sum, row) => sum + row.outQty, 0), 3),
  };
}

/* ------------------------------------------------------------------ */
/* Customer debtors                                                   */
/* ------------------------------------------------------------------ */

export type DebtorBucket = "0–30" | "31–60" | "61–90" | "90+";

export interface DebtorRow {
  id: string;
  customerName: string;
  phone: string;
  vehicleNo: string;
  jobCardId: string;
  creditDate: string;
  dueDate: string;
  kind: string;
  total: number;
  paid: number;
  balance: number;
  ageDays: number;
  overdueDays: number;
  bucket: DebtorBucket;
}

export interface InsuranceDebtorRow {
  id: string;
  insurerName: string;
  claimNo: string;
  vehicleNo: string;
  billDate: string;
  billAmount: number;
  settled: number;
  balance: number;
  ageDays: number;
}

export interface DebtorReport {
  rows: DebtorRow[];
  buckets: { bucket: DebtorBucket; amount: number }[];
  totalOutstanding: number;
  totalOverdue: number;
  insuranceRows: InsuranceDebtorRow[];
  insuranceOutstanding: number;
}

function paidAsOf(
  state: AppState,
  credit: CustomerCredit,
  cutoff?: string,
): number {
  const payments = state.creditPayments.filter(
    (payment) => payment.creditId === credit.id && !payment.reversed,
  );
  if (payments.length > 0) {
    return payments
      .filter((payment) => !cutoff || payment.date.slice(0, 10) <= cutoff)
      .reduce((sum, payment) => sum + payment.amount, 0);
  }
  if (credit.status === "Settled") return credit.total;
  return Math.min(credit.total, credit.paid);
}

function debtorBucket(ageDays: number): DebtorBucket {
  if (ageDays <= 30) return "0–30";
  if (ageDays <= 60) return "31–60";
  if (ageDays <= 90) return "61–90";
  return "90+";
}

export function debtorReport(state: AppState, range: ReportRange): DebtorReport {
  const rows = state.customerCredits
    .filter((credit) => credit.creditDate.slice(0, 10) <= range.end)
    .map((credit) => {
      const paid = paidAsOf(state, credit, range.end);
      const balance = round(Math.max(0, credit.total - paid));
      const ageDays = daysBetween(credit.creditDate, range.end);
      const overdueDays =
        credit.dueDate.slice(0, 10) < range.end
          ? daysBetween(credit.dueDate, range.end)
          : 0;
      return {
        id: credit.id,
        customerName: credit.customerName,
        phone: credit.phone,
        vehicleNo: credit.vehicleNo,
        jobCardId: credit.jobCardId,
        creditDate: credit.creditDate,
        dueDate: credit.dueDate,
        kind: credit.kind ?? "Credit Sale",
        total: credit.total,
        paid: round(paid),
        balance,
        ageDays,
        overdueDays,
        bucket: debtorBucket(ageDays),
      };
    })
    .filter((row) => row.balance > 0.009)
    .sort((a, b) => b.balance - a.balance);

  const buckets: DebtorBucket[] = ["0–30", "31–60", "61–90", "90+"];
  const insuranceRows = state.insuranceJobs
    .filter((claim) => {
      const billDate = (claim.insuranceBillAt ?? claim.createdAt).slice(0, 10);
      return billDate <= range.end && (claim.insuranceBillAmount ?? 0) > 0;
    })
    .map((claim) => {
      const billDate = claim.insuranceBillAt ?? claim.createdAt;
      const billAmount = claim.insuranceBillAmount ?? 0;
      const clearedDay = claim.chequeClearedAt?.slice(0, 10);
      const receivedDay = claim.chequeReceivedAt?.slice(0, 10);
      const settlementDay =
        clearedDay ?? (claim.chequeStatus === "Cleared" ? receivedDay : undefined);
      let settled = 0;
      if (settlementDay && settlementDay <= range.end) {
        settled = claim.chequeAmount ?? 0;
      } else if (claim.status === "Settled" && !settlementDay) {
        settled = billAmount;
      }
      return {
        id: claim.id,
        insurerName:
          state.insuranceCompanies.find((company) => company.id === claim.insurerId)
            ?.name ?? "Insurance company",
        claimNo: claim.claimNo,
        vehicleNo:
          state.jobCards.find((job) => job.id === claim.jobCardId)?.vehicleNo ??
          claim.jobCardId,
        billDate,
        billAmount,
        settled,
        balance: round(Math.max(0, billAmount - settled)),
        ageDays: daysBetween(billDate, range.end),
      };
    })
    .filter((row) => row.balance > 0.009)
    .sort((a, b) => b.balance - a.balance);

  return {
    rows,
    buckets: buckets.map((bucket) => ({
      bucket,
      amount: round(
        rows.filter((row) => row.bucket === bucket).reduce((sum, row) => sum + row.balance, 0),
      ),
    })),
    totalOutstanding: round(rows.reduce((sum, row) => sum + row.balance, 0)),
    totalOverdue: round(
      rows.filter((row) => row.overdueDays > 0).reduce((sum, row) => sum + row.balance, 0),
    ),
    insuranceRows,
    insuranceOutstanding: round(
      insuranceRows.reduce((sum, row) => sum + row.balance, 0),
    ),
  };
}

/* ------------------------------------------------------------------ */
/* Separate ledgers                                                   */
/* ------------------------------------------------------------------ */

export type LedgerKind = "customer" | "supplier" | "insurance" | "bank";

export interface LedgerRow {
  id: string;
  date: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface LedgerAccount {
  id: string;
  name: string;
  subtitle: string;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
  rows: LedgerRow[];
}

function ledgerAccount(
  id: string,
  name: string,
  subtitle: string,
  opening: number,
  entries: Omit<LedgerRow, "balance">[],
  normal: "debit" | "credit" = "debit",
): LedgerAccount {
  let balance = opening;
  const rows = entries
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((entry) => {
      balance +=
        normal === "debit"
          ? entry.debit - entry.credit
          : entry.credit - entry.debit;
      return { ...entry, balance: round(balance) };
    });
  return {
    id,
    name,
    subtitle,
    opening: round(opening),
    debit: round(rows.reduce((sum, row) => sum + row.debit, 0)),
    credit: round(rows.reduce((sum, row) => sum + row.credit, 0)),
    closing: round(balance),
    rows,
  };
}

function customerLedger(state: AppState, range: ReportRange): LedgerAccount[] {
  const groups = new Map<string, { name: string; phone: string; credits: CustomerCredit[] }>();
  state.customerCredits.forEach((credit) => {
    const key = `${credit.customerName}|${credit.phone}`;
    const group = groups.get(key) ?? {
      name: credit.customerName,
      phone: credit.phone,
      credits: [],
    };
    group.credits.push(credit);
    groups.set(key, group);
  });
  return Array.from(groups.entries())
    .map(([id, group]) => {
      const opening = group.credits
        .filter((credit) => credit.creditDate.slice(0, 10) < range.start)
        .reduce((sum, credit) => {
          const paidBefore = paidAsOf(
            state,
            credit,
            localDay(new Date(dayNumber(range.start) - 86_400_000)),
          );
          return sum + Math.max(0, credit.total - paidBefore);
        }, 0);
      const entries: Omit<LedgerRow, "balance">[] = [];
      group.credits.forEach((credit) => {
        if (inReportRange(credit.creditDate, range)) {
          entries.push({
            id: `${credit.id}-sale`,
            date: credit.creditDate,
            reference: `${credit.id} · ${credit.vehicleNo}`,
            description:
              credit.kind === "Part Payment"
                ? "Part-payment balance moved to credit"
                : `Credit sale · ${credit.jobCardId}`,
            debit: credit.total,
            credit: 0,
          });
        }
      });
      state.creditPayments
        .filter(
          (payment) =>
            !payment.reversed &&
            inReportRange(payment.date, range) &&
            group.credits.some((credit) => credit.id === payment.creditId),
        )
        .forEach((payment) => {
          const credit = group.credits.find((entry) => entry.id === payment.creditId);
          entries.push({
            id: payment.id,
            date: payment.date,
            reference: `${payment.creditId} · ${credit?.vehicleNo ?? ""}`,
            description: `Credit settlement · ${payment.method}`,
            debit: 0,
            credit: payment.amount,
          });
        });
      return ledgerAccount(id, group.name, group.phone, opening, entries);
    })
    .filter((account) => account.opening !== 0 || account.rows.length > 0)
    .sort((a, b) => b.closing - a.closing);
}

function supplierLedger(state: AppState, range: ReportRange): LedgerAccount[] {
  return state.suppliers
    .map((supplier) => {
      const purchases = state.purchases.filter(
        (purchase) => purchase.supplierId === supplier.id && purchase.type === "Credit",
      );
      const opening = purchases
        .filter((purchase) => {
          const purchaseDay = purchase.purchaseDate.slice(0, 10);
          const paidDay = purchase.paidAt?.slice(0, 10);
          return purchaseDay < range.start && (!paidDay || paidDay >= range.start);
        })
        .reduce((sum, purchase) => sum + purchase.amount, 0);
      const entries: Omit<LedgerRow, "balance">[] = [];
      purchases
        .filter((purchase) => inReportRange(purchase.purchaseDate, range))
        .forEach((purchase) => {
          entries.push({
            id: `${purchase.id}-invoice`,
            date: purchase.purchaseDate,
            reference: `${purchase.invoiceNo} · ${purchase.id}`,
            description: purchase.description || "Credit purchase",
            debit: 0,
            credit: purchase.amount,
          });
        });
      purchases
        .filter(
          (purchase) =>
            purchase.paidAt && inReportRange(purchase.paidAt, range),
        )
        .forEach((purchase) => {
          entries.push({
            id: `${purchase.id}-payment`,
            date: purchase.paidAt ?? purchase.purchaseDate,
            reference: `${purchase.invoiceNo} · ${purchase.paymentMethod ?? "Payment"}`,
            description: "Supplier settlement",
            debit: purchase.amount,
            credit: 0,
          });
        });
      state.supplierReturns
        .filter(
          (entry) =>
            entry.supplierId === supplier.id && inReportRange(entry.date, range),
        )
        .forEach((entry) => {
          entries.push({
            id: `${entry.id}-return`,
            date: entry.date,
            reference: `${entry.invoiceNo} · ${entry.creditNoteNo ?? entry.id}`,
            description: entry.reason || "Supplier return",
            debit: entry.total,
            credit: 0,
          });
        });
      return ledgerAccount(
        supplier.id,
        supplier.name,
        supplier.phone,
        opening,
        entries,
        "credit",
      );
    })
    .filter((account) => account.opening !== 0 || account.rows.length > 0)
    .sort((a, b) => b.closing - a.closing);
}

function insuranceLedger(state: AppState, range: ReportRange): LedgerAccount[] {
  return state.insuranceCompanies
    .map((company) => {
      const claims = state.insuranceJobs.filter((claim) => claim.insurerId === company.id);
      const opening = claims.reduce((sum, claim) => {
        const billDay = (claim.insuranceBillAt ?? claim.createdAt).slice(0, 10);
        if (billDay >= range.start) return sum;
        const clearedDay = claim.chequeClearedAt?.slice(0, 10);
        const receivedDay = claim.chequeReceivedAt?.slice(0, 10);
        const settlementDay =
          clearedDay ?? (claim.chequeStatus === "Cleared" ? receivedDay : undefined);
        const settledBefore =
          settlementDay && settlementDay < range.start ? claim.chequeAmount ?? 0 : 0;
        return sum + Math.max(0, (claim.insuranceBillAmount ?? 0) - settledBefore);
      }, 0);
      const entries: Omit<LedgerRow, "balance">[] = [];
      claims.forEach((claim) => {
        const billDay = (claim.insuranceBillAt ?? claim.createdAt).slice(0, 10);
        if (inReportRange(billDay, range) && (claim.insuranceBillAmount ?? 0) > 0) {
          entries.push({
            id: `${claim.id}-bill`,
            date: claim.insuranceBillAt ?? claim.createdAt,
            reference: `${claim.claimNo} · ${claim.insuranceBillNo ?? claim.id}`,
            description: `Insurance bill · ${
              state.jobCards.find((job) => job.id === claim.jobCardId)?.vehicleNo ??
              claim.jobCardId
            }`,
            debit: claim.insuranceBillAmount ?? 0,
            credit: 0,
          });
        }
        const clearedDay = claim.chequeClearedAt?.slice(0, 10);
        const receivedDay = claim.chequeReceivedAt?.slice(0, 10);
        const settlementDate =
          claim.chequeClearedAt ??
          (claim.chequeStatus === "Cleared" ? claim.chequeReceivedAt : undefined);
        const settlementDay = clearedDay ?? (claim.chequeStatus === "Cleared" ? receivedDay : undefined);
        if (
          settlementDate &&
          settlementDay &&
          inReportRange(settlementDay, range) &&
          (claim.chequeAmount ?? 0) > 0
        ) {
          entries.push({
            id: `${claim.id}-settlement`,
            date: settlementDate,
            reference: `${claim.chequeNo ?? claim.id} · cheque cleared`,
            description: "Insurance claim settlement",
            debit: 0,
            credit: claim.chequeAmount ?? 0,
          });
        }
      });
      return ledgerAccount(company.id, company.name, company.email, opening, entries);
    })
    .filter((account) => account.opening !== 0 || account.rows.length > 0)
    .sort((a, b) => b.closing - a.closing);
}

function bankLedger(state: AppState, range: ReportRange): LedgerAccount[] {
  return state.bankAccounts
    .map((account) => {
      const transactions = state.bankTransactions.filter(
        (entry) => entry.accountId === account.id,
      );
      const opening =
        account.openingBalance +
        transactions
          .filter((entry) => entry.date.slice(0, 10) < range.start)
          .reduce(
            (sum, entry) =>
              sum + (entry.direction === "Credit_In" ? entry.amount : -entry.amount),
            0,
          );
      const entries = transactions
        .filter((entry) => inReportRange(entry.date, range))
        .map((entry) => ({
          id: entry.id,
          date: entry.date,
          reference: entry.reference ?? entry.category,
          description: entry.description,
          debit: entry.direction === "Credit_In" ? entry.amount : 0,
          credit: entry.direction === "Debit_Out" ? entry.amount : 0,
        }));
      return ledgerAccount(
        account.id,
        account.name,
        `${account.bankName}${account.branch ? ` · ${account.branch}` : ""}`,
        opening,
        entries,
      );
    })
    .filter((account) => account.opening !== 0 || account.rows.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function ledgerReport(
  state: AppState,
  range: ReportRange,
  kind: LedgerKind,
): LedgerAccount[] {
  if (kind === "customer") return customerLedger(state, range);
  if (kind === "supplier") return supplierLedger(state, range);
  if (kind === "insurance") return insuranceLedger(state, range);
  return bankLedger(state, range);
}

/* ------------------------------------------------------------------ */
/* Trial balance                                                      */
/* ------------------------------------------------------------------ */

export type TrialBalanceGroup =
  | "Assets"
  | "Liabilities"
  | "Equity"
  | "Income"
  | "Cost of sales"
  | "Expenses";

export interface TrialBalanceRow {
  account: string;
  group: TrialBalanceGroup;
  debit: number;
  credit: number;
}

export interface TrialBalanceReport {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

interface BalanceLine {
  account: string;
  group: TrialBalanceGroup;
  amount: number;
}

function cashAndBankBalance(state: AppState, end: string): number {
  return (
    state.bankAccounts.reduce((sum, account) => sum + account.openingBalance, 0) +
    state.bankTransactions
      .filter((entry) => entry.date.slice(0, 10) <= end)
      .reduce(
        (sum, entry) =>
          sum + (entry.direction === "Credit_In" ? entry.amount : -entry.amount),
        0,
      )
  );
}

function pettyCashBalanceAt(state: AppState, end: string): number {
  return state.pettyCash
    .filter((entry) => entry.date.slice(0, 10) <= end)
    .reduce(
      (sum, entry) => sum + (entry.type === "Float_Topup" ? entry.amount : -entry.amount),
      0,
    );
}

function receivablesAt(state: AppState, end: string): number {
  return state.customerCredits
    .filter((credit) => credit.creditDate.slice(0, 10) <= end)
    .reduce(
      (sum, credit) =>
        sum + Math.max(0, credit.total - paidAsOf(state, credit, end)),
      0,
    );
}

function insuranceReceivablesAt(state: AppState, end: string): number {
  return state.insuranceJobs
    .filter(
      (claim) =>
        (claim.insuranceBillAt ?? claim.createdAt).slice(0, 10) <= end,
    )
    .reduce((sum, claim) => {
      const billAmount = claim.insuranceBillAmount ?? 0;
      if (billAmount <= 0) return sum;
      const clearedDay = claim.chequeClearedAt?.slice(0, 10);
      const receivedDay = claim.chequeReceivedAt?.slice(0, 10);
      const settlementDay =
        clearedDay ?? (claim.chequeStatus === "Cleared" ? receivedDay : undefined);
      let settled = 0;
      if (settlementDay && settlementDay <= end) settled = claim.chequeAmount ?? 0;
      else if (claim.status === "Settled" && !settlementDay) settled = billAmount;
      return sum + Math.max(0, billAmount - settled);
    }, 0);
}

function inventoryValueAt(state: AppState, end: string): number {
  return state.inventory.reduce((sum, item) => {
    const futureNet = state.stockMovements
      .filter(
        (movement) =>
          movement.itemId === item.id && movement.date.slice(0, 10) > end,
      )
      .reduce((total, movement) => total + movement.qty, 0);
    const qty = Math.max(0, item.stock - futureNet);
    return sum + qty * stockUnitCost(item);
  }, 0);
}

function supplierPayablesAt(state: AppState, end: string): number {
  const unpaid = state.purchases.filter(
    (purchase) =>
      purchase.type === "Credit" &&
      purchase.status === "Unpaid" &&
      purchase.purchaseDate.slice(0, 10) <= end,
  );
  const returns = state.supplierReturns.filter(
    (entry) => entry.date.slice(0, 10) <= end,
  );
  const linked = unpaid.reduce((sum, purchase) => {
    const returned = returns
      .filter((entry) => entry.purchaseId === purchase.id)
      .reduce((total, entry) => total + entry.total, 0);
    return sum + Math.max(0, purchase.amount - returned);
  }, 0);
  const unlinked = returns
    .filter((entry) => !entry.purchaseId)
    .reduce((sum, entry) => sum + entry.total, 0);
  return Math.max(0, linked - unlinked);
}

function loansAt(state: AppState, end: string): number {
  return state.workshopLoans
    .filter((loan) => loan.startDate.slice(0, 10) <= end)
    .reduce((sum, loan) => {
      const repaidAfter =
        state.workshopLoanPayments
          .filter(
            (payment) =>
              payment.loanId === loan.id && payment.date.slice(0, 10) > end,
          )
          .reduce((total, payment) => total + payment.amount, 0) ?? 0;
      return sum + Math.max(0, loan.balance + repaidAfter);
    }, 0);
}

function periodVat(state: AppState, range: ReportRange): number {
  return state.jobCards
    .filter(
      (job) => job.paidAt && inReportRange(job.paidAt, range) && job.vatAmount,
    )
    .reduce((sum, job) => sum + (job.vatAmount ?? 0), 0);
}

export function trialBalanceReport(
  state: AppState,
  range: ReportRange,
): TrialBalanceReport {
  const entries = state.ledger.filter((entry) => inReportRange(entry.date, range));
  const revenue = entries.reduce(
    (sum, entry) => sum + entry.laborRevenue + entry.partsRevenue,
    0,
  );
  const discounts = entries.reduce((sum, entry) => sum + entry.discount, 0);
  const partsCost = entries.reduce((sum, entry) => sum + entry.partsCost, 0);
  const commissions = entries.reduce((sum, entry) => sum + entry.commission, 0);
  const driverCommissions = entries.reduce(
    (sum, entry) => sum + (entry.driverCommission ?? 0),
    0,
  );
  const operatingExpenses = state.expenses
    .filter((expense) => inReportRange(expense.date, range))
    .reduce((sum, expense) => sum + expense.amount, 0);
  const pettyExpenses = state.pettyCash
    .filter(
      (entry) => entry.type === "Expense" && inReportRange(entry.date, range),
    )
    .reduce((sum, entry) => sum + entry.amount, 0);
  const payroll = payrollForRange(state, range.start, range.end);
  const vat = periodVat(state, range);

  const lines: BalanceLine[] = [
    { account: "Cash & bank", group: "Assets", amount: cashAndBankBalance(state, range.end) },
    { account: "Petty cash", group: "Assets", amount: pettyCashBalanceAt(state, range.end) },
    { account: "Trade receivables", group: "Assets", amount: receivablesAt(state, range.end) },
    {
      account: "Insurance receivables",
      group: "Assets",
      amount: insuranceReceivablesAt(state, range.end),
    },
    { account: "Inventory at cost", group: "Assets", amount: inventoryValueAt(state, range.end) },
    { account: "Supplier payables", group: "Liabilities", amount: -supplierPayablesAt(state, range.end) },
    { account: "Workshop loans", group: "Liabilities", amount: -loansAt(state, range.end) },
    { account: "Commission payable", group: "Liabilities", amount: -(commissions + driverCommissions) },
    { account: "Accrued payroll", group: "Liabilities", amount: -payroll },
    { account: "VAT payable", group: "Liabilities", amount: -vat },
    { account: "Sales revenue", group: "Income", amount: -revenue },
    { account: "Discounts allowed", group: "Expenses", amount: discounts },
    { account: "Cost of parts sold", group: "Cost of sales", amount: partsCost },
    { account: "Technician commissions", group: "Expenses", amount: commissions },
    { account: "Driver commissions", group: "Expenses", amount: driverCommissions },
    { account: "Operating expenses", group: "Expenses", amount: operatingExpenses },
    { account: "Petty cash expenses", group: "Expenses", amount: pettyExpenses },
    { account: "Payroll expense", group: "Expenses", amount: payroll },
  ];

  const netBeforeCapital = lines.reduce((sum, line) => sum + line.amount, 0);
  if (Math.abs(netBeforeCapital) > 0.009) {
    lines.push({
      account:
        netBeforeCapital < 0
          ? "Owner's capital / accumulated losses"
          : "Owner's capital & retained earnings",
      group: "Equity",
      amount: -netBeforeCapital,
    });
  }

  const rows = lines.map((line) => ({
    account: line.account,
    group: line.group,
    debit: round(Math.max(0, line.amount)),
    credit: round(Math.max(0, -line.amount)),
  }));
  const groupOrder: TrialBalanceGroup[] = [
    "Assets",
    "Liabilities",
    "Equity",
    "Income",
    "Cost of sales",
    "Expenses",
  ];
  rows.sort(
    (a, b) =>
      groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group) ||
      a.account.localeCompare(b.account),
  );
  const totalDebit = round(rows.reduce((sum, row) => sum + row.debit, 0));
  const totalCredit = round(rows.reduce((sum, row) => sum + row.credit, 0));
  return {
    rows,
    totalDebit,
    totalCredit,
    balanced: Math.abs(totalDebit - totalCredit) < 0.01,
  };
}

/* ------------------------------------------------------------------ */
/* CSV                                                                */
/* ------------------------------------------------------------------ */

export function downloadReportCsv(
  filename: string,
  rows: (string | number)[][],
): void {
  if (typeof window === "undefined") return;
  const text = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "");
          return `"${value.replace(/"/g, '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
  const blob = new Blob([`\uFEFF${text}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
