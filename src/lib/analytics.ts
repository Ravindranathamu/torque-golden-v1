import type { AppState, ExpenseCategory, LedgerEntry } from "../types";
import { isWithinRange, ledgerCommissionForWorker } from "./utils";
import { monthBounds, monthlyPayrollRow } from "./payroll";

function payrollForMonth(state: AppState, date: Date = new Date()): number {
  const { start, end } = monthBounds(date);
  return state.workers
    .filter((worker) => worker.status === "Active")
    .reduce((sum, worker) => {
      const row = monthlyPayrollRow(state, worker, date);
      const employerContributions = row.epfEmployer + row.etfEmployer;
      if (worker.payType === "Daily") {
        const presentDays = new Set(
          state.attendance
            .filter(
              (record) =>
                record.workerId === worker.id &&
                record.status === "Present" &&
                record.date >= start &&
                record.date <= end,
            )
            .map((record) => record.date),
        ).size;
        return sum + presentDays * worker.dailyRate + employerContributions;
      }
      return sum + row.basic + employerContributions;
    }, 0);
}

export type Period = "today" | "month" | "year";

export interface DateRange {
  start: string;
  end: string;
}

function localDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function rangeForPeriod(period: Period, now = new Date()): DateRange {
  const today = localDay(now);
  if (period === "today") return { start: today, end: today };
  if (period === "month") {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
    return { start: `${year}-${month}-01`, end: `${year}-${month}-${lastDay}` };
  }
  return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` };
}

function inDateRange(iso: string, start: string, end: string): boolean {
  const day = iso.slice(0, 10);
  return day >= start && day <= end;
}

/**
 * Monthly payroll spread across an arbitrary report range. Whole months use
 * the existing payroll calculation; partial months are prorated by day.
 */
export function payrollForRange(state: AppState, start: string, end: string): number {
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  if (startDate > endDate) return 0;
  let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  let total = 0;
  while (cursor <= endDate) {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const coveredStart = startDate > monthStart ? startDate : monthStart;
    const coveredEnd = endDate < monthEnd ? endDate : monthEnd;
    const daysCovered =
      Math.floor((coveredEnd.getTime() - coveredStart.getTime()) / 86_400_000) + 1;
    const daysInMonth = monthEnd.getDate();
    if (daysCovered > 0) {
      total += payrollForMonth(state, monthStart) * (daysCovered / daysInMonth);
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return total;
}

export interface PnlSummary {
  revenue: number;
  laborRevenue: number;
  partsRevenue: number;
  discounts: number;
  partsCost: number;
  grossProfit: number;
  grossMargin: number;
  commissions: number;
  driverCommissions: number;
  expenses: number;
  pettyCashExpenses: number;
  payroll: number;
  netProfit: number;
  cashSales: number;
  creditSales: number;
  insuranceSales: number;
  cashCollected: number;
  creditSettlements: number;
  receivables: number;
  insuranceReceivables: number;
  payables: number;
  lowStock: number;
  bankLiquidity: number;
  pettyCashBalance: number;
}

export function ledgerRevenue(entry: LedgerEntry): number {
  return Math.max(0, entry.laborRevenue + entry.partsRevenue - entry.discount);
}

export function pnlFor(state: AppState, period: Period): PnlSummary {
  const range = rangeForPeriod(period);
  return pnlForRange(state, range.start, range.end);
}

export function pnlForRange(
  state: AppState,
  start: string,
  end: string,
): PnlSummary {
  const entries = state.ledger.filter((entry) => inDateRange(entry.date, start, end));
  const expenses = state.expenses
    .filter((expense) => inDateRange(expense.date, start, end))
    .reduce((sum, expense) => sum + expense.amount, 0);
  const pettyCashExpenses = state.pettyCash
    .filter((entry) => entry.type === "Expense" && inDateRange(entry.date, start, end))
    .reduce((sum, entry) => sum + entry.amount, 0);
  const pettyCashBalance = state.pettyCash.reduce(
    (sum, entry) => sum + (entry.type === "Float_Topup" ? entry.amount : -entry.amount),
    0,
  );
  const bankLiquidity =
    state.bankAccounts
      .filter((account) => account.active)
      .reduce((sum, account) => sum + account.openingBalance, 0) +
    state.bankTransactions.reduce(
      (sum, entry) => sum + (entry.direction === "Credit_In" ? entry.amount : -entry.amount),
      0,
    );

  const laborRevenue = entries.reduce((sum, entry) => sum + entry.laborRevenue, 0);
  const partsRevenue = entries.reduce((sum, entry) => sum + entry.partsRevenue, 0);
  const discounts = entries.reduce((sum, entry) => sum + entry.discount, 0);
  const revenue = entries.reduce((sum, entry) => sum + ledgerRevenue(entry), 0);
  const partsCost = entries.reduce((sum, entry) => sum + entry.partsCost, 0);
  const commissions = entries.reduce((sum, entry) => sum + entry.commission, 0);
  const driverCommissions = entries.reduce(
    (sum, entry) => sum + (entry.driverCommission ?? 0),
    0,
  );
  const cashSales = entries
    .filter(
      (entry) =>
        entry.paymentMethod === "Cash" ||
        entry.paymentMethod === "Card" ||
        entry.paymentMethod === "Bank Transfer",
    )
    .reduce((sum, entry) => sum + ledgerRevenue(entry), 0);
  const creditSales = entries
    .filter((entry) => entry.paymentMethod === "Credit")
    .reduce((sum, entry) => sum + ledgerRevenue(entry), 0);
  const insuranceSales = entries
    .filter((entry) => entry.paymentMethod === "Insurance")
    .reduce((sum, entry) => sum + ledgerRevenue(entry), 0);
  const creditSettlements = entries
    .filter((entry) => entry.paymentMethod === "Credit Settlement")
    .reduce((sum, entry) => sum + (entry.settlementAmount ?? 0), 0);
  const insuranceSettlements = entries
    .filter((entry) => entry.paymentMethod === "Insurance Settlement")
    .reduce((sum, entry) => sum + (entry.settlementAmount ?? 0), 0);

  const payroll = payrollForRange(state, start, end);

  const grossProfit = revenue - partsCost;
  const netProfit =
    grossProfit - commissions - driverCommissions - expenses - pettyCashExpenses - payroll;
  const receivables = state.customerCredits
    .filter((credit) => credit.status !== "Settled")
    .reduce((sum, credit) => sum + Math.max(0, credit.total - credit.paid), 0);
  const insuranceReceivables = state.insuranceJobs
    .filter((claim) => claim.status !== "Settled")
    .reduce(
      (sum, claim) =>
        sum + Math.max(0, (claim.insuranceBillAmount ?? 0) - (claim.chequeAmount ?? 0)),
      0,
    );
  const payables = state.purchases
    .filter((purchase) => purchase.type === "Credit" && purchase.status === "Unpaid")
    .reduce((sum, purchase) => sum + purchase.amount, 0);
  const lowStock = state.inventory.filter((item) => item.stock < item.minStock).length;

  return {
    revenue,
    laborRevenue,
    partsRevenue,
    discounts,
    partsCost,
    grossProfit,
    grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
    commissions,
    driverCommissions,
    expenses,
    pettyCashExpenses,
    payroll,
    netProfit,
    cashSales,
    creditSales,
    insuranceSales,
    cashCollected:
      cashSales + creditSettlements + insuranceSettlements,
    creditSettlements,
    receivables,
    insuranceReceivables,
    payables,
    lowStock,
    bankLiquidity,
    pettyCashBalance,
  };
}

export interface SectionProfitRow {
  sectionId: string;
  sectionName: string;
  laborRevenue: number;
  partsRevenue: number;
  revenue: number;
  partsCost: number;
  commission: number;
  grossProfit: number;
}

/**
 * Section profitability comes from the immutable section snapshot stored on
 * each ledger entry, so historical reports do not drift when staff move bays.
 */
export function sectionProfitability(state: AppState, period: Period): SectionProfitRow[] {
  const rows = new Map<string, SectionProfitRow>();
  state.ledger
    .filter((entry) => isWithinRange(entry.date, period))
    .forEach((entry) => {
      const breakdown =
        entry.sectionBreakdown && entry.sectionBreakdown.length > 0
          ? entry.sectionBreakdown
          : [
              {
                sectionId: "__unassigned",
                sectionName: "Unassigned",
                laborRevenue: entry.laborRevenue,
                partsRevenue: entry.partsRevenue,
                partsCost: entry.partsCost,
                commission: entry.commission,
              },
            ];
      breakdown.forEach((part) => {
        const existing = rows.get(part.sectionId) ?? {
          sectionId: part.sectionId,
          sectionName:
            state.sections.find((section) => section.id === part.sectionId)?.name ??
            part.sectionName,
          laborRevenue: 0,
          partsRevenue: 0,
          revenue: 0,
          partsCost: 0,
          commission: 0,
          grossProfit: 0,
        };
        existing.laborRevenue += part.laborRevenue;
        existing.partsRevenue += part.partsRevenue;
        existing.revenue += part.laborRevenue + part.partsRevenue;
        existing.partsCost += part.partsCost;
        existing.commission += part.commission;
        existing.grossProfit =
          existing.revenue - existing.partsCost - existing.commission;
        rows.set(part.sectionId, existing);
      });
    });
  return Array.from(rows.values())
    .filter(
      (row) => row.revenue !== 0 || row.partsCost !== 0 || row.commission !== 0,
    )
    .sort((a, b) => b.revenue - a.revenue);
}

export interface DailySales {
  key: string;
  label: string;
  cash: number;
  credit: number;
  total: number;
}

export function dailySales(state: AppState, days = 7): DailySales[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(today);
    day.setDate(day.getDate() - (days - 1 - index));
    const key = day.toDateString();
    const entries = state.ledger.filter(
      (entry) => new Date(entry.date).toDateString() === key,
    );
    const cash = entries
      .filter(
        (entry) =>
          entry.paymentMethod === "Cash" ||
          entry.paymentMethod === "Card" ||
          entry.paymentMethod === "Bank Transfer",
      )
      .reduce((sum, entry) => sum + ledgerRevenue(entry), 0);
    const credit = entries
      .filter((entry) => entry.paymentMethod === "Credit")
      .reduce((sum, entry) => sum + ledgerRevenue(entry), 0);
    return {
      key,
      label: day.toLocaleDateString("en-GB", { weekday: "short" }),
      cash,
      credit,
      total: cash + credit,
    };
  });
}

export function expenseBreakdown(
  state: AppState,
  period: Period,
): { category: ExpenseCategory; amount: number }[] {
  const range = rangeForPeriod(period);
  return expenseBreakdownForRange(state, range.start, range.end);
}

export function expenseBreakdownForRange(
  state: AppState,
  start: string,
  end: string,
): { category: ExpenseCategory; amount: number }[] {
  const categories: ExpenseCategory[] = [
    "Rental",
    "Electricity",
    "Water",
    "Operational Cost",
    "Other Expenses",
  ];
  return categories
    .map((category) => ({
      category,
      amount: state.expenses
        .filter(
          (expense) =>
            expense.category === category && inDateRange(expense.date, start, end),
        )
        .reduce((sum, expense) => sum + expense.amount, 0),
    }))
    .filter((row) => row.amount > 0);
}

export function commissionsByWorker(
  state: AppState,
  period: Period,
): { workerId: string; name: string; commission: number; baseSalary: number }[] {
  return state.workers
    .map((worker) => ({
      workerId: worker.id,
      name: worker.fullName,
      commission: state.ledger
        .filter((entry) => isWithinRange(entry.date, period))
        .reduce(
          (sum, entry) => sum + ledgerCommissionForWorker(entry, worker.id),
          0,
        ),
      baseSalary:
        worker.payType === "Daily"
          ? worker.dailyRate * state.settings.workingDays.length * 4.33 * (period === "year" ? 12 : 1)
          : period === "year"
            ? worker.baseSalary * 12
            : worker.baseSalary,
    }))
    .sort((a, b) => b.commission - a.commission);
}

export interface MonthPoint {
  key: string;
  label: string;
  revenue: number;
  cost: number;
  expenses: number;
  payroll: number;
  profit: number;
}

export function monthlySeries(state: AppState, months = 6): MonthPoint[] {
  const now = new Date();
  return Array.from({ length: months }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (months - 1 - index), 1);
    const sameMonth = (iso: string) => {
      const value = new Date(iso);
      return (
        value.getFullYear() === date.getFullYear() &&
        value.getMonth() === date.getMonth()
      );
    };
    const entries = state.ledger.filter((entry) => sameMonth(entry.date));
    const revenue = entries.reduce((sum, entry) => sum + ledgerRevenue(entry), 0);
    const cost = entries.reduce(
      (sum, entry) =>
        sum + entry.partsCost + entry.commission + (entry.driverCommission ?? 0),
      0,
    );
    const expenses = state.expenses
      .filter((expense) => sameMonth(expense.date))
      .reduce((sum, expense) => sum + expense.amount, 0);
    const payroll = payrollForMonth(state, date);
    return {
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: date.toLocaleDateString("en-GB", { month: "short" }),
      revenue,
      cost,
      expenses,
      payroll,
      profit: revenue - cost - expenses - payroll,
    };
  });
}
