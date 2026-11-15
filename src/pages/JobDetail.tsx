import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Banknote,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Download,
  FileText,
  Gauge,
  History,
  Layers,
  MessageCircle,
  Package,
  Percent,
  Pencil,
  Phone,
  Plus,
  Printer,
  ReceiptText,
  RefreshCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserRound,
  Wallet,
  Wrench,
  XCircle,
} from "lucide-react";
import { hasDepartment, useApp } from "../state/AppStore";
import { featureEnabled } from "../lib/features";
import {
  driverCommissionFor,
  formatQty,
  jobTotals,
  money,
  partIssueQty,
  dateTime,
  timeAgo,
  waLink,
  shortDate,
  daysUntil,
  dateOnly,
} from "../lib/utils";
import { acceptanceMessage, checkoutMessage } from "../lib/messages";
import {
  buildEstimatePdf,
  buildInsuranceBillPdf,
  buildInsuranceEstimatePdf,
  downloadInvoice,
  printDriverCommissionChit,
  printInvoice,
  shareEstimateWhatsApp,
  shareInsuranceBillWhatsApp,
  shareInsuranceEstimateWhatsApp,
  shareInvoiceWhatsApp,
  totalsForInvoice,
} from "../lib/invoice";
import { localDateKey } from "../lib/payroll";
import {
  Alert,
  EmptyState,
  Field,
  Modal,
  StatusBadge,
  Tabs,
} from "../components/ui";
import { useToast } from "../components/Toast";
import type {
  DamagePhoto,
  EstimateLine,
  JobEstimate,
  JobTask,
} from "../types";

type JobTab = "overview" | "labour" | "parts" | "estimates" | "insurance" | "invoice";

