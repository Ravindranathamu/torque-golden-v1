import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Download,
  MessageCircle,
  Percent,
  Phone,
  Plus,
  Printer,
  ReceiptText,
  Search,
  Send,
  ShieldCheck,
  Star,
  UserRound,
  Wallet,
  Wrench,
} from "lucide-react";
import { useApp } from "../state/AppStore";
import { featureEnabled } from "../lib/features";
import { pnlFor } from "../lib/analytics";
import { jobTotals, money, partIssueQty, shortDate, timeAgo, waLink } from "../lib/utils";
import { checkoutMessage } from "../lib/messages";
import {
  downloadInvoice,
  downloadVehicleBill,
  printAdvanceReceipt,
  printDriverCommissionChit,
  printInvoice,
  printVehicleBill,
  shareAdvanceReceiptWhatsApp,
  shareInvoiceWhatsApp,
  sharePdfFile,
  totalsForInvoice,
} from "../lib/invoice";
import { buildVehicleBillsPdf, printVehicleBills } from "../lib/ird";
import { CreditLedger } from "../components/CreditLedger";
import { EmptyState, Field, Modal, PageHeader, StatCard, StatusBadge, Tabs } from "../components/ui";
import { useToast } from "../components/Toast";
import type {
  AdvancePayment,
  DiscountType,
  JobCard,
  PaymentMethod,
  VehicleBill,
  VehicleBillPaymentMethod,
} from "../types";

type CashierTab = "queue" | "advances" | "settled" | "credits";

