import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  CreditCard,
  Download,
  FileText,
  Landmark,
  Layers,
  MessageCircle,
  Package,
  Plus,
  Printer,
  ReceiptText,
  ShieldCheck,
  Trash2,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { useApp } from "../state/AppStore";
import { featureEnabled } from "../lib/features";
import {
  expenseBreakdown,
  monthlySeries,
  pnlFor,
  sectionProfitability,
  type Period,
} from "../lib/analytics";
import {
  dailyWageDue,
  monthBounds,
  monthlyPayrollRow,
  nextWorkingDayLabel,
  type MonthlyPayrollRow,
} from "../lib/payroll";
import {
  buildPayslipPdf,
  printWageReceipt,
  sharePayslipWhatsApp,
} from "../lib/invoice";
import {
  printThermalPayslip,
  printThermalSupplierPaymentVoucher,
} from "../lib/ird";
import {
  dateOnly,
  daysUntil,
  money,
  shortDate,
  timeAgo,
  waLink,
} from "../lib/utils";
import {
  Alert,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  StatCard,
  StatusBadge,
  Tabs,
} from "../components/ui";
import { CreditLedger } from "../components/CreditLedger";
import {
  BankAccountsPanel,
  CustomerChequePanel,
  PettyCashPanel,
  SupplierChequeLoanPanel,
} from "../components/FinancePanels";
import { useToast } from "../components/Toast";
import type { ExpenseCategory } from "../types";

type AccountingTab =
  | "overview"
  | "sections"
  | "expenses"
  | "payables"
  | "credits"
  | "petty-cash"
  | "bank"
  | "cheques"
  | "supplier-cheques"
  | "payroll"
  | "insurance";

const expenseCategories: ExpenseCategory[] = [
  "Rental",
  "Electricity",
  "Water",
  "Operational Cost",
  "Other Expenses",
];

const periodLabels: Record<Period, string> = {
  today: "today",
  month: "this month",
  year: "this year",
};