export function JobDetailPage() {
  const { jobId } = useParams();
  const {
    state,
    currentUser,
    addTask,
    updateTask,
    removeTask,
    requestPart,
    removePart,
    requestExchange,
    requestReturn,
    requestWarrantyClaim,
    updatePartSalvage,
    createEstimate,
    updateEstimate,
    removeEstimate,
    approveEstimate,
    setEstimateStatus,
    addVehicleBill,
    removeVehicleBill,
    updateDriverCommission,
    createInsuranceClaim,
    updateInsuranceClaim,
    recordInsuranceCheque,
    settleInsuranceClaim,
    markRepairCompleted,
    updateJobSections,
    togglePartIncludedInLabor,
  } = useApp();
  const { push } = useToast();
  const [tab, setTab] = useState<JobTab>("overview");
  const [photoView, setPhotoView] = useState<DamagePhoto | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskEditingId, setTaskEditingId] = useState<string | null>(null);
  const [taskName, setTaskName] = useState("");
  const [taskLabor, setTaskLabor] = useState("");
  const [taskWorker, setTaskWorker] = useState(state.workers.find((worker) => worker.status === "Active")?.id ?? "");
  const [taskSectionId, setTaskSectionId] = useState("");
  const [partOpen, setPartOpen] = useState(false);
  const [partSearch, setPartSearch] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [partQty, setPartQty] = useState("1");
  const [partSectionId, setPartSectionId] = useState("");
  const [sectionEditorOpen, setSectionEditorOpen] = useState(false);
  const [sectionDraft, setSectionDraft] = useState<string[]>([]);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [estimateKind, setEstimateKind] = useState<JobEstimate["kind"]>("Initial");
  const [estimateNotes, setEstimateNotes] = useState("");
  const [estimateLines, setEstimateLines] = useState<EstimateLine[]>([]);
  const [estimateEditingId, setEstimateEditingId] = useState<string | null>(null);
  const [driverOpen, setDriverOpen] = useState(false);
  const [driverForm, setDriverForm] = useState({
    name: "",
    phone: "",
    basis: "Labour" as "Labour" | "Total Bill",
    type: "Percentage" as "Fixed" | "Percentage",
    value: "",
  });
  const [claimForm, setClaimForm] = useState({
    insurerId: "",
    claimNo: "",
    policyNo: "",
    assessorName: "",
    assessorPhone: "",
  });
  const [releaseOrderNo, setReleaseOrderNo] = useState("");
  const [salvageReference, setSalvageReference] = useState("");
  const [billNo, setBillNo] = useState("");
  const [billAmount, setBillAmount] = useState("");
  const [customerBillNo, setCustomerBillNo] = useState("");
  const [customerBillAmount, setCustomerBillAmount] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [chequeAmount, setChequeAmount] = useState("");
  const [chequeBank, setChequeBank] = useState("");
  const [chequeBranch, setChequeBranch] = useState("");
  const [chequeDate, setChequeDate] = useState(dateOnly(new Date().toISOString()));
  const [chequeAccountId, setChequeAccountId] = useState("");
  const [warrantyPartId, setWarrantyPartId] = useState<string | null>(null);
  const [warrantyNote, setWarrantyNote] = useState("");
  const [billKind, setBillKind] = useState<"Insurance" | "Customer">("Customer");
  const [billHistoryNo, setBillHistoryNo] = useState("");
  const [billHistoryAmount, setBillHistoryAmount] = useState("");
  const [billHistoryNotes, setBillHistoryNotes] = useState("");

  const job = state.jobCards.find((entry) => entry.id === jobId);
  const jobTasks = useMemo(
    () => state.tasks.filter((task) => task.jobCardId === jobId),
    [state.tasks, jobId],
  );
  const jobParts = useMemo(
    () => state.parts.filter((part) => part.jobCardId === jobId),
    [state.parts, jobId],
  );
  const jobBills = useMemo(
    () =>
      state.vehicleBills
        .filter((bill) => bill.jobCardId === jobId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.vehicleBills, jobId],
  );
  const totals = useMemo(
    () => (job ? jobTotals(job, state.tasks, state.parts, state.workers) : null),
    [job, state.tasks, state.parts, state.workers],
  );

  const canSupervise = hasDepartment(currentUser, "Supervisor");
  const canBill = hasDepartment(currentUser, "Cashier");
  const canDispatch = hasDepartment(currentUser, "PRO");
  const canEditBase = Boolean(job && canSupervise && job.status === "In Progress");
  const canEditDriver =
    Boolean(currentUser?.isOwner) ||
    hasDepartment(currentUser, "Supervisor") ||
    hasDepartment(currentUser, "Cashier");
  const credit = job ? state.customerCredits.find((entry) => entry.jobCardId === job.id) : null;
  const invoiceReady = Boolean(
    job && ["Paid", "Released on Credit", "Dispatched"].includes(job.status),
  );
  const dueDate = credit?.dueDate;

  const workers = state.workers.filter((worker) => worker.status === "Active");
  const todayKey = localDateKey();
  const presentWorkerIds = new Set(
    state.attendance
      .filter((record) => record.date === todayKey && record.status === "Present")
      .map((record) => record.workerId),
  );
  const selectedWorker = workers.find((worker) => worker.id === taskWorker);

  const fitmentItems = useMemo(() => {
    if (!job) return [];
    const needle = partSearch.trim().toLowerCase();
    return state.inventory
      .filter((item) => {
        const fitment =
          (!item.make || item.make.toLowerCase() === job.make.toLowerCase()) &&
          (!item.model || item.model.toLowerCase() === job.model.toLowerCase());
        if (!fitment) return false;
        if (!needle) return true;
        return `${item.name} ${item.code} ${item.make ?? ""} ${item.model ?? ""} ${item.type}`
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => {
        const aExact = Number(Boolean(a.make && a.model));
        const bExact = Number(Boolean(b.make && b.model));
        if (aExact !== bExact) return bExact - aExact;
        return b.stock - a.stock;
      });
  }, [state.inventory, job, partSearch]);
  const selectedItem = state.inventory.find((item) => item.id === selectedItemId);
  const taskSuggestions = useMemo(() => {
    const map = new Map<string, number>();
    [...state.tasks]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .forEach((task) => map.set(task.name, task.laborCost));
    return [...map.entries()]
      .reverse()
      .slice(0, 8)
      .map(([name, price]) => ({ name, price }));
  }, [state.tasks]);

  const pendingParts = jobParts.filter((part) =>
    ["Requested", "Backordered", "Exchange Pending", "Return Pending"].includes(part.status),
  );

  if (!job || !totals) {
    return (
      <div className="page">
        <div className="card">
          <EmptyState
            title="Job card not found"
            message="It may have been removed or the link is from an older workshop. Return to the workshop floor or search vehicle history."
            action={
              <Link className="btn btn-primary" to="/workshop">
                Back to workshop
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const activeJob = job;
  const activeTotals = totals;
  const jobEstimates = state.estimates
    .filter((estimate) => estimate.jobCardId === activeJob.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const initialEstimate = jobEstimates.find((estimate) => estimate.kind === "Initial");
  const hasApprovedEstimate = jobEstimates.some((estimate) => estimate.status === "Approved");
  const repairUnlocked = activeJob.intakeType !== "Estimate" || hasApprovedEstimate;
  const canEdit = canEditBase && repairUnlocked;
  const claim = activeJob.insuranceClaimId
    ? state.insuranceJobs.find((entry) => entry.id === activeJob.insuranceClaimId) ?? null
    : null;
  const insurer = claim
    ? state.insuranceCompanies.find((entry) => entry.id === claim.insurerId)
    : null;
  const insurancePdfData = claim
    ? { claim, insurer: insurer ?? undefined }
    : undefined;
  const jobAdvances = state.advancePayments.filter(
    (advance) => advance.jobCardId === activeJob.id,
  );
  const advanceTotal = jobAdvances.reduce((sum, advance) => sum + advance.amount, 0);
  const driverCommission = driverCommissionFor(activeJob, activeTotals);
  const canManageInsurance = canSupervise || Boolean(currentUser?.isOwner);
  const warrantyPart = state.parts.find((part) => part.id === warrantyPartId) ?? null;

  const estimatesEnabled = featureEnabled(state.settings, "enable_estimates_module");
  const insuranceEnabled = featureEnabled(state.settings, "enable_insurance_module");
  const driverEnabled = featureEnabled(state.settings, "enable_driver_commissions");
  const sectionsEnabled =
    featureEnabled(state.settings, "enable_multi_sections") && state.sections.length > 0;
  const activeSections = state.sections.filter((section) => section.active);
  const canEditSections = Boolean(currentUser?.isOwner) || canSupervise;
  const taskSectionWorkers = workers.filter(
    (worker) =>
      !taskSectionId ||
      (worker.sectionIds ?? []).length === 0 ||
      (worker.sectionIds ?? []).includes(taskSectionId),
  );
  const taskAssignableWorkers = taskSectionWorkers.filter((worker) =>
    presentWorkerIds.has(worker.id),
  );

  function openTaskModal(task?: JobTask) {
    setTaskEditingId(task?.id ?? null);
    setTaskName(task?.name ?? "");
    setTaskLabor(task ? String(task.laborCost) : "");
    if (task) {
      setTaskSectionId(task.sectionId ?? "");
      setTaskWorker(task.workerId);
      setTaskOpen(true);
      return;
    }
    const defaultSection = activeJob.sectionIds?.[0] ?? "";
    setTaskSectionId(defaultSection);
    const eligible = workers.filter(
      (worker) =>
        !defaultSection ||
        (worker.sectionIds ?? []).length === 0 ||
        (worker.sectionIds ?? []).includes(defaultSection),
    );
    setTaskWorker(
      eligible.find((worker) => presentWorkerIds.has(worker.id))?.id ?? "",
    );
    setTaskOpen(true);
  }

  function applyTaskSuggestion(suggestion: { name: string; price: number }) {
    setTaskName(suggestion.name);
    setTaskLabor(String(suggestion.price));
  }

  function saveTask() {
    if (!taskName.trim()) {
      push("Enter the labour task name.", "error");
      return;
    }
    const labor = Number(taskLabor);
    if (!Number.isFinite(labor) || labor <= 0) {
      push("Enter the labour charge.", "error");
      return;
    }
    if (!taskWorker) {
      push("Choose the technician who performed the task.", "error");
      return;
    }
    const result = taskEditingId
      ? updateTask(taskEditingId, {
          name: taskName.trim(),
          laborCost: labor,
          workerId: taskWorker,
          sectionId: taskSectionId || undefined,
        })
      : addTask(
          activeJob.id,
          taskName.trim(),
          labor,
          taskWorker,
          undefined,
          taskSectionId || undefined,
        );
    if (!result.ok) {
      push(result.message ?? "Could not assign this task.", "error");
      return;
    }
    push(
      taskEditingId
        ? "Labour task updated."
        : "Labour task assigned. Commission is now tracked.",
    );
    setTaskOpen(false);
    setTaskEditingId(null);
  }

  function newEstimateLine(): EstimateLine {
    return {
      id: `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: "Labour",
      description: "",
      qty: 1,
      unitPrice: 0,
    };
  }

  function openEstimate(kind: JobEstimate["kind"] = "Initial", existing?: JobEstimate) {
    setEstimateEditingId(existing?.id ?? null);
    setEstimateKind(existing?.kind ?? kind);
    setEstimateNotes(existing?.notes ?? "");
    if (existing) {
      setEstimateLines(
        existing.lines.map((line) => ({ ...line, id: `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` })),
      );
    } else {
      const carried: EstimateLine[] = [
        ...jobTasks.map((task) => ({
          id: `el_${task.id}`,
          type: "Labour" as const,
          description: task.name,
          qty: 1,
          unitPrice: task.laborCost,
        })),
        ...jobParts
          .filter((part) => part.sellingPrice > 0)
          .map((part) => ({
            id: `el_${part.id}`,
            type: "Part" as const,
            description: part.itemName,
            qty: partIssueQty(part) || part.qtyRequested,
            unitPrice: part.sellingPrice,
          })),
      ];
      setEstimateLines(carried.length > 0 ? carried : [newEstimateLine()]);
    }
    setEstimateOpen(true);
  }

  function updateEstimateLine(id: string, patch: Partial<EstimateLine>) {
    setEstimateLines((prev) =>
      prev.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );
  }

  function saveEstimate() {
    const lines = estimateLines.filter(
      (line) => line.description.trim() && line.qty > 0 && line.unitPrice >= 0,
    );
    if (lines.length === 0) {
      push("Add at least one complete estimate line.", "error");
      return;
    }
    const result = estimateEditingId
      ? updateEstimate(
          estimateEditingId,
          lines.map((line) => ({ ...line, description: line.description.trim() })),
          estimateNotes,
        )
      : createEstimate(
          activeJob.id,
          estimateKind,
          lines.map((line) => ({ ...line, description: line.description.trim() })),
          estimateNotes,
        );
    if (!result.ok) {
      push(result.message ?? "Could not save the estimate.", "error");
      return;
    }
    push(
      estimateEditingId
        ? "Estimate revised. The new revision needs approval."
        : `${estimateKind} estimate saved and sent for approval.`,
    );
    setEstimateOpen(false);
    setEstimateEditingId(null);
    setTab("estimates");
  }

  function changeEstimateStatus(estimate: JobEstimate, status: JobEstimate["status"]) {
    if (status === "Approved") {
      const result = approveEstimate(estimate.id);
      if (!result.ok) {
        push(result.message ?? "Could not approve the estimate.", "error");
        return;
      }
      push("Estimate approved. Lines copied to tasks and parts, and the job is unlocked.");
      return;
    }
    setEstimateStatus(estimate.id, status);
    push(`${estimate.kind} estimate marked ${status.toLowerCase()}.`);
  }

  function openDriverModal() {
    setDriverForm({
      name: activeJob.driver?.name ?? "",
      phone: activeJob.driver?.phone ?? "",
      basis: activeJob.driver?.basis ?? "Labour",
      type: activeJob.driver?.type ?? "Percentage",
      value: activeJob.driver ? String(activeJob.driver.value) : "",
    });
    setDriverOpen(true);
  }

  function saveDriverCommission(clear = false) {
    if (clear) {
      updateDriverCommission(activeJob.id, undefined);
      push("Driver commission removed from this job.");
      setDriverOpen(false);
      return;
    }
    const value = Number(driverForm.value);
    if (!driverForm.name.trim() || !driverForm.phone.trim()) {
      push("Enter the driver name and phone number.", "error");
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      push("Enter a valid driver commission value.", "error");
      return;
    }
    const result = updateDriverCommission(activeJob.id, {
      name: driverForm.name.trim(),
      phone: driverForm.phone.trim(),
      basis: driverForm.basis,
      type: driverForm.type,
      value,
    });
    if (!result.ok) {
      push(result.message ?? "Could not update the driver commission.", "error");
      return;
    }
    push("Driver commission updated. It stays hidden from customer documents.");
    setDriverOpen(false);
  }

  function saveClaim() {
    if (!claimForm.insurerId) {
      push("Choose the insurance company.", "error");
      return;
    }
    if (!claimForm.claimNo.trim() || !claimForm.policyNo.trim()) {
      push("Enter the claim number and policy number.", "error");
      return;
    }
    const result = createInsuranceClaim(activeJob.id, claimForm);
    if (!result.ok) {
      push(result.message ?? "Could not open the insurance claim.", "error");
      return;
    }
    push("Insurance claim opened. Submit the estimate for approval.");
    setTab("insurance");
  }

  function approveClaimEstimate() {
    if (!claim) return;
    updateInsuranceClaim(claim.id, {
      estimateStatus: "Approved",
      estimateApprovedAt: new Date().toISOString(),
      status: "Estimate Approved",
    });
    push("Insurer estimate approval recorded.");
  }

  function approveClaimParts() {
    if (!claim) return;
    updateInsuranceClaim(claim.id, {
      partsStatus: "Approved",
      partsApprovedAt: new Date().toISOString(),
      status: "Parts Approved",
    });
    push("Insurer parts approval recorded.");
  }

  function saveReleaseOrder() {
    if (!claim) return;
    if (!releaseOrderNo.trim()) {
      push("Enter the insurer release order number.", "error");
      return;
    }
    updateInsuranceClaim(claim.id, {
      releaseOrderNo: releaseOrderNo.trim(),
      releaseOrderReceivedAt: new Date().toISOString(),
    });
    push("Release order recorded. The vehicle can be released without waiting for the cheque.");
  }

  function saveSalvageSubmission() {
    if (!claim) return;
    updateInsuranceClaim(claim.id, {
      salvageStatus: "Submitted",
      salvageSubmittedAt: new Date().toISOString(),
      salvageReference: salvageReference.trim() || claim.salvageReference,
    });
    push("Salvage submission recorded against the claim.");
  }

  function saveInsuranceBill() {
    if (!claim) return;
    const amount = Number(billAmount) || claim.insuranceBillAmount || activeTotals.total;
    if (!Number.isFinite(amount) || amount <= 0) {
      push("Enter a valid insurance bill amount.", "error");
      return;
    }
    updateInsuranceClaim(claim.id, {
      insuranceBillNo: billNo.trim() || claim.insuranceBillNo || `INS-${claim.claimNo}`,
      insuranceBillAmount: amount,
      insuranceBillAt: new Date().toISOString(),
      status: "Awaiting Payment",
    });
    push("Insurance bill recorded and marked awaiting payment.");
  }

  function saveCustomerBill() {
    if (!claim || !activeJob) return;
    const amount = customerBillAmount.trim()
      ? Number(customerBillAmount)
      : (claim.customerBillAmount ?? activeTotals.total);
    if (!Number.isFinite(amount) || amount < 0) {
      push("Enter a valid customer bill amount.", "error");
      return;
    }
    updateInsuranceClaim(claim.id, {
      customerBillNo:
        customerBillNo.trim() || claim.customerBillNo || activeJob.id,
      customerBillAmount: amount,
    });
    push("Customer bill recorded for this insurance job.");
  }

  function saveCheque() {
    if (!claim) return;
    const amount = Number(chequeAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      push("Enter a valid cheque amount.", "error");
      return;
    }
    if (!chequeNo.trim() || !chequeBank.trim() || !chequeBranch.trim()) {
      push("Enter the cheque number, bank and branch.", "error");
      return;
    }
    if (!chequeDate) {
      push("Enter the cheque date.", "error");
      return;
    }
    const result = recordInsuranceCheque(claim.id, {
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
  }

  function settleClaim() {
    if (!claim) return;
    const result = settleInsuranceClaim(claim.id);
    if (!result.ok) {
      push(result.message ?? "Could not settle the claim.", "error");
      return;
    }
    push("Insurance claim settled and posted to the ledger.");
  }

  function insuranceBillLines() {
    return {
      labor: activeTotals.labor,
      parts: activeTotals.parts,
      total: claim?.insuranceBillAmount ?? activeTotals.total,
    };
  }

  function downloadInsuranceBill() {
    if (!claim) return;
    const { blob, filename } = buildInsuranceBillPdf(
      activeJob,
      claim,
      insurer ?? undefined,
      state.settings,
      insuranceBillLines(),
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    push("Insurance bill PDF downloaded.");
  }

  function estimatePdf(estimate: JobEstimate) {
    if (claim) {
      return buildInsuranceEstimatePdf(
        activeJob,
        estimate,
        claim,
        insurer ?? undefined,
        state.settings,
      );
    }
    return buildEstimatePdf(activeJob, estimate, state.settings);
  }

  function downloadEstimatePdf(estimate: JobEstimate) {
    const { blob, filename } = estimatePdf(estimate);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    push(`${claim ? "Insurance" : "Customer"} estimate PDF downloaded.`);
  }

  function printEstimate(estimate: JobEstimate) {
    const { blob } = estimatePdf(estimate);
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) {
      URL.revokeObjectURL(url);
      push("Allow pop-ups to print the A4 estimate.", "error");
      return;
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    push("A4 estimate opened in a new tab — use the print button there.");
  }

  async function shareEstimate(estimate: JobEstimate) {
    setBusyAction(`estimate_share_${estimate.id}`);
    try {
      const outcome = claim
        ? await shareInsuranceEstimateWhatsApp(
            activeJob,
            estimate,
            claim,
            insurer ?? undefined,
            state.settings,
            `Insurance estimate ${estimate.number} Rev ${estimate.revision} for ${activeJob.vehicleNo} · claim ${claim.claimNo} · ${money(estimate.lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0))}. ${state.settings.companyName}.`,
          )
        : await shareEstimateWhatsApp(
            activeJob,
            estimate,
            state.settings,
            `Estimate ${estimate.number} Rev ${estimate.revision} for ${activeJob.vehicleNo} · ${money(estimate.lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0))}. ${state.settings.companyName}. Reply here to approve the work.`,
          );
      push(
        outcome === "queued"
          ? "Estimate sent automatically through WAHA with the PDF attached."
          : "Estimate PDF prepared for WhatsApp.",
        "info",
      );
    } catch {
      push("Could not prepare the estimate PDF.", "error");
    } finally {
      setBusyAction("");
    }
  }

  function emailEstimate(estimate: JobEstimate) {
    if (!claim) {
      push("Open an insurance claim before emailing an insurance estimate.", "error");
      return;
    }
    downloadEstimatePdf(estimate);
    const subject = encodeURIComponent(
      `Insurance estimate ${estimate.number} Rev ${estimate.revision} · claim ${claim.claimNo}`,
    );
    const body = encodeURIComponent(
      `Dear ${insurer?.name ?? "Assessor"},\n\nPlease find attached estimate ${estimate.number} Rev ${estimate.revision} for ${activeJob.vehicleNo} (${activeJob.make} ${activeJob.model}), policy ${claim.policyNo}, claim ${claim.claimNo}.\n\nThe estimated total is ${money(estimate.lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0))}. The PDF has been downloaded — attach it to this email before sending.\n\nRegards,\n${state.settings.companyName}\n${state.settings.phone}`,
    );
    window.location.href = `mailto:${insurer?.email ?? ""}?subject=${subject}&body=${body}`;
  }

  async function shareInsuranceBill() {
    if (!claim) return;
    setBusyAction("insurance_share");
    try {
      await shareInsuranceBillWhatsApp(
        activeJob,
        claim,
        insurer ?? undefined,
        state.settings,
        insuranceBillLines(),
        `Insurance bill for ${activeJob.vehicleNo} · claim ${claim.claimNo} · ${money(insuranceBillLines().total)}. ${state.settings.companyName}.`,
      );
      push("Insurance bill prepared for WhatsApp.", "info");
    } catch {
      push("Could not prepare the insurance bill.", "error");
    } finally {
      setBusyAction("");
    }
  }

  function saveVehicleBill() {
    const result = addVehicleBill({
      jobCardId: activeJob.id,
      kind: billKind,
      billNo: billHistoryNo,
      amount: Number(billHistoryAmount),
      claimId: claim?.id,
      insurerId: claim?.insurerId,
      notes: billHistoryNotes,
    });
    if (!result.ok) {
      push(result.message ?? "Could not record the bill.", "error");
      return;
    }
    push(`${billKind} bill ${billHistoryNo.trim()} recorded for ${activeJob.vehicleNo}.`);
    setBillHistoryNo("");
    setBillHistoryAmount("");
    setBillHistoryNotes("");
  }

  function openWarrantyClaim(partId: string) {
    setWarrantyPartId(partId);
    setWarrantyNote("");
  }

  function saveWarrantyClaim() {
    if (!warrantyPart) return;
    const result = requestWarrantyClaim(warrantyPart.id, warrantyNote);
    if (!result.ok) {
      push(result.message ?? "Could not raise the warranty claim.", "error");
      return;
    }
    push("Warranty claim raised. Stores will complete it with the supplier invoice and credit note.");
    setWarrantyPartId(null);
  }

  function changeSalvage(partId: string, status: "Pending" | "Submitted" | "Not Required") {
    updatePartSalvage(partId, { status });
    push(`Salvage marked ${status.toLowerCase()}.`, "info");
  }

  function openPartModal() {
    setPartSearch("");
    setSelectedItemId("");
    setPartQty("1");
    setPartSectionId(activeJob.sectionIds?.[0] ?? "");
    setPartOpen(true);
  }

  function sendPartRequest() {
    if (!selectedItem) {
      push("Choose a part to request.", "error");
      return;
    }
    const qty = Number(partQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      push("Enter a valid quantity.", "error");
      return;
    }
    if (qty > selectedItem.stock) {
      push(
        `Only ${formatQty(selectedItem.stock, selectedItem.measureUnit ?? selectedItem.unit)} in stock.`,
        "error",
      );
      return;
    }
    const result = requestPart(activeJob.id, selectedItem.id, qty, partSectionId || undefined);
    if (!result.ok) {
      push(result.message ?? "Could not request this part.", "error");
      return;
    }
    push(
      `${formatQty(qty, selectedItem.measureUnit ?? selectedItem.unit)} of ${selectedItem.name} sent to stores.`,
    );
    setPartOpen(false);
  }

  function requestSwap(partId: string) {
    requestExchange(partId);
    push("Exchange request sent to stores. Pricing updates after the swap.", "info");
  }

  function requestShelfReturn(partId: string) {
    requestReturn(partId);
    push("Return request sent to stores for physical verification.", "info");
  }

  function completeRepair() {
    if (jobTasks.length === 0 && activeTotals.issuedParts.length === 0) {
      push("Add at least one labour task or issued part before completing the repair.", "error");
      return;
    }
    markRepairCompleted(activeJob.id);
    setCompleteOpen(false);
    setTab("invoice");
    push("Repair completed. The cashier has been notified.");
  }

  async function handleShareInvoice() {
    if (!invoiceReady) return;
    setBusyAction("share");
    try {
      const outcome = await shareInvoiceWhatsApp(
        activeJob,
        jobTasks,
        jobParts,
        state.workers,
        state.settings,
        totalsForInvoice(activeTotals),
        checkoutMessage(activeJob, activeTotals.total, state.settings, dueDate),
        dueDate,
        insurancePdfData,
        { advancePaid: advanceTotal, customerTin: activeJob.customerTinNumber },
      );
      push(
        outcome === "queued"
          ? "Invoice sent automatically through WAHA with the PDF attached."
          : outcome === "shared"
            ? "Invoice shared through your device."
            : "PDF downloaded and WhatsApp opened. Attach the downloaded PDF.",
        "info",
      );
    } catch {
      push("Could not prepare the invoice PDF.", "error");
    } finally {
      setBusyAction("");
    }
  }

  async function handleDownloadInvoice() {
    if (!invoiceReady) return;
    setBusyAction("download");
    try {
      await downloadInvoice(
        activeJob,
        jobTasks,
        jobParts,
        state.workers,
        state.settings,
        totalsForInvoice(activeTotals),
        dueDate,
        insurancePdfData,
        { advancePaid: advanceTotal, customerTin: activeJob.customerTinNumber },
      );
      push("Invoice PDF downloaded.");
    } catch {
      push("Could not generate the invoice PDF.", "error");
    } finally {
      setBusyAction("");
    }
  }

  function handlePrintInvoice() {
    if (!invoiceReady) return;
    printInvoice(
      activeJob,
      jobTasks,
      jobParts,
      state.workers,
      state.settings,
      totalsForInvoice(activeTotals),
      dueDate,
      insurancePdfData,
      {
        advancePaid: advanceTotal,
        customerTin: activeJob.customerTinNumber,
        format: activeJob.insuranceClaimId ? "a4" : undefined,
      },
    );
  }

  const timeline = [
    { label: "Vehicle checked in at the gate", date: job.createdAt },
    { label: "Accepted and moved to the workshop floor", date: job.acceptedAt },
    { label: "Repair completed", date: job.completedAt },
    { label: "Payment / credit release recorded", date: job.paidAt },
    { label: "Handed over at the gate", date: job.dispatchedAt },
  ].filter((item) => Boolean(item.date));

  const jobTabs: { id: JobTab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "labour", label: "Labour & tasks", count: jobTasks.length },
    { id: "parts", label: "Parts & materials", count: jobParts.length },
    ...(estimatesEnabled
      ? [{ id: "estimates" as JobTab, label: "Estimates", count: jobEstimates.length }]
      : []),
    ...(insuranceEnabled
      ? [
          {
            id: "insurance" as JobTab,
            label: "Insurance",
            ...(claim ? { count: 1 } : {}),
          },
        ]
      : []),
    { id: "invoice", label: "Invoice" },
  ];

  return (
    <div className="page">
      <div className="row-between wrap" style={{ marginBottom: 12 }}>
        <Link className="btn btn-ghost btn-sm" to="/workshop">
          <ArrowLeft />
          Workshop floor
        </Link>
        <div className="row wrap">
          <Link className="btn btn-ghost btn-sm" to={`/history?vehicle=${encodeURIComponent(job.vehicleNo)}`}>
            <History />
            Vehicle history
          </Link>
          <a
            className="btn btn-ghost btn-sm"
            href={waLink(job.phone, acceptanceMessage(job, state.settings))}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle />
            WhatsApp customer
          </a>
        </div>
      </div>

      <div className="job-hero">
        <div>
          <div className="row wrap" style={{ gap: 8 }}>
            <span className="plate">
              <ShieldCheck size={12} />
              {job.vehicleNo}
            </span>
            <StatusBadge status={job.status} />
            <span className="badge" style={{ background: "rgba(255,255,255,.1)", color: "#d7e5e7" }}>
              {job.id}
            </span>
          </div>
          <h1>
            {job.make} {job.model}
          </h1>
          {sectionsEnabled && (
            <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
              {(job.sectionIds ?? []).map((sectionId) => {
                const section = state.sections.find((entry) => entry.id === sectionId);
                if (!section) return null;
                return (
                  <span
                    key={sectionId}
                    className="chip"
                    style={{
                      borderColor: "rgba(255,255,255,.28)",
                      color: "#e7f4f4",
                      background: "rgba(255,255,255,.08)",
                    }}
                  >
                    <Layers size={10} /> {section.name}
                  </span>
                );
              })}
              {(job.sectionIds ?? []).length === 0 && (
                <span className="chip" style={{ color: "#e7f4f4" }}>
                  No section assigned
                </span>
              )}
              {canEditSections && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: "#e7f4f4", padding: "2px 6px" }}
                  onClick={() => {
                    setSectionDraft([...(job.sectionIds ?? [])]);
                    setSectionEditorOpen(true);
                  }}
                >
                  <Pencil size={11} />
                  Edit sections
                </button>
              )}
            </div>
          )}
          <div className="hero-meta">
            <span>
              <UserRound size={13} /> {job.customerName}
            </span>
            <span>
              <Phone size={13} /> {job.phone}
            </span>
            <span>
              <Gauge size={13} /> {job.mileage.toLocaleString()} km
            </span>
            <span>
              <Wrench size={13} /> {job.repairType}
            </span>
            <span>
              <ClipboardCheck size={13} /> In since {timeAgo(job.acceptedAt ?? job.createdAt)}
            </span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.3, color: "#98b8bd" }}>
            Job value
          </div>
          <div style={{ fontSize: 28, fontWeight: 780, letterSpacing: "-0.04em", marginTop: 2 }}>
            {money(totals.total)}
          </div>
          <div className="row wrap" style={{ justifyContent: "flex-end", marginTop: 10 }}>
            {canEdit && (
              <>
                <button className="btn btn-accent btn-sm" onClick={() => openTaskModal()}>
                  <Plus />
                  Add task
                </button>
                <button className="btn btn-secondary btn-sm" onClick={openPartModal}>
                  <Package />
                  Request parts
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => setCompleteOpen(true)}>
                  <CheckCircle2 />
                  Complete repair
                </button>
              </>
            )}
            {job.status === "Repair Completed" && canBill && (
              <Link className="btn btn-primary btn-sm" to="/cashier">
                <Wallet />
                Send to billing
                <ChevronRight />
              </Link>
            )}
            {invoiceReady && (canBill || currentUser?.isOwner) && (
              <button className="btn btn-primary btn-sm" onClick={handlePrintInvoice}>
                <Printer />
                Print invoice
              </button>
            )}
            {invoiceReady && canDispatch && (
              <Link className="btn btn-secondary btn-sm" to="/gate">
                <ShieldCheck />
                Gate clearance
              </Link>
            )}
          </div>
        </div>
      </div>

      {activeJob.intakeType === "Estimate" && !repairUnlocked && (
        <Alert tone="warn" title="Estimate-only job — work is locked">
          Add task, Request parts and Complete repair stay hidden until the Initial estimate is
          approved. Approval copies the estimate lines into tasks and parts and moves the job to In
          Progress.
        </Alert>
      )}

      <div className="row-between wrap" style={{ marginBottom: 14 }}>
        <Tabs<JobTab>
          value={tab}
          onChange={setTab}
          tabs={jobTabs}
        />
        <span className="tiny muted">
          Job created {dateTime(job.createdAt)} · photos stored under {job.driveFolderId}
        </span>
      </div>

      <div className="grid cols-3">
        <div className="span-2 stack">
          {tab === "overview" && (
            <>
              <div className="card">
                <div className="card-head">
                  <div>
                    <h3>Gate inspection & safety notes</h3>
                    <p>Recorded by the PRO when the vehicle was accepted.</p>
                  </div>
                  <span className="badge badge-brand">
                    <Camera size={11} /> {job.photos.length} photo{job.photos.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="card-body stack">
                  <div className="inspection-panel">{job.safetyNotes || "No safety notes recorded."}</div>
                  {job.photos.length > 0 ? (
                    <div className="photo-strip">
                      {job.photos.map((photo) => (
                        <img
                          key={photo.id}
                          src={photo.dataUrl}
                          alt={photo.name}
                          className="photo-thumb"
                          onClick={() => setPhotoView(photo)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="tiny muted">No photos were attached at acceptance.</div>
                  )}
                </div>
              </div>

              <div className="grid cols-2">
                <div className="card">
                  <div className="card-head">
                    <div>
                      <h3>Job summary</h3>
                      <p>Vehicle, customer and repair context.</p>
                    </div>
                  </div>
                  <div className="card-body">
                    <div className="kv">
                      <span>Repair type</span>
                      <span>{job.repairType}</span>
                    </div>
                    <div className="kv">
                      <span>Intake</span>
                      <span>{job.intakeType}</span>
                    </div>
                    <div className="kv">
                      <span>Mileage at intake</span>
                      <span>{job.mileage.toLocaleString()} km</span>
                    </div>
                    <div className="kv">
                      <span>Customer</span>
                      <span>{job.customerName}</span>
                    </div>
                    <div className="kv">
                      <span>Mobile</span>
                      <span>{job.phone}</span>
                    </div>
                    <div className="kv">
                      <span>Payment method</span>
                      <span>{job.paymentMethod ?? "Not billed yet"}</span>
                    </div>
                    {credit && (
                      <div className="kv">
                        <span>Credit due</span>
                        <span>
                          {shortDate(credit.dueDate)}{" "}
                          {credit.status !== "Settled" &&
                            (daysUntil(credit.dueDate) < 0
                              ? `(overdue ${Math.abs(daysUntil(credit.dueDate))}d)`
                              : `(in ${daysUntil(credit.dueDate)}d)`)}
                        </span>
                      </div>
                    )}
                    {driverEnabled && (
                      <div className="kv">
                        <span>Driver commission · internal</span>
                        <span className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                          {job.driver ? (
                            <>
                              <span>
                                {job.driver.name} ·{" "}
                                {job.driver.type === "Percentage"
                                  ? `${job.driver.value}% of ${job.driver.basis.toLowerCase()}`
                                  : money(job.driver.value)}
                                {" "}· {money(driverCommission)}
                              </span>
                              <span className="tiny muted">hidden from customers</span>
                            </>
                          ) : (
                            <span className="tiny muted">Not recorded</span>
                          )}
                          {job.driver && (
                            <button
                              className="btn btn-ghost btn-sm"
                              title="Print thermal driver commission chit"
                              onClick={() =>
                                printDriverCommissionChit(activeJob, state.settings, {
                                  labor: activeTotals.labor,
                                  total: Math.max(0, activeTotals.total - activeTotals.vat),
                                })
                              }
                            >
                              <Printer />
                            </button>
                          )}
                          {canEditDriver && (
                            <button
                              className="btn btn-ghost btn-sm"
                              title={
                                job.driver ? "Edit driver commission" : "Add driver commission"
                              }
                              onClick={openDriverModal}
                            >
                              <Pencil />
                            </button>
                          )}
                        </span>
                      </div>
                    )}
                    {advanceTotal > 0 && (
                      <div className="kv">
                        <span>Advance received</span>
                        <span>{money(advanceTotal)}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="card">
                  <div className="card-head">
                    <div>
                      <h3>Work status</h3>
                      <p>What's happening right now.</p>
                    </div>
                  </div>
                  <div className="card-body">
                    <div className="kv">
                      <span>Lab tasks</span>
                      <span>{jobTasks.length}</span>
                    </div>
                    <div className="kv">
                      <span>Parts lines</span>
                      <span>{jobParts.length}</span>
                    </div>
                    <div className="kv">
                      <span>Open stores items</span>
                      <span>{pendingParts.length}</span>
                    </div>
                    <div className="kv">
                      <span>Issued parts</span>
                      <span>{totals.issuedParts.length}</span>
                    </div>
                    <div className="kv">
                      <span>Estimated margin</span>
                      <span>{money(totals.parts - totals.partsCost)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <div>
                    <h3>Job timeline</h3>
                    <p>Every gate and workshop milestone.</p>
                  </div>
                </div>
                <div className="card-body">
                  <div className="timeline">
                    {timeline.map((item) => (
                      <div className="timeline-item" key={item.label}>
                        <div className="timeline-date">{dateTime(item.date)}</div>
                        <div className="small strong">{item.label}</div>
                      </div>
                    ))}
                    {timeline.length === 0 && <div className="tiny muted">No timeline events yet.</div>}
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === "labour" && (
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Labour & technician tasks</h3>
                  <p>Assign work to workers — commission is computed from their rate.</p>
                </div>
                {canEdit && (
                  <button className="btn btn-primary btn-sm" onClick={() => openTaskModal()}>
                    <Plus />
                    Add task
                  </button>
                )}
              </div>
              <div className="card-body" style={{ paddingTop: 8 }}>
                {jobTasks.length === 0 ? (
                  <EmptyState
                    icon={<Wrench size={22} />}
                    title="No labour tasks yet"
                    message="Assign each repair task to the technician who does the work. This creates the basis for commission and warranty traceability."
                    action={
                      canEdit ? (
                        <button className="btn btn-primary" onClick={() => openTaskModal()}>
                          <Plus />
                          Assign first task
                        </button>
                      ) : undefined
                    }
                  />
                ) : (
                  jobTasks.map((task) => {
                    const worker = state.workers.find((entry) => entry.id === task.workerId);
                    return (
                      <div className="list-row" key={task.id}>
                        <span className="part-icon" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
                          <Wrench size={15} />
                        </span>
                        <div className="list-main">
                          <strong>{task.name}</strong>
                          <span>
                            {worker?.fullName ?? "Unassigned"} · commission{" "}
                            {worker ? `${worker.commissionRate}%` : "0%"} · added {timeAgo(task.createdAt)}
                          </span>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div className="strong small">{money(task.laborCost)}</div>
                          <div className="tiny muted">
                            {money((task.laborCost * (worker?.commissionRate ?? 0)) / 100)} commission
                          </div>
                        </div>
                        {canEdit && (
                          <>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => openTaskModal(task)}
                              title="Edit task"
                            >
                              <Pencil />
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ color: "var(--danger)" }}
                              onClick={() => {
                                removeTask(task.id);
                                push("Labour task removed.", "info");
                              }}
                              title="Remove task"
                            >
                              <Trash2 />
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              <div className="card-foot row-between">
                <span className="small muted">
                  {jobTasks.length} task{jobTasks.length === 1 ? "" : "s"} ·{" "}
                  {workers.length} active technician{workers.length === 1 ? "" : "s"}
                </span>
                <span className="strong">
                  Labour total {money(totals.labor)} · commission {money(totals.commission)}
                </span>
              </div>
            </div>
          )}

          {tab === "parts" && (
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Parts & materials</h3>
                  <p>Strict stock enforcement with vehicle-fitment matching.</p>
                </div>
                {canEdit && (
                  <button className="btn btn-primary btn-sm" onClick={openPartModal}>
                    <Plus />
                    Request a part
                  </button>
                )}
              </div>
              <div className="card-body" style={{ paddingTop: 8 }}>
                {jobParts.length === 0 ? (
                  <EmptyState
                    icon={<Package size={22} />}
                    title="No parts requested"
                    message="Search only parts that fit this vehicle's make and model. Stocks are deducted when stores issues the item."
                    action={
                      canEdit ? (
                        <button className="btn btn-primary" onClick={openPartModal}>
                          <Package />
                          Find a part
                        </button>
                      ) : undefined
                    }
                  />
                ) : (
                  jobParts.map((part) => {
                    const supplier = state.suppliers.find((entry) => entry.id === part.supplierId);
                    const item = state.inventory.find((entry) => entry.id === part.itemId);
                    const unit = item?.measureUnit ?? item?.unit ?? "pc";
                    const isConsumable = item?.type === "Consumable";
                    const section = state.sections.find((entry) => entry.id === part.sectionId);
                    return (
                      <div className="part-row" key={part.id}>
                        <span className="part-icon">
                          <Package size={15} />
                        </span>
                        <div className="list-main">
                          <div className="row wrap" style={{ gap: 6 }}>
                            <strong style={{ fontSize: 12.7 }}>{part.itemName}</strong>
                            <StatusBadge status={part.status} />
                            {part.includedInLabor && (
                              <span className="badge badge-slate">Included in labor</span>
                            )}
                            {sectionsEnabled && section && (
                              <span
                                className="chip"
                                style={{
                                  borderColor: section.color,
                                  color: section.color,
                                  background: `${section.color}14`,
                                }}
                              >
                                {section.name}
                              </span>
                            )}
                          </div>
                          <span>
                            Requested {formatQty(part.qtyRequested, unit)} · issued{" "}
                            {formatQty(partIssueQty(part), unit)} ·{" "}
                            {supplier?.name ?? "Supplier pending"} · {part.marginPercent}% margin
                          </span>
                          <div className="tiny muted" style={{ marginTop: 3 }}>
                            Cost {money(part.costPrice, 2)} · sells at {money(part.sellingPrice, 2)} per {unit}
                          </div>
                          <div className="tiny muted" style={{ marginTop: 2 }}>
                            Supplier invoice: {part.supplierInvoiceNo || "not recorded"}
                            {part.warrantyReplacementInvoiceNo && (
                              <> · Replacement invoice: {part.warrantyReplacementInvoiceNo}</>
                            )}
                            {part.warrantyStatus !== "None" && (
                              <> · Warranty: {part.warrantyStatus}{part.creditNoteNo ? ` (${part.creditNoteNo})` : ""}</>
                            )}
                            {claim && (
                              <> · Salvage: {part.salvageStatus ?? "Not Required"}</>
                            )}
                          </div>
                          {part.warrantyNote && (
                            <div className="tiny muted" style={{ marginTop: 2 }}>{part.warrantyNote}</div>
                          )}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div className="strong small">
                            {part.includedInLabor
                              ? "Internal cost"
                              : money(part.sellingPrice * partIssueQty(part))}
                          </div>
                          <div className="tiny muted">line value</div>
                          {isConsumable && part.status === "Issued" && canSupervise && (
                            <label className="tiny" style={{ display: "inline-flex", gap: 4, marginTop: 3 }}>
                              <input
                                type="checkbox"
                                checked={Boolean(part.includedInLabor)}
                                onChange={(event) =>
                                  togglePartIncludedInLabor(part.id, event.target.checked)
                                }
                              />
                              In labor
                            </label>
                          )}
                        </div>
                        {canEdit && (part.status === "Requested" || part.status === "Backordered") && (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: "var(--danger)" }}
                            title="Remove this part request"
                            onClick={() => {
                              const result = removePart(part.id);
                              if (!result.ok) {
                                push(result.message ?? "Could not remove the part.", "error");
                                return;
                              }
                              push(`${part.itemName} removed from the job card.`, "info");
                            }}
                          >
                            <Trash2 />
                          </button>
                        )}
                        {canEdit && part.status === "Issued" && (
                          <div className="row" style={{ gap: 4 }}>
                            <button
                              className="btn btn-ghost btn-sm"
                              title="Request exchange"
                              onClick={() => requestSwap(part.id)}
                            >
                              <RefreshCcw />
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              title="Request return"
                              onClick={() => requestShelfReturn(part.id)}
                            >
                              <XCircle />
                            </button>
                          </div>
                        )}
                        {canSupervise &&
                          part.status === "Issued" &&
                          part.warrantyStatus !== "Claimed" &&
                          part.warrantyStatus !== "Credited" && (
                            <button
                              className="btn btn-ghost btn-sm"
                              title="Raise warranty claim"
                              onClick={() => openWarrantyClaim(part.id)}
                            >
                              <ShieldAlert />
                            </button>
                          )}
                        {insuranceEnabled && claim && part.status === "Issued" && !isConsumable && (
                          <select
                            className="select"
                            style={{ width: 116, fontSize: 11 }}
                            title="Per-part salvage status"
                            value={part.salvageStatus ?? "Not Required"}
                            onChange={(event) =>
                              changeSalvage(
                                part.id,
                                event.target.value as "Pending" | "Submitted" | "Not Required",
                              )
                            }
                          >
                            <option value="Pending">Salvage pending</option>
                            <option value="Submitted">Salvage submitted</option>
                            <option value="Not Required">No salvage</option>
                          </select>
                        )}
                        {part.status === "Exchange Pending" && (
                          <span className="badge badge-blue">Stores swapping</span>
                        )}
                        {part.status === "Return Pending" && (
                          <span className="badge badge-amber">Awaiting return</span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              <div className="card-foot row-between">
                <span className="small muted">
                  Selling price updates on the same row when stores completes a swap.
                </span>
                <span className="strong">
                  Parts total {money(totals.parts)}
                  {totals.includedParts.length > 0 && (
                    <span className="tiny muted">
                      {" "}· {money(
                        totals.includedParts.reduce(
                          (sum, part) => sum + part.costPrice * partIssueQty(part),
                          0,
                        ),
                      )} internal consumable cost
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}

          {tab === "estimates" && estimatesEnabled && (
            <div className="stack">
              <div className="card">
                <div className="card-head">
                  <div>
                    <h3>Estimates & approvals</h3>
                    <p>Initial or supplementary quotations for insurer and customer approval.</p>
                  </div>
                  {canSupervise && (
                    <div className="row wrap">
                      {!initialEstimate && (
                        <button className="btn btn-primary btn-sm" onClick={() => openEstimate("Initial")}>
                          <Plus />
                          Initial estimate
                        </button>
                      )}
                      <button className="btn btn-secondary btn-sm" onClick={() => openEstimate("Supplementary")}>
                        <Plus />
                        Supplementary
                      </button>
                    </div>
                  )}
                </div>
                <div className="card-body" style={{ paddingTop: 8 }}>
                  {jobEstimates.length === 0 ? (
                    <EmptyState
                      icon={<FileText size={22} />}
                      title="No estimates yet"
                      message="Create an estimate for a vehicle accepted as an estimate-only job, or a supplementary estimate when extra work is discovered. Estimates can be prepared even after check-in."
                      action={
                        canSupervise ? (
                          <button className="btn btn-primary" onClick={() => openEstimate("Initial")}>
                            <FileText />
                            Create estimate
                          </button>
                        ) : undefined
                      }
                    />
                  ) : (
                    jobEstimates.map((estimate) => {
                      const estimateTotal = estimate.lines.reduce(
                        (sum, line) => sum + line.qty * line.unitPrice,
                        0,
                      );
                      return (
                        <div key={estimate.id} style={{ marginBottom: 18 }}>
                          <div className="row-between wrap" style={{ marginBottom: 8 }}>
                            <div className="row wrap" style={{ gap: 8 }}>
                              <strong>{estimate.number} estimate</strong>
                              <span className="badge badge-brand">Rev {estimate.revision}</span>
                              <StatusBadge status={estimate.status} />
                              <span className="badge badge-slate">{money(estimateTotal)}</span>
                              {estimate.status === "Approved" && (
                                <span className="badge badge-slate">Locked</span>
                              )}
                            </div>
                            <div className="row wrap" style={{ gap: 4 }}>
                              {canSupervise && estimate.status !== "Approved" && (
                                <>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => openEstimate(estimate.kind, estimate)}
                                  >
                                    <Pencil />
                                    Edit
                                  </button>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ color: "var(--danger)" }}
                                    title="Delete this estimate"
                                    onClick={() => {
                                      const result = removeEstimate(estimate.id);
                                      if (!result.ok) {
                                        push(result.message ?? "Could not delete the estimate.", "error");
                                        return;
                                      }
                                      push(`${estimate.number} estimate deleted.`, "info");
                                    }}
                                  >
                                    <Trash2 />
                                    Delete
                                  </button>
                                </>
                              )}
                              {canManageInsurance && estimate.status === "Awaiting Approval" && (
                                <>
                                  <button
                                    className="btn btn-soft btn-sm"
                                    onClick={() => changeEstimateStatus(estimate, "Approved")}
                                  >
                                    <CheckCircle2 />
                                    Approve
                                  </button>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => changeEstimateStatus(estimate, "Rejected")}
                                  >
                                    <XCircle />
                                    Reject
                                  </button>
                                </>
                              )}
                              <button
                                className="btn btn-ghost btn-sm"
                                title="Download estimate PDF"
                                onClick={() => downloadEstimatePdf(estimate)}
                              >
                                <Download />
                                PDF
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                title="Print the A4 estimate"
                                onClick={() => printEstimate(estimate)}
                              >
                                <Printer />
                                Print
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                title="Send estimate on WhatsApp"
                                disabled={busyAction === `estimate_share_${estimate.id}`}
                                onClick={() => shareEstimate(estimate)}
                              >
                                <Send />
                                WhatsApp
                              </button>
                              {claim && (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  title="Email the estimate to the insurer"
                                  onClick={() => emailEstimate(estimate)}
                                >
                                  <Send />
                                  Email
                                </button>
                              )}
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => openEstimate("Supplementary")}
                                disabled={!canSupervise}
                              >
                                <Plus />
                                Supplement
                              </button>
                            </div>
                          </div>
                          <div className="table-wrap">
                            <table className="data">
                              <thead>
                                <tr>
                                  <th>Type</th>
                                  <th>Description</th>
                                  <th className="num">Qty</th>
                                  <th className="num">Unit price</th>
                                  <th className="num">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {estimate.lines.map((line) => (
                                  <tr key={line.id}>
                                    <td><span className="chip">{line.type}</span></td>
                                    <td>{line.description}</td>
                                    <td className="num">{line.qty}</td>
                                    <td className="num">{money(line.unitPrice)}</td>
                                    <td className="num">{money(line.qty * line.unitPrice)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="tiny muted" style={{ marginTop: 6 }}>
                            {estimate.notes || "No notes."} · created {dateTime(estimate.createdAt)} by{" "}
                            {estimate.createdBy ?? "—"}
                            {estimate.approvedAt ? ` · approved ${dateTime(estimate.approvedAt)}` : ""}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === "insurance" && insuranceEnabled && (
            <div className="stack">
              {!claim ? (
                <div className="card">
                  <div className="card-head">
                    <div>
                      <h3>Open an insurance claim</h3>
                      <p>Link this job to the insurer, policy and assessor before approval work starts.</p>
                    </div>
                    <ShieldCheck size={18} className="muted" />
                  </div>
                  <div className="card-body stack">
                    {canManageInsurance ? (
                      <>
                        <div className="form-grid">
                          <Field label="Insurance company" required full>
                            <select
                              className="select"
                              value={claimForm.insurerId}
                              onChange={(event) =>
                                setClaimForm({ ...claimForm, insurerId: event.target.value })
                              }
                            >
                              <option value="">Choose insurer</option>
                              {state.insuranceCompanies
                                .filter((company) => company.active !== false)
                                .map((company) => (
                                  <option key={company.id} value={company.id}>{company.name}</option>
                                ))}
                            </select>
                          </Field>
                          <Field label="Claim number" required>
                            <input
                              className="input"
                              value={claimForm.claimNo}
                              onChange={(event) =>
                                setClaimForm({ ...claimForm, claimNo: event.target.value })
                              }
                            />
                          </Field>
                          <Field label="Policy number" required>
                            <input
                              className="input"
                              value={claimForm.policyNo}
                              onChange={(event) =>
                                setClaimForm({ ...claimForm, policyNo: event.target.value })
                              }
                            />
                          </Field>
                          <Field label="Assessor name">
                            <input
                              className="input"
                              value={claimForm.assessorName}
                              onChange={(event) =>
                                setClaimForm({ ...claimForm, assessorName: event.target.value })
                              }
                            />
                          </Field>
                          <Field label="Assessor phone">
                            <input
                              className="input"
                              value={claimForm.assessorPhone}
                              onChange={(event) =>
                                setClaimForm({ ...claimForm, assessorPhone: event.target.value })
                              }
                            />
                          </Field>
                        </div>
                        <button className="btn btn-primary" onClick={saveClaim}>
                          <ShieldCheck />
                          Open insurance claim
                        </button>
                      </>
                    ) : (
                      <Alert tone="info" title="Supervisor task">
                        A supervisor or the owner opens the insurance claim for this job.
                      </Alert>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="card">
                    <div className="card-head">
                      <div>
                        <h3>{insurer?.name ?? "Insurance claim"}</h3>
                        <p>
                          Claim {claim.claimNo} · policy {claim.policyNo} · opened {timeAgo(claim.createdAt)}
                        </p>
                      </div>
                      <StatusBadge status={claim.status} />
                    </div>
                    <div className="card-body">
                      <div className="grid cols-3" style={{ gap: 10 }}>
                        <div className="mini-stat card">
                          <div className="label">Estimate</div>
                          <div className="value" style={{ fontSize: 14 }}>{claim.estimateStatus}</div>
                          <div className="meta">{claim.estimateApprovedAt ? shortDate(claim.estimateApprovedAt) : "Awaiting approval"}</div>
                        </div>
                        <div className="mini-stat card">
                          <div className="label">Parts approval</div>
                          <div className="value" style={{ fontSize: 14 }}>{claim.partsStatus}</div>
                          <div className="meta">{claim.partsApprovedAt ? shortDate(claim.partsApprovedAt) : "Awaiting approval"}</div>
                        </div>
                        <div className="mini-stat card">
                          <div className="label">Salvage</div>
                          <div className="value" style={{ fontSize: 14 }}>{claim.salvageStatus}</div>
                          <div className="meta">{claim.salvageReference ?? "No reference"}</div>
                        </div>
                      </div>
                      <div className="divider" />
                      <div className="grid cols-2" style={{ gap: 12 }}>
                        <div>
                          <div className="kv"><span>Insurer hotline</span><span>{insurer?.hotline ?? "—"}</span></div>
                          <div className="kv"><span>Email</span><span className="tiny">{insurer?.email ?? "—"}</span></div>
                          <div className="kv"><span>Address</span><span className="tiny">{insurer?.address ?? "—"}</span></div>
                          <div className="kv"><span>Assessor</span><span>{claim.assessorName ?? "—"} {claim.assessorPhone ? `· ${claim.assessorPhone}` : ""}</span></div>
                        </div>
                        <div>
                          <div className="kv"><span>Release order</span><span>{claim.releaseOrderNo ?? "Not received"}</span></div>
                          <div className="kv"><span>Insurance bill</span><span>{claim.insuranceBillAmount ? money(claim.insuranceBillAmount) : "Not billed"}</span></div>
                          <div className="kv"><span>Customer bill</span><span>{claim.customerBillAmount !== undefined ? money(claim.customerBillAmount) : "Not billed"}</span></div>
                          <div className="kv"><span>Cheque</span><span>{claim.chequeNo ? `${claim.chequeNo} · ${money(claim.chequeAmount ?? 0)}` : "Not received"}</span></div>
                          <div className="kv"><span>Salvage submitted</span><span>{claim.salvageSubmittedAt ? shortDate(claim.salvageSubmittedAt) : "Pending"}</span></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid cols-2">
                    <div className="card">
                      <div className="card-head"><div><h3>Approvals</h3><p>Record the insurer's decisions.</p></div></div>
                      <div className="card-body stack">
                        <div className="row-between">
                          <span className="small">Estimate approval</span>
                          {claim.estimateStatus === "Approved" ? (
                            <span className="badge badge-green">Approved</span>
                          ) : (
                            <button className="btn btn-soft btn-sm" onClick={approveClaimEstimate} disabled={!canManageInsurance}>
                              <CheckCircle2 />
                              Mark approved
                            </button>
                          )}
                        </div>
                        <div className="row-between">
                          <span className="small">Parts approval</span>
                          {claim.partsStatus === "Approved" ? (
                            <span className="badge badge-green">Approved</span>
                          ) : (
                            <button className="btn btn-soft btn-sm" onClick={approveClaimParts} disabled={!canManageInsurance}>
                              <CheckCircle2 />
                              Mark approved
                            </button>
                          )}
                        </div>
                        <div className="divider" />
                        <Field label="Insurer release order no." hint="Vehicle may be released on this without waiting for the cheque.">
                          <input
                            className="input"
                            value={releaseOrderNo}
                            placeholder={claim.releaseOrderNo ?? "RO-2026-018"}
                            onChange={(event) => setReleaseOrderNo(event.target.value)}
                          />
                        </Field>
                        <div className="row wrap">
                          <button className="btn btn-secondary btn-sm" onClick={saveReleaseOrder} disabled={!canManageInsurance}>
                            <ShieldCheck />
                            Record release order
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="card">
                      <div className="card-head"><div><h3>Salvage submission</h3><p>Per-part salvage data lives under Parts & materials.</p></div></div>
                      <div className="card-body stack">
                        <div className="kv"><span>Status</span><span>{claim.salvageStatus}</span></div>
                        <Field label="Salvage reference / handover note">
                          <input
                            className="input"
                            placeholder="Salvage handed to assessor"
                            value={salvageReference}
                            onChange={(event) => setSalvageReference(event.target.value)}
                          />
                        </Field>
                        <button className="btn btn-secondary btn-sm" onClick={saveSalvageSubmission} disabled={!canManageInsurance}>
                          <Package />
                          Mark salvage submitted
                        </button>
                        <div className="tiny muted">
                          {jobParts.filter((part) => part.salvageStatus === "Pending").length} part line(s)
                          still pending salvage. Update each line in the parts tab.
                        </div>
                      </div>
                    </div>

                    <div className="card">
                      <div className="card-head"><div><h3>Insurance bill</h3><p>Bill the insurer and share the PDF.</p></div></div>
                      <div className="card-body stack">
                        <div className="form-grid">
                          <Field label="Bill number">
                            <input
                              className="input"
                              value={billNo}
                              placeholder={claim.insuranceBillNo ?? `INS-${claim.claimNo}`}
                              onChange={(event) => setBillNo(event.target.value)}
                            />
                          </Field>
                          <Field label="Bill amount (LKR)">
                            <input
                              className="input"
                              type="number"
                              min={0}
                              value={billAmount}
                              placeholder={String(claim.insuranceBillAmount ?? activeTotals.total)}
                              onChange={(event) => setBillAmount(event.target.value)}
                            />
                          </Field>
                        </div>
                        <div className="row wrap">
                          <button className="btn btn-primary btn-sm" onClick={saveInsuranceBill} disabled={!canManageInsurance}>
                            <FileText />
                            Record bill
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={downloadInsuranceBill}>
                            <Download />
                            PDF
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={shareInsuranceBill} disabled={busyAction === "insurance_share"}>
                            <MessageCircle />
                            WhatsApp
                          </button>
                        </div>
                        <div className="tiny muted">
                          Current bill: {claim.insuranceBillAmount ? money(claim.insuranceBillAmount) : "not recorded"}.
                        </div>
                      </div>
                    </div>

                    <div className="card">
                      <div className="card-head"><div><h3>Customer bill</h3><p>Invoice issued to the vehicle owner.</p></div></div>
                      <div className="card-body stack">
                        <div className="form-grid">
                          <Field label="Bill number">
                            <input
                              className="input"
                              value={customerBillNo}
                              placeholder={claim.customerBillNo ?? activeJob.id}
                              onChange={(event) => setCustomerBillNo(event.target.value)}
                            />
                          </Field>
                          <Field label="Bill amount (LKR)">
                            <input
                              className="input"
                              type="number"
                              min={0}
                              value={customerBillAmount}
                              placeholder={String(claim.customerBillAmount ?? activeTotals.total)}
                              onChange={(event) => setCustomerBillAmount(event.target.value)}
                            />
                          </Field>
                        </div>
                        <button className="btn btn-secondary btn-sm" onClick={saveCustomerBill} disabled={!canManageInsurance}>
                          <FileText />
                          Record customer bill
                        </button>
                        <div className="tiny muted">
                          Current customer bill: {claim.customerBillAmount !== undefined ? money(claim.customerBillAmount) : "not recorded"}.
                        </div>
                      </div>
                    </div>

                    <div className="card">
                      <div className="card-head"><div><h3>Cheque & settlement</h3><p>Track the insurer cheque through to clearance.</p></div></div>
                      <div className="card-body stack">
                        <div className="form-grid">
                          <Field label="Cheque number">
                            <input className="input" value={chequeNo} onChange={(event) => setChequeNo(event.target.value)} />
                          </Field>
                          <Field label="Cheque amount (LKR)">
                            <input
                              className="input"
                              type="number"
                              min={0}
                              value={chequeAmount}
                              onChange={(event) => setChequeAmount(event.target.value)}
                            />
                          </Field>
                          <Field label="Bank">
                            <input
                              className="input"
                              placeholder="Issuing bank"
                              value={chequeBank}
                              onChange={(event) => setChequeBank(event.target.value)}
                            />
                          </Field>
                          <Field label="Branch">
                            <input
                              className="input"
                              placeholder="Branch"
                              value={chequeBranch}
                              onChange={(event) => setChequeBranch(event.target.value)}
                            />
                          </Field>
                          <Field label="Cheque date" hint="Post-dated cheques stay In Safe until deposit.">
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
                              {state.bankAccounts
                                .filter((account) => account.active)
                                .map((account) => (
                                  <option key={account.id} value={account.id}>
                                    {account.name}
                                  </option>
                                ))}
                            </select>
                          </Field>
                        </div>
                        <div className="row wrap">
                          <button className="btn btn-secondary btn-sm" onClick={saveCheque} disabled={!canManageInsurance}>
                            <Banknote />
                            Record cheque
                          </button>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={settleClaim}
                            disabled={!canManageInsurance || !claim.chequeAmount || claim.status === "Settled"}
                          >
                            <CheckCircle2 />
                            Settle claim
                          </button>
                        </div>
                        <div className="tiny muted">
                          {claim.chequeClearedAt
                            ? `Cleared ${shortDate(claim.chequeClearedAt)}.`
                            : claim.chequeReceivedAt
                              ? `Received ${shortDate(claim.chequeReceivedAt)} — awaiting clearance.`
                              : "No cheque recorded yet."}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === "invoice" && (
            <div className="stack">
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Invoice & payment</h3>
                  <p>Generated from labour tasks and issued parts.</p>
                </div>
                {invoiceReady ? (
                  <StatusBadge status={job.status} />
                ) : (
                  <span className="badge badge-amber">Not billed yet</span>
                )}
              </div>
              <div className="card-body">
                {!invoiceReady ? (
                  <div className="stack">
                    <Alert tone="warn" title="The invoice is locked until billing is complete">
                      The cashier must record payment (cash, card or approved credit) before an
                      official invoice can be printed or shared. The totals below are a proforma.
                    </Alert>
                    <div className="table-wrap">
                      <table className="data">
                        <thead>
                          <tr>
                            <th>Description</th>
                            <th className="num">Qty</th>
                            <th className="num">Unit</th>
                            <th className="num">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {totals.issuedParts.map((part) => (
                            <tr key={part.id}>
                              <td>{part.itemName}</td>
                              <td className="num">{formatQty(partIssueQty(part))}</td>
                              <td className="num">{money(part.sellingPrice)}</td>
                              <td className="num">{money(part.sellingPrice * partIssueQty(part))}</td>
                            </tr>
                          ))}
                          {jobTasks.map((task) => (
                            <tr key={task.id}>
                              <td>
                                {task.name}
                                <div className="cell-sub">
                                  {state.workers.find((worker) => worker.id === task.workerId)?.fullName}
                                </div>
                              </td>
                              <td className="num">1</td>
                              <td className="num">{money(task.laborCost)}</td>
                              <td className="num">{money(task.laborCost)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {job.status === "Repair Completed" && canBill && (
                      <Link className="btn btn-primary" to="/cashier">
                        <Wallet />
                        Go to billing queue
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="stack">
                    <div
                      style={{
                        border: "1px solid var(--line)",
                        borderRadius: 12,
                        overflow: "hidden",
                      }}
                    >
                      <div style={{ background: state.settings.brandColor, color: "#fff", padding: "18px 20px" }}>
                        <div className="row-between wrap">
                          <div>
                            <div style={{ fontSize: 19, fontWeight: 800 }}>{state.settings.companyName}</div>
                            <div style={{ fontSize: 10.5, opacity: 0.8, marginTop: 2 }}>
                              {state.settings.address}
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 1 }}>INVOICE</div>
                            <div style={{ fontSize: 10.5, opacity: 0.85 }}>{job.id}</div>
                          </div>
                        </div>
                      </div>
                      <div style={{ padding: "16px 20px" }}>
                        <div className="grid cols-3" style={{ gap: 12 }}>
                          <div>
                            <div className="tiny muted">Billed to</div>
                            <div className="small strong">{job.customerName}</div>
                            <div className="tiny muted">{job.phone}</div>
                          </div>
                          <div>
                            <div className="tiny muted">Vehicle</div>
                            <div className="small strong">{job.vehicleNo}</div>
                            <div className="tiny muted">
                              {job.make} {job.model} · {job.mileage.toLocaleString()} km
                            </div>
                          </div>
                          <div>
                            <div className="tiny muted">Payment</div>
                            <div className="small strong">{job.paymentMethod}</div>
                            <div className="tiny muted">{shortDate(job.paidAt)}</div>
                          </div>
                        </div>
                        <div className="divider" />
                        <div className="table-wrap">
                          <table className="data">
                            <thead>
                              <tr>
                                <th>Description</th>
                                <th className="num">Qty</th>
                                <th className="num">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {totals.issuedParts.map((part) => (
                                <tr key={part.id}>
                                  <td>{part.itemName}</td>
                                  <td className="num">{formatQty(partIssueQty(part))}</td>
                                  <td className="num">
                                    {money(part.sellingPrice * partIssueQty(part))}
                                  </td>
                                </tr>
                              ))}
                              {jobTasks.map((task) => (
                                <tr key={task.id}>
                                  <td>{task.name}</td>
                                  <td className="num">1</td>
                                  <td className="num">{money(task.laborCost)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div style={{ maxWidth: 300, marginLeft: "auto", marginTop: 12 }}>
                          <div className="kv">
                            <span>Labour</span>
                            <span>{money(totals.labor)}</span>
                          </div>
                          <div className="kv">
                            <span>Parts</span>
                            <span>{money(totals.parts)}</span>
                          </div>
                          {totals.discount > 0 && (
                            <div className="kv">
                              <span>Discount</span>
                              <span>- {money(totals.discount)}</span>
                            </div>
                          )}
                          <div className="kv" style={{ fontSize: 15 }}>
                            <span>Total</span>
                            <span>{money(totals.total)}</span>
                          </div>
                          {credit && (
                            <div className="kv">
                              <span>Credit due</span>
                              <span>{shortDate(credit.dueDate)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="row wrap">
                      <button
                        className="btn btn-primary"
                        onClick={handlePrintInvoice}
                      >
                        <Printer />
                        Thermal print
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={handleDownloadInvoice}
                        disabled={busyAction === "download"}
                      >
                        <Download />
                        Download PDF
                      </button>
                      {(canBill || currentUser?.isOwner) && (
                        <button
                          className="btn btn-secondary"
                          onClick={handleShareInvoice}
                          disabled={busyAction === "share"}
                        >
                          <MessageCircle />
                          Send PDF on WhatsApp
                        </button>
                      )}
                      <a
                        className="btn btn-ghost"
                        href={waLink(job.phone, checkoutMessage(job, totals.total, state.settings, dueDate))}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <MessageCircle />
                        Invoice note & review request
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Separate vehicle bills</h3>
                  <p>
                    One vehicle can carry more than one bill — for example an insurer bill and a
                    separate customer bill for the excess.
                  </p>
                </div>
                <ReceiptText size={16} className="muted" />
              </div>
              <div className="card-body stack">
                {jobBills.length === 0 ? (
                  <p className="small muted">No separate bills recorded for this vehicle yet.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Bill</th>
                          <th>Type</th>
                          <th className="num">Amount</th>
                          <th>Recorded</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {jobBills.map((bill) => (
                          <tr key={bill.id}>
                            <td>
                              {bill.billNo}
                              {bill.notes && <div className="cell-sub">{bill.notes}</div>}
                            </td>
                            <td>
                              <span className={`badge ${bill.kind === "Insurance" ? "badge-blue" : "badge-slate"}`}>
                                {bill.kind}
                              </span>
                            </td>
                            <td className="num">{money(bill.amount)}</td>
                            <td>
                              <div className="tiny muted">
                                {dateTime(bill.createdAt)}
                                {bill.createdBy ? ` · ${bill.createdBy}` : ""}
                              </div>
                            </td>
                            <td>
                              <button
                                className="btn btn-ghost btn-sm"
                                title="Remove this bill"
                                onClick={() => {
                                  removeVehicleBill(bill.id);
                                  push(`${bill.billNo} removed from ${activeJob.vehicleNo}.`, "info");
                                }}
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
                <div className="divider" />
                <div className="grid cols-4" style={{ gap: 10 }}>
                  <Field label="Bill type">
                    <select
                      className="input"
                      value={billKind}
                      onChange={(event) =>
                        setBillKind(event.target.value as "Insurance" | "Customer")
                      }
                    >
                      <option value="Customer">Customer</option>
                      <option value="Insurance">Insurance</option>
                    </select>
                  </Field>
                  <Field label="Bill number" required>
                    <input
                      className="input"
                      value={billHistoryNo}
                      placeholder={billKind === "Insurance" ? "INS-2026-018" : "CUS-2026-018"}
                      onChange={(event) => setBillHistoryNo(event.target.value)}
                    />
                  </Field>
                  <Field label="Amount (LKR)" required>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={billHistoryAmount}
                      onChange={(event) => setBillHistoryAmount(event.target.value)}
                    />
                  </Field>
                  <Field label="Note">
                    <input
                      className="input"
                      value={billHistoryNotes}
                      placeholder="Customer excess"
                      onChange={(event) => setBillHistoryNotes(event.target.value)}
                    />
                  </Field>
                </div>
                <div className="row wrap" style={{ justifyContent: "flex-end" }}>
                  <button className="btn btn-primary btn-sm" onClick={saveVehicleBill}>
                    <Plus />
                    Record separate bill
                  </button>
                </div>
              </div>
            </div>
            </div>
          )}
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head">
              <div>
                <h3>Job value</h3>
                <p>Live totals before and after billing.</p>
              </div>
              <Banknote size={16} className="muted" />
            </div>
            <div className="card-body">
              <div className="kv">
                <span>Labour</span>
                <span>{money(totals.labor)}</span>
              </div>
              <div className="kv">
                <span>Parts & materials</span>
                <span>{money(totals.parts)}</span>
              </div>
              <div className="kv">
                <span>Subtotal</span>
                <span>{money(totals.subtotal)}</span>
              </div>
              {totals.discount > 0 && (
                <div className="kv">
                  <span>Discount {job.discountType === "Percentage" ? `(${job.discount}%)` : ""}</span>
                  <span>- {money(totals.discount)}</span>
                </div>
              )}
              <div className="kv" style={{ fontSize: 16 }}>
                <span>Total</span>
                <span>{money(totals.total)}</span>
              </div>
              <div className="divider" />
              <div className="kv">
                <span>Parts cost</span>
                <span>{money(totals.partsCost)}</span>
              </div>
              <div className="kv">
                <span>Worker commission</span>
                <span>{money(totals.commission)}</span>
              </div>
              {driverEnabled && driverCommission > 0 && (
                <div className="kv">
                  <span>Driver commission · internal</span>
                  <span>{money(driverCommission)}</span>
                </div>
              )}
              <div className="kv">
                <span>Parts margin</span>
                <span>{money(totals.parts - totals.partsCost)}</span>
              </div>
              {advanceTotal > 0 && (
                <>
                  <div className="divider" />
                  <div className="kv">
                    <span>Advance received</span>
                    <span>{money(advanceTotal)}</span>
                  </div>
                  <div className="kv">
                    <span>Balance to collect</span>
                    <span>{money(Math.max(0, totals.total - advanceTotal))}</span>
                  </div>
                </>
              )}
            </div>
            <div className="card-foot">
              {job.status === "Paid" || job.status === "Released on Credit" ? (
                <span className="badge badge-green">
                  <CheckCircle2 size={11} /> Cleared for gate handover
                </span>
              ) : job.status === "Dispatched" ? (
                <span className="badge badge-slate">Vehicle dispatched</span>
              ) : job.status === "Repair Completed" ? (
                <span className="badge badge-purple">Waiting for cashier</span>
              ) : (
                <span className="badge badge-blue">Repair in progress</span>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Customer & vehicle</h3>
                <p>Service history travels with the plate.</p>
              </div>
            </div>
            <div className="card-body">
              <div className="row" style={{ gap: 10, marginBottom: 12 }}>
                <span className="avatar lg">
                  <UserRound size={18} />
                </span>
                <div>
                  <div className="strong">{job.customerName}</div>
                  <div className="tiny muted">{job.phone}</div>
                </div>
              </div>
              <div className="kv">
                <span>Vehicle</span>
                <span>{job.vehicleNo}</span>
              </div>
              <div className="kv">
                <span>Make / model</span>
                <span>{job.make} {job.model}</span>
              </div>
              <div className="kv">
                <span>Mileage</span>
                <span>{job.mileage.toLocaleString()} km</span>
              </div>
              <div className="kv">
                <span>Repair type</span>
                <span>{job.repairType}</span>
              </div>
              <div className="divider" />
              <div className="row wrap">
                <Link className="btn btn-secondary btn-sm" to={`/history?vehicle=${encodeURIComponent(job.vehicleNo)}`}>
                  <History />
                  Full history
                </Link>
                <a
                  className="btn btn-soft btn-sm"
                  href={waLink(job.phone, acceptanceMessage(job, state.settings))}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle />
                  WhatsApp
                </a>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Operational notes</h3>
                <p>System guardrails for this job.</p>
              </div>
            </div>
            <div className="card-body stack" style={{ gap: 10 }}>
              <div className="row" style={{ alignItems: "flex-start", gap: 8 }}>
                <Percent size={14} className="muted" style={{ marginTop: 2 }} />
                <span className="tiny muted">
                  Default parts margin is 20%. Stores can override it per item; the selling price
                  updates directly on the same line.
                </span>
              </div>
              <div className="row" style={{ alignItems: "flex-start", gap: 8 }}>
                <Package size={14} className="muted" style={{ marginTop: 2 }} />
                <span className="tiny muted">
                  Parts are restricted to this vehicle's fitment plus universal consumables. Stock
                  is checked again by stores before issue.
                </span>
              </div>
              <div className="row" style={{ alignItems: "flex-start", gap: 8 }}>
                <ShieldCheck size={14} className="muted" style={{ marginTop: 2 }} />
                <span className="tiny muted">
                  Billing must be completed before the PRO can release the vehicle at the gate.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={taskOpen}
        onClose={() => {
          setTaskOpen(false);
          setTaskEditingId(null);
        }}
        title={taskEditingId ? "Edit labour task" : "Assign a labour task"}
        subtitle={`${job.vehicleNo} · ${job.make} ${job.model}`}
        footer={
          <>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setTaskOpen(false);
                setTaskEditingId(null);
              }}
            >
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveTask}>
              {taskEditingId ? <Pencil /> : <Plus />}
              {taskEditingId ? "Save task" : "Add task"}
            </button>
          </>
        }
      >
        <div className="stack">
          <Field
            label="Task description"
            required
            hint="Type freely. Past tasks appear as suggestions with their last-used price."
          >
            <input
              className="input"
              list="task-suggestion-list"
              placeholder="e.g. Front brake pad replacement"
              value={taskName}
              onChange={(event) => {
                const value = event.target.value;
                setTaskName(value);
                const match = taskSuggestions.find(
                  (suggestion) => suggestion.name.toLowerCase() === value.trim().toLowerCase(),
                );
                if (match) setTaskLabor(String(match.price));
              }}
              autoFocus
            />
            <datalist id="task-suggestion-list">
              {taskSuggestions.map((suggestion) => (
                <option key={suggestion.name} value={suggestion.name} />
              ))}
            </datalist>
          </Field>
          {taskSuggestions.length > 0 && (
            <div className="suggestions">
              <span className="tiny muted">Last used:</span>
              {taskSuggestions.map((suggestion) => (
                <button
                  key={suggestion.name}
                  type="button"
                  className="suggestion"
                  onClick={() => applyTaskSuggestion(suggestion)}
                >
                  {suggestion.name} · {money(suggestion.price)}
                </button>
              ))}
            </div>
          )}
          <div className="form-grid">
            <Field label="Labour charge (LKR)" required>
              <input
                className="input"
                type="number"
                min={0}
                placeholder="3500"
                value={taskLabor}
                onChange={(event) => setTaskLabor(event.target.value)}
              />
            </Field>
            {sectionsEnabled && (
              <Field label="Workshop section" required>
                <select
                  className="select"
                  value={taskSectionId}
                  onChange={(event) => {
                    const nextSection = event.target.value;
                    setTaskSectionId(nextSection);
                    const stillEligible = workers.some(
                      (worker) =>
                        worker.id === taskWorker &&
                        (!nextSection ||
                          (worker.sectionIds ?? []).length === 0 ||
                          (worker.sectionIds ?? []).includes(nextSection)),
                    );
                    if (!stillEligible) {
                      const eligible = workers.filter(
                        (worker) =>
                          (!nextSection ||
                            (worker.sectionIds ?? []).length === 0 ||
                            (worker.sectionIds ?? []).includes(nextSection)) &&
                          presentWorkerIds.has(worker.id),
                      );
                      setTaskWorker(eligible[0]?.id ?? "");
                    }
                  }}
                >
                  <option value="">Unassigned</option>
                  {activeSections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Technician" required>
              <select
                className="select"
                value={taskWorker}
                onChange={(event) => setTaskWorker(event.target.value)}
              >
                <option value="">Select technician</option>
                {taskAssignableWorkers.map((worker) => (
                  <option key={worker.id} value={worker.id}>
                    {worker.fullName} · {worker.commissionRate}% commission
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {taskAssignableWorkers.length === 0 ? (
            <Alert tone="warn" title="No workers marked present today">
              Mark the morning attendance on the Workshop page before assigning labour. Only present
              workers in this section can receive tasks.
            </Alert>
          ) : (
            <div className="tiny muted">
              {taskAssignableWorkers.length} present worker{taskAssignableWorkers.length === 1 ? "" : "s"} available
              {sectionsEnabled && taskSectionId ? " in this section" : " today"}.
            </div>
          )}
          <div className="alert alert-info">
            <Percent />
            <div>
              Commission on this task:{" "}
              <strong>
                {money(
                  (Number(taskLabor || 0) * (selectedWorker?.commissionRate ?? 0)) / 100,
                )}
              </strong>{" "}
              at {selectedWorker?.commissionRate ?? 0}%.
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={partOpen}
        onClose={() => setPartOpen(false)}
        title="Request parts from stores"
        subtitle={`Fitment filter: ${job.make} ${job.model} + universal consumables`}
        size="wide"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setPartOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={sendPartRequest} disabled={!selectedItem}>
              <Package />
              Send {formatQty(Number(partQty) || 0.001, selectedItem?.measureUnit ?? selectedItem?.unit)} to stores
            </button>
          </>
        }
      >
        <div className="stack">
          <Field label="Search in-stock parts" hint="Only matching fitment and universal items are shown.">
            <input
              className="input"
              placeholder="Search by part name or code…"
              value={partSearch}
              onChange={(event) => {
                setPartSearch(event.target.value);
                setSelectedItemId("");
              }}
              autoFocus
            />
          </Field>

          {selectedItem ? (
            <div className="card">
              <div className="card-body">
                <div className="row-between wrap">
                  <div>
                    <div className="row wrap" style={{ gap: 6 }}>
                      <strong style={{ fontSize: 13 }}>{selectedItem.name}</strong>
                      <span className="badge badge-green">
                        {formatQty(selectedItem.stock, selectedItem.measureUnit ?? selectedItem.unit)} in stock
                      </span>
                    </div>
                    <div className="tiny muted" style={{ marginTop: 3 }}>
                      {selectedItem.code} · {selectedItem.make ? `${selectedItem.make} ${selectedItem.model}` : "Universal"} ·{" "}
                      Last selling price {money(selectedItem.lastSellingPrice ?? 0)}
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelectedItemId("")}>
                    Change
                  </button>
                </div>
                <div className="form-grid" style={{ marginTop: 12 }}>
                  <Field
                    label={`Quantity (${selectedItem.measureUnit ?? selectedItem.unit})`}
                    required
                    hint={`Maximum available: ${formatQty(selectedItem.stock, selectedItem.measureUnit ?? selectedItem.unit)}. Fractional quantities are allowed for consumables.`}
                  >
                    <input
                      className="input"
                      type="number"
                      min={0.001}
                      step="any"
                      max={selectedItem.stock}
                      value={partQty}
                      onChange={(event) => setPartQty(event.target.value)}
                    />
                  </Field>
                  {sectionsEnabled && (
                    <Field label="Section" required>
                      <select
                        className="select"
                        value={partSectionId}
                        onChange={(event) => setPartSectionId(event.target.value)}
                      >
                        <option value="">Unassigned</option>
                        {activeSections.map((section) => (
                          <option key={section.id} value={section.id}>
                            {section.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <div className="field">
                    <label>Stores will set</label>
                    <div className="alert alert-info" style={{ padding: "8px 10px" }}>
                      <Percent />
                      <span>Cost price, 20% default margin and final selling price.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                border: "1px solid var(--line)",
                borderRadius: 11,
                maxHeight: 280,
                overflowY: "auto",
              }}
            >
              {fitmentItems.length === 0 ? (
                <div className="empty" style={{ padding: "22px 14px" }}>
                  <p>No in-stock part matches this vehicle. Add the part under Stores first.</p>
                </div>
              ) : (
                fitmentItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="suggestion"
                    style={{ width: "100%", border: 0, background: "transparent", textAlign: "left" }}
                    onClick={() => {
                      setSelectedItemId(item.id);
                      setPartQty("1");
                    }}
                  >
                    <span className="part-icon">
                      <Package size={14} />
                    </span>
                    <div className="s-main">
                      <strong>{item.name}</strong>
                      <span>
                        {item.code} · {item.make ? `${item.make} ${item.model}` : "Universal"} ·{" "}
                        {item.stock} {item.unit}(s) available
                      </span>
                    </div>
                    <span className={`badge ${item.stock > 0 ? "badge-green" : "badge-red"}`}>
                      {item.stock > 0 ? "In stock" : "Out of stock"}
                    </span>
                    <ChevronRight size={14} className="muted" />
                  </button>
                ))
              )}
            </div>
          )}

          <div className="alert alert-warn">
            <Package />
            <div>
              Strict stock enforcement is active. Stores cannot issue more than the available
              quantity; any balance becomes a backorder on a separate line.
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={estimateOpen}
        onClose={() => setEstimateOpen(false)}
        title="Create estimate"
        subtitle={`${job.vehicleNo} · ${job.customerName}`}
        size="wide"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setEstimateOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveEstimate}>
              <FileText />
              Save estimate
            </button>
          </>
        }
      >
        <div className="stack">
          <div className="form-grid">
            <Field label="Estimate type" required>
              <select
                className="select"
                value={estimateKind}
                onChange={(event) => setEstimateKind(event.target.value as JobEstimate["kind"])}
              >
                <option value="Initial">Initial estimate</option>
                <option value="Supplementary">Supplementary estimate</option>
              </select>
            </Field>
            <Field label="Notes" hint="Assessor comments, exclusions or approval context.">
              <input
                className="input"
                value={estimateNotes}
                onChange={(event) => setEstimateNotes(event.target.value)}
              />
            </Field>
          </div>

          <div className="stack" style={{ gap: 8 }}>
            {estimateLines.map((line, index) => (
              <div className="card" key={line.id}>
                <div className="card-body">
                  <div className="form-grid">
                    <Field label={`Line ${index + 1} type`}>
                      <select
                        className="select"
                        value={line.type}
                        onChange={(event) =>
                          updateEstimateLine(line.id, {
                            type: event.target.value as EstimateLine["type"],
                          })
                        }
                      >
                        <option value="Labour">Labour</option>
                        <option value="Part">Part</option>
                      </select>
                    </Field>
                    <Field label="Description" required>
                      <input
                        className="input"
                        value={line.description}
                        onChange={(event) =>
                          updateEstimateLine(line.id, { description: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Quantity">
                      <input
                        className="input"
                        type="number"
                        min={1}
                        value={line.qty}
                        onChange={(event) =>
                          updateEstimateLine(line.id, { qty: Number(event.target.value) || 1 })
                        }
                      />
                    </Field>
                    <Field label="Unit price (LKR)">
                      <input
                        className="input"
                        type="number"
                        min={0}
                        value={line.unitPrice}
                        onChange={(event) =>
                          updateEstimateLine(line.id, { unitPrice: Number(event.target.value) || 0 })
                        }
                      />
                    </Field>
                  </div>
                  <div className="row-between" style={{ marginTop: 8 }}>
                    <span className="tiny muted">
                      Line total {money(line.qty * line.unitPrice)}
                    </span>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        setEstimateLines((prev) => prev.filter((entry) => entry.id !== line.id))
                      }
                      disabled={estimateLines.length === 1}
                    >
                      <Trash2 />
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <div className="row-between wrap">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setEstimateLines((prev) => [...prev, newEstimateLine()])}
              >
                <Plus />
                Add line
              </button>
              <span className="strong">
                Estimate total{" "}
                {money(estimateLines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0))}
              </span>
            </div>
          </div>

          <Alert tone="info" title="Estimate-only and supplementary work">
            Estimates can be created for vehicles already checked in, or raised as a supplementary
            estimate when hidden damage appears. Approval is recorded separately for the insurer.
          </Alert>
        </div>
      </Modal>

      <Modal
        open={Boolean(warrantyPart)}
        onClose={() => setWarrantyPartId(null)}
        title="Raise warranty claim"
        subtitle={warrantyPart ? `${warrantyPart.itemName} · ${job.vehicleNo}` : undefined}
        size="narrow"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setWarrantyPartId(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveWarrantyClaim}>
              <ShieldAlert />
              Raise claim
            </button>
          </>
        }
      >
        {warrantyPart && (
          <div className="stack">
            <div className="kv">
              <span>Supplier invoice</span>
              <span>{warrantyPart.supplierInvoiceNo || "Not recorded"}</span>
            </div>
            <div className="kv">
              <span>Current warranty status</span>
              <span>{warrantyPart.warrantyStatus}</span>
            </div>
            <Field label="Defect description" hint="Shown to stores when completing the claim.">
              <input
                className="input"
                placeholder="e.g. Bearing noise after 200 km"
                value={warrantyNote}
                onChange={(event) => setWarrantyNote(event.target.value)}
              />
            </Field>
            <Alert tone="warn" title="Supplier invoice required">
              Stores will complete the replacement or supplier credit note using the purchase
              invoice. Credit notes are recorded against this job.
            </Alert>
          </div>
        )}
      </Modal>

      <Modal
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        title="Complete this repair?"
        subtitle={`${job.vehicleNo} · ${job.customerName}`}
        size="narrow"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setCompleteOpen(false)}>Not yet</button>
            <button className="btn btn-primary" onClick={completeRepair}>
              <CheckCircle2 />
              Mark repair completed
            </button>
          </>
        }
      >
        <div className="stack">
          <div className="card">
            <div className="card-body">
              <div className="kv"><span>Labour tasks</span><span>{jobTasks.length}</span></div>
              <div className="kv"><span>Issued parts</span><span>{totals.issuedParts.length}</span></div>
              <div className="kv"><span>Job total</span><span>{money(totals.total)}</span></div>
            </div>
          </div>
          {pendingParts.length > 0 && (
            <Alert tone="warn" title={`${pendingParts.length} parts line still open`}>
              The cashier will only bill issued parts. Pending requests or backorders will not be
              included until stores issues them. You can still complete the repair.
            </Alert>
          )}
          <Alert tone="info" icon={<ClipboardCheck />}>
            Once marked completed, labour and parts editing closes. The job moves to the cashier's
            billing queue.
          </Alert>
        </div>
      </Modal>

      <Modal
        open={driverEnabled && driverOpen}
        onClose={() => setDriverOpen(false)}
        title={activeJob.driver ? "Edit driver commission" : "Add driver commission"}
        subtitle={`${activeJob.vehicleNo} · internal only — never shown to the customer`}
        footer={
          <>
            {activeJob.driver && (
              <button className="btn btn-ghost" onClick={() => saveDriverCommission(true)}>
                Remove
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => setDriverOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={() => saveDriverCommission()}>
              Save commission
            </button>
          </>
        }
      >
        <div className="stack">
          <div className="form-grid">
            <Field label="Driver name" required>
              <input
                className="input"
                placeholder="e.g. Sunil Perera"
                value={driverForm.name}
                onChange={(event) => setDriverForm({ ...driverForm, name: event.target.value })}
              />
            </Field>
            <Field label="Phone" required>
              <input
                className="input"
                placeholder="0771234567"
                value={driverForm.phone}
                onChange={(event) => setDriverForm({ ...driverForm, phone: event.target.value })}
              />
            </Field>
            <Field label="Commission basis" required>
              <select
                className="select"
                value={driverForm.basis}
                onChange={(event) =>
                  setDriverForm({
                    ...driverForm,
                    basis: event.target.value as typeof driverForm.basis,
                  })
                }
              >
                <option value="Labour">Labour total</option>
                <option value="Total Bill">Total bill</option>
              </select>
            </Field>
            <Field label="Commission type" required>
              <select
                className="select"
                value={driverForm.type}
                onChange={(event) =>
                  setDriverForm({
                    ...driverForm,
                    type: event.target.value as typeof driverForm.type,
                  })
                }
              >
                <option value="Percentage">Percentage</option>
                <option value="Fixed">Fixed amount</option>
              </select>
            </Field>
            <Field
              label={driverForm.type === "Percentage" ? "Percentage (%)" : "Fixed amount (LKR)"}
              required
            >
              <input
                className="input"
                type="number"
                min={0}
                value={driverForm.value}
                onChange={(event) => setDriverForm({ ...driverForm, value: event.target.value })}
              />
            </Field>
          </div>
          <Alert tone="info">
            Driver commission is deducted in the owner P&amp;L and excluded from invoices,
            receipts and WhatsApp messages.
          </Alert>
        </div>
      </Modal>

      {sectionsEnabled && (
        <Modal
          open={sectionEditorOpen}
          onClose={() => setSectionEditorOpen(false)}
          title="Workshop sections"
          subtitle={`${job.vehicleNo} · choose every section working on this vehicle`}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setSectionEditorOpen(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  updateJobSections(activeJob.id, sectionDraft);
                  setSectionEditorOpen(false);
                  push(
                    sectionDraft.length === 0
                      ? "Job removed from all sections."
                      : `Job routed to ${sectionDraft.length} section${sectionDraft.length === 1 ? "" : "s"}.`,
                  );
                }}
              >
                <Layers />
                Save sections
              </button>
            </>
          }
        >
          <div className="stack">
            <Alert tone="info">
              A vehicle can move through several sections — for example mechanical, then body &amp;
              paint, then electrical. Tasks, parts and revenue are tagged to the selected section so
              each supervisor and storekeeper only sees their own work.
            </Alert>
            <div className="grid cols-2" style={{ gap: 8 }}>
              {activeSections.map((section) => (
                <label key={section.id} className="toggle-row">
                  <span>
                    <strong style={{ color: section.color }}>{section.name}</strong>
                    <div className="tiny muted">
                      {section.code}
                      {section.supervisorIds.length > 0
                        ? ` · ${section.supervisorIds.length} supervisor(s)`
                        : ""}
                    </div>
                  </span>
                  <input
                    type="checkbox"
                    checked={sectionDraft.includes(section.id)}
                    onChange={(event) =>
                      setSectionDraft((prev) =>
                        event.target.checked
                          ? Array.from(new Set([...prev, section.id]))
                          : prev.filter((id) => id !== section.id),
                      )
                    }
                  />
                </label>
              ))}
            </div>
            {activeSections.length === 0 && (
              <div className="tiny muted">
                No active sections yet. Create sections in Settings → Workshop sections.
              </div>
            )}
          </div>
        </Modal>
      )}

      <Modal
        open={Boolean(photoView)}
        onClose={() => setPhotoView(null)}
        title={photoView?.name ?? "Inspection photo"}
        subtitle="Gate inspection evidence"
        size="wide"
      >
        {photoView && <img src={photoView.dataUrl} alt={photoView.name} className="photo-big" />}
      </Modal>
    </div>
  );
}