export function CashierPage() {
  const { state, currentUser, checkoutJob, recordAdvancePayment, prepareVehicleBill, settleVehicleBill } = useApp();
  const { push } = useToast();
  const [tab, setTab] = useState<CashierTab>("queue");
  const [checkoutTargetId, setCheckoutTargetId] = useState<string | null>(null);
  const [successJobId, setSuccessJobId] = useState<string | null>(null);
  const [discount, setDiscount] = useState("0");
  const [discountType, setDiscountType] = useState<DiscountType>("Fixed");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash");
  const [graceDays, setGraceDays] = useState("30");
  const [busy, setBusy] = useState("");
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [advanceJob, setAdvanceJob] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceMethod, setAdvanceMethod] = useState<AdvancePayment["method"]>("Cash");
  const [advanceNote, setAdvanceNote] = useState("");
  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatRate, setVatRate] = useState(String(state.settings.defaultVatRate ?? 18));
  const [customerTin, setCustomerTin] = useState("");
  const [printFormat, setPrintFormat] = useState<"thermal" | "a4">(
    state.settings.printerMode === "Standard_PC" ? "a4" : "thermal",
  );
  const [releaseBillId, setReleaseBillId] = useState<string | null>(null);
  const [releaseOrderNo, setReleaseOrderNo] = useState("");
  const [releaseAmount, setReleaseAmount] = useState("");
  const [paymentBillId, setPaymentBillId] = useState<string | null>(null);
  const [billPaymentMethod, setBillPaymentMethod] =
    useState<VehicleBillPaymentMethod>("Cash");
  const [billDiscount, setBillDiscount] = useState("0");
  const [prepareBillId, setPrepareBillId] = useState<string | null>(null);
  const [prepareVatEnabled, setPrepareVatEnabled] = useState(false);
  const [prepareDiscount, setPrepareDiscount] = useState("0");
  const [queueSearch, setQueueSearch] = useState("");
  const [expandedJobs, setExpandedJobs] = useState<string[]>([]);
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([]);
  const [amountPaid, setAmountPaid] = useState("");
  const [amountPaidTouched, setAmountPaidTouched] = useState(false);
  const [billAmount, setBillAmount] = useState("");

  const vatFeatureEnabled = featureEnabled(state.settings, "enable_vat_invoicing");
  const effectiveVat = vatFeatureEnabled && vatEnabled;
  const settled = state.jobCards
    .filter((job) => ["Paid", "Released on Credit", "Dispatched"].includes(job.status))
    .sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""));
  const progressingJobs = state.jobCards
    .filter((job) => !["Paid", "Released on Credit", "Dispatched"].includes(job.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const todayPnl = pnlFor(state, "today");
  const queueEntries = useMemo(() => {
    const grouped = new Map<string, VehicleBill[]>();
    state.vehicleBills.forEach((bill) => {
      const list = grouped.get(bill.jobCardId) ?? [];
      list.push(bill);
      grouped.set(bill.jobCardId, list);
    });
    const needle = queueSearch.trim().toLowerCase();
    return state.jobCards
      .map((job) => {
        const bills = [...(grouped.get(job.id) ?? [])].sort((a, b) =>
          a.createdAt.localeCompare(b.createdAt),
        );
        const open = bills.filter(
          (bill) => bill.status !== "Paid" && bill.status !== "Release Order",
        );
        return { job, bills, open };
      })
      .filter(({ job, bills, open }) => {
        if (bills.length > 0) {
          return (
            open.length > 0 &&
            !["Paid", "Released on Credit", "Dispatched"].includes(job.status)
          );
        }
        return job.status === "Repair Completed";
      })
      .filter(({ job }) => {
        if (!needle) return true;
        return `${job.vehicleNo} ${job.make} ${job.model} ${job.customerName} ${job.id} ${job.phone}`
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => {
        const aTime = a.job.completedAt ?? a.open[0]?.createdAt ?? a.job.createdAt;
        const bTime = b.job.completedAt ?? b.open[0]?.createdAt ?? b.job.createdAt;
        return aTime.localeCompare(bTime);
      });
  }, [state.vehicleBills, state.jobCards, queueSearch]);
  const releaseBill =
    state.vehicleBills.find((bill) => bill.id === releaseBillId) ?? null;
  const paymentBill =
    state.vehicleBills.find((bill) => bill.id === paymentBillId) ?? null;
  const prepareBill =
    state.vehicleBills.find((bill) => bill.id === prepareBillId) ?? null;
  const prepareVatRate = Math.max(
    0,
    prepareBill?.vatRate || state.settings.defaultVatRate || 18,
  );
  const prepareCharges = prepareBill
    ? billCharges(prepareBill, prepareDiscount, prepareVatEnabled)
    : null;
  const releaseNet = releaseBill ? billCharges(releaseBill).net : 0;
  const paymentNet = paymentBill ? billCharges(paymentBill).net : 0;
  const releaseApproved = Number(releaseAmount) || 0;
  const releaseShortfall = Math.max(
    0,
    releaseNet - Math.min(releaseNet, releaseApproved),
  );

  const target = state.jobCards.find((job) => job.id === checkoutTargetId) ?? null;
  const ticket = useMemo(() => {
    if (!target) return null;
    const baseDraft: JobCard = {
      ...target,
      discount: Number(discount) || 0,
      discountType,
      isVatInvoice: false,
      vatAmount: 0,
      vatRateApplied: 0,
    };
    const base = jobTotals(baseDraft, state.tasks, state.parts, state.workers);
    const rate = effectiveVat ? Math.max(0, Number(vatRate) || 0) : 0;
    const vatAmount = Math.round(base.total * rate) / 100;
    return jobTotals(
      {
        ...baseDraft,
        isVatInvoice: effectiveVat,
        vatRateApplied: rate,
        vatAmount,
      },
      state.tasks,
      state.parts,
      state.workers,
    );
  }, [
    target,
    discount,
    discountType,
    effectiveVat,
    vatRate,
    state.tasks,
    state.parts,
    state.workers,
  ]);

  const successJob = state.jobCards.find((job) => job.id === successJobId) ?? null;
  const successTotals = successJob
    ? jobTotals(successJob, state.tasks, state.parts, state.workers)
    : null;
  const successCredit = successJob
    ? state.customerCredits.find((credit) => credit.jobCardId === successJob.id) ?? null
    : null;
  const targetAdvances = target ? advancePaidFor(target.id) : 0;
  const targetBalance = ticket ? Math.max(0, ticket.total - targetAdvances) : 0;
  const canPartPay = paymentMethod === "Cash" || paymentMethod === "Card";
  const effectiveAmountPaid = amountPaidTouched
    ? amountPaid
    : String(Math.max(0, Math.round(targetBalance * 100) / 100));
  const collectedNow = canPartPay ? Number(effectiveAmountPaid) : targetBalance;
  const partialCheckout =
    canPartPay &&
    Number.isFinite(collectedNow) &&
    collectedNow >= 0 &&
    collectedNow < targetBalance - 0.5;
  const partialCredit = partialCheckout
    ? Math.max(0, Math.round((targetBalance - collectedNow) * 100) / 100)
    : 0;
  const billCollected = Number(billAmount);
  const billPartial =
    Boolean(paymentBill) &&
    Number.isFinite(billCollected) &&
    billCollected > 0 &&
    billCollected < paymentNet - 0.5;
  const targetClaim = target?.insuranceClaimId
    ? state.insuranceJobs.find((claim) => claim.id === target.insuranceClaimId) ?? null
    : null;
  const targetInsurer = targetClaim
    ? state.insuranceCompanies.find((insurer) => insurer.id === targetClaim.insurerId)
    : null;
  const advanceMatch = advanceJob.trim()
    ? state.jobCards.find(
        (job) =>
          job.id.toLowerCase() === advanceJob.trim().toLowerCase() ||
          job.vehicleNo.toLowerCase() === advanceJob.trim().toLowerCase(),
      ) ?? null
    : null;

  function openCheckout(jobId: string) {
    const job = state.jobCards.find((entry) => entry.id === jobId);
    setCheckoutTargetId(jobId);
    setSuccessJobId(null);
    setDiscount(String(job?.discount ?? 0));
    setDiscountType(job?.discountType ?? "Fixed");
    setPaymentMethod("Cash");
    setGraceDays("30");
    setVatEnabled(false);
    setVatRate(String(state.settings.defaultVatRate ?? 18));
    setCustomerTin(job?.customerTinNumber ?? "");
    if (job) {
      const total = jobTotals(job, state.tasks, state.parts, state.workers).total;
      setAmountPaid(String(Math.max(0, Math.round((total - advancePaidFor(job.id)) * 100) / 100)));
      setAmountPaidTouched(false);
    } else {
      setAmountPaid("");
      setAmountPaidTouched(false);
    }
  }

  function advancePaidFor(jobId: string): number {
    return state.advancePayments
      .filter(
        (advance) =>
          advance.jobCardId === jobId && advance.chequeStatus !== "Bounced",
      )
      .reduce((sum, advance) => sum + advance.amount, 0);
  }

  function confirmCheckout() {
    if (!target || !ticket) return;
    const value = Number(discount);
    if (!Number.isFinite(value) || value < 0) {
      push("Enter a valid discount.", "error");
      return;
    }
    if (discountType === "Percentage" && value > 100) {
      push("Percentage discount cannot exceed 100%.", "error");
      return;
    }
    if (paymentMethod === "Credit" && (!Number(graceDays) || Number(graceDays) < 1)) {
      push("Enter a credit grace period in days.", "error");
      return;
    }
    if (effectiveVat && (!Number.isFinite(Number(vatRate)) || Number(vatRate) < 0 || Number(vatRate) > 100)) {
      push("VAT rate must be between 0 and 100 percent.", "error");
      return;
    }
    if (canPartPay) {
      if (!Number.isFinite(collectedNow) || collectedNow < 0) {
        push("Enter the amount collected at the counter.", "error");
        return;
      }
      if (collectedNow > targetBalance + 0.5) {
        push(`The amount collected cannot exceed ${money(targetBalance)}.`, "error");
        return;
      }
      if (partialCheckout && collectedNow <= 0) {
        push(
          "Enter the amount the customer is paying now, or use the Credit release for a full credit sale.",
          "error",
        );
        return;
      }
      if (partialCheckout && (!Number(graceDays) || Number(graceDays) < 1)) {
        push("Enter a grace period for the part-payment balance.", "error");
        return;
      }
    }
    const result = checkoutJob(target.id, {
      paymentMethod,
      discount: value,
      discountType,
      graceDays:
        paymentMethod === "Credit" || partialCheckout ? Number(graceDays) : undefined,
      isVatInvoice: effectiveVat,
      vatRate: effectiveVat ? Number(vatRate) : 0,
      customerTinNumber: customerTin.trim() || undefined,
      amountPaid: canPartPay ? collectedNow : undefined,
    });
    if (!result.ok) {
      push(result.message ?? "Could not complete billing.", "error");
      return;
    }
    setSuccessJobId(target.id);
    setCheckoutTargetId(null);
    push(
      partialCheckout
        ? `Part payment recorded. ${money(partialCredit)} is on customer credit and the release needs owner/accounting approval.`
        : paymentMethod === "Credit"
          ? "Credit sale recorded. PRO notified for gate release."
          : "Payment collected. PRO notified for gate clearance.",
    );
  }

  function invoiceTotals(job: JobCard) {
    return totalsForInvoice(jobTotals(job, state.tasks, state.parts, state.workers));
  }

  function dueFor(job: JobCard) {
    return state.customerCredits.find((credit) => credit.jobCardId === job.id)?.dueDate;
  }

  function advanceBalanceAfter(advance: AdvancePayment) {
    const job = state.jobCards.find((entry) => entry.id === advance.jobCardId);
    if (!job) return undefined;
    const total = jobTotals(job, state.tasks, state.parts, state.workers).total;
    const paid = state.advancePayments
      .filter((entry) => entry.jobCardId === advance.jobCardId)
      .reduce((sum, entry) => sum + entry.amount, 0);
    return Math.max(0, total - paid);
  }

  function printAdvance(advance: AdvancePayment) {
    printAdvanceReceipt(advance, state.settings, advanceBalanceAfter(advance), printFormat);
  }

  async function shareAdvance(advance: AdvancePayment) {
    setBusy(`advance_${advance.id}`);
    try {
      const outcome = await shareAdvanceReceiptWhatsApp(
        advance,
        state.settings,
        `Hello ${advance.customerName}, we received your advance of ${money(advance.amount)} against job ${advance.jobCardId} (${advance.vehicleNo}). Receipt ${advance.receiptNo}. Thank you — ${state.settings.companyName}.`,
        advanceBalanceAfter(advance),
      );
      push(
        outcome === "queued"
          ? "Advance receipt sent automatically through WAHA."
          : outcome === "shared"
            ? "Advance receipt shared through your device."
            : "Receipt downloaded. Attach it in the WhatsApp chat that opened.",
        "info",
      );
    } catch {
      push("Could not prepare the advance receipt.", "error");
    } finally {
      setBusy("");
    }
  }

  function openAdvance() {
    setAdvanceJob("");
    setAdvanceAmount("");
    setAdvanceMethod("Cash");
    setAdvanceNote("");
    setAdvanceOpen(true);
  }

  function saveAdvance() {
    const amount = Number(advanceAmount);
    if (!advanceJob.trim()) {
      push("Enter the job number or vehicle number.", "error");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      push("Enter a valid advance amount.", "error");
      return;
    }
    const result = recordAdvancePayment(advanceJob.trim(), amount, advanceMethod, advanceNote);
    if (!result.ok) {
      push(result.message ?? "Could not record the advance.", "error");
      return;
    }
    push(`Advance ${result.reference} recorded for ${result.jobId}.`);
    setAdvanceOpen(false);
    setTab("advances");
  }

  function insuranceFor(job: JobCard) {
    const claim = job.insuranceClaimId
      ? state.insuranceJobs.find((entry) => entry.id === job.insuranceClaimId)
      : undefined;
    if (!claim) return undefined;
    return {
      claim,
      insurer: state.insuranceCompanies.find((entry) => entry.id === claim.insurerId),
    };
  }

  function insuranceForBill(bill: VehicleBill) {
    const job = state.jobCards.find((entry) => entry.id === bill.jobCardId);
    const claimId = bill.claimId ?? job?.insuranceClaimId;
    const claim = claimId
      ? state.insuranceJobs.find((entry) => entry.id === claimId)
      : undefined;
    if (!claim) return undefined;
    return {
      claim,
      insurer: state.insuranceCompanies.find((entry) => entry.id === claim.insurerId),
    };
  }

  function billNet(bill: VehicleBill) {
    return bill.netPayable ?? bill.amount;
  }

  function billOutstanding(bill: VehicleBill) {
    return bill.status === "Partially Paid"
      ? Math.max(0, billNet(bill) - (bill.paidAmount ?? 0))
      : billNet(bill);
  }

  function billTasks(bill: VehicleBill) {
    return bill.taskIds?.length
      ? state.tasks.filter((task) => bill.taskIds?.includes(task.id))
      : [];
  }

  function billParts(bill: VehicleBill) {
    return bill.partIds?.length
      ? state.parts.filter((part) => bill.partIds?.includes(part.id))
      : [];
  }

  function billCharges(
    bill: VehicleBill,
    discountInput: string = billDiscount,
    vatOverride?: boolean,
  ) {
    const job = state.jobCards.find((entry) => entry.id === bill.jobCardId);
    const tasks = billTasks(bill);
    const parts = billParts(bill);
    const dueParts =
      bill.kind === "Insurance"
        ? parts
        : parts.filter((part) => part.partSource !== "Customer_Brought");
    const labor =
      bill.laborSubtotal ?? tasks.reduce((sum, task) => sum + task.laborCost, 0);
    const partsTotal =
      bill.partsSubtotal ??
      dueParts.reduce(
        (sum, part) => sum + part.sellingPrice * partIssueQty(part),
        0,
      );
    const hasLines = tasks.length > 0 || parts.length > 0;
    const isShortfall = bill.kind === "Additional" && Boolean(bill.parentBillId);
    // Auto-created shortfall bills carry their payable total, not line items.
    const gross = hasLines ? Math.max(0, labor + partsTotal) : billNet(bill);
    const discount = Math.min(
      gross,
      Math.max(0, Math.round((Number(discountInput) || 0) * 100) / 100),
    );
    const supply = Math.max(0, gross - discount);
    // VAT is chosen in Cashier before the bill is sent, then fixed on the bill.
    const vatRate =
      !hasLines && isShortfall
        ? 0
        : vatOverride === undefined
          ? Math.max(
              0,
              bill.vatRate ??
                (job?.isVatInvoice ? state.settings.defaultVatRate ?? 18 : 0),
            )
          : vatOverride
            ? Math.max(
                0,
                bill.vatRate || state.settings.defaultVatRate || 18,
              )
            : 0;
    const vatAmount =
      isShortfall || vatRate === 0 ? 0 : Math.round(supply * vatRate) / 100;
    const net = Math.max(
      0,
      Math.round(
        (supply +
          vatAmount -
          (bill.policyExcess ?? 0) -
          (bill.depreciation ?? 0) -
          (bill.advance ?? 0)) *
          100,
      ) / 100,
    );
    return { supply, discount, vatRate, vatAmount, net };
  }

  function printBillDocument(bill: VehicleBill) {
    const job = state.jobCards.find((entry) => entry.id === bill.jobCardId);
    if (!job) {
      push("The job card for this bill could not be found.", "error");
      return;
    }
    printVehicleBill(
      job,
      bill,
      billTasks(bill),
      billParts(bill),
      state.settings,
      insuranceForBill(bill),
    );
  }

  function printFinalBill(job: JobCard, bills: VehicleBill[]) {
    const settled = bills.filter(
      (bill) => bill.status === "Paid" || bill.status === "Release Order",
    );
    const sections = new Set(
      bills.map((bill) => bill.sectionId).filter((id): id is string => Boolean(id)),
    );
    if (bills.length < 2 || sections.size < 2) {
      push(
        "The final bill is used when a vehicle has separate bills for different repair sections.",
        "info",
      );
      return;
    }
    if (settled.length !== bills.length) {
      push(
        "Every section bill must be settled before the final bill can be printed.",
        "error",
      );
      return;
    }
    const taskIds = Array.from(new Set(bills.flatMap((bill) => bill.taskIds ?? [])));
    const partIds = Array.from(new Set(bills.flatMap((bill) => bill.partIds ?? [])));
    const laborSubtotal = bills.reduce((sum, bill) => {
      const tasks = bill.taskIds?.length
        ? state.tasks.filter((task) => bill.taskIds?.includes(task.id))
        : [];
      return sum + (bill.laborSubtotal ?? tasks.reduce((total, task) => total + task.laborCost, 0));
    }, 0);
    const partsSubtotal = bills.reduce((sum, bill) => {
      const parts = bill.partIds?.length
        ? state.parts.filter((part) => bill.partIds?.includes(part.id))
        : [];
      return (
        sum +
        (bill.partsSubtotal ??
          parts.reduce(
            (total, part) => total + part.sellingPrice * partIssueQty(part),
            0,
          ))
      );
    }, 0);
    const discount = bills.reduce((sum, bill) => sum + (bill.discount ?? 0), 0);
    const vatAmount = bills.reduce((sum, bill) => sum + (bill.vatAmount ?? 0), 0);
    const policyExcess = bills.reduce((sum, bill) => sum + (bill.policyExcess ?? 0), 0);
    const depreciation = bills.reduce((sum, bill) => sum + (bill.depreciation ?? 0), 0);
    const advance = bills.reduce((sum, bill) => sum + (bill.advance ?? 0), 0);
    const net = bills.reduce((sum, bill) => sum + billNet(bill), 0);
    const synthetic: VehicleBill = {
      id: `final_${job.id}`,
      jobCardId: job.id,
      vehicleNo: job.vehicleNo,
      kind: "Customer",
      billNo: `FINAL-${job.id}`,
      amount: Math.round(net * 100) / 100,
      netPayable: Math.round(net * 100) / 100,
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.name,
      taskIds,
      partIds,
      laborSubtotal: Math.round(laborSubtotal * 100) / 100,
      partsSubtotal: Math.round(partsSubtotal * 100) / 100,
      discount: Math.round(discount * 100) / 100,
      vatRate: 0,
      vatAmount: Math.round(vatAmount * 100) / 100,
      policyExcess: policyExcess > 0 ? Math.round(policyExcess * 100) / 100 : undefined,
      depreciation: depreciation > 0 ? Math.round(depreciation * 100) / 100 : undefined,
      advance: advance > 0 ? Math.round(advance * 100) / 100 : undefined,
      notes:
        "Final bill — every repair section on this vehicle completed and settled. Totals all section bills.",
      status: "Paid",
    };
    printVehicleBill(
      job,
      synthetic,
      state.tasks.filter((task) => taskIds.includes(task.id)),
      state.parts.filter((part) => partIds.includes(part.id)),
      state.settings,
    );
    push("Final consolidated bill opened for printing.");
  }

  function toggleQueueJob(jobId: string) {
    setExpandedJobs((prev) =>
      prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId],
    );
  }

  function toggleBillSelection(billId: string) {
    setSelectedBillIds((prev) =>
      prev.includes(billId)
        ? prev.filter((id) => id !== billId)
        : [...prev, billId],
    );
  }

  function toggleAllJobBills(bills: VehicleBill[]) {
    const ids = bills.map((bill) => bill.id);
    setSelectedBillIds((prev) => {
      const allSelected = ids.every((id) => prev.includes(id));
      if (allSelected) return prev.filter((id) => !ids.includes(id));
      return Array.from(new Set([...prev, ...ids]));
    });
  }

  function selectedBillsFor(job: JobCard) {
    return state.vehicleBills
      .filter(
        (bill) =>
          bill.jobCardId === job.id && selectedBillIds.includes(bill.id),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  function printSelectedBills(job: JobCard) {
    const bills = selectedBillsFor(job);
    if (bills.length === 0) {
      push("Select at least one bill to print.", "info");
      return;
    }
    printVehicleBills(
      job,
      bills.map((bill) => ({
        bill,
        tasks: billTasks(bill),
        parts: billParts(bill),
        insurance: insuranceForBill(bill),
      })),
      state.settings,
    );
    push(
      `${bills.length} bill${bills.length === 1 ? "" : "s"} opened for printing as one set.`,
    );
  }

  async function shareSelectedBills(job: JobCard) {
    const bills = selectedBillsFor(job);
    if (bills.length === 0) {
      push("Select at least one bill to send.", "info");
      return;
    }
    setBusy(`bills_share_${job.id}`);
    try {
      const { blob, filename } = buildVehicleBillsPdf(
        job,
        bills.map((bill) => ({
          bill,
          tasks: billTasks(bill),
          parts: billParts(bill),
          insurance: insuranceForBill(bill),
        })),
        state.settings,
      );
      const total = bills.reduce((sum, bill) => sum + billNet(bill), 0);
      const outcome = await sharePdfFile(
        blob,
        filename,
        job.phone,
        `Hello ${job.customerName}, please find ${bills.length === 1 ? "the bill" : `${bills.length} bills`} for ${job.vehicleNo}. Total payable ${money(total)}. Thank you — ${state.settings.companyName}.`,
        `Bills ${job.vehicleNo}`,
        state.settings,
      );
      push(
        outcome === "queued"
          ? "Bills sent automatically through WAHA with the PDF attached."
          : outcome === "shared"
            ? "Bills shared through your device."
            : "Bill PDF downloaded. Attach it in the WhatsApp chat that opened.",
        "info",
      );
    } catch {
      push("Could not prepare the combined bill PDF.", "error");
    } finally {
      setBusy("");
    }
  }

  async function downloadBillDocument(bill: VehicleBill) {
    const job = state.jobCards.find((entry) => entry.id === bill.jobCardId);
    if (!job) {
      push("The job card for this bill could not be found.", "error");
      return;
    }
    setBusy(`bill_download_${bill.id}`);
    try {
      await downloadVehicleBill(
        job,
        bill,
        billTasks(bill),
        billParts(bill),
        state.settings,
        insuranceForBill(bill),
      );
      push(`${bill.billNo} PDF downloaded.`);
    } catch {
      push("Could not generate the bill PDF.", "error");
    } finally {
      setBusy("");
    }
  }

  function openPrepareBill(bill: VehicleBill) {
    const job = state.jobCards.find((entry) => entry.id === bill.jobCardId);
    setPrepareBillId(bill.id);
    setPrepareVatEnabled(
      (bill.vatRate ?? (job?.isVatInvoice ? state.settings.defaultVatRate ?? 18 : 0)) >
        0,
    );
    setPrepareDiscount(String(bill.discount ?? 0));
    setReleaseBillId(null);
    setPaymentBillId(null);
  }

  function confirmPrepareBill() {
    if (!prepareBill) return;
    const result = prepareVehicleBill(prepareBill.id, {
      discount: Number(prepareDiscount) || 0,
      vatRate: prepareVatEnabled ? prepareVatRate : 0,
    });
    if (!result.ok) {
      push(result.message ?? "Could not prepare the bill.", "error");
      return;
    }
    push(
      prepareBill.kind === "Insurance"
        ? `${prepareBill.billNo} sent to the insurer${prepareVatEnabled ? ` with VAT ${prepareVatRate}%` : " without VAT"}. It now waits for the release order.`
        : `${prepareBill.billNo} ready for customer billing${prepareVatEnabled ? ` with VAT ${prepareVatRate}%` : " without VAT"}.`,
    );
    setPrepareBillId(null);
    setTab("queue");
  }

  function openReleaseBill(bill: VehicleBill) {
    setReleaseBillId(bill.id);
    setReleaseOrderNo(bill.releaseOrderNo ?? "");
    setReleaseAmount(String(billNet(bill)));
    setBillDiscount(String(bill.discount ?? 0));
    setPaymentBillId(null);
  }

  function openPaymentBill(bill: VehicleBill) {
    if (bill.status === "Partially Paid") {
      setTab("credits");
      push(
        `${bill.billNo} has a part-payment balance. Collect the remaining amount from the customer credit ledger.`,
        "info",
      );
      return;
    }
    setPaymentBillId(bill.id);
    setBillPaymentMethod("Cash");
    setBillDiscount(String(bill.discount ?? 0));
    setBillAmount(String(billNet(bill)));
    setReleaseBillId(null);
  }

  function confirmReleaseBill() {
    if (!releaseBill) return;
    if (!releaseOrderNo.trim()) {
      push("Enter the insurer release order number.", "error");
      return;
    }
    if (!Number.isFinite(releaseApproved) || releaseApproved <= 0) {
      push("Enter the amount approved on the release order.", "error");
      return;
    }
    const result = settleVehicleBill(releaseBill.id, {
      method: "Release Order",
      releaseOrderNo: releaseOrderNo.trim(),
      releaseOrderAmount: releaseApproved,
      discount: Number(billDiscount) || 0,
    });
    if (!result.ok) {
      push(result.message ?? "Could not release the insurance bill.", "error");
      return;
    }
    push(
      releaseShortfall > 0.005
        ? `${releaseBill.billNo} released. Shortfall ${money(releaseShortfall)} was added as a customer-payable additional bill.`
        : `${releaseBill.billNo} released against order ${releaseOrderNo.trim()}.`,
    );
    setReleaseBillId(null);
    setTab("queue");
  }

  function confirmBillPayment() {
    if (!paymentBill) return;
    const value = Number(billAmount);
    if (!Number.isFinite(value) || value <= 0) {
      push("Enter the amount collected from the customer.", "error");
      return;
    }
    if (value > paymentNet + 0.5) {
      push(`The amount collected cannot exceed ${money(paymentNet)}.`, "error");
      return;
    }
    if (billPaymentMethod === "Cheque" && value < paymentNet - 0.5) {
      push("A cheque must cover this bill in full.", "error");
      return;
    }
    const result = settleVehicleBill(paymentBill.id, {
      method: billPaymentMethod,
      amount: value,
      discount: Number(billDiscount) || 0,
    });
    if (!result.ok) {
      push(result.message ?? "Could not collect the bill payment.", "error");
      return;
    }
    push(
      value < paymentNet - 0.5
        ? `${paymentBill.billNo}: ${money(value)} collected. The remaining ${money(
            paymentNet - value,
          )} is in the customer credit ledger and needs owner/accounting release approval.`
        : `${paymentBill.billNo} paid in full — ${money(paymentNet)} collected by ${billPaymentMethod}.`,
    );
    setPaymentBillId(null);
    setTab("queue");
  }

  function printJobWithFormat(job: JobCard, format: "thermal" | "a4") {
    printInvoice(
      job,
      state.tasks.filter((task) => task.jobCardId === job.id),
      state.parts.filter((part) => part.jobCardId === job.id),
      state.workers,
      state.settings,
      invoiceTotals(job),
      dueFor(job),
      insuranceFor(job),
      { format, advancePaid: advancePaidFor(job.id) },
    );
  }

  function printJob(job: JobCard) {
    printJobWithFormat(job, printFormat);
  }

  async function downloadJob(job: JobCard) {
    setBusy(`download_${job.id}`);
    try {
      await downloadInvoice(
        job,
        state.tasks.filter((task) => task.jobCardId === job.id),
        state.parts.filter((part) => part.jobCardId === job.id),
        state.workers,
        state.settings,
        invoiceTotals(job),
        dueFor(job),
        insuranceFor(job),
        { advancePaid: advancePaidFor(job.id), customerTin: job.customerTinNumber },
      );
      push("Invoice PDF downloaded.");
    } catch {
      push("Could not generate the invoice PDF.", "error");
    } finally {
      setBusy("");
    }
  }

  async function shareJob(job: JobCard) {
    setBusy(`share_${job.id}`);
    const total = invoiceTotals(job).total;
    try {
      const outcome = await shareInvoiceWhatsApp(
        job,
        state.tasks.filter((task) => task.jobCardId === job.id),
        state.parts.filter((part) => part.jobCardId === job.id),
        state.workers,
        state.settings,
        invoiceTotals(job),
        checkoutMessage(job, total, state.settings, dueFor(job)),
        dueFor(job),
        insuranceFor(job),
        { advancePaid: advancePaidFor(job.id), customerTin: job.customerTinNumber },
      );
      push(
        outcome === "queued"
          ? "Invoice sent automatically through WAHA with the PDF attached."
          : outcome === "shared"
            ? "Invoice shared through your device."
            : "PDF downloaded. Attach it in the WhatsApp chat that opened.",
        "info",
      );
    } catch {
      push("Could not prepare the WhatsApp invoice.", "error");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Billing & cashier"
        subtitle="Discounts, payment capture, thermal receipts, PDF invoices and credit releases — with PRO gate clearance built in."
        actions={
          <>
            <Tabs<CashierTab>
              value={tab}
              onChange={setTab}
              tabs={[
                { id: "queue", label: "Billing queue", count: queueEntries.length },
                { id: "advances", label: "Advances", count: state.advancePayments.length },
                { id: "settled", label: "Paid & released", count: settled.length },
                { id: "credits", label: "Credit ledger" },
              ]}
            />
            <select
              className="select"
              aria-label="Print format"
              title="Default format for customer invoices and advance receipts"
              style={{ width: 152 }}
              value={printFormat}
              onChange={(event) => setPrintFormat(event.target.value as "thermal" | "a4")}
            >
              <option value="thermal">
                Thermal {state.settings.thermalPaperWidth ?? "80mm"}
              </option>
              <option value="a4">Standard A4</option>
            </select>
            {tab === "advances" && (
              <button className="btn btn-primary" onClick={openAdvance}>
                <Plus />
                Record advance
              </button>
            )}
          </>
        }
      />

      {tab !== "credits" && (
        <div className="grid cols-4">
          <StatCard
            label="Queue value"
            value={money(
              queueEntries.reduce((sum, { job, bills, open }) => {
                if (bills.length > 0) {
                  return sum + open.reduce((total, bill) => total + billOutstanding(bill), 0);
                }
                return sum + jobTotals(job, state.tasks, state.parts, state.workers).total;
              }, 0),
            )}
            meta={`${queueEntries.length} vehicle${queueEntries.length === 1 ? "" : "s"} ready to bill`}
            icon={<ReceiptText />}
            tone="purple"
          />
          <StatCard
            label="Collected at the counter today"
            value={money(todayPnl.cashCollected)}
            meta="Cash, card, credit and insurance receipts"
            icon={<Banknote />}
          />
          <StatCard
            label="Credit sales today"
            value={money(todayPnl.creditSales)}
            meta="Approved customer credit"
            icon={<CreditCard />}
            tone="amber"
          />
          <StatCard
            label="Receivables"
            value={money(todayPnl.receivables)}
            meta="All open customer credit balances"
            icon={<Wallet />}
            tone="blue"
          />
        </div>
      )}

      {tab === "queue" && (
        <div className="stack" style={{ marginTop: 18 }}>
          <div className="card">
            <div className="card-body">
              <div className="row-between wrap" style={{ gap: 10 }}>
                <div
                  className="input-group"
                  style={{ minWidth: 280, maxWidth: 560, flex: 1 }}
                >
                  <span className="prefix">
                    <Search size={15} />
                  </span>
                  <input
                    className="input"
                    placeholder="Search vehicle number, customer or job…"
                    value={queueSearch}
                    onChange={(event) => setQueueSearch(event.target.value)}
                    aria-label="Search the billing queue by vehicle number"
                  />
                </div>
                <div className="row wrap" style={{ gap: 8 }}>
                  <span className="badge badge-purple">
                    {queueEntries.length} vehicle
                    {queueEntries.length === 1 ? "" : "s"} in queue
                  </span>
                  {queueSearch.trim() && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setQueueSearch("")}
                    >
                      Clear search
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {queueEntries.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<CheckCircle2 size={22} />}
                title={
                  queueSearch.trim()
                    ? "No vehicle matches that search"
                    : "Billing queue is clear"
                }
                message={
                  queueSearch.trim()
                    ? "Try the vehicle number, customer name or job number."
                    : "When a supervisor marks a repair completed, the full job — labour, parts and discounts — lands here for checkout."
                }
                action={
                  <Link className="btn btn-secondary" to="/workshop">
                    Open workshop floor
                    <ArrowRight />
                  </Link>
                }
              />
            </div>
          ) : (
            queueEntries.map(({ job, bills, open }) => {
              const totals = jobTotals(job, state.tasks, state.parts, state.workers);
              const expanded = expandedJobs.includes(job.id);
              const openTotal = open.reduce((sum, bill) => sum + billOutstanding(bill), 0);
              const amount = bills.length > 0 ? openTotal : totals.total;
              const selected = bills.filter((bill) =>
                selectedBillIds.includes(bill.id),
              );
              const allSelected =
                bills.length > 0 && selected.length === bills.length;
              const multiSection =
                bills.length > 1 &&
                new Set(
                  bills
                    .map((bill) => bill.sectionId)
                    .filter((id): id is string => Boolean(id)),
                ).size > 1;
              return (
                <div className="card" key={job.id}>
                  <div className="card-head">
                    <div className="row" style={{ gap: 11, minWidth: 0 }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => toggleQueueJob(job.id)}
                        title={expanded ? "Collapse vehicle" : "Expand bills"}
                        aria-expanded={expanded}
                      >
                        {expanded ? <ChevronDown /> : <ChevronRight />}
                      </button>
                      <span
                        className="part-icon"
                        style={{
                          width: 42,
                          height: 42,
                          flex: "0 0 42px",
                          background: "var(--purple-soft)",
                          color: "var(--purple)",
                        }}
                      >
                        <ReceiptText size={18} />
                      </span>
                      <div>
                        <div className="row wrap" style={{ gap: 7 }}>
                          <h3
                            style={{
                              fontSize: 16.5,
                              fontWeight: 800,
                              letterSpacing: "-0.02em",
                            }}
                          >
                            {job.vehicleNo} · {job.make} {job.model}
                          </h3>
                          <StatusBadge status={job.status} />
                        </div>
                        <p>
                          {job.customerName} · {job.id} ·{" "}
                          {bills.length > 0
                            ? `${open.length} open of ${bills.length} bill${
                                bills.length === 1 ? "" : "s"
                              }`
                            : `completed ${timeAgo(job.completedAt)}`}
                        </p>
                      </div>
                    </div>
                    <div className="row wrap" style={{ gap: 12 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 20, fontWeight: 780 }}>
                          {money(amount)}
                        </div>
                        <div className="tiny muted">
                          {bills.length > 0 ? "still to settle" : "full job invoice"}
                        </div>
                      </div>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => toggleQueueJob(job.id)}
                      >
                        {expanded
                          ? "Hide"
                          : bills.length > 0
                            ? `Open bills (${open.length})`
                            : "Open job"}
                      </button>
                    </div>
                  </div>
                  {expanded && (
                    <div className="card-body stack">
                      {bills.length === 0 ? (
                        <>
                          <div className="grid cols-4" style={{ gap: 10 }}>
                            <div className="mini-stat card">
                              <div className="label">Labour</div>
                              <div className="value" style={{ fontSize: 15 }}>
                                {money(totals.labor)}
                              </div>
                              <div className="meta">{totals.activeTasks.length} tasks</div>
                            </div>
                            <div className="mini-stat card">
                              <div className="label">Parts</div>
                              <div className="value" style={{ fontSize: 15 }}>
                                {money(totals.parts)}
                              </div>
                              <div className="meta">
                                {totals.issuedParts.length} issued lines
                              </div>
                            </div>
                            <div className="mini-stat card">
                              <div className="label">Discount</div>
                              <div className="value" style={{ fontSize: 15 }}>
                                {money(totals.discount)}
                              </div>
                              <div className="meta">Apply at checkout</div>
                            </div>
                            <div className="mini-stat card">
                              <div className="label">Commission</div>
                              <div className="value" style={{ fontSize: 15 }}>
                                {money(totals.commission)}
                              </div>
                              <div className="meta">Payable to technicians</div>
                            </div>
                          </div>
                          <div className="divider" />
                          <div className="row-between wrap">
                            <div className="row wrap small muted">
                              <span>
                                <UserRound
                                  size={12}
                                  style={{ verticalAlign: -2, marginRight: 4 }}
                                />
                                {job.customerName}
                              </span>
                              <span>·</span>
                              <span>
                                <Phone
                                  size={12}
                                  style={{ verticalAlign: -2, marginRight: 4 }}
                                />
                                {job.phone}
                              </span>
                              <span>·</span>
                              <span>
                                <Wrench
                                  size={12}
                                  style={{ verticalAlign: -2, marginRight: 4 }}
                                />
                                {job.repairType}
                              </span>
                            </div>
                            <div className="row wrap">
                              <Link className="btn btn-ghost btn-sm" to={`/jobs/${job.id}`}>
                                Review job
                              </Link>
                              <button
                                className="btn btn-primary"
                                onClick={() => openCheckout(job.id)}
                              >
                                <Wallet />
                                Bill & collect
                              </button>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="grid cols-3" style={{ gap: 10 }}>
                            <div className="mini-stat card">
                              <div className="label">Insurance bill</div>
                              <div className="value" style={{ fontSize: 15 }}>
                                {money(
                                  bills
                                    .filter((bill) => bill.kind === "Insurance")
                                    .reduce((sum, bill) => sum + billNet(bill), 0),
                                )}
                              </div>
                              <div className="meta">
                                Settle on the insurer release order
                              </div>
                            </div>
                            <div className="mini-stat card">
                              <div className="label">Customer bills</div>
                              <div className="value" style={{ fontSize: 15 }}>
                                {money(
                                  bills
                                    .filter((bill) => bill.kind !== "Insurance")
                                    .reduce((sum, bill) => sum + billNet(bill), 0),
                                )}
                              </div>
                              <div className="meta">Paid in full or by approved part payment</div>
                            </div>
                            <div className="mini-stat card">
                              <div className="label">Still to settle</div>
                              <div className="value" style={{ fontSize: 15 }}>
                                {money(openTotal)}
                              </div>
                              <div className="meta">
                                {open.length} open bill{open.length === 1 ? "" : "s"}
                              </div>
                            </div>
                          </div>

                          <div className="row-between wrap" style={{ gap: 8 }}>
                            <span className="tiny muted">
                              {selected.length} of {bills.length} bill
                              {bills.length === 1 ? "" : "s"} selected
                            </span>
                            <div className="row wrap" style={{ gap: 6 }}>
                              <button
                                className="btn btn-secondary btn-sm"
                                disabled={selected.length === 0}
                                onClick={() => printSelectedBills(job)}
                              >
                                <Printer />
                                Print selected
                                {selected.length > 0 ? ` (${selected.length})` : ""}
                              </button>
                              <button
                                className="btn btn-soft btn-sm"
                                disabled={
                                  selected.length === 0 ||
                                  busy === `bills_share_${job.id}`
                                }
                                onClick={() => shareSelectedBills(job)}
                              >
                                <MessageCircle />
                                Send selected on WhatsApp
                              </button>
                              <Link
                                className="btn btn-ghost btn-sm"
                                to={`/jobs/${job.id}`}
                              >
                                Review job
                              </Link>
                            </div>
                          </div>

                          <div className="table-wrap">
                            <table className="data">
                              <thead>
                                <tr>
                                  <th style={{ width: 34 }}>
                                    <input
                                      type="checkbox"
                                      checked={allSelected}
                                      onChange={() => toggleAllJobBills(bills)}
                                      aria-label="Select every bill on this vehicle"
                                    />
                                  </th>
                                  <th>Bill</th>
                                  <th>Type</th>
                                  <th className="num">Items</th>
                                  <th className="num">Net payable</th>
                                  <th>Status</th>
                                  <th>Settled</th>
                                  <th />
                                </tr>
                              </thead>
                              <tbody>
                                {bills.map((bill) => {
                                  const parent = bill.parentBillId
                                    ? state.vehicleBills.find(
                                        (entry) => entry.id === bill.parentBillId,
                                      )
                                    : null;
                                  const shortfallBill = bill.shortfallBillId
                                    ? state.vehicleBills.find(
                                        (entry) =>
                                          entry.id === bill.shortfallBillId,
                                      )
                                    : null;
                                  const settled =
                                    bill.status === "Paid" ||
                                    bill.status === "Release Order";
                                  return (
                                    <tr key={bill.id}>
                                      <td>
                                        <input
                                          type="checkbox"
                                          checked={selectedBillIds.includes(bill.id)}
                                          onChange={() => toggleBillSelection(bill.id)}
                                          aria-label={`Select ${bill.billNo}`}
                                        />
                                      </td>
                                      <td>
                                        <div className="cell-main">{bill.billNo}</div>
                                        {bill.parentBillId && (
                                          <div className="cell-sub">
                                            Shortfall of{" "}
                                            {parent?.billNo ?? bill.parentBillId}
                                          </div>
                                        )}
                                        {bill.shortfallBillId && (
                                          <div className="cell-sub">
                                            Shortfall billed to{" "}
                                            {shortfallBill?.billNo ??
                                              bill.shortfallBillId}
                                          </div>
                                        )}
                                        {bill.notes && (
                                          <div className="cell-sub">{bill.notes}</div>
                                        )}
                                      </td>
                                      <td>
                                        <span
                                          className={`badge ${
                                            bill.kind === "Insurance"
                                              ? "badge-blue"
                                              : bill.kind === "Additional"
                                                ? "badge-amber"
                                                : "badge-slate"
                                          }`}
                                        >
                                          {bill.kind}
                                        </span>
                                      </td>
                                      <td className="num">
                                        {(bill.taskIds?.length ?? 0) +
                                          (bill.partIds?.length ?? 0)}
                                      </td>
                                      <td className="num strong">
                                        {money(billNet(bill))}
                                      </td>
                                      <td>
                                        <StatusBadge
                                          status={
                                            bill.status === "Awaiting Release Order"
                                              ? "Waiting for releasing order"
                                              : bill.status ?? "Unpaid"
                                          }
                                        />
                                        {bill.status === "Draft" && (
                                          <div className="cell-sub">
                                            Set VAT before sending
                                          </div>
                                        )}
                                        {bill.status === "Partially Paid" && (
                                          <div className="cell-sub">
                                            {money(bill.paidAmount ?? 0)} paid · balance in credit
                                          </div>
                                        )}
                                      </td>
                                      <td className="tiny muted">
                                        {bill.status === "Release Order" ? (
                                          <>
                                            RO {bill.releaseOrderNo ?? "—"}
                                            <div className="cell-sub">
                                              {shortDate(
                                                bill.releaseOrderAt ?? bill.paidAt,
                                              )}
                                              {bill.releaseOrderAmount !== undefined
                                                ? ` · approved ${money(
                                                    bill.releaseOrderAmount,
                                                  )}`
                                                : ""}
                                            </div>
                                          </>
                                        ) : bill.status === "Partially Paid" ? (
                                          <>
                                            {money(bill.paidAmount ?? 0)} of {money(billNet(bill))}
                                            <div className="cell-sub">
                                              {bill.paymentMethod ?? "—"} · balance in credit
                                            </div>
                                          </>
                                        ) : bill.status === "Paid" ? (
                                          <>
                                            {shortDate(bill.paidAt)}
                                            <div className="cell-sub">
                                              {bill.paymentMethod ?? "—"}
                                              {bill.paidBy
                                                ? ` · ${bill.paidBy}`
                                                : ""}
                                            </div>
                                          </>
                                        ) : bill.sentAt ? (
                                          <>
                                            Sent {shortDate(bill.sentAt)}
                                            <div className="cell-sub">
                                              {bill.sentBy ?? "—"}
                                            </div>
                                          </>
                                        ) : (
                                          "—"
                                        )}
                                      </td>
                                      <td>
                                        <div
                                          className="row"
                                          style={{
                                            justifyContent: "flex-end",
                                            gap: 3,
                                          }}
                                        >
                                          {bill.status === "Draft" ? (
                                            <button
                                              className="btn btn-primary btn-sm"
                                              onClick={() => openPrepareBill(bill)}
                                            >
                                              <Percent />
                                              Set VAT & send
                                            </button>
                                          ) : (
                                            <>
                                              <button
                                                className="btn btn-ghost btn-sm"
                                                title="Print this bill (A4)"
                                                onClick={() =>
                                                  printBillDocument(bill)
                                                }
                                              >
                                                <Printer />
                                              </button>
                                              <button
                                                className="btn btn-ghost btn-sm"
                                                title="Download this bill as PDF"
                                                disabled={
                                                  busy ===
                                                  `bill_download_${bill.id}`
                                                }
                                                onClick={() =>
                                                  downloadBillDocument(bill)
                                                }
                                              >
                                                <Download />
                                              </button>
                                              {bill.kind === "Insurance" &&
                                                !settled && (
                                                  <button
                                                    className="btn btn-primary btn-sm"
                                                    onClick={() =>
                                                      openReleaseBill(bill)
                                                    }
                                                  >
                                                    <ShieldCheck />
                                                    Release on order
                                                  </button>
                                                )}
                                              {bill.kind !== "Insurance" &&
                                                !settled && (
                                                  <button
                                                    className="btn btn-primary btn-sm"
                                                    onClick={() =>
                                                      openPaymentBill(bill)
                                                    }
                                                  >
                                                    {bill.status === "Partially Paid" ? (
                                                      <CreditCard />
                                                    ) : (
                                                      <Wallet />
                                                    )}
                                                    {bill.status === "Partially Paid"
                                                      ? "Collect balance in credit ledger"
                                                      : "Collect payment"}
                                                  </button>
                                                )}
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

                          <div className="row-between wrap" style={{ gap: 8 }}>
                            <div className="tiny muted">
                              Set VAT on each draft bill here before it is sent to the
                              insurer or customer. Insurance bills then settle on the
                              insurer release order; customer and additional bills are
                              collected in full or, with owner/accounting approval, released
                              with the balance on customer credit. A short release order creates an
                              additional customer bill for the difference automatically.
                            </div>
                            {multiSection && (
                              <button
                                className="btn btn-secondary btn-sm"
                                disabled={open.length > 0}
                                title={
                                  open.length > 0
                                    ? "Settle every section bill first"
                                    : "Print one final bill totalling all sections"
                                }
                                onClick={() => printFinalBill(job, bills)}
                              >
                                <Printer />
                                Final consolidated bill
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === "advances" && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-head">
            <div>
              <h3>Advance payments against jobs</h3>
              <p>Deposits collected before final billing. Each receipt is credited to the job at checkout.</p>
            </div>
            <span className="badge badge-green">{state.advancePayments.length} receipts</span>
          </div>
          {state.advancePayments.length === 0 ? (
            <EmptyState
              icon={<Wallet size={22} />}
              title="No advance payments yet"
              message="Record a deposit against a job or vehicle number, print the receipt and send it to the customer on WhatsApp."
              action={
                <button className="btn btn-primary" onClick={openAdvance}>
                  <Plus />
                  Record advance
                </button>
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Job / vehicle</th>
                    <th>Customer</th>
                    <th>Method</th>
                    <th className="num">Amount</th>
                    <th>Balance after</th>
                    <th>Recorded</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {state.advancePayments.map((advance) => {
                    const balance = advanceBalanceAfter(advance);
                    return (
                      <tr key={advance.id}>
                        <td className="strong">{advance.receiptNo}</td>
                        <td>
                          <Link className="cell-main" to={`/jobs/${advance.jobCardId}`}>
                            {advance.jobCardId}
                          </Link>
                          <div className="cell-sub">{advance.vehicleNo}</div>
                        </td>
                        <td>
                          <div className="cell-main" style={{ fontSize: 12.2 }}>{advance.customerName}</div>
                          <div className="cell-sub">{advance.phone}</div>
                        </td>
                        <td><StatusBadge status={advance.method} /></td>
                        <td className="num strong">{money(advance.amount)}</td>
                        <td className="num">{balance === undefined ? "—" : money(balance)}</td>
                        <td className="tiny muted">
                          {shortDate(advance.createdAt)}
                          <div className="cell-sub">{advance.recordedBy ?? "—"}</div>
                        </td>
                        <td>
                          <div className="row" style={{ justifyContent: "flex-end", gap: 3 }}>
                            <button
                              className="btn btn-ghost btn-sm"
                              title="Print advance receipt"
                              onClick={() => printAdvance(advance)}
                            >
                              <Printer />
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              title="Send receipt on WhatsApp"
                              disabled={busy === `advance_${advance.id}`}
                              onClick={() => shareAdvance(advance)}
                            >
                              <MessageCircle />
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
      )}

      {tab === "settled" && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-head">
            <div>
              <h3>Paid, credit-released & dispatched</h3>
              <p>Reprint receipts, download PDFs or resend via WhatsApp.</p>
            </div>
            <span className="badge badge-green">{settled.length} records</span>
          </div>
          {settled.length === 0 ? (
            <EmptyState title="No settled invoices yet" message="Completed checkouts and approved credit releases will be archived here." />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Vehicle</th>
                    <th>Method</th>
                    <th className="num">Total</th>
                    <th>Paid</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {settled.map((job) => {
                    const settledTotals = jobTotals(job, state.tasks, state.parts, state.workers);
                    const total = settledTotals.total;
                    const credit = state.customerCredits.find((entry) => entry.jobCardId === job.id);
                    const separateBills = state.vehicleBills.filter(
                      (bill) => bill.jobCardId === job.id,
                    );
                    return (
                      <tr key={job.id}>
                        <td>
                          <Link className="cell-main" to={`/jobs/${job.id}`}>{job.id}</Link>
                          <div className="cell-sub">{job.repairType}</div>
                          {separateBills.length > 0 && (
                            <div className="cell-sub">
                              {separateBills.length} separate bill
                              {separateBills.length === 1 ? "" : "s"}
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="cell-main" style={{ fontSize: 12.2 }}>{job.customerName}</div>
                          <div className="cell-sub">{job.phone}</div>
                        </td>
                        <td className="small">{job.vehicleNo}</td>
                        <td><StatusBadge status={job.paymentMethod ?? "—"} /></td>
                        <td className="num strong">{money(total)}</td>
                        <td className="tiny muted">
                          {shortDate(job.paidAt)}
                          {credit && credit.status !== "Settled" && (
                            <div className="cell-sub">Due {shortDate(credit.dueDate)}</div>
                          )}
                        </td>
                        <td><StatusBadge status={job.status} /></td>
                        <td>
                          <div className="row" style={{ justifyContent: "flex-end", gap: 3 }}>
                            <button className="btn btn-ghost btn-sm" title="Print invoice" onClick={() => printJob(job)}>
                              <Printer />
                            </button>
                            {job.driver && (
                              <button
                                className="btn btn-ghost btn-sm"
                                title="Driver commission thermal chit"
                                onClick={() =>
                                  printDriverCommissionChit(job, state.settings, {
                                    labor: settledTotals.labor,
                                    total: Math.max(0, total - settledTotals.vat),
                                  })
                                }
                              >
                                <Banknote />
                              </button>
                            )}
                            <button
                              className="btn btn-ghost btn-sm"
                              title="Download PDF"
                              disabled={busy === `download_${job.id}`}
                              onClick={() => downloadJob(job)}
                            >
                              <Download />
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              title="Send on WhatsApp"
                              disabled={busy === `share_${job.id}`}
                              onClick={() => shareJob(job)}
                            >
                              <MessageCircle />
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
      )}

      {tab === "credits" && (
        <div style={{ marginTop: 18 }}>
          <CreditLedger />
        </div>
      )}

      <Modal
        open={Boolean(prepareBill)}
        onClose={() => setPrepareBillId(null)}
        title={
          prepareBill
            ? `Prepare ${prepareBill.kind.toLowerCase()} bill`
            : "Prepare bill"
        }
        subtitle={
          prepareBill
            ? `${prepareBill.billNo} · ${prepareBill.vehicleNo} · set VAT before sending`
            : undefined
        }
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setPrepareBillId(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={confirmPrepareBill}>
              <Send />
              Save & mark sent
            </button>
          </>
        }
      >
        {prepareBill && prepareCharges && (
          <div className="stack">
            <div className="card">
              <div className="card-body">
                <div className="kv"><span>Bill</span><span>{prepareBill.billNo}</span></div>
                <div className="kv"><span>Type</span><span>{prepareBill.kind}</span></div>
                <div className="kv">
                  <span>Vehicle</span>
                  <span>{prepareBill.vehicleNo}</span>
                </div>
                <div className="kv">
                  <span>
                    {prepareBill.kind === "Insurance" ? "Insurer" : "Customer"}
                  </span>
                  <span>
                    {prepareBill.kind === "Insurance"
                      ? insuranceForBill(prepareBill)?.insurer?.name ?? "—"
                      : state.jobCards.find((job) => job.id === prepareBill.jobCardId)
                          ?.customerName ?? "—"}
                  </span>
                </div>
                {prepareBill.kind === "Insurance" &&
                  insuranceForBill(prepareBill)?.claim && (
                    <div className="kv">
                      <span>Claim</span>
                      <span>{insuranceForBill(prepareBill)?.claim.claimNo}</span>
                    </div>
                  )}
              </div>
            </div>
            <div className="form-grid">
              <Field
                label="VAT on this bill"
                full
                hint="Choose this before the bill is sent. It cannot be changed after sending."
              >
                <select
                  className="select"
                  value={prepareVatEnabled ? "on" : "off"}
                  onChange={(event) => setPrepareVatEnabled(event.target.value === "on")}
                >
                  <option value="off">No VAT — standard INVOICE</option>
                  <option value="on">
                    Add VAT ({prepareVatRate}%) — TAX INVOICE
                  </option>
                </select>
              </Field>
              <Field
                label="Cashier discount (LKR)"
                full
                hint="Applied before VAT. Leave zero if no discount applies."
              >
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={prepareDiscount}
                  onChange={(event) => setPrepareDiscount(event.target.value)}
                />
              </Field>
            </div>
            <div className="card">
              <div className="card-body">
                <div className="kv">
                  <span>Supply after discount</span>
                  <span>{money(prepareCharges.supply)}</span>
                </div>
                <div className="kv">
                  <span>VAT {prepareCharges.vatRate.toFixed(2)}%</span>
                  <span>{money(prepareCharges.vatAmount)}</span>
                </div>
                {prepareBill.policyExcess ? (
                  <div className="kv">
                    <span>Policy excess</span>
                    <span>- {money(prepareBill.policyExcess)}</span>
                  </div>
                ) : null}
                {prepareBill.depreciation ? (
                  <div className="kv">
                    <span>Depreciation</span>
                    <span>- {money(prepareBill.depreciation)}</span>
                  </div>
                ) : null}
                {prepareBill.advance ? (
                  <div className="kv">
                    <span>Advance deducted</span>
                    <span>- {money(prepareBill.advance)}</span>
                  </div>
                ) : null}
                <div className="kv">
                  <span>Net payable</span>
                  <span className="strong">{money(prepareCharges.net)}</span>
                </div>
              </div>
            </div>
            <div className="alert alert-info">
              <Send />
              <div>
                {prepareBill.kind === "Insurance"
                  ? "Saving marks this bill as sent and moves it to Waiting for releasing order. The insurer release order will be compared with this VAT-inclusive total."
                  : "Saving marks this bill ready for customer billing. Collect the full net payable afterwards; VAT is fixed at this step."}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(releaseBill)}
        onClose={() => setReleaseBillId(null)}
        title="Release insurance bill on order"
        subtitle={
          releaseBill
            ? `${releaseBill.billNo} · ${releaseBill.vehicleNo} · ${money(releaseNet)}`
            : undefined
        }
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setReleaseBillId(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={confirmReleaseBill}>
              <ShieldCheck />
              Release on order
            </button>
          </>
        }
      >
        {releaseBill && (
          <div className="stack">
            <div className="card">
              <div className="card-body">
                <div className="kv"><span>Bill</span><span>{releaseBill.billNo}</span></div>
                <div className="kv"><span>Vehicle</span><span>{releaseBill.vehicleNo}</span></div>
                <div className="kv">
                  <span>Insurer</span>
                  <span>{insuranceForBill(releaseBill)?.insurer?.name ?? "—"}</span>
                </div>
                <div className="kv">
                  <span>Claim</span>
                  <span>{insuranceForBill(releaseBill)?.claim.claimNo ?? "—"}</span>
                </div>
                <div className="kv">
                  <span>Net payable by insurer</span>
                  <span className="strong">{money(releaseNet)}</span>
                </div>
              </div>
            </div>
            <div className="form-grid">
              <Field label="Release order number" required full>
                <input
                  className="input"
                  placeholder="RO / settlement reference"
                  value={releaseOrderNo}
                  onChange={(event) => setReleaseOrderNo(event.target.value)}
                />
              </Field>
              <Field
                label="Amount approved on order (LKR)"
                required
                full
                hint="If the release order is lower than the bill, the shortfall is billed to the customer automatically."
              >
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={releaseAmount}
                  onChange={(event) => setReleaseAmount(event.target.value)}
                />
              </Field>
              <Field
                label="Cashier discount (LKR)"
                full
                hint="Applied before tax. Use it to settle a negotiated adjustment."
              >
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={billDiscount}
                  onChange={(event) => setBillDiscount(event.target.value)}
                />
              </Field>
            </div>
            <div className="card">
              <div className="card-body">
                <div className="kv">
                  <span>Supply after discount</span>
                  <span>{money(billCharges(releaseBill).supply)}</span>
                </div>
                <div className="kv">
                  <span>VAT {billCharges(releaseBill).vatRate.toFixed(2)}%</span>
                  <span>{money(billCharges(releaseBill).vatAmount)}</span>
                </div>
                <div className="kv">
                  <span>Net payable by insurer</span>
                  <span className="strong">{money(releaseNet)}</span>
                </div>
                <div className="tiny muted" style={{ marginTop: 6 }}>
                  VAT was set in Cashier before this bill was sent. Releasing only records the
                  insurer settlement.
                </div>
              </div>
            </div>
            {releaseShortfall > 0.005 ? (
              <div className="alert alert-warn">
                <AlertTriangle />
                <div>
                  The release order is short by <strong>{money(releaseShortfall)}</strong>. This
                  penalty / under-value difference will be created as a separate additional bill
                  payable by the customer. The insurance bill itself stays at{" "}
                  {money(releaseNet)}.
                </div>
              </div>
            ) : (
              <div className="alert alert-info">
                <ShieldCheck />
                <div>
                  The release order covers the full insurance bill. The vehicle's insurance side is
                  settled; any customer bill on this vehicle must still be collected.
                </div>
              </div>
            )}
            <div className="tiny muted">
              Releasing records the insurer settlement in the ledger and notifies Cashier,
              Accounting and PRO. Settled bills cannot be deleted.
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(paymentBill)}
        onClose={() => setPaymentBillId(null)}
        title="Collect customer bill payment"
        subtitle={
          paymentBill
            ? `${paymentBill.billNo} · ${paymentBill.vehicleNo} · ${money(paymentNet)}`
            : undefined
        }
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setPaymentBillId(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={confirmBillPayment}>
              <CheckCircle2 />
              Collect{" "}
              {paymentBill
                ? money(billPartial ? billCollected : paymentNet)
                : "payment"}
            </button>
          </>
        }
      >
        {paymentBill && (
          <div className="stack">
            <div className="card">
              <div className="card-body">
                <div className="kv"><span>Bill</span><span>{paymentBill.billNo}</span></div>
                <div className="kv"><span>Type</span><span>{paymentBill.kind}</span></div>
                <div className="kv">
                  <span>Customer</span>
                  <span>
                    {state.jobCards.find((job) => job.id === paymentBill.jobCardId)?.customerName ??
                      "—"}
                  </span>
                </div>
                {paymentBill.parentBillId && (
                  <div className="kv">
                    <span>Release order shortfall</span>
                    <span>
                      {state.vehicleBills.find((bill) => bill.id === paymentBill.parentBillId)
                        ?.billNo ?? paymentBill.parentBillId}
                    </span>
                  </div>
                )}
                <div className="kv">
                  <span>Amount to collect</span>
                  <span className="strong">{money(paymentNet)}</span>
                </div>
              </div>
            </div>
            <div className="form-grid">
              <Field
                label="Cashier discount (LKR)"
                full
                hint="Applied before tax. Printed on the bill."
              >
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={billDiscount}
                  onChange={(event) => {
                    setBillDiscount(event.target.value);
                    setBillAmount(
                      String(billCharges(paymentBill, event.target.value).net),
                    );
                  }}
                />
              </Field>
            </div>
            <div className="card">
              <div className="card-body">
                <div className="kv">
                  <span>Supply after discount</span>
                  <span>{money(billCharges(paymentBill).supply)}</span>
                </div>
                <div className="kv">
                  <span>VAT {billCharges(paymentBill).vatRate.toFixed(2)}%</span>
                  <span>{money(billCharges(paymentBill).vatAmount)}</span>
                </div>
                <div className="kv">
                  <span>Net payable by customer</span>
                  <span className="strong">{money(paymentNet)}</span>
                </div>
                <div className="tiny muted" style={{ marginTop: 6 }}>
                  VAT was set in Cashier before this bill was sent. This screen only records
                  payment.
                </div>
              </div>
            </div>
            <Field label="Payment method" required>
              <select
                className="select"
                value={billPaymentMethod}
                onChange={(event) =>
                  setBillPaymentMethod(event.target.value as VehicleBillPaymentMethod)
                }
              >
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="Bank Transfer">Bank transfer</option>
                <option value="Cheque">Cheque</option>
              </select>
            </Field>
            <Field
              label="Amount collected now (LKR)"
              required
              hint={`Net payable ${money(paymentNet)}. A lower amount moves the balance to customer credit and needs owner/accounting release approval.`}
            >
              <input
                className="input"
                type="number"
                min={0}
                max={paymentNet}
                step="0.01"
                value={billAmount}
                onChange={(event) => setBillAmount(event.target.value)}
              />
            </Field>
            {billPartial && (
              <div className="alert alert-warn">
                <AlertTriangle />
                <div>
                  <strong>Release approval required.</strong> {money(billCollected)} is collected
                  now and <strong>{money(paymentNet - billCollected)}</strong> is moved to the
                  customer credit ledger. The vehicle stays until the owner or accounting approves
                  the release.
                </div>
              </div>
            )}
            <div className="alert alert-info">
              <Wallet />
              <div>
                Customer bills can be collected in full or as a part payment. Once a bill has a
                part-payment balance, further collections are recorded from the customer credit
                ledger so the balance, reminders and release approval stay in one place.
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={advanceOpen}
        onClose={() => setAdvanceOpen(false)}
        title="Record advance payment"
        subtitle="Receipt is credited against the job at final billing."
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setAdvanceOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveAdvance}>
              <ReceiptText />
              Record & issue receipt
            </button>
          </>
        }
      >
        <div className="stack">
          <div className="form-grid">
            <Field
              label="Vehicle in progress"
              required
              full
              hint="Only vehicles still in the workshop can take an advance."
            >
              <select
                className="input"
                value={advanceJob}
                onChange={(event) => setAdvanceJob(event.target.value)}
              >
                <option value="">Choose a progressing vehicle…</option>
                {progressingJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.vehicleNo} · {job.customerName} · {job.id} · {job.status}
                  </option>
                ))}
              </select>
              {progressingJobs.length === 0 && (
                <span className="tiny muted">
                  No jobs are currently in progress. Accept a vehicle at the gate first.
                </span>
              )}
            </Field>
            <Field label="Advance amount (LKR)" required>
              <input
                className="input"
                type="number"
                min={1}
                value={advanceAmount}
                onChange={(event) => setAdvanceAmount(event.target.value)}
              />
            </Field>
            <Field label="Payment method" required>
              <select
                className="select"
                value={advanceMethod}
                onChange={(event) =>
                  setAdvanceMethod(event.target.value as AdvancePayment["method"])
                }
              >
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="Bank Transfer">Bank transfer</option>
              </select>
            </Field>
            <Field label="Note" full hint="Optional — shown on the receipt.">
              <input
                className="input"
                placeholder="Brake repair deposit"
                value={advanceNote}
                onChange={(event) => setAdvanceNote(event.target.value)}
              />
            </Field>
          </div>

          {advanceMatch ? (
            <div className="card">
              <div className="card-body">
                <div className="kv"><span>Job</span><span>{advanceMatch.id}</span></div>
                <div className="kv"><span>Vehicle</span><span>{advanceMatch.vehicleNo}</span></div>
                <div className="kv"><span>Customer</span><span>{advanceMatch.customerName}</span></div>
                <div className="kv"><span>Phone</span><span>{advanceMatch.phone}</span></div>
                <div className="kv">
                  <span>Current job total</span>
                  <span>{money(jobTotals(advanceMatch, state.tasks, state.parts, state.workers).total)}</span>
                </div>
              </div>
            </div>
          ) : advanceJob.trim() ? (
            <div className="alert alert-warn">
              <Wallet />
              <div>No job matches that number. Check the job card or vehicle plate.</div>
            </div>
          ) : null}

          <div className="alert alert-brand">
            <MessageCircle />
            <div>
              After saving, print the advance receipt or resend it on WhatsApp from the Advances tab.
              The cashier may take deposits before the repair is completed.
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(target)}
        onClose={() => setCheckoutTargetId(null)}
        title="Checkout & payment"
        subtitle={target ? `${target.id} · ${target.vehicleNo} · ${target.customerName}` : undefined}
        size="wide"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setCheckoutTargetId(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={confirmCheckout}>
              <CheckCircle2 />
              Confirm {paymentMethod === "Credit" ? "credit release" : "payment"}
            </button>
          </>
        }
      >
        {target && ticket && (
          <div className="stack">
            <div className="grid cols-2" style={{ gap: 14 }}>
              <div className="card">
                <div className="card-head" style={{ paddingTop: 14 }}>
                  <div>
                    <h3>Invoice preview</h3>
                    <p>{target.make} {target.model} · {target.mileage.toLocaleString()} km</p>
                  </div>
                </div>
                <div className="card-body" style={{ paddingTop: 6 }}>
                  {ticket.issuedParts.map((part) => (
                    <div className="kv" key={part.id}>
                      <span>{part.itemName} × {Math.max(1, part.qtyIssued)}</span>
                      <span>{money(part.sellingPrice * Math.max(1, part.qtyIssued))}</span>
                    </div>
                  ))}
                  {ticket.activeTasks.map((task) => (
                    <div className="kv" key={task.id}>
                      <span>{task.name}</span>
                      <span>{money(task.laborCost)}</span>
                    </div>
                  ))}
                  <div className="kv"><span>Subtotal</span><span>{money(ticket.subtotal)}</span></div>
                  <div className="kv"><span>Discount</span><span>- {money(ticket.discount)}</span></div>
                  {ticket.vat > 0 && (
                    <div className="kv"><span>VAT @ {vatRate}%</span><span>{money(ticket.vat)}</span></div>
                  )}
                  <div className="kv" style={{ fontSize: 16 }}><span>{ticket.vat > 0 ? "Total incl. VAT" : "Net total"}</span><span>{money(ticket.total)}</span></div>
                  {targetAdvances > 0 && (
                    <>
                      <div className="kv"><span>Advance already paid</span><span>- {money(targetAdvances)}</span></div>
                      <div className="kv strong"><span>Balance payable</span><span>{money(targetBalance)}</span></div>
                    </>
                  )}
                </div>
              </div>

              <div className="stack">
                <div className="card">
                  <div className="card-body stack">
                    <div className="form-grid">
                      <Field label="Discount" hint="Fixed amount or percentage.">
                        <input
                          className="input"
                          type="number"
                          min={0}
                          max={discountType === "Percentage" ? 100 : undefined}
                          value={discount}
                          onChange={(event) => setDiscount(event.target.value)}
                        />
                      </Field>
                      <Field label="Discount type">
                        <select
                          className="select"
                          value={discountType}
                          onChange={(event) => setDiscountType(event.target.value as DiscountType)}
                        >
                          <option value="Fixed">Fixed (LKR)</option>
                          <option value="Percentage">Percentage (%)</option>
                        </select>
                      </Field>
                      <Field label="Payment method" required full>
                        <select
                          className="select"
                          value={paymentMethod}
                          onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
                        >
                          <option value="Cash">Cash</option>
                          <option value="Card">Card</option>
                          <option value="Credit">Credit — release now, pay later</option>
                          {targetClaim && (
                            <option value="Insurance">Insurance — bill the insurer</option>
                          )}
                        </select>
                      </Field>
                      {canPartPay && (
                        <>
                          <Field
                            label="Amount collected now (LKR)"
                            required
                            full
                            hint={`Balance payable ${money(targetBalance)}. Leave part unpaid only when the owner or accounting approves the release.`}
                          >
                            <input
                              className="input"
                              type="number"
                              min={0}
                              max={targetBalance}
                              step="0.01"
                              value={effectiveAmountPaid}
                              onChange={(event) => {
                                setAmountPaid(event.target.value);
                                setAmountPaidTouched(true);
                              }}
                            />
                          </Field>
                          <div className="row wrap" style={{ gridColumn: "1 / -1" }}>
                            {[0.25, 0.5, 1].map((fraction) => (
                              <button
                                key={fraction}
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                  setAmountPaid(
                                    String(
                                      Math.round(targetBalance * fraction * 100) / 100,
                                    ),
                                  );
                                  setAmountPaidTouched(true);
                                }}
                              >
                                {fraction === 1 ? "Full balance" : `${fraction * 100}%`}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                      {vatFeatureEnabled && (
                        <>
                          <Field label="Invoice tax" full hint="Prints TAX INVOICE with the supplier and purchaser TIN blocks when VAT is enabled.">
                            <select
                              className="select"
                              value={vatEnabled ? "vat" : "novat"}
                              onChange={(event) => setVatEnabled(event.target.value === "vat")}
                            >
                              <option value="novat">Without VAT — standard INVOICE</option>
                              <option value="vat">With VAT — TAX INVOICE</option>
                            </select>
                          </Field>
                          {vatEnabled && (
                            <>
                              <Field label="VAT rate (%)" required>
                                <input
                                  className="input"
                                  type="number"
                                  min={0}
                                  max={100}
                                  step="0.01"
                                  value={vatRate}
                                  onChange={(event) => setVatRate(event.target.value)}
                                />
                          </Field>
                              <Field label="Customer TIN" hint="Optional for corporate customers.">
                                <input
                                  className="input"
                                  placeholder="123456789-7000"
                                  value={customerTin}
                                  onChange={(event) => setCustomerTin(event.target.value)}
                                />
                              </Field>
                            </>
                          )}
                        </>
                      )}
                      {paymentMethod === "Insurance" && targetClaim && (
                        <div className="alert alert-info" style={{ gridColumn: "1 / -1" }}>
                          <ShieldCheck />
                          <div>
                            <strong>{targetInsurer?.name ?? "Insurer"}</strong> · claim{" "}
                            {targetClaim.claimNo} · policy {targetClaim.policyNo}. The insurance bill
                            is recorded for {money(ticket.total)} and the vehicle can be released on
                            the insurer release note. Salvage submission stays with the workshop.
                          </div>
                        </div>
                      )}
                      {(paymentMethod === "Credit" || partialCheckout) && (
                        <Field
                          label={partialCheckout ? "Part-payment grace period (days)" : "Grace period (days)"}
                          required
                          full
                          hint={`Due date: ${shortDate(
                            new Date(Date.now() + (Number(graceDays) || 0) * 86400000).toISOString(),
                          )}`}
                        >
                          <input
                            className="input"
                            type="number"
                            min={1}
                            value={graceDays}
                            onChange={(event) => setGraceDays(event.target.value)}
                          />
                        </Field>
                      )}
                      {partialCheckout && (
                        <div className="alert alert-warn" style={{ gridColumn: "1 / -1" }}>
                          <AlertTriangle />
                          <div>
                            <strong>Release approval required.</strong>{" "}
                            {money(collectedNow)} is collected now and{" "}
                            <strong>{money(partialCredit)}</strong> moves to the customer credit
                            ledger. The vehicle stays in the workshop until the owner or accounting
                            approves the release.
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="alert alert-info">
                      <Wallet />
                      <div>
                        {paymentMethod === "Insurance" ? (
                          <>
                            <strong>{money(ticket.total)}</strong> is billed to the insurer.
                            {targetAdvances > 0 && (
                              <> Customer advance {money(targetAdvances)} is already credited.</>
                            )}{" "}
                            Record the insurer cheque in the insurance tracker when it arrives.
                          </>
                        ) : (
                          <>
                            {targetAdvances > 0 ? (
                              <>
                                Advance {money(targetAdvances)} is credited. Customer pays{" "}
                                <strong>{money(targetBalance)}</strong>.
                              </>
                            ) : (
                              <>Customer pays <strong>{money(ticket.total)}</strong>.</>
                            )}{" "}
                            {paymentMethod === "Credit"
                              ? "The balance will appear in the customer credit ledger and accounts reminders."
                              : partialCheckout
                                ? `Only ${money(collectedNow)} is collected now. ${money(partialCredit)} goes to customer credit and owner/accounting approval is needed before release.`
                                : "PRO is notified immediately for gate clearance after payment."}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="alert alert-brand">
                  <Star />
                  <div>
                    <strong>After checkout</strong>
                    Print a thermal receipt, download/share the PDF invoice, and send the Google
                    review request in one WhatsApp thread.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(successJob)}
        onClose={() => setSuccessJobId(null)}
        title="Checkout complete"
        subtitle={successJob ? `${successJob.id} · ${successJob.vehicleNo}` : undefined}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setSuccessJobId(null)}>Done</button>
            {successJob?.status === "Awaiting Release Approval" ? (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setSuccessJobId(null);
                  setTab("credits");
                }}
              >
                <CreditCard />
                Customer credit ledger
              </button>
            ) : (
              <Link className="btn btn-primary" to="/gate" onClick={() => setSuccessJobId(null)}>
                Gate clearance
                <ArrowRight />
              </Link>
            )}
          </>
        }
      >
        {successJob && successTotals && (
          <div className="success-panel" style={{ paddingTop: 0 }}>
            <div className="success-icon">
              <CheckCircle2 size={32} />
            </div>
            <h2>
              {successJob.status === "Awaiting Release Approval"
                ? "Part payment recorded — approval pending"
                : successJob.paymentMethod === "Credit"
                  ? "Released on credit"
                  : "Payment received"}
            </h2>
            <p>
              {successJob.status === "Awaiting Release Approval"
                ? `${money(successJob.partPaymentCollected ?? 0)} collected from ${successJob.customerName}. ${money(
                    successJob.partPaymentCredit ?? 0,
                  )} is on customer credit, so ${successJob.vehicleNo} stays in the workshop until the owner or accounting approves the release.`
                : `${money(successTotals.total)} recorded for ${successJob.customerName}. The PRO has been notified that ${successJob.vehicleNo} is cleared for handover.`}
            </p>

            <div className="card" style={{ marginTop: 18, textAlign: "left" }}>
              <div className="card-body">
                <div className="kv"><span>Invoice</span><span>{successJob.id}</span></div>
                <div className="kv">
                  <span>Payment method</span>
                  <span>
                    {successJob.partPaymentAt
                      ? "Part payment — balance on credit"
                      : successJob.paymentMethod}
                  </span>
                </div>
                <div className="kv"><span>Net amount</span><span>{money(successTotals.total)}</span></div>
                {successJob.partPaymentAt && (
                  <>
                    <div className="kv">
                      <span>Collected now</span>
                      <span>{money(successJob.partPaymentCollected ?? 0)}</span>
                    </div>
                    <div className="kv">
                      <span>Balance on customer credit</span>
                      <span className="strong">{money(successJob.partPaymentCredit ?? 0)}</span>
                    </div>
                  </>
                )}
                {successJob.isVatInvoice && (
                  <div className="kv">
                    <span>VAT</span>
                    <span>{money(successJob.vatAmount ?? 0)} @ {successJob.vatRateApplied ?? 0}%</span>
                  </div>
                )}
                {successJob.customerTinNumber && (
                  <div className="kv"><span>Customer TIN</span><span>{successJob.customerTinNumber}</span></div>
                )}
                {successCredit && (
                  <div className="kv">
                    <span>Credit due</span>
                    <span>{shortDate(successCredit.dueDate)} ({successCredit.graceDays} days)</span>
                  </div>
                )}
              </div>
            </div>

            <div className="row wrap" style={{ marginTop: 16, justifyContent: "center" }}>
              <button className="btn btn-primary" onClick={() => printJobWithFormat(successJob, "a4")}>
                <Printer />
                Print A4 invoice
              </button>
              <button className="btn btn-secondary" onClick={() => printJobWithFormat(successJob, "thermal")}>
                <ReceiptText />
                Thermal {state.settings.thermalPaperWidth ?? "80mm"} receipt
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => shareJob(successJob)}
                disabled={busy === `share_${successJob.id}`}
              >
                <MessageCircle />
                WhatsApp PDF
              </button>
              <a
                className="btn btn-ghost"
                href={waLink(
                  successJob.phone,
                  checkoutMessage(successJob, successTotals.total, state.settings, successCredit?.dueDate),
                )}
                target="_blank"
                rel="noreferrer"
              >
                <Star />
                Review request
              </a>
            </div>
            <p className="tiny muted" style={{ marginTop: 12 }}>
              Tip: use "WhatsApp PDF" — it shares the invoice file on mobile and downloads it on
              desktop while opening WhatsApp.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