export function AccountingPage() {
  const {
    state,
    addExpense,
    removeExpense,
    markPurchasePaid,
    addStaffLoan,
    savePayslip,
    payDailyWage,
    recordInsuranceCheque,
    settleInsuranceClaim,
  } = useApp();
  const { push } = useToast();
  const [tab, setTab] = useState<AccountingTab>("overview");
  const [period, setPeriod] = useState<Period>("month");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [payslipTarget, setPayslipTarget] = useState<string | null>(null);
  const [payslipOther, setPayslipOther] = useState("0");
  const [payslipNote, setPayslipNote] = useState("");
  const [loanOpen, setLoanOpen] = useState(false);
  const [loanForm, setLoanForm] = useState({
    workerId: "",
    principal: "",
    monthlyDeduction: "",
    reason: "",
  });
  const [wageCommission, setWageCommission] = useState(true);
  const [chequeTarget, setChequeTarget] = useState<string | null>(null);
  const [chequeNo, setChequeNo] = useState("");
  const [chequeAmount, setChequeAmount] = useState("");
  const [chequeBank, setChequeBank] = useState("");
  const [chequeBranch, setChequeBranch] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [chequeAccountId, setChequeAccountId] = useState("");
  const [payTarget, setPayTarget] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<"Cash" | "Bank Transfer" | "Cheque">("Bank Transfer");
  const [payBankId, setPayBankId] = useState("");
  const [payChequeNo, setPayChequeNo] = useState("");
  const [payChequeBank, setPayChequeBank] = useState("");
  const [payChequeBranch, setPayChequeBranch] = useState("");
  const [payChequeDate, setPayChequeDate] = useState("");
  const [partsPurchaseId, setPartsPurchaseId] = useState<string | null>(null);
  const [form, setForm] = useState({
    category: "Operational Cost" as ExpenseCategory,
    amount: "",
    description: "",
    date: dateOnly(new Date().toISOString()),
  });

  const pnl = useMemo(() => pnlFor(state, period), [state, period]);
  const breakdown = useMemo(() => expenseBreakdown(state, period), [state, period]);
  const months = useMemo(() => monthlySeries(state, 6), [state]);
  const sectionRows = useMemo(() => sectionProfitability(state, period), [state, period]);
  const monthLabel = monthBounds().label;
  const advancedAccounting = featureEnabled(state.settings, "enable_advanced_accounting");
  const pettyCashEnabled = featureEnabled(state.settings, "enable_petty_cash");
  const payrollEnabled =
    featureEnabled(state.settings, "enable_payroll_epf_etf") ||
    featureEnabled(state.settings, "enable_daily_wages");
  const insuranceEnabled = featureEnabled(state.settings, "enable_insurance_module");
  const sectionsEnabled =
    featureEnabled(state.settings, "enable_multi_sections") && state.sections.length > 0;

  const activeWorkers = state.workers.filter((worker) => worker.status === "Active");
  const monthlyWorkers = activeWorkers.filter((worker) => worker.payType !== "Daily");
  const dailyWorkers = activeWorkers.filter((worker) => worker.payType === "Daily");
  const payrollRows: MonthlyPayrollRow[] = monthlyWorkers.map((worker) =>
    monthlyPayrollRow(state, worker),
  );
  const payrollTotal = payrollRows.reduce((sum, row) => sum + row.gross, 0);
  const payrollNet = payrollRows.reduce((sum, row) => sum + row.net, 0);
  const payrollCommission = payrollRows.reduce((sum, row) => sum + row.commission, 0);
  const epfEmployeeTotal = payrollRows.reduce((sum, row) => sum + row.epfEmployee, 0);
  const epfEmployerTotal = payrollRows.reduce((sum, row) => sum + row.epfEmployer, 0);
  const etfTotal = payrollRows.reduce((sum, row) => sum + row.etfEmployer, 0);
  const loanOutstanding = state.staffLoans
    .filter((loan) => loan.status === "Active")
    .reduce((sum, loan) => sum + loan.balance, 0);
  const dailyWageRows = dailyWorkers.map((worker) => ({
    worker,
    due: dailyWageDue(state, worker, wageCommission),
  }));
  const dailyWageTotal = dailyWageRows.reduce((sum, row) => sum + row.due.amount, 0);
  const payslipWorker = state.workers.find((worker) => worker.id === payslipTarget) ?? null;
  const payslipRow = payrollRows.find((row) => row.workerId === payslipTarget) ?? null;
  const payslipOtherValue = Math.max(0, Number(payslipOther) || 0);
  const payslipNet = payslipRow
    ? Math.max(
        0,
        payslipRow.gross -
          payslipRow.loanDeduction -
          payslipRow.epfEmployee -
          payslipOtherValue,
      )
    : 0;
  const insuranceClaims = [...state.insuranceJobs].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const openClaims = insuranceClaims.filter((claim) => claim.status !== "Settled");
  const salvagePending = insuranceClaims.filter(
    (claim) => claim.salvageStatus === "Pending",
  ).length;
  const chequeClaim =
    state.insuranceJobs.find((claim) => claim.id === chequeTarget) ?? null;
  const payPurchase = state.purchases.find((purchase) => purchase.id === payTarget) ?? null;
  const partsPurchase =
    state.purchases.find((purchase) => purchase.id === partsPurchaseId) ?? null;

  const periodExpenses = state.expenses
    .filter((expense) => {
      const date = new Date(expense.date);
      const now = new Date();
      if (period === "today") return date.toDateString() === now.toDateString();
      if (period === "month")
        return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
      return date.getFullYear() === now.getFullYear();
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const unpaidCredit = state.purchases
    .filter((purchase) => purchase.type === "Credit" && purchase.status === "Unpaid")
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const overdueSupplier = unpaidCredit.filter(
    (purchase) => purchase.dueDate && daysUntil(purchase.dueDate) < 0,
  );
  const dueSoonSupplier = unpaidCredit.filter(
    (purchase) =>
      purchase.dueDate && daysUntil(purchase.dueDate) >= 0 && daysUntil(purchase.dueDate) <= 7,
  );

  const supplierName = (id: string) =>
    state.suppliers.find((supplier) => supplier.id === id)?.name ?? "Unknown supplier";

  const maxMonthRevenue = Math.max(1, ...months.map((month) => month.revenue));

  function saveExpense() {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      push("Enter a valid expense amount.", "error");
      return;
    }
    if (!form.description.trim()) {
      push("Add a short description for the expense.", "error");
      return;
    }
    if (!form.date) {
      push("Choose the expense date.", "error");
      return;
    }
    addExpense(form.category, amount, form.description.trim(), form.date);
    push(`${form.category} expense recorded.`);
    setExpenseOpen(false);
    setForm({
      category: "Operational Cost",
      amount: "",
      description: "",
      date: dateOnly(new Date().toISOString()),
    });
  }

  function confirmDeleteExpense() {
    if (!deleteTarget) return;
    removeExpense(deleteTarget);
    push("Expense removed from the ledger.", "info");
    setDeleteTarget(null);
  }

  function remindSupplier(purchaseId: string) {
    const purchase = state.purchases.find((entry) => entry.id === purchaseId);
    if (!purchase) return;
    const supplier = state.suppliers.find((entry) => entry.id === purchase.supplierId);
    if (!supplier) return;
    const message = `Hello ${supplier.name}, this is ${state.settings.companyName}. This is a payment confirmation reminder for invoice ${purchase.invoiceNo} of ${money(purchase.amount)}, due ${purchase.dueDate ? shortDate(purchase.dueDate) : "on agreed terms"}. Please confirm the settlement details. Thank you.`;
    window.open(waLink(supplier.phone, message), "_blank", "noopener,noreferrer");
  }

  function insurerName(insurerId: string) {
    return (
      state.insuranceCompanies.find((company) => company.id === insurerId)?.name ??
      "Insurance company"
    );
  }

  function openPayslip(workerId: string) {
    setPayslipTarget(workerId);
    setPayslipOther("0");
    setPayslipNote("");
  }

  function issuePayslip(download: boolean) {
    if (!payslipWorker || !payslipRow) return;
    const bounds = monthBounds();
    const data = {
      periodStart: bounds.start,
      periodEnd: bounds.end,
      workedDays: payslipRow.presentDays + payslipRow.paidOffDays,
      workingDays: payslipRow.workingDays,
      basic: payslipRow.basic,
      commission: payslipRow.commission,
      loanDeduction: payslipRow.loanDeduction,
      epfEmployee: payslipRow.epfEmployee,
      epfEmployer: payslipRow.epfEmployer,
      etfEmployer: payslipRow.etfEmployer,
      otherDeductions: payslipOtherValue,
      gross: payslipRow.gross,
      net: payslipNet,
      note: payslipNote.trim() || undefined,
    };
    const result = savePayslip(payslipWorker.id, data);
    if (!result.ok) {
      push(result.message ?? "Could not issue the payslip.", "error");
      return;
    }
    if (download) {
      const payslip = {
        ...data,
        id: result.reference ?? "payslip",
        workerId: payslipWorker.id,
        paidAt: new Date().toISOString(),
      };
      const { blob, filename } = buildPayslipPdf(payslip, payslipWorker, state.settings);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      push(`Payslip saved for ${payslipWorker.fullName} and PDF downloaded.`);
    } else {
      push(`Payslip saved for ${payslipWorker.fullName}. Staff loan balance updated.`);
    }
    setPayslipTarget(null);
  }

  async function shareLatestPayslip(payslipId: string) {
    const payslip = state.payslips.find((entry) => entry.id === payslipId);
    if (!payslip) return;
    const worker = state.workers.find((entry) => entry.id === payslip.workerId);
    if (!worker) return;
    try {
      const outcome = await sharePayslipWhatsApp(
        payslip,
        worker,
        state.settings,
        `Hello ${worker.fullName}, your payslip from ${state.settings.companyName} for ${shortDate(payslip.periodStart)} — ${shortDate(payslip.periodEnd)} is attached. Net pay ${money(payslip.net)}. ${
          payslip.note ?? ""
        }`.trim(),
      );
      push(
        outcome === "queued"
          ? "Payslip sent automatically through WAHA with the PDF attached."
          : "Payslip prepared for WhatsApp.",
        "info",
      );
    } catch {
      push("Could not prepare the payslip.", "error");
    }
  }

  function downloadPayslip(payslipId: string) {
    const payslip = state.payslips.find((entry) => entry.id === payslipId);
    if (!payslip) return;
    const worker = state.workers.find((entry) => entry.id === payslip.workerId);
    if (!worker) return;
    const { blob, filename } = buildPayslipPdf(payslip, worker, state.settings);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function openLoanModal() {
    setLoanForm({
      workerId: activeWorkers[0]?.id ?? "",
      principal: "",
      monthlyDeduction: "",
      reason: "",
    });
    setLoanOpen(true);
  }

  function saveLoan() {
    const principal = Number(loanForm.principal);
    const monthly = Number(loanForm.monthlyDeduction);
    if (!loanForm.workerId) {
      push("Choose the worker taking the loan.", "error");
      return;
    }
    if (!Number.isFinite(principal) || principal <= 0) {
      push("Enter a valid loan amount.", "error");
      return;
    }
    if (!Number.isFinite(monthly) || monthly <= 0) {
      push("Enter the monthly deduction.", "error");
      return;
    }
    if (monthly > principal) {
      push("The monthly deduction cannot exceed the loan amount.", "error");
      return;
    }
    if (!loanForm.reason.trim()) {
      push("Add a reason for the loan or salary advance.", "error");
      return;
    }
    addStaffLoan(loanForm.workerId, principal, monthly, loanForm.reason.trim());
    push("Staff loan recorded. It will be deducted from the next payslip.");
    setLoanOpen(false);
  }

  function payWage(workerId: string) {
    const worker = state.workers.find((entry) => entry.id === workerId);
    if (!worker) return;
    const due = dailyWageDue(state, worker, wageCommission);
    const result = payDailyWage(workerId, wageCommission);
    if (!result.ok) {
      push(result.message ?? "Could not pay the daily wage.", "error");
      return;
    }
    printWageReceipt(
      {
        id: result.reference ?? "wage",
        workerId,
        date: dateOnly(new Date().toISOString()),
        days: due.days,
        baseAmount: due.baseAmount,
        commissionAmount: due.commissionAmount,
        commissionIncluded: due.commissionIncluded,
        amount: due.amount,
        receiptNo: result.reference ?? "WAGE",
        paidAt: new Date().toISOString(),
      },
      worker,
      state.settings,
    );
    push(`${result.reference} paid to ${worker.fullName} · ${money(due.amount)}. Receipt ready.`);
  }

  function openChequeModal(claimId: string) {
    const claim = state.insuranceJobs.find((entry) => entry.id === claimId);
    setChequeTarget(claimId);
    setChequeNo(claim?.chequeNo ?? "");
    setChequeAmount(
      claim?.chequeAmount
        ? String(claim.chequeAmount)
        : String(claim?.insuranceBillAmount ?? ""),
    );
    setChequeBank("");
    setChequeBranch("");
    setChequeDate(dateOnly(new Date().toISOString()));
    setChequeAccountId(state.bankAccounts.find((account) => account.active)?.id ?? "");
  }

  function saveCheque() {
    if (!chequeClaim) return;
    const amount = Number(chequeAmount);
    if (!chequeNo.trim()) {
      push("Enter the insurer cheque number.", "error");
      return;
    }
    if (!chequeBank.trim() || !chequeBranch.trim()) {
      push("Enter the issuing bank and branch.", "error");
      return;
    }
    if (!chequeDate) {
      push("Enter the cheque date.", "error");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      push("Enter a valid cheque amount.", "error");
      return;
    }
    const result = recordInsuranceCheque(chequeClaim.id, {
      chequeNo: chequeNo.trim(),
      amount,
      bank: chequeBank.trim(),
      branch: chequeBranch.trim(),
      chequeDate,
      bankAccountId: chequeAccountId || undefined,
    });
    if (!result.ok) {
      push(result.message ?? "Could not record the cheque.", "error");
      return;
    }
    push("Insurer cheque recorded in the incoming cheque board.");
    setChequeTarget(null);
  }

  function openPayPurchase(purchaseId: string, amount: number) {
    setPayTarget(purchaseId);
    setPayMethod("Bank Transfer");
    setPayBankId(state.bankAccounts.find((account) => account.active)?.id ?? "");
    setPayChequeNo("");
    setPayChequeBank("");
    setPayChequeBranch("");
    setPayChequeDate(dateOnly(new Date().toISOString()));
    setPartsPurchaseId(null);
    void amount;
  }

  function savePurchasePayment() {
    if (!payPurchase) return;
    if (payMethod !== "Cash" && !payBankId && payMethod !== "Cheque") {
      push("Choose the bank account paying the invoice.", "error");
      return;
    }
    if (payMethod === "Cheque") {
      if (!payChequeNo.trim() || !payChequeBank.trim() || !payChequeBranch.trim()) {
        push("Enter the cheque number, bank and branch.", "error");
        return;
      }
      if (!payChequeDate) {
        push("Enter the cheque date.", "error");
        return;
      }
    }
    const result = markPurchasePaid(payPurchase.id, {
      method: payMethod,
      bankAccountId: payMethod === "Cheque" ? undefined : payBankId || undefined,
      cheque:
        payMethod === "Cheque"
          ? {
              chequeNo: payChequeNo.trim(),
              bank: payChequeBank.trim(),
              branch: payChequeBranch.trim(),
              chequeDate: payChequeDate,
              amount: payPurchase.amount,
            }
          : undefined,
    });
    if (!result.ok) {
      push(result.message ?? "Could not settle the invoice.", "error");
      return;
    }
    push(
      payMethod === "Cheque"
        ? `${payPurchase.invoiceNo} settled with a post-dated cheque.`
        : `${payPurchase.invoiceNo} marked paid. Supplier credit reduced.`,
    );
    setPayTarget(null);
  }

  function settleClaim(claimId: string) {
    const result = settleInsuranceClaim(claimId);
    if (!result.ok) {
      push(result.message ?? "Could not settle the claim.", "error");
      return;
    }
    push("Insurance claim settled and posted to the ledger.");
  }

  return (
    <div className="page">
      <PageHeader
        title="Accounts & profitability"
        subtitle="Operating expenses, supplier credit, customer receivables and payroll in one ledger."
        actions={
          <>
            <Tabs<AccountingTab>
              value={tab}
              onChange={setTab}
              tabs={[
                { id: "overview", label: "Overview" },
                ...(sectionsEnabled
                  ? [
                      {
                        id: "sections" as AccountingTab,
                        label: "Section P&L",
                        count: sectionRows.length,
                      },
                    ]
                  : []),
                { id: "expenses", label: "Expenses", count: state.expenses.length },
                { id: "payables", label: "Supplier credit", count: unpaidCredit.length },
                { id: "credits", label: "Customer credit", count: state.customerCredits.filter((credit) => credit.status !== "Settled").length },
                ...(pettyCashEnabled
                  ? [{ id: "petty-cash" as AccountingTab, label: "Petty cash" }]
                  : []),
                ...(advancedAccounting
                  ? [
                      { id: "bank" as AccountingTab, label: "Bank" },
                      {
                        id: "cheques" as AccountingTab,
                        label: "Cheque board",
                        count: state.customerCheques.filter((cheque) => cheque.status === "In_Safe" || cheque.status === "Deposited").length,
                      },
                      {
                        id: "supplier-cheques" as AccountingTab,
                        label: "Supplier PDC & loans",
                        count: state.supplierCheques.filter((cheque) => cheque.status === "Issued_PDC").length,
                      },
                    ]
                  : []),
                ...(payrollEnabled
                  ? [{ id: "payroll" as AccountingTab, label: "Payroll" }]
                  : []),
                ...(insuranceEnabled
                  ? [
                      {
                        id: "insurance" as AccountingTab,
                        label: "Insurance",
                        count: openClaims.length,
                      },
                    ]
                  : []),
              ]}
            />
            <button className="btn btn-primary" onClick={() => setExpenseOpen(true)}>
              <Plus />
              Add expense
            </button>
          </>
        }
      />

      {tab === "overview" && (
        <div className="stack">
          <div className="row-between wrap">
            <span className="tiny muted">Profit & loss statement</span>
            <Tabs<Period>
              value={period}
              onChange={setPeriod}
              tabs={[
                { id: "today", label: "Today" },
                { id: "month", label: "This month" },
                { id: "year", label: "This year" },
              ]}
            />
          </div>

          <div className="grid cols-4">
            <StatCard
              label={`Revenue · ${periodLabels[period]}`}
              value={money(pnl.revenue)}
              meta={`${money(pnl.cashSales)} cash & card · ${money(pnl.creditSales)} credit`}
              icon={<Wallet />}
            />
            <StatCard
              label="Gross profit"
              value={money(pnl.grossProfit)}
              meta={`${pnl.grossMargin.toFixed(1)}% after ${money(pnl.partsCost)} parts cost`}
              icon={<TrendingUp />}
              tone="blue"
            />
            <StatCard
              label="Operating expenses"
              value={money(pnl.expenses + pnl.pettyCashExpenses)}
              meta={`${periodExpenses.length} entries · petty cash ${money(pnl.pettyCashExpenses)} · payroll ${money(pnl.payroll)}`}
              icon={<ReceiptText />}
              tone="amber"
            />
            <StatCard
              label="Net profit"
              value={money(pnl.netProfit)}
              meta={`After ${money(pnl.commissions)} commissions`}
              icon={<CircleDollarSign />}
              tone={pnl.netProfit < 0 ? "red" : "purple"}
              negative={pnl.netProfit < 0}
            />
          </div>

          <div className="grid cols-4">
            <StatCard
              label="Customer receivables"
              value={money(pnl.receivables)}
              meta={`${state.customerCredits.filter((credit) => credit.status !== "Settled").length} open accounts`}
              icon={<CreditCard />}
              tone="amber"
            />
            <StatCard
              label="Supplier payables"
              value={money(pnl.payables)}
              meta={`${unpaidCredit.length} unpaid credit invoices`}
              icon={<Truck />}
              tone={pnl.payables > 0 ? "red" : "brand"}
            />
            <StatCard
              label="Cash collected"
              value={money(pnl.cashCollected)}
              meta={`${money(pnl.creditSettlements)} from credit settlements`}
              icon={<Banknote />}
            />
            <StatCard
              label="Commission accrued"
              value={money(pnl.commissions)}
              meta="Worker share of labour revenue"
              icon={<Users />}
              tone="blue"
            />
          </div>

          <div className="grid cols-4">
            <StatCard
              label="Insurance receivables"
              value={money(pnl.insuranceReceivables)}
              meta={`${openClaims.length} claim${openClaims.length === 1 ? "" : "s"} awaiting settlement`}
              icon={<ShieldCheck />}
              tone="amber"
            />
            <StatCard
              label="Driver commissions"
              value={money(pnl.driverCommissions)}
              meta={`${periodLabels[period]} · internal only`}
              icon={<Truck />}
              tone="purple"
            />
            <StatCard
              label="Daily wages unpaid"
              value={money(dailyWageTotal)}
              meta={`${dailyWorkers.length} daily worker${dailyWorkers.length === 1 ? "" : "s"}`}
              icon={<Banknote />}
              tone={dailyWageTotal > 0 ? "amber" : "brand"}
            />
            <StatCard
              label="Staff loan balances"
              value={money(loanOutstanding)}
              meta="Auto-deducted from payslips"
              icon={<Landmark />}
              tone={loanOutstanding > 0 ? "red" : "brand"}
            />
          </div>

          {overdueSupplier.length > 0 && (
            <Alert tone="danger" icon={<AlertTriangle />} title="Overdue supplier credit">
              {overdueSupplier.length} invoice{overdueSupplier.length === 1 ? "" : "s"} worth{" "}
              {money(overdueSupplier.reduce((sum, purchase) => sum + purchase.amount, 0))} are
              past their due date.{" "}
              <button className="btn btn-ghost btn-sm" onClick={() => setTab("payables")}>
                Review supplier credit
              </button>
            </Alert>
          )}

          <div className="grid cols-3">
            <div className="card span-2">
              <div className="card-head">
                <div>
                  <h3>Profit & loss breakdown</h3>
                  <p>How the workshop earned and spent {periodLabels[period]}.</p>
                </div>
                <span className="badge badge-brand">Live</span>
              </div>
              <div className="card-body">
                <div className="kv">
                  <span>Labour revenue</span>
                  <span>{money(pnl.laborRevenue)}</span>
                </div>
                <div className="kv">
                  <span>Parts revenue</span>
                  <span>{money(pnl.partsRevenue)}</span>
                </div>
                <div className="kv">
                  <span>Discounts given</span>
                  <span>− {money(pnl.discounts)}</span>
                </div>
                <div className="divider" />
                <div className="kv strong">
                  <span>Net revenue</span>
                  <span>{money(pnl.revenue)}</span>
                </div>
                <div className="kv">
                  <span>Parts cost of sales</span>
                  <span>− {money(pnl.partsCost)}</span>
                </div>
                <div className="kv strong">
                  <span>Gross profit</span>
                  <span>{money(pnl.grossProfit)}</span>
                </div>
                <div className="kv">
                  <span>Worker commissions</span>
                  <span>− {money(pnl.commissions)}</span>
                </div>
                <div className="kv">
                  <span>Driver commissions</span>
                  <span>− {money(pnl.driverCommissions)}</span>
                </div>
                <div className="kv">
                  <span>Operating expenses</span>
                  <span>− {money(pnl.expenses)}</span>
                </div>
                <div className="kv">
                  <span>Petty cash vouchers</span>
                  <span>− {money(pnl.pettyCashExpenses)}</span>
                </div>
                <div className="kv">
                  <span>Payroll accrual (incl. employer EPF/ETF)</span>
                  <span>− {money(pnl.payroll)}</span>
                </div>
                <div className="divider" />
                <div className="kv strong" style={{ fontSize: 14 }}>
                  <span>Net profit</span>
                  <span style={{ color: pnl.netProfit < 0 ? "var(--danger)" : "var(--success)" }}>
                    {money(pnl.netProfit)}
                  </span>
                </div>
                <div className="tiny muted" style={{ marginTop: 8 }}>
                  Payroll is accrued from attendance-based salaries and daily wages, including employer EPF and
                  ETF contributions. Driver commissions are an internal cost and never appear on the
                  customer invoice. Expenses are recorded as operating cost, not inventory purchases.
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Expense mix</h3>
                  <p>{periodLabels[period]}</p>
                </div>
                <BarChart3 size={17} className="muted" />
              </div>
              <div className="card-body">
                {breakdown.length === 0 ? (
                  <div className="empty" style={{ padding: "22px 10px" }}>
                    <p>No operating expenses recorded for this period.</p>
                  </div>
                ) : (
                  breakdown.map((row) => (
                    <div key={row.category} style={{ marginBottom: 13 }}>
                      <div className="row-between" style={{ marginBottom: 5 }}>
                        <span className="small strong">{row.category}</span>
                        <span className="small mono">{money(row.amount)}</span>
                      </div>
                      <div className="progress">
                        <span
                          style={{
                            width: `${Math.max(3, (row.amount / Math.max(1, pnl.expenses)) * 100)}%`,
                            background: "var(--accent)",
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
                <div className="divider" />
                <div className="kv">
                  <span>Total expenses</span>
                  <span>{money(pnl.expenses)}</span>
                </div>
                <div className="kv">
                  <span>Expense ratio</span>
                  <span>
                    {pnl.revenue > 0 ? ((pnl.expenses / pnl.revenue) * 100).toFixed(1) : "0.0"}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Six-month performance</h3>
                <p>Revenue, cost of sales, payroll, operating expenses and profit trend.</p>
              </div>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Revenue</th>
                    <th className="num">Revenue trend</th>
                    <th className="num">Cost & commission</th>
                    <th className="num">Payroll</th>
                    <th className="num">Expenses</th>
                    <th className="num">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((month) => (
                    <tr key={month.key}>
                      <td className="strong">{month.label}</td>
                      <td className="num">{money(month.revenue)}</td>
                      <td style={{ minWidth: 150 }}>
                        <div className="progress">
                          <span
                            style={{
                              width: `${Math.max(2, (month.revenue / maxMonthRevenue) * 100)}%`,
                              background: "var(--brand)",
                            }}
                          />
                        </div>
                      </td>
                      <td className="num">{money(month.cost)}</td>
                      <td className="num">{money(month.payroll)}</td>
                      <td className="num">{money(month.expenses)}</td>
                      <td
                        className="num strong"
                        style={{ color: month.profit < 0 ? "var(--danger)" : "var(--success)" }}
                      >
                        {money(month.profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="alert alert-brand">
            <Landmark />
            <div>
              <strong>Reconciliation snapshot</strong>
              Cash and card sales {money(pnl.cashSales)} + credit invoices {money(pnl.creditSales)}{" "}
              + credit settlements {money(pnl.creditSettlements)} ={" "}
              <strong>{money(pnl.revenue + pnl.creditSettlements)}</strong> total billings and
              collections. Receivables still to collect: {money(pnl.receivables)}. Bank & cash
              liquidity {money(pnl.bankLiquidity)} · petty cash float {money(pnl.pettyCashBalance)}.
            </div>
          </div>
        </div>
      )}

      {tab === "sections" && sectionsEnabled && (
        <div className="stack">
          <div className="row-between wrap">
            <span className="tiny muted">
              Revenue, parts cost and commission by workshop section · {periodLabels[period]}
            </span>
            <Tabs<Period>
              value={period}
              onChange={setPeriod}
              tabs={[
                { id: "today", label: "Today" },
                { id: "month", label: "This month" },
                { id: "year", label: "This year" },
              ]}
            />
          </div>

          <div className="grid cols-4">
            <StatCard
              label="Section revenue"
              value={money(sectionRows.reduce((sum, row) => sum + row.revenue, 0))}
              meta={`${sectionRows.length} section${sectionRows.length === 1 ? "" : "s"} with activity`}
              icon={<Layers />}
            />
            <StatCard
              label="Parts cost"
              value={money(sectionRows.reduce((sum, row) => sum + row.partsCost, 0))}
              meta="Issued parts and consumables"
              icon={<Package />}
            />
            <StatCard
              label="Technician commission"
              value={money(sectionRows.reduce((sum, row) => sum + row.commission, 0))}
              meta="Section labour commission"
              icon={<Users />}
            />
            <StatCard
              label="Section gross profit"
              value={money(sectionRows.reduce((sum, row) => sum + row.grossProfit, 0))}
              meta="Before overheads and payroll"
              tone="brand"
              icon={<TrendingUp />}
            />
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Profitability by section</h3>
                <p>
                  Labour and part revenue are split from each job's section ledger, so multi-section
                  jobs report each bay separately.
                </p>
              </div>
            </div>
            {sectionRows.length === 0 ? (
              <EmptyState
                icon={<Layers size={22} />}
                title="No section revenue yet"
                message="Complete a job tagged to a section. Revenue, parts cost and commission will appear here per section."
              />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Section</th>
                      <th className="num">Labour</th>
                      <th className="num">Parts</th>
                      <th className="num">Revenue</th>
                      <th className="num">Parts cost</th>
                      <th className="num">Commission</th>
                      <th className="num">Gross profit</th>
                      <th className="num">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionRows.map((row) => {
                      const margin = row.revenue > 0 ? (row.grossProfit / row.revenue) * 100 : 0;
                      return (
                        <tr key={row.sectionId}>
                          <td>
                            <div className="cell-main">{row.sectionName}</div>
                            <div className="cell-sub">
                              {state.sections.find((section) => section.id === row.sectionId)?.code ??
                                "Ledger"}
                            </div>
                          </td>
                          <td className="num">{money(row.laborRevenue)}</td>
                          <td className="num">{money(row.partsRevenue)}</td>
                          <td className="num strong">{money(row.revenue)}</td>
                          <td className="num">{money(row.partsCost)}</td>
                          <td className="num">{money(row.commission)}</td>
                          <td
                            className="num strong"
                            style={{ color: row.grossProfit < 0 ? "var(--danger)" : "var(--success)" }}
                          >
                            {money(row.grossProfit)}
                          </td>
                          <td className="num">{margin.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "expenses" && (
        <div className="stack">
          <div className="grid cols-4">
            <StatCard
              label="Total expenses"
              value={money(periodExpenses.reduce((sum, expense) => sum + expense.amount, 0))}
              meta={periodLabels[period]}
              icon={<ReceiptText />}
              tone="amber"
            />
            <StatCard
              label="Rental & utilities"
              value={money(
                periodExpenses
                  .filter((expense) =>
                    ["Rental", "Electricity", "Water"].includes(expense.category),
                  )
                  .reduce((sum, expense) => sum + expense.amount, 0),
              )}
              meta="Fixed operating overhead"
              icon={<Landmark />}
            />
            <StatCard
              label="Operational costs"
              value={money(
                periodExpenses
                  .filter((expense) => expense.category === "Operational Cost")
                  .reduce((sum, expense) => sum + expense.amount, 0),
              )}
              meta="Supplies, cleaning and consumables"
              icon={<Truck />}
              tone="blue"
            />
            <StatCard
              label="Other expenses"
              value={money(
                periodExpenses
                  .filter((expense) => expense.category === "Other Expenses")
                  .reduce((sum, expense) => sum + expense.amount, 0),
              )}
              meta={`${periodExpenses.length} ledger entries`}
              icon={<CircleDollarSign />}
              tone="purple"
            />
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Expense ledger</h3>
                <p>Rental, utilities, operations and miscellaneous costs.</p>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => setExpenseOpen(true)}>
                <Plus />
                Add expense
              </button>
            </div>
            {periodExpenses.length === 0 ? (
              <EmptyState
                icon={<ReceiptText size={22} />}
                title="No expenses in this period"
                message="Record rent, utility bills, operational supplies and other costs so the owner dashboard reflects a true net profit."
                action={
                  <button className="btn btn-primary" onClick={() => setExpenseOpen(true)}>
                    Add expense
                  </button>
                }
              />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Category</th>
                      <th>Description</th>
                      <th className="num">Amount</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {periodExpenses.map((expense) => (
                      <tr key={expense.id}>
                        <td>
                          <div className="cell-main">{shortDate(expense.date)}</div>
                          <div className="cell-sub">{timeAgo(expense.date)}</div>
                        </td>
                        <td>
                          <span className="chip">{expense.category}</span>
                        </td>
                        <td className="small">{expense.description}</td>
                        <td className="num strong">{money(expense.amount)}</td>
                        <td>
                          <button
                            className="btn btn-ghost btn-sm"
                            title="Delete expense"
                            onClick={() => setDeleteTarget(expense.id)}
                          >
                            <Trash2 />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "payables" && (
        <div className="stack">
          <div className="grid cols-4">
            <StatCard
              label="Total supplier payables"
              value={money(unpaidCredit.reduce((sum, purchase) => sum + purchase.amount, 0))}
              meta={`${unpaidCredit.length} unpaid credit invoice${unpaidCredit.length === 1 ? "" : "s"}`}
              icon={<Truck />}
              tone={unpaidCredit.length ? "amber" : "brand"}
            />
            <StatCard
              label="Overdue"
              value={money(overdueSupplier.reduce((sum, purchase) => sum + purchase.amount, 0))}
              meta={`${overdueSupplier.length} invoice${overdueSupplier.length === 1 ? "" : "s"} past due`}
              icon={<AlertTriangle />}
              tone="red"
              negative={overdueSupplier.length > 0}
            />
            <StatCard
              label="Due this week"
              value={money(dueSoonSupplier.reduce((sum, purchase) => sum + purchase.amount, 0))}
              meta="Within the next 7 days"
              icon={<CalendarDays />}
              tone="amber"
            />
            <StatCard
              label="Suppliers"
              value={state.suppliers.length}
              meta={`${state.purchases.length} purchases recorded`}
              icon={<Users />}
              tone="blue"
            />
          </div>

          {overdueSupplier.length > 0 && (
            <Alert tone="danger" icon={<AlertTriangle />} title="Settle overdue supplier invoices">
              {overdueSupplier.map((purchase) => (
                <div key={purchase.id} className="history-line">
                  <span>
                    {supplierName(purchase.supplierId)} · {purchase.invoiceNo}
                  </span>
                  <span className="strong">
                    {money(purchase.amount)} · {purchase.dueDate ? shortDate(purchase.dueDate) : ""}
                  </span>
                </div>
              ))}
            </Alert>
          )}

          {dueSoonSupplier.length > 0 && (
            <Alert tone="warn" icon={<CalendarDays />} title="Supplier credit due soon">
              {dueSoonSupplier.length} invoice{dueSoonSupplier.length === 1 ? "" : "s"} worth{" "}
              {money(dueSoonSupplier.reduce((sum, purchase) => sum + purchase.amount, 0))} due
              within seven days.
            </Alert>
          )}

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Supplier credit & purchases</h3>
                <p>Cash purchases and credit invoices with their agreed payment periods.</p>
              </div>
              <Link className="btn btn-secondary btn-sm" to="/stores">
                <Truck />
                Open stores
              </Link>
            </div>
            {state.purchases.length === 0 ? (
              <EmptyState
                icon={<Truck size={22} />}
                title="No supplier purchases yet"
                message="Record parts purchases in Stores. Credit invoices appear here with due dates and outstanding balances."
                action={
                  <Link className="btn btn-primary" to="/stores">
                    Record a purchase
                  </Link>
                }
              />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Supplier</th>
                      <th>Terms</th>
                      <th>Due</th>
                      <th className="num">Amount</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {[...state.purchases]
                      .sort((a, b) => (a.dueDate ?? a.purchaseDate).localeCompare(b.dueDate ?? b.purchaseDate))
                      .map((purchase) => {
                        const supplier = state.suppliers.find(
                          (entry) => entry.id === purchase.supplierId,
                        );
                        const dueIn = purchase.dueDate ? daysUntil(purchase.dueDate) : null;
                        return (
                          <tr key={purchase.id}>
                            <td>
                              <div className="cell-main">{purchase.invoiceNo}</div>
                              <div className="cell-sub">
                                {purchase.id} · {shortDate(purchase.purchaseDate)}
                              </div>
                            </td>
                            <td>
                              <div className="cell-main">{supplier?.name ?? "—"}</div>
                              <div className="cell-sub">{supplier?.contactPerson ?? supplier?.phone}</div>
                            </td>
                            <td>
                              <span className="chip">
                                {purchase.type}
                                {purchase.type === "Credit" ? ` · ${purchase.creditDays}d` : ""}
                              </span>
                            </td>
                            <td>
                              {purchase.dueDate ? (
                                <>
                                  <div className="small">{shortDate(purchase.dueDate)}</div>
                                  <div
                                    className={`cell-sub ${
                                      purchase.status === "Unpaid" && dueIn !== null && dueIn < 0
                                        ? "overdue-text"
                                        : ""
                                    }`}
                                  >
                                    {purchase.status === "Paid"
                                      ? "Settled"
                                      : dueIn === null
                                        ? ""
                                        : dueIn < 0
                                          ? `Overdue ${Math.abs(dueIn)}d`
                                          : dueIn === 0
                                            ? "Due today"
                                            : `In ${dueIn}d`}
                                  </div>
                                </>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="num strong">{money(purchase.amount)}</td>
                            <td>
                              <StatusBadge status={purchase.status} />
                            </td>
                            <td>
                              <div className="row" style={{ justifyContent: "flex-end" }}>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  title="View purchased parts"
                                  onClick={() => setPartsPurchaseId(purchase.id)}
                                >
                                  <Package />
                                  Parts
                                </button>
                                {purchase.type === "Credit" && purchase.status === "Unpaid" && (
                                  <>
                                    <button
                                      className="btn btn-ghost btn-sm"
                                      title="WhatsApp supplier"
                                      onClick={() => remindSupplier(purchase.id)}
                                    >
                                      <MessageCircle />
                                    </button>
                                    <button
                                      className="btn btn-soft btn-sm"
                                      onClick={() => openPayPurchase(purchase.id, purchase.amount)}
                                    >
                                      <Wallet />
                                      Settle
                                    </button>
                                  </>
                                )}
                                {purchase.status === "Paid" && (
                                  <>
                                    <span className="tiny muted">Settled</span>
                                    <button
                                      className="btn btn-ghost btn-sm"
                                      title="Thermal payment voucher"
                                      onClick={() =>
                                        printThermalSupplierPaymentVoucher(
                                          purchase,
                                          supplier?.name ?? "Supplier",
                                          state.settings,
                                          state.bankAccounts.find(
                                            (account) => account.id === purchase.bankAccountId,
                                          )?.name,
                                        )
                                      }
                                    >
                                      <Printer />
                                      Voucher
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "credits" && <CreditLedger />}

      {tab === "petty-cash" && <PettyCashPanel />}

      {tab === "bank" && <BankAccountsPanel />}

      {tab === "cheques" && <CustomerChequePanel />}

      {tab === "supplier-cheques" && <SupplierChequeLoanPanel />}

      {tab === "payroll" && (
        <div className="stack">
          <div className="row-between wrap">
            <span className="tiny muted">
              {monthLabel} · working days {nextWorkingDayLabel(state.settings.workingDays)}
            </span>
            <span className="badge badge-slate">
              EPF {state.settings.epfEmployeeRate}% employee · {state.settings.epfEmployerRate}%
              employer · ETF {state.settings.etfRate}%
            </span>
          </div>

          <div className="grid cols-4">
            <StatCard
              label="Gross payroll"
              value={money(payrollTotal)}
              meta={`${monthlyWorkers.length} monthly worker${monthlyWorkers.length === 1 ? "" : "s"} · ${monthLabel}`}
              icon={<Users />}
            />
            <StatCard
              label="Net payable"
              value={money(payrollNet)}
              meta="After loans, EPF and deductions"
              icon={<Wallet />}
              tone="blue"
            />
            <StatCard
              label="Commissions"
              value={money(payrollCommission)}
              meta="Earned from this month's labour"
              icon={<TrendingUp />}
              tone="amber"
            />
            <StatCard
              label="EPF & ETF"
              value={money(epfEmployeeTotal + epfEmployerTotal + etfTotal)}
              meta={`Employee ${money(epfEmployeeTotal)} · employer ${money(epfEmployerTotal + etfTotal)}`}
              icon={<Landmark />}
              tone="purple"
            />
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Monthly payroll statement</h3>
                <p>
                  Basic salary is earned from attendance: present days plus the owner-allowed off
                  days. Loans are deducted automatically.
                </p>
              </div>
              <div className="row wrap">
                <span className="badge badge-amber">{monthLabel}</span>
                <button className="btn btn-secondary btn-sm" onClick={openLoanModal}>
                  <Plus />
                  Staff loan
                </button>
              </div>
            </div>
            {payrollRows.length === 0 ? (
              <EmptyState
                icon={<Users size={22} />}
                title="No monthly workers on payroll"
                message="Add workers and set salary, commission and EPF/ETF options in Team & HR. Daily workers are paid from the daily wage section."
                action={
                  <Link className="btn btn-primary" to="/team">
                    Open team
                  </Link>
                }
              />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Worker</th>
                      <th>Attendance</th>
                      <th className="num">Basic</th>
                      <th className="num">Commission</th>
                      <th className="num">Loan</th>
                      <th className="num">EPF employee</th>
                      <th className="num">Net pay</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {payrollRows.map((row) => {
                      const worker = state.workers.find((entry) => entry.id === row.workerId);
                      const issued = state.payslips.some(
                        (payslip) =>
                          payslip.workerId === row.workerId &&
                          payslip.periodStart === monthBounds().start,
                      );
                      return (
                        <tr key={row.workerId}>
                          <td>
                            <div className="cell-main">
                              {row.name}{" "}
                              {issued && <span className="badge badge-green">Slip issued</span>}
                            </div>
                            <div className="cell-sub">
                              {worker?.bankName ?? "Bank not set"} ·{" "}
                              {worker?.accountNumber ?? "—"}
                            </div>
                          </td>
                          <td>
                            <div className="small">
                              {row.presentDays + row.paidOffDays}/{row.workingDays} payable days
                            </div>
                            <div className="cell-sub">
                              {row.presentDays} present · {row.absentDays} absent · {row.paidOffDays}{" "}
                              paid off
                            </div>
                          </td>
                          <td className="num">{money(row.basic)}</td>
                          <td className="num">{money(row.commission)}</td>
                          <td className="num">{money(row.loanDeduction)}</td>
                          <td className="num">{money(row.epfEmployee)}</td>
                          <td className="num strong">{money(row.net)}</td>
                          <td>
                            <button
                              className="btn btn-soft btn-sm"
                              onClick={() => openPayslip(row.workerId)}
                            >
                              <FileText />
                              Payslip
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid cols-2">
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Daily wages</h3>
                  <p>Paid at the end of the day from attendance, with optional commission.</p>
                </div>
                <label className="checkbox-row tiny">
                  <input
                    type="checkbox"
                    checked={wageCommission}
                    onChange={(event) => setWageCommission(event.target.checked)}
                  />
                  Include commission
                </label>
              </div>
              {dailyWageRows.length === 0 ? (
                <EmptyState
                  icon={<Banknote size={22} />}
                  title="No daily-wage workers"
                  message="Set a worker's pay type to Daily in Team & HR, then pay their accrued days and commission here."
                  action={
                    <Link className="btn btn-primary" to="/team">
                      Open team
                    </Link>
                  }
                />
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Worker</th>
                        <th className="num">Unpaid</th>
                        <th className="num">Amount</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {dailyWageRows.map(({ worker, due }) => (
                        <tr key={worker.id}>
                          <td>
                            <div className="cell-main">{worker.fullName}</div>
                            <div className="cell-sub">
                              Since {shortDate(due.from)} · {money(worker.dailyRate)}/day
                            </div>
                          </td>
                          <td className="num">
                            <div className="small">{due.days} day{due.days === 1 ? "" : "s"}</div>
                            <div className="cell-sub">
                              {money(due.baseAmount)}
                              {due.commissionAmount > 0
                                ? ` + ${money(due.commissionAmount)} commission`
                                : wageCommission
                                  ? ""
                                  : " · commission excluded"}
                            </div>
                          </td>
                          <td className="num strong">{money(due.amount)}</td>
                          <td>
                            <button
                              className="btn btn-primary btn-sm"
                              disabled={due.amount <= 0}
                              onClick={() => payWage(worker.id)}
                            >
                              <ReceiptText />
                              Pay & receipt
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Staff loans & advances</h3>
                  <p>Outstanding balance {money(loanOutstanding)} is deducted from net salary.</p>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={openLoanModal}>
                  <Plus />
                  Add loan
                </button>
              </div>
              {state.staffLoans.length === 0 ? (
                <EmptyState
                  icon={<Landmark size={22} />}
                  title="No staff loans"
                  message="Record salary advances or staff loans with a monthly deduction. Payslips reduce the balance automatically."
                />
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Worker</th>
                        <th className="num">Balance</th>
                        <th className="num">Monthly</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.staffLoans.map((loan) => {
                        const worker = state.workers.find(
                          (entry) => entry.id === loan.workerId,
                        );
                        return (
                          <tr key={loan.id}>
                            <td>
                              <div className="cell-main">{worker?.fullName ?? "Unknown worker"}</div>
                              <div className="cell-sub">
                                {money(loan.principal)} · {loan.reason}
                              </div>
                            </td>
                            <td className="num strong">{money(loan.balance)}</td>
                            <td className="num">{money(loan.monthlyDeduction)}</td>
                            <td>
                              <StatusBadge status={loan.status} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Payslip & wage receipts</h3>
                <p>Issued payslips for monthly staff and receipts for daily wage payments.</p>
              </div>
              <span className="badge badge-slate">
                {state.payslips.length} payslip{state.payslips.length === 1 ? "" : "s"} ·{" "}
                {state.wagePayouts.length} wage receipt
                {state.wagePayouts.length === 1 ? "" : "s"}
              </span>
            </div>
            {state.payslips.length === 0 && state.wagePayouts.length === 0 ? (
              <EmptyState
                icon={<FileText size={22} />}
                title="No payroll documents yet"
                message="Issue a payslip or pay a daily wage to create a PDF or printed receipt."
              />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Worker</th>
                      <th>Period / days</th>
                      <th className="num">Gross</th>
                      <th className="num">Net paid</th>
                      <th>Paid</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {state.payslips.map((payslip) => {
                      const worker = state.workers.find(
                        (entry) => entry.id === payslip.workerId,
                      );
                      return (
                        <tr key={payslip.id}>
                          <td>
                            <div className="cell-main">Payslip</div>
                            <div className="cell-sub">
                              Loan {money(payslip.loanDeduction)} · EPF{" "}
                              {money(payslip.epfEmployee)}
                            </div>
                          </td>
                          <td className="small">{worker?.fullName ?? "—"}</td>
                          <td className="tiny">
                            {shortDate(payslip.periodStart)} — {shortDate(payslip.periodEnd)}
                            <div className="cell-sub">
                              {payslip.workedDays}/{payslip.workingDays} days
                            </div>
                          </td>
                          <td className="num">{money(payslip.gross)}</td>
                          <td className="num strong">{money(payslip.net)}</td>
                          <td className="tiny muted">{shortDate(payslip.paidAt)}</td>
                          <td>
                            <div className="row" style={{ justifyContent: "flex-end", gap: 3 }}>
                              <button
                                className="btn btn-ghost btn-sm"
                                title="Download payslip PDF"
                                onClick={() => downloadPayslip(payslip.id)}
                              >
                                <Download />
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                title="Send payslip on WhatsApp"
                                onClick={() => shareLatestPayslip(payslip.id)}
                              >
                                <MessageCircle />
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                title="Thermal payslip"
                                disabled={!worker}
                                onClick={() =>
                                  worker && printThermalPayslip(payslip, worker, state.settings)
                                }
                              >
                                <Printer />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {state.wagePayouts.map((payout) => {
                      const worker = state.workers.find(
                        (entry) => entry.id === payout.workerId,
                      );
                      return (
                        <tr key={payout.id}>
                          <td>
                            <div className="cell-main">Wage receipt</div>
                            <div className="cell-sub">{payout.receiptNo}</div>
                          </td>
                          <td className="small">{worker?.fullName ?? "—"}</td>
                          <td className="tiny">
                            {payout.days} day{payout.days === 1 ? "" : "s"}
                            <div className="cell-sub">
                              Commission {payout.commissionIncluded ? "included" : "excluded"}
                            </div>
                          </td>
                          <td className="num">{money(payout.baseAmount + payout.commissionAmount)}</td>
                          <td className="num strong">{money(payout.amount)}</td>
                          <td className="tiny muted">{shortDate(payout.paidAt)}</td>
                          <td>
                            <button
                              className="btn btn-ghost btn-sm"
                              title="Print wage receipt"
                              disabled={!worker}
                              onClick={() =>
                                worker && printWageReceipt(payout, worker, state.settings)
                              }
                            >
                              <Printer />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="alert alert-info">
            <TrendingDown />
            <div>
              <strong>Attendance-driven payroll</strong>
              Basic salary uses the morning attendance register and the owner's working-day and
              allowed-off-day settings. Commission and salary changes remain owner-controlled in
              Team & HR. Daily-wage staff are paid from the daily wage panel with a receipt.
            </div>
          </div>
        </div>
      )}

      {tab === "insurance" && (
        <div className="stack">
          <div className="grid cols-4">
            <StatCard
              label="Insurance receivables"
              value={money(pnl.insuranceReceivables)}
              meta="Billed less cheques received"
              icon={<ShieldCheck />}
              tone={pnl.insuranceReceivables > 0 ? "amber" : "brand"}
            />
            <StatCard
              label="Open claims"
              value={openClaims.length}
              meta={`${insuranceClaims.length} total claims`}
              icon={<FileText />}
              tone="blue"
            />
            <StatCard
              label="Salvage pending"
              value={salvagePending}
              meta="Workshop duty after release"
              icon={<Truck />}
              tone={salvagePending > 0 ? "red" : "brand"}
            />
            <StatCard
              label="Insurance billings"
              value={money(pnl.insuranceSales)}
              meta={`${periodLabels[period]} · billed to insurers`}
              icon={<Banknote />}
              tone="purple"
            />
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Insurance claims & cheque tracking</h3>
                <p>
                  Estimate, parts approval, salvage, insurance bill and cheque settlement for
                  every insured job.
                </p>
              </div>
              <span className="badge badge-slate">{openClaims.length} open</span>
            </div>
            {insuranceClaims.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck size={22} />}
                title="No insurance claims"
                message="Open an insurance claim from a job card to track approvals, salvage and insurer payments."
              />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Claim / job</th>
                      <th>Insurer</th>
                      <th>Approvals</th>
                      <th>Salvage</th>
                      <th className="num">Bill</th>
                      <th className="num">Cheque</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {insuranceClaims.map((claim) => {
                      const job = state.jobCards.find(
                        (entry) => entry.id === claim.jobCardId,
                      );
                      return (
                        <tr key={claim.id}>
                          <td>
                            <Link className="cell-main" to={`/jobs/${claim.jobCardId}`}>
                              {claim.claimNo}
                            </Link>
                            <div className="cell-sub">
                              {job?.vehicleNo ?? claim.jobCardId} · {job?.customerName ?? "—"}
                            </div>
                          </td>
                          <td>
                            <div className="small">{insurerName(claim.insurerId)}</div>
                            <div className="cell-sub">Policy {claim.policyNo}</div>
                          </td>
                          <td className="tiny">
                            Estimate {claim.estimateStatus}
                            <div className="cell-sub">Parts {claim.partsStatus}</div>
                          </td>
                          <td className="tiny">
                            {claim.salvageStatus}
                            <div className="cell-sub">
                              {claim.releaseOrderNo
                                ? `Release ${claim.releaseOrderNo}`
                                : "Release note pending"}
                            </div>
                          </td>
                          <td className="num">
                            {claim.insuranceBillAmount
                              ? money(claim.insuranceBillAmount)
                              : "—"}
                            <div className="cell-sub">{claim.insuranceBillNo ?? ""}</div>
                          </td>
                          <td className="num">
                            {claim.chequeAmount ? money(claim.chequeAmount) : "—"}
                            <div className="cell-sub">{claim.chequeNo ?? ""}</div>
                          </td>
                          <td>
                            <StatusBadge status={claim.status} />
                          </td>
                          <td>
                            <div className="row" style={{ justifyContent: "flex-end", gap: 3 }}>
                              <button
                                className="btn btn-soft btn-sm"
                                onClick={() => openChequeModal(claim.id)}
                                disabled={claim.status === "Settled"}
                              >
                                <Banknote />
                                Cheque
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => settleClaim(claim.id)}
                                title="Settle claim"
                                disabled={!claim.chequeAmount || claim.status === "Settled"}
                              >
                                <ShieldCheck />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="alert alert-brand">
            <ShieldCheck />
            <div>
              A vehicle can be released on the insurer release note without waiting for the cheque
              or salvage. Per-part salvage submission stays a workshop duty and is recorded against
              each insurance job. Settled cheques post to the ledger as insurance settlements.
            </div>
          </div>
        </div>
      )}

      <Modal
        open={Boolean(payslipWorker && payslipRow)}
        onClose={() => setPayslipTarget(null)}
        title="Issue payslip"
        subtitle={
          payslipWorker && payslipRow
            ? `${payslipWorker.fullName} · ${monthLabel}`
            : undefined
        }
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setPayslipTarget(null)}>
              Cancel
            </button>
            <button className="btn btn-soft" onClick={() => issuePayslip(false)}>
              <FileText />
              Save payslip
            </button>
            <button className="btn btn-primary" onClick={() => issuePayslip(true)}>
              <Download />
              Save & PDF
            </button>
          </>
        }
      >
        {payslipWorker && payslipRow && (
          <div className="stack">
            <div className="kv">
              <span>Attendance</span>
              <span>
                {payslipRow.presentDays + payslipRow.paidOffDays} of {payslipRow.workingDays}{" "}
                payable days
              </span>
            </div>
            <div className="kv">
              <span>Basic salary</span>
              <span>{money(payslipRow.basic)}</span>
            </div>
            <div className="kv">
              <span>Labour commission</span>
              <span>{money(payslipRow.commission)}</span>
            </div>
            <div className="kv strong">
              <span>Gross pay</span>
              <span>{money(payslipRow.gross)}</span>
            </div>
            <div className="divider" />
            <div className="kv">
              <span>Staff loan deduction</span>
              <span>− {money(payslipRow.loanDeduction)}</span>
            </div>
            <div className="kv">
              <span>EPF employee ({state.settings.epfEmployeeRate}%)</span>
              <span>− {money(payslipRow.epfEmployee)}</span>
            </div>
            <div className="form-grid">
              <Field label="Other deductions (LKR)">
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={payslipOther}
                  onChange={(event) => setPayslipOther(event.target.value)}
                />
              </Field>
              <Field label="Note" hint="Shown on the payslip PDF.">
                <input
                  className="input"
                  placeholder="Paid by bank transfer"
                  value={payslipNote}
                  onChange={(event) => setPayslipNote(event.target.value)}
                />
              </Field>
            </div>
            <div className="kv strong" style={{ fontSize: 15 }}>
              <span>Net pay</span>
              <span>{money(payslipNet)}</span>
            </div>
            <div className="tiny muted">
              Employer contributions: EPF {money(payslipRow.epfEmployer)} · ETF{" "}
              {money(payslipRow.etfEmployer)} (not deducted from the worker).
            </div>
            <Alert tone="info" title="Loan balance updates automatically">
              Saving this payslip reduces the worker's active staff loan balance by{" "}
              {money(payslipRow.loanDeduction)}. A PDF can be downloaded now and shared on
              WhatsApp from the payslip history.
            </Alert>
          </div>
        )}
      </Modal>

      <Modal
        open={loanOpen}
        onClose={() => setLoanOpen(false)}
        title="Record staff loan or salary advance"
        subtitle="Deducted automatically from net salary each month."
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setLoanOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveLoan}>
              <Landmark />
              Save loan
            </button>
          </>
        }
      >
        <div className="stack">
          <div className="form-grid">
            <Field label="Worker" required full>
              <select
                className="select"
                value={loanForm.workerId}
                onChange={(event) =>
                  setLoanForm({ ...loanForm, workerId: event.target.value })
                }
              >
                <option value="">Choose worker</option>
                {activeWorkers.map((worker) => (
                  <option key={worker.id} value={worker.id}>
                    {worker.fullName} · {worker.payType} pay
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Loan amount (LKR)" required>
              <input
                className="input"
                type="number"
                min={1}
                value={loanForm.principal}
                onChange={(event) =>
                  setLoanForm({ ...loanForm, principal: event.target.value })
                }
              />
            </Field>
            <Field label="Monthly deduction (LKR)" required>
              <input
                className="input"
                type="number"
                min={1}
                value={loanForm.monthlyDeduction}
                onChange={(event) =>
                  setLoanForm({ ...loanForm, monthlyDeduction: event.target.value })
                }
              />
            </Field>
            <Field label="Reason" required full>
              <input
                className="input"
                placeholder="e.g. School fees / salary advance"
                value={loanForm.reason}
                onChange={(event) => setLoanForm({ ...loanForm, reason: event.target.value })}
              />
            </Field>
          </div>
          <Alert tone="warn" title="Owner-controlled payroll">
            Loans and salary advances reduce the net pay on the next payslip. The outstanding
            balance is tracked until settled and is included in the owner's P&L staff costs.
          </Alert>
        </div>
      </Modal>

      <Modal
        open={Boolean(chequeClaim)}
        onClose={() => setChequeTarget(null)}
        title="Record insurer cheque"
        subtitle={
          chequeClaim
            ? `${insurerName(chequeClaim.insurerId)} · claim ${chequeClaim.claimNo}`
            : undefined
        }
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setChequeTarget(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveCheque}>
              <Banknote />
              Record cheque
            </button>
          </>
        }
      >
        {chequeClaim && (
          <div className="stack">
            <div className="kv">
              <span>Insurance bill</span>
              <span>
                {chequeClaim.insuranceBillAmount
                  ? money(chequeClaim.insuranceBillAmount)
                  : "Not billed"}
              </span>
            </div>
            <div className="kv">
              <span>Outstanding</span>
              <span>
                {money(
                  Math.max(
                    0,
                    (chequeClaim.insuranceBillAmount ?? 0) - (chequeClaim.chequeAmount ?? 0),
                  ),
                )}
              </span>
            </div>
            <div className="form-grid">
              <Field label="Cheque number" required>
                <input
                  className="input"
                  value={chequeNo}
                  onChange={(event) => setChequeNo(event.target.value)}
                />
              </Field>
              <Field label="Cheque amount (LKR)" required>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={chequeAmount}
                  onChange={(event) => setChequeAmount(event.target.value)}
                />
              </Field>
              <Field label="Bank" required>
                <input
                  className="input"
                  placeholder="Ceylinco General Insurance"
                  value={chequeBank}
                  onChange={(event) => setChequeBank(event.target.value)}
                />
              </Field>
              <Field label="Branch" required>
                <input
                  className="input"
                  placeholder="Colombo 02"
                  value={chequeBranch}
                  onChange={(event) => setChequeBranch(event.target.value)}
                />
              </Field>
              <Field label="Cheque date" required hint="Post-dated cheques stay In Safe until deposited.">
                <input
                  className="input"
                  type="date"
                  value={chequeDate}
                  onChange={(event) => setChequeDate(event.target.value)}
                />
              </Field>
              <Field label="Deposit account">
                <select
                  className="select"
                  value={chequeAccountId}
                  onChange={(event) => setChequeAccountId(event.target.value)}
                >
                  <option value="">No account</option>
                  {state.bankAccounts.filter((account) => account.active).map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Alert tone="info" title="Release note controls the gate">
              The vehicle may already be released on the insurer release note. Recording the
              cheque does not affect release — it only updates receivables and the settlement
              trail.
            </Alert>
          </div>
        )}
      </Modal>

      <Modal
        open={expenseOpen}
        onClose={() => setExpenseOpen(false)}
        title="Record an expense"
        subtitle="Rent, utilities, operational costs and other spending."
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setExpenseOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveExpense}>
              <Plus />
              Save expense
            </button>
          </>
        }
      >
        <div className="stack">
          <div className="form-grid">
            <Field label="Category" required>
              <select
                className="select"
                value={form.category}
                onChange={(event) =>
                  setForm({ ...form, category: event.target.value as ExpenseCategory })
                }
              >
                {expenseCategories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </Field>
            <Field label="Date" required>
              <input
                className="input"
                type="date"
                value={form.date}
                onChange={(event) => setForm({ ...form, date: event.target.value })}
              />
            </Field>
            <Field label="Amount (LKR)" required>
              <input
                className="input"
                type="number"
                min={0}
                placeholder="0"
                value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
              />
            </Field>
            <Field label="Description" required full>
              <input
                className="input"
                placeholder="e.g. CEB bill — workshop & compressor"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </Field>
          </div>
          <Alert tone="info" icon={<ReceiptText />}>
            Expenses reduce net profit immediately. Supplier parts purchases are tracked
            separately under supplier credit.
          </Alert>
        </div>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete this expense?"
        size="narrow"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={confirmDeleteExpense}>
              <Trash2 />
              Delete expense
            </button>
          </>
        }
      >
        <Alert tone="danger" title="This affects the P&L">
          The expense will be removed from the ledger and net profit will increase by the
          deleted amount. This cannot be undone.
        </Alert>
      </Modal>
      <Modal
        open={Boolean(payPurchase)}
        onClose={() => setPayTarget(null)}
        title="Settle supplier invoice"
        subtitle={
          payPurchase
            ? `${payPurchase.invoiceNo} · ${supplierName(payPurchase.supplierId)} · ${money(payPurchase.amount)}`
            : undefined
        }
        size="wide"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setPayTarget(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={savePurchasePayment}>
              <Wallet />
              {payMethod === "Cheque" ? "Issue post-dated cheque" : "Mark paid"}
            </button>
          </>
        }
      >
        {payPurchase && (
          <div className="stack">
            <div className="form-grid">
              <Field label="Payment method" required>
                <select
                  className="select"
                  value={payMethod}
                  onChange={(event) => setPayMethod(event.target.value as typeof payMethod)}
                >
                  <option value="Bank Transfer">Bank transfer</option>
                  <option value="Cash">Cash</option>
                  <option value="Cheque">Post-dated cheque</option>
                </select>
              </Field>
              {payMethod !== "Cheque" ? (
                <Field label="Pay from account" required={payMethod === "Bank Transfer"}>
                  <select
                    className="select"
                    value={payBankId}
                    onChange={(event) => setPayBankId(event.target.value)}
                  >
                    <option value="">No account</option>
                    {state.bankAccounts.filter((account) => account.active).map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <>
                  <Field label="Cheque number" required>
                    <input
                      className="input"
                      value={payChequeNo}
                      onChange={(event) => setPayChequeNo(event.target.value)}
                    />
                  </Field>
                  <Field label="Bank" required>
                    <input
                      className="input"
                      value={payChequeBank}
                      onChange={(event) => setPayChequeBank(event.target.value)}
                    />
                  </Field>
                  <Field label="Branch" required>
                    <input
                      className="input"
                      value={payChequeBranch}
                      onChange={(event) => setPayChequeBranch(event.target.value)}
                    />
                  </Field>
                  <Field label="Cheque date" required>
                    <input
                      className="input"
                      type="date"
                      value={payChequeDate}
                      onChange={(event) => setPayChequeDate(event.target.value)}
                    />
                  </Field>
                </>
              )}
            </div>
            <Alert tone={payMethod === "Cheque" ? "warn" : "info"}>
              {payMethod === "Cheque"
                ? "The cheque is held as a supplier PDC. The invoice is settled when the cheque clears, or you can take it back and pay cash."
                : "Only Accounting or Cashier can settle a supplier invoice. The balance is reduced immediately."}
            </Alert>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(partsPurchase)}
        onClose={() => setPartsPurchaseId(null)}
        title="Purchased parts on this supplier invoice"
        subtitle={
          partsPurchase
            ? `${partsPurchase.invoiceNo} · ${supplierName(partsPurchase.supplierId)} · ${money(partsPurchase.amount)}`
            : undefined
        }
        size="wide"
        footer={
          <button className="btn btn-secondary" onClick={() => setPartsPurchaseId(null)}>
            Close
          </button>
        }
      >
        {partsPurchase && (
          <div className="stack">
            <div className="grid cols-3">
              <div className="card">
                <div className="card-body">
                  <div className="kv">
                    <span>Invoice total</span>
                    <span>{money(partsPurchase.amount)}</span>
                  </div>
                  <div className="kv">
                    <span>Terms</span>
                    <span>{partsPurchase.type}{partsPurchase.type === "Credit" ? ` · ${partsPurchase.creditDays}d` : ""}</span>
                  </div>
                  <div className="kv">
                    <span>Status</span>
                    <span><StatusBadge status={partsPurchase.status} /></span>
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="card-body">
                  <div className="kv">
                    <span>Purchase date</span>
                    <span>{shortDate(partsPurchase.purchaseDate)}</span>
                  </div>
                  <div className="kv">
                    <span>Due date</span>
                    <span>{partsPurchase.dueDate ? shortDate(partsPurchase.dueDate) : "—"}</span>
                  </div>
                  <div className="kv">
                    <span>Goods confirmed by</span>
                    <span>{partsPurchase.goodsConfirmedBy ?? "—"}</span>
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="card-body">
                  <div className="kv">
                    <span>Lines</span>
                    <span>{partsPurchase.lines?.length ?? 0}</span>
                  </div>
                  <div className="kv">
                    <span>Paid by</span>
                    <span>{partsPurchase.paidBy ?? "—"}</span>
                  </div>
                  <div className="kv">
                    <span>Method</span>
                    <span>{partsPurchase.paymentMethod ?? "—"}</span>
                  </div>
                </div>
              </div>
            </div>
            {!partsPurchase.lines || partsPurchase.lines.length === 0 ? (
              <EmptyState
                icon={<Package size={22} />}
                title="No line details stored"
                message="This purchase was recorded before bulk invoice lines were introduced, or it is a single-value purchase."
              />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Part</th>
                      <th className="num">Qty</th>
                      <th className="num">Cost</th>
                      <th className="num">Selling price</th>
                      <th className="num">Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partsPurchase.lines.map((line) => (
                      <tr key={line.id}>
                        <td>
                          <div className="cell-main">{line.itemName}</div>
                          <div className="cell-sub">{line.itemId}</div>
                        </td>
                        <td className="num">{line.qty}</td>
                        <td className="num">{money(line.costPrice)}</td>
                        <td className="num">{money(line.sellingPrice ?? line.costPrice)}</td>
                        <td className="num strong">{money(line.qty * line.costPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
