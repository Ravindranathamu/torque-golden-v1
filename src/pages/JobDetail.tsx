import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Banknote,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Download,
  FileText,
  Gauge,
  History,
  Layers,
  ListChecks,
  Lock,
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
  X,
  XCircle,
} from "lucide-react";
import { hasDepartment, useApp } from "../state/AppStore";
import { featureEnabled } from "../lib/features";
import {
  driverCommissionFor,
  estimateDisplayNumber,
  estimateKindLabel,
  estimateShortLabel,
  findApprovedDuplicate,
  formatQty,
  jobTotals,
  money,
  partIssueQty,
  taskCommission,
  taskCommissionShares,
  taskWorkerIds,
  taskWorkerNames,
  taskWorkers,
  dateTime,
  timeAgo,
  waLink,
  shortDate,
  daysUntil,
} from "../lib/utils";
import { acceptanceMessage, checkoutMessage } from "../lib/messages";
import {
  buildEstimatePdf,
  buildInsuranceEstimatePdf,
  downloadInvoice,
  downloadVehicleBill,
  printDriverCommissionChit,
  printInvoice,
  printVehicleBill,
  shareEstimateWhatsApp,
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
  EstimateLineApproval,
  JobEstimate,
  JobTask,
  VehicleBill,
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
    addCustomerBroughtPart,
    removePart,
    requestExchange,
    requestReturn,
    setPartSource: setJobPartSource,
    returnCustomerBroughtPart,
    requestWarrantyClaim,
    updatePartSalvage,
    createEstimate,
    updateEstimate,
    removeEstimate,
    approveEstimate,
    reviseEstimatePrices,
    convertEstimateLineToCustomerExtra,
    addVehicleBill,
    removeVehicleBill,
    updateDriverCommission,
    createInsuranceClaim,
    updateInsuranceClaim,
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
  const [taskWorkerSelection, setTaskWorkerSelection] = useState<string[]>([]);
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
  const [estimateSectionId, setEstimateSectionId] = useState("");
  const [estimateNotes, setEstimateNotes] = useState("");
  const [estimateLines, setEstimateLines] = useState<EstimateLine[]>([]);
  const [estimateEditingId, setEstimateEditingId] = useState<string | null>(null);
  const [approvalEstimateId, setApprovalEstimateId] = useState<string | null>(null);
  const [approvalDecisions, setApprovalDecisions] = useState<
    Record<string, { status: EstimateLineApproval; approvedUnitPrice: string }>
  >({});
  const [partsApprovalDraft, setPartsApprovalDraft] = useState<Record<string, string>>({});
  const [splitBillOpen, setSplitBillOpen] = useState(false);
  const [splitBillKind, setSplitBillKind] = useState<VehicleBill["kind"]>("Insurance");
  const [splitBillNo, setSplitBillNo] = useState("");
  const [splitSectionId, setSplitSectionId] = useState("");
  const [splitTaskIds, setSplitTaskIds] = useState<string[]>([]);
  const [splitPartIds, setSplitPartIds] = useState<string[]>([]);
  const [splitDiscount, setSplitDiscount] = useState("0");
  const [splitVat, setSplitVat] = useState("0");
  const [splitAdvance, setSplitAdvance] = useState("0");
  const [splitExcess, setSplitExcess] = useState("0");
  const [splitDepreciation, setSplitDepreciation] = useState("0");
  const [splitNotes, setSplitNotes] = useState("");
  const [partSource, setPartSource] = useState<"Workshop_Store" | "Customer_Brought">(
    "Workshop_Store",
  );
  const [partExtra, setPartExtra] = useState(false);
  const [customerPartName, setCustomerPartName] = useState("");
  const [customerPartQty, setCustomerPartQty] = useState("1");
  const [customerPartValue, setCustomerPartValue] = useState("");
  const [readdPartId, setReaddPartId] = useState<string | null>(null);
  const [readdQty, setReaddQty] = useState("1");
  const [readdSearch, setReaddSearch] = useState("");
  const [taskExtra, setTaskExtra] = useState(false);
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
  const [warrantyPartId, setWarrantyPartId] = useState<string | null>(null);
  const [warrantyNote, setWarrantyNote] = useState("");

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
  const readdPart = readdPartId
    ? jobParts.find((part) => part.id === readdPartId) ?? null
    : null;
  const readdStockOptions = state.inventory
    .filter((item) => {
      const needle = readdSearch.trim().toLowerCase();
      if (!needle) return true;
      return `${item.name} ${item.code} ${item.make ?? ""} ${item.model ?? ""}`
        .toLowerCase()
        .includes(needle);
    })
    .sort((a, b) => {
      const aStock = a.stock > 0 ? 0 : 1;
      const bStock = b.stock > 0 ? 0 : 1;
      if (aStock !== bStock) return aStock - bStock;
      return a.name.localeCompare(b.name);
    });
  const estimatePartSuggestions = state.inventory
    .filter((item) => item.type === "Spare Part")
    .sort((a, b) => a.name.localeCompare(b.name));
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
    job &&
      [
        "Awaiting Release Approval",
        "Paid",
        "Released on Credit",
        "Dispatched",
      ].includes(job.status),
  );
  const dueDate = credit?.dueDate;

  const workers = state.workers.filter((worker) => worker.status === "Active");
  const todayKey = localDateKey();
  const presentWorkerIds = new Set(
    state.attendance
      .filter((record) => record.date === todayKey && record.status === "Present")
      .map((record) => record.workerId),
  );
  const selectedTaskWorkers = state.workers.filter((worker) =>
    taskWorkerSelection.includes(worker.id),
  );
  const taskCommissionPreview = taskCommissionShares(
    { laborCost: Number(taskLabor) || 0, workerIds: taskWorkerSelection },
    state.workers,
  );
  const taskCommissionPreviewTotal = taskCommissionPreview.reduce(
    (sum, share) => sum + share.commission,
    0,
  );

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
  const canManageBilling =
    Boolean(currentUser?.isOwner) ||
    hasDepartment(currentUser, "Cashier") ||
    hasDepartment(currentUser, "Accounting");
  const warrantyPart = state.parts.find((part) => part.id === warrantyPartId) ?? null;
  const billableParts = jobParts.filter(
    (part) =>
      (part.status === "Issued" ||
        part.status === "Exchange Pending" ||
        part.status === "Return Pending") &&
      !part.includedInLabor &&
      part.sellingPrice > 0 &&
      part.warrantyStatus !== "Replaced",
  );
  const orderedEstimates = [...jobEstimates].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "Initial" ? -1 : 1;
    return (a.supplementaryNo ?? 0) - (b.supplementaryNo ?? 0);
  });
  const approvalEstimate = approvalEstimateId
    ? jobEstimates.find((estimate) => estimate.id === approvalEstimateId) ?? null
    : null;
  const splitTasks = jobTasks.filter((task) => splitTaskIds.includes(task.id));
  const splitParts = billableParts.filter((part) => splitPartIds.includes(part.id));
  const splitLabor = splitTasks.reduce((sum, task) => sum + task.laborCost, 0);
  const splitPartsTotal = splitParts.reduce(
    (sum, part) => sum + part.sellingPrice * partIssueQty(part),
    0,
  );
  const splitSubtotal = splitLabor + splitPartsTotal;
  const splitDiscountValue = Math.min(
    splitSubtotal,
    Math.max(0, Number(splitDiscount) || 0),
  );
  const splitVatRate = Math.max(0, Number(splitVat) || 0);
  const splitVatAmount =
    ((splitSubtotal - splitDiscountValue) * splitVatRate) / 100;
  const splitAdvanceValue = Math.min(
    splitSubtotal - splitDiscountValue + splitVatAmount,
    Math.max(0, Number(splitAdvance) || 0),
  );
  const splitExcessValue = Math.max(0, Number(splitExcess) || 0);
  const splitDepreciationValue = Math.max(0, Number(splitDepreciation) || 0);
  const splitGross =
    splitSubtotal - splitDiscountValue + splitVatAmount - splitAdvanceValue;
  const splitNet =
    splitBillKind === "Insurance"
      ? Math.max(0, splitGross - splitExcessValue - splitDepreciationValue)
      : Math.max(0, splitGross + splitExcessValue + splitDepreciationValue);
  const billById = (billId?: string) =>
    billId ? state.vehicleBills.find((bill) => bill.id === billId) ?? null : null;
  const estimateDuplicateLineIds = new Set<string>();
  if (estimateKind === "Supplementary") {
    estimateLines.forEach((line) => {
      if (!line.description.trim()) return;
      const duplicate = findApprovedDuplicate(
        state.estimates,
        activeJob.id,
        line.type,
        line.description,
        estimateEditingId ?? undefined,
      );
      if (duplicate) estimateDuplicateLineIds.add(line.id);
    });
  }

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
  /**
   * Editing keeps already-assigned workers visible even if they are no longer
   * present or no longer belong to the selected section. New assignments are
   * still limited to present workers in the section.
   */
  const taskSelectableWorkers = state.workers.filter((worker) => {
    if (taskWorkerSelection.includes(worker.id)) return true;
    if (worker.status !== "Active") return false;
    return (
      !taskSectionId ||
      (worker.sectionIds ?? []).length === 0 ||
      (worker.sectionIds ?? []).includes(taskSectionId)
    );
  });

  function openTaskModal(task?: JobTask) {
    setTaskEditingId(task?.id ?? null);
    setTaskName(task?.name ?? "");
    setTaskLabor(task ? String(task.laborCost) : "");
    setTaskExtra(Boolean(task?.isCustomerExtra));
    if (task) {
      setTaskSectionId(task.sectionId ?? "");
      setTaskWorkerSelection(taskWorkerIds(task));
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
    const defaultWorker = eligible.find((worker) => presentWorkerIds.has(worker.id));
    setTaskWorkerSelection(defaultWorker ? [defaultWorker.id] : []);
    setTaskOpen(true);
  }

  function toggleTaskWorker(workerId: string) {
    setTaskWorkerSelection((prev) =>
      prev.includes(workerId)
        ? prev.filter((id) => id !== workerId)
        : [...prev, workerId],
    );
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
    const workerIds = Array.from(new Set(taskWorkerSelection.filter(Boolean)));
    if (workerIds.length === 0) {
      push("Choose at least one technician who performed the task.", "error");
      return;
    }
    const result = taskEditingId
      ? updateTask(taskEditingId, {
          name: taskName.trim(),
          laborCost: labor,
          workerIds,
          sectionId: taskSectionId || undefined,
          isCustomerExtra: taskExtra || undefined,
        })
      : addTask(
          activeJob.id,
          taskName.trim(),
          labor,
          workerIds,
          undefined,
          taskSectionId || undefined,
          { isCustomerExtra: taskExtra || undefined },
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

  function newEstimateLine(type: EstimateLine["type"] = "Labour"): EstimateLine {
    return {
      id: `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      description: "",
      qty: 1,
      unitPrice: 0,
      approvalStatus: "Pending",
    };
  }

  function openEstimate(kind: JobEstimate["kind"] = "Initial", existing?: JobEstimate) {
    setEstimateEditingId(existing?.id ?? null);
    setEstimateKind(existing?.kind ?? kind);
    setEstimateSectionId(
      existing?.sectionId ?? activeJob.sectionIds?.[0] ?? "",
    );
    setEstimateNotes(existing?.notes ?? "");
    setEstimateLines(existing ? existing.lines.map((line) => ({ ...line })) : []);
    setEstimateOpen(true);
  }

  function updateEstimateLine(id: string, patch: Partial<EstimateLine>) {
    setEstimateLines((prev) =>
      prev.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );
  }

  function saveEstimate() {
    if (estimateDuplicateLineIds.size > 0) {
      push(
        "Remove the lines already approved on an earlier estimate before saving.",
        "error",
      );
      return;
    }
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
          estimateSectionId || undefined,
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

  function openApproval(estimate: JobEstimate) {
    setApprovalEstimateId(estimate.id);
    setApprovalDecisions(
      Object.fromEntries(
        estimate.lines.map((line) => [
          line.id,
          {
            status: (line.approvalStatus === "Rejected"
              ? "Rejected"
              : "Approved") as EstimateLineApproval,
            approvedUnitPrice: String(line.approvedUnitPrice ?? line.unitPrice),
          },
        ]),
      ),
    );
  }

  function updateApprovalDecision(
    lineId: string,
    patch: Partial<{ status: EstimateLineApproval; approvedUnitPrice: string }>,
  ) {
    setApprovalDecisions((prev) => ({
      ...prev,
      [lineId]: {
        ...(prev[lineId] ?? {
          status: "Approved" as EstimateLineApproval,
          approvedUnitPrice: "0",
        }),
        ...patch,
      },
    }));
  }

  function saveApproval() {
    if (!approvalEstimate) return;
    const decisions = Object.fromEntries(
      approvalEstimate.lines.map((line) => {
        const draft = approvalDecisions[line.id];
        return [
          line.id,
          {
            status: draft?.status ?? ("Approved" as EstimateLineApproval),
            approvedUnitPrice:
              Number(draft?.approvedUnitPrice) || line.unitPrice,
          },
        ];
      }),
    );
    if (approvalEstimate.status === "Approved") {
      const changed = approvalEstimate.lines.some((line) => {
        const draftPrice = Number(approvalDecisions[line.id]?.approvedUnitPrice);
        return (
          Number.isFinite(draftPrice) &&
          draftPrice !== (line.approvedUnitPrice ?? line.unitPrice)
        );
      });
      if (!changed) {
        setApprovalEstimateId(null);
        push("No approved price changes to save.", "info");
        return;
      }
      const prices = Object.fromEntries(
        approvalEstimate.lines
          .filter(
            (line) =>
              (approvalDecisions[line.id]?.status ?? line.approvalStatus) === "Approved",
          )
          .map((line) => [
            line.id,
            Number(approvalDecisions[line.id]?.approvedUnitPrice) ||
              line.approvedUnitPrice ||
              line.unitPrice,
          ]),
      );
      const result = reviseEstimatePrices(approvalEstimate.id, prices);
      if (!result.ok) {
        push(result.message ?? "Could not save the approved prices.", "error");
        return;
      }
      push("Assessor approved prices saved. Job card costs and the insurance bill updated.");
      setApprovalEstimateId(null);
      return;
    }
    const result = approveEstimate(approvalEstimate.id, decisions);
    if (!result.ok) {
      push(result.message ?? "Could not approve the estimate.", "error");
      return;
    }
    if (claim) {
      approveClaimEstimate();
    }
    push(
      "Estimate approved. Only approved lines were loaded at the assessor prices; the supervisor now assigns workers and chooses each part's source before stores receives it.",
    );
    setApprovalEstimateId(null);
  }

  function savePartsApproval(estimate: JobEstimate) {
    const prices: Record<string, number> = {};
    estimate.lines
      .filter((line) => line.type === "Part" && line.approvalStatus === "Approved")
      .forEach((line) => {
        const raw = partsApprovalDraft[line.id];
        const value = Number(raw);
        prices[line.id] =
          raw !== undefined && raw !== "" && Number.isFinite(value)
            ? value
            : line.approvedUnitPrice ?? line.unitPrice;
      });
    const result = reviseEstimatePrices(estimate.id, prices);
    if (!result.ok) {
      push(result.message ?? "Could not save the parts approval prices.", "error");
      return;
    }
    if (claim) {
      approveClaimParts();
    }
    push("Assessor approved part prices saved to the job card and insurance bill.");
  }

  function convertRejectedLine(estimate: JobEstimate, line: EstimateLine) {
    const result = convertEstimateLineToCustomerExtra(estimate.id, line.id);
    if (!result.ok) {
      push(result.message ?? "Could not move the line to customer extra.", "error");
      return;
    }
    push(`${line.description} moved to Non-Claim / Customer Extra.`);
  }

  function openSplitBill(kind: VehicleBill["kind"]) {
    setSplitBillKind(kind);
    const count = state.vehicleBills.filter(
      (bill) => bill.jobCardId === activeJob.id && bill.kind === kind,
    ).length;
    const prefix = kind === "Insurance" ? "INS" : kind === "Customer" ? "CUS" : "ADD";
    setSplitBillNo(`${prefix}-${activeJob.id}-${count + 1}`);
    setSplitSectionId(activeJob.sectionIds?.[0] ?? "");
    setSplitDiscount("0");
    setSplitVat(
      activeJob.isVatInvoice ? String(state.settings.defaultVatRate ?? 18) : "0",
    );
    setSplitAdvance("0");
    setSplitExcess("0");
    setSplitDepreciation("0");
    setSplitNotes("");
    const taskIds = jobTasks
      .filter(
        (task) =>
          !task.assignedBillId &&
          (kind === "Insurance"
            ? !task.isCustomerExtra
            : kind === "Customer"
              ? Boolean(task.isCustomerExtra)
              : false),
      )
      .map((task) => task.id);
    const partIds = billableParts
      .filter((part) => {
        if (part.assignedBillId) return false;
        if (kind === "Insurance") {
          return part.partSource === "Customer_Brought" || !part.isCustomerExtra;
        }
        if (kind === "Customer") {
          return (
            part.partSource !== "Customer_Brought" && Boolean(part.isCustomerExtra)
          );
        }
        return false;
      })
      .map((part) => part.id);
    setSplitTaskIds(taskIds);
    setSplitPartIds(partIds);
    setSplitBillOpen(true);
  }

  function toggleSplitTask(taskId: string) {
    setSplitTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId],
    );
  }

  function toggleSplitPart(partId: string) {
    setSplitPartIds((prev) =>
      prev.includes(partId) ? prev.filter((id) => id !== partId) : [...prev, partId],
    );
  }

  function saveSplitBill() {
    if (splitTaskIds.length === 0 && splitPartIds.length === 0) {
      push("Tick at least one task or part for this bill.", "error");
      return;
    }
    if (splitNet <= 0) {
      push("The bill net payable must be greater than zero.", "error");
      return;
    }
    const result = addVehicleBill({
      jobCardId: activeJob.id,
      kind: splitBillKind,
      billNo: splitBillNo,
      amount: splitNet,
      netPayable: splitNet,
      sectionId: splitSectionId || undefined,
      claimId: claim?.id,
      insurerId: claim?.insurerId,
      notes: splitNotes,
      taskIds: splitTaskIds,
      partIds: splitPartIds,
      laborSubtotal: splitLabor,
      partsSubtotal: splitPartsTotal,
      discount: splitDiscountValue,
      vatRate: splitVatRate,
      vatAmount: splitVatAmount,
      advance: splitAdvanceValue,
      policyExcess: splitExcessValue,
      depreciation: splitDepreciationValue,
    });
    if (!result.ok) {
      push(result.message ?? "Could not record the bill.", "error");
      return;
    }
    push(
      `${splitBillKind} bill ${splitBillNo.trim()} recorded for ${activeJob.vehicleNo} at ${money(splitNet)}.`,
    );
    setSplitBillOpen(false);
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
            `Insurance estimate ${estimateDisplayNumber(estimate)} for ${activeJob.vehicleNo} · claim ${claim.claimNo} · ${money(estimate.lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0))}. ${state.settings.companyName}.`,
          )
        : await shareEstimateWhatsApp(
            activeJob,
            estimate,
            state.settings,
            `Estimate ${estimateDisplayNumber(estimate)} for ${activeJob.vehicleNo} · ${money(estimate.lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0))}. ${state.settings.companyName}. Reply here to approve the work.`,
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
      `Insurance estimate ${estimateDisplayNumber(estimate)} · claim ${claim.claimNo}`,
    );
    const body = encodeURIComponent(
      `Dear ${insurer?.name ?? "Assessor"},\n\nPlease find attached estimate ${estimateDisplayNumber(estimate)} for ${activeJob.vehicleNo} (${activeJob.make} ${activeJob.model}), policy ${claim.policyNo}, claim ${claim.claimNo}.\n\nThe estimated total is ${money(estimate.lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0))}. The PDF has been downloaded — attach it to this email before sending.\n\nRegards,\n${state.settings.companyName}\n${state.settings.phone}`,
    );
    window.location.href = `mailto:${insurer?.email ?? ""}?subject=${subject}&body=${body}`;
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
    setPartSource("Workshop_Store");
    setPartExtra(false);
    setCustomerPartName("");
    setCustomerPartQty("1");
    setCustomerPartValue("");
    setPartOpen(true);
  }

  function saveCustomerBroughtPart() {
    const result = addCustomerBroughtPart(activeJob.id, {
      name: customerPartName,
      qty: Number(customerPartQty),
      unitPrice: Number(customerPartValue),
      sectionId: partSectionId || undefined,
    });
    if (!result.ok) {
      push(result.message ?? "Could not add the customer-brought part.", "error");
      return;
    }
    push(
      `${customerPartName.trim()} added as customer-brought. Insurance bill only — no stock deduction.`,
    );
    setPartOpen(false);
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
    const result = requestPart(activeJob.id, selectedItem.id, qty, partSectionId || undefined, {
      isCustomerExtra: partExtra || undefined,
    });
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

  function choosePartSource(
    partId: string,
    source: "Workshop_Store" | "Customer_Brought",
  ) {
    const result = setJobPartSource(partId, source);
    if (!result.ok) {
      push(result.message ?? "Could not set the part source.", "error");
      return;
    }
    push(
      source === "Customer_Brought"
        ? "Marked customer-brought. No stock request was sent to stores."
        : "Sent to stores as a store-supplied part.",
    );
  }

  function handBackCustomerPart(partId: string, mode: "Return" | "Swap") {
    const part = jobParts.find((entry) => entry.id === partId);
    const result = returnCustomerBroughtPart(partId, mode);
    if (!result.ok) {
      push(result.message ?? "Could not return the part.", "error");
      return;
    }
    const message =
      mode === "Swap"
        ? `${state.settings.companyName}: ${part?.itemName ?? "The customer-brought part"} has been handed back to you. Please bring the replacement part for ${activeJob.vehicleNo} (${activeJob.make} ${activeJob.model}). Thank you.`
        : `${state.settings.companyName}: ${part?.itemName ?? "Your customer-brought part"} has been handed back to you. Please collect it when you visit for ${activeJob.vehicleNo} (${activeJob.make} ${activeJob.model}). Thank you.`;
    const win = window.open(
      waLink(activeJob.phone, message),
      "_blank",
      "noopener,noreferrer",
    );
    push(
      win
        ? `Part returned to the customer — WhatsApp opened. It was not sent to stores.`
        : "Part returned to the customer. Allow pop-ups to open WhatsApp.",
      win ? "info" : "error",
    );
  }

  function readdAsCustomerPart(part: (typeof jobParts)[number]) {
    const result = addCustomerBroughtPart(activeJob.id, {
      name: part.itemName,
      qty: part.qtyRequested,
      unitPrice: part.sellingPrice,
      sectionId: part.sectionId,
    });
    if (!result.ok) {
      push(result.message ?? "Could not add the part again.", "error");
      return;
    }
    push(
      `${part.itemName} added again as customer-brought. It stays on the insurance bill only.`,
    );
  }

  function openReaddFromStore(part: (typeof jobParts)[number]) {
    setReaddPartId(part.id);
    setReaddQty(String(part.qtyRequested || 1));
    setReaddSearch("");
  }

  function readdFromStore(itemId: string) {
    if (!readdPart) return;
    const item = state.inventory.find((entry) => entry.id === itemId);
    const qty = Number(readdQty);
    if (!item) return;
    if (!Number.isFinite(qty) || qty <= 0) {
      push("Enter a valid quantity.", "error");
      return;
    }
    const result = requestPart(
      activeJob.id,
      item.id,
      qty,
      readdPart.sectionId,
    );
    if (!result.ok) {
      push(result.message ?? "Could not add the part to the stores queue.", "error");
      return;
    }
    push(
      `${item.name} requested from stores again for ${activeJob.vehicleNo}. Stores sets the price at issue.`,
    );
    setReaddPartId(null);
  }

  function completeRepair() {
    if (jobTasks.length === 0 && activeTotals.billableParts.length === 0) {
      push("Add at least one labour task or issued part before completing the repair.", "error");
      return;
    }
    const result = markRepairCompleted(activeJob.id);
    if (!result.ok) {
      push(result.message ?? "Could not complete the repair.", "error");
      return;
    }
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
            {invoiceReady &&
              canDispatch &&
              (job.status === "Paid" || job.status === "Released on Credit") && (
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
                    {job.partPaymentAt && (
                      <>
                        <div className="kv">
                          <span>Collected at checkout</span>
                          <span>{money(job.partPaymentCollected ?? 0)}</span>
                        </div>
                        <div className="kv">
                          <span>Balance on credit</span>
                          <span>{money(job.partPaymentCredit ?? 0)}</span>
                        </div>
                      </>
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
                  <p>Assign one or more workers — commission is split equally between them.</p>
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
                    message="Assign each repair task to one or more technicians. Their labour share and commission are split equally for payroll and warranty traceability."
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
                    const assignedWorkers = taskWorkers(task, state.workers);
                    const taskCommissionValue = taskCommission(task, state.workers);
                    return (
                      <div className="list-row" key={task.id}>
                        <span className="part-icon" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
                          <Wrench size={15} />
                        </span>
                        <div className="list-main">
                          <strong>{task.name}</strong>
                          <span>
                            {assignedWorkers.length > 0
                              ? assignedWorkers.map((worker) => worker.fullName).join(" + ")
                              : "Unassigned"}{" "}
                            · commission {money(taskCommissionValue)}
                            {assignedWorkers.length > 1
                              ? ` (split equally across ${assignedWorkers.length})`
                              : ""}{" "}
                            · added {timeAgo(task.createdAt)}
                          </span>
                          <div className="row wrap" style={{ gap: 4, marginTop: 4 }}>
                            {task.isCustomerExtra && (
                              <span className="badge badge-amber">Customer extra</span>
                            )}
                            {billById(task.assignedBillId) && (
                              <span className="badge badge-slate">
                                <Lock size={10} /> {billById(task.assignedBillId)?.billNo}
                              </span>
                            )}
                            {task.quotedLaborCost !== undefined &&
                              task.quotedLaborCost !== task.laborCost && (
                                <span className="chip">
                                  Quoted {money(task.quotedLaborCost)}
                                </span>
                              )}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div className="strong small">{money(task.laborCost)}</div>
                          <div className="tiny muted">
                            {money(taskCommissionValue)} commission
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
                    const issuedQty =
                      part.qtyIssued > 0
                        ? part.qtyIssued
                        : ["Issued", "Exchange Pending", "Return Pending"].includes(part.status)
                          ? part.qtyRequested
                          : 0;
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
                            {part.partSource === "Customer_Brought" && (
                              <span className="badge badge-blue">Customer supplied</span>
                            )}
                            {!part.partSource && part.status === "Requested" && (
                              <span className="badge badge-amber">Choose part source</span>
                            )}
                            {part.customerReturnMode && (
                              <span className="badge badge-slate">
                                {part.customerReturnMode === "Swap"
                                  ? "Returned to customer — swap"
                                  : "Returned to customer"}
                              </span>
                            )}
                            {part.isCustomerExtra && (
                              <span className="badge badge-amber">Customer extra</span>
                            )}
                            {billById(part.assignedBillId) && (
                              <span className="badge badge-slate">
                                <Lock size={10} /> {billById(part.assignedBillId)?.billNo}
                              </span>
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
                            {formatQty(issuedQty, unit)} ·{" "}
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
                          {part.insuranceApprovedPrice !== undefined &&
                            part.insuranceApprovedPrice !== part.sellingPrice && (
                              <div className="tiny muted">
                                Approved {money(part.insuranceApprovedPrice)}
                              </div>
                            )}
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
                        {canEdit && part.status === "Requested" && !part.partSource && (
                          <select
                            className="select"
                            style={{ width: 150, fontSize: 11 }}
                            title="Choose who supplies this part before the request is sent"
                            value=""
                            onChange={(event) => {
                              const value = event.target.value as
                                | "Workshop_Store"
                                | "Customer_Brought"
                                | "";
                              if (!value) return;
                              choosePartSource(part.id, value);
                            }}
                          >
                            <option value="">Choose source…</option>
                            <option value="Workshop_Store">Store supplied</option>
                            <option value="Customer_Brought">Customer brought</option>
                          </select>
                        )}
                        {canEdit &&
                          part.status === "Issued" &&
                          part.partSource !== "Customer_Brought" && (
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
                        {canEdit &&
                          part.status === "Issued" &&
                          part.partSource === "Customer_Brought" && (
                            <div className="row" style={{ gap: 4 }}>
                              <button
                                className="btn btn-ghost btn-sm"
                                title="Swap with the customer"
                                onClick={() => handBackCustomerPart(part.id, "Swap")}
                              >
                                <RefreshCcw />
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                title="Return this part to the customer"
                                onClick={() => handBackCustomerPart(part.id, "Return")}
                              >
                                <XCircle />
                              </button>
                            </div>
                          )}
                        {canEdit &&
                          part.status === "Returned" &&
                          part.partSource === "Customer_Brought" && (
                            <select
                              className="select"
                              style={{ width: 168, fontSize: 11 }}
                              title="Add the same part again for this job"
                              value=""
                              onChange={(event) => {
                                const value = event.target.value;
                                if (value === "customer") readdAsCustomerPart(part);
                                if (value === "store") openReaddFromStore(part);
                              }}
                            >
                              <option value="">Add again…</option>
                              <option value="customer">Customer brings it again</option>
                              <option value="store">Supply from store</option>
                            </select>
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
                    orderedEstimates.map((estimate) => {
                      const estimateTotal = estimate.lines.reduce(
                        (sum, line) => sum + line.qty * line.unitPrice,
                        0,
                      );
                      const approvedTotal = estimate.lines.reduce(
                        (sum, line) =>
                          sum +
                          (line.approvalStatus === "Approved"
                            ? line.qty * (line.approvedUnitPrice ?? line.unitPrice)
                            : 0),
                        0,
                      );
                      const pendingCount = estimate.lines.filter(
                        (line) =>
                          !line.approvalStatus || line.approvalStatus === "Pending",
                      ).length;
                      return (
                        <div key={estimate.id} style={{ marginBottom: 18 }}>
                          <div className="row-between wrap" style={{ marginBottom: 8 }}>
                            <div className="row wrap" style={{ gap: 8 }}>
                              <strong>{estimateDisplayNumber(estimate)}</strong>
                              <span className="badge badge-brand">Rev {estimate.revision}</span>
                              <StatusBadge status={estimate.status} />
                              <span className="badge badge-slate">{money(estimateTotal)}</span>
                              {approvedTotal > 0 && approvedTotal !== estimateTotal && (
                                <span className="badge badge-green">
                                  Approved {money(approvedTotal)}
                                </span>
                              )}
                              {pendingCount > 0 && estimate.status !== "Approved" && (
                                <span className="badge badge-amber">
                                  {pendingCount} pending
                                </span>
                              )}
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
                                      push(`${estimateDisplayNumber(estimate)} deleted.`, "info");
                                    }}
                                  >
                                    <Trash2 />
                                    Delete
                                  </button>
                                </>
                              )}
                              {canManageInsurance && estimate.status === "Awaiting Approval" && (
                                <button
                                  className="btn btn-soft btn-sm"
                                  onClick={() => openApproval(estimate)}
                                >
                                  <ListChecks />
                                  Review &amp; approve
                                </button>
                              )}
                              {canManageInsurance && estimate.status === "Approved" && (
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => openApproval(estimate)}
                                >
                                  <Pencil />
                                  Revise approved prices
                                </button>
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
                                  <th className="num">Quoted</th>
                                  <th className="num">Approved</th>
                                  <th>Decision</th>
                                </tr>
                              </thead>
                              <tbody>
                                {estimate.lines.map((line) => {
                                  const approvedPrice =
                                    line.approvedUnitPrice ?? line.unitPrice;
                                  const variance =
                                    line.approvalStatus === "Approved"
                                      ? approvedPrice - line.unitPrice
                                      : 0;
                                  return (
                                    <tr key={line.id}>
                                      <td><span className="chip">{line.type}</span></td>
                                      <td>{line.description}</td>
                                      <td className="num">{line.qty}</td>
                                      <td className="num">{money(line.unitPrice)}</td>
                                      <td className="num">
                                        {line.approvalStatus === "Approved"
                                          ? money(approvedPrice)
                                          : "—"}
                                        {variance !== 0 && (
                                          <div
                                            className="cell-sub"
                                            style={{
                                              color:
                                                variance < 0
                                                  ? "var(--danger)"
                                                  : "var(--success, #0f766e)",
                                            }}
                                          >
                                            {variance > 0 ? "+" : ""}
                                            {money(variance)}
                                          </div>
                                        )}
                                      </td>
                                      <td>
                                        {line.approvalStatus === "Approved" && (
                                          <span className="badge badge-green">Approved</span>
                                        )}
                                        {line.approvalStatus === "Rejected" && (
                                          <span className="badge badge-red">Rejected</span>
                                        )}
                                        {(!line.approvalStatus ||
                                          line.approvalStatus === "Pending") && (
                                          <span className="badge badge-amber">Pending</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
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
                          <div className="kv"><span>Cheque</span><span>{claim.chequeNo ? `${claim.chequeNo} · ${money(claim.chequeAmount ?? 0)}` : "Not received"}</span></div>
                          <div className="kv"><span>Salvage submitted</span><span>{claim.salvageSubmittedAt ? shortDate(claim.salvageSubmittedAt) : "Pending"}</span></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-head">
                      <div>
                        <h3>Approvals</h3>
                        <p>
                          Stage 1 scope sign-off, then Stage 2 parts pricing. Every initial and
                          supplementary estimate appears here as soon as it is saved.
                        </p>
                      </div>
                      <ListChecks size={16} className="muted" />
                    </div>
                    <div className="card-body stack">
                      {orderedEstimates.length === 0 ? (
                        <p className="small muted">
                          No estimates submitted yet. Create an estimate to start the approval
                          workflow.
                        </p>
                      ) : (
                        orderedEstimates.map((estimate) => {
                          const pendingLines = estimate.lines.filter(
                            (line) =>
                              !line.approvalStatus || line.approvalStatus === "Pending",
                          );
                          const approvedParts = estimate.lines.filter(
                            (line) =>
                              line.type === "Part" && line.approvalStatus === "Approved",
                          );
                          const rejectedLines = estimate.lines.filter(
                            (line) => line.approvalStatus === "Rejected",
                          );
                          return (
                            <div key={estimate.id} className="stack" style={{ gap: 8 }}>
                              <div className="row-between wrap">
                                <div className="row wrap" style={{ gap: 8 }}>
                                  <strong>{estimateDisplayNumber(estimate)}</strong>
                                  <span className="badge badge-slate">
                                    {estimateKindLabel(estimate)}
                                  </span>
                                  <StatusBadge status={estimate.status} />
                                  {pendingLines.length > 0 && (
                                    <span className="badge badge-amber">
                                      {pendingLines.length} pending
                                    </span>
                                  )}
                                </div>
                                {canManageInsurance &&
                                  (estimate.status === "Approved" ? (
                                    <button
                                      className="btn btn-secondary btn-sm"
                                      onClick={() => openApproval(estimate)}
                                    >
                                      <Pencil />
                                      Revise approved prices
                                    </button>
                                  ) : (
                                    <button
                                      className="btn btn-primary btn-sm"
                                      onClick={() => openApproval(estimate)}
                                    >
                                      <ListChecks />
                                      Stage 1 review
                                    </button>
                                  ))}
                              </div>
                              <div className="table-wrap">
                                <table className="data">
                                  <thead>
                                    <tr>
                                      <th>Type</th>
                                      <th>Description</th>
                                      <th className="num">Qty</th>
                                      <th className="num">Quoted</th>
                                      <th className="num">Approved</th>
                                      <th>Decision</th>
                                      <th />
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {estimate.lines.map((line) => (
                                      <tr key={line.id}>
                                        <td><span className="chip">{line.type}</span></td>
                                        <td>{line.description}</td>
                                        <td className="num">{line.qty}</td>
                                        <td className="num">{money(line.unitPrice)}</td>
                                        <td className="num">
                                          {line.approvalStatus === "Approved"
                                            ? money(line.approvedUnitPrice ?? line.unitPrice)
                                            : "—"}
                                        </td>
                                        <td>
                                          {line.approvalStatus === "Approved" && (
                                            <span className="badge badge-green">Approved</span>
                                          )}
                                          {line.approvalStatus === "Rejected" && (
                                            <span className="badge badge-red">Rejected</span>
                                          )}
                                          {(!line.approvalStatus ||
                                            line.approvalStatus === "Pending") && (
                                            <span className="badge badge-amber">Pending</span>
                                          )}
                                        </td>
                                        <td>
                                          {canManageInsurance &&
                                            line.approvalStatus === "Rejected" &&
                                            claim && (
                                              <button
                                                className="btn btn-ghost btn-sm"
                                                title="Load this rejected line as customer extra work"
                                                onClick={() =>
                                                  convertRejectedLine(estimate, line)
                                                }
                                              >
                                                <UserRound />
                                                Move to customer extra
                                              </button>
                                            )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              {rejectedLines.length > 0 && (
                                <div className="tiny muted">
                                  {rejectedLines.length} rejected line(s) will not load to the job
                                  card. Use “Move to customer extra” to bill the work to the
                                  vehicle owner instead.
                                </div>
                              )}

                              {estimate.status === "Approved" && approvedParts.length > 0 && (
                                <div
                                  className="stack"
                                  style={{
                                    gap: 8,
                                    border: "1px solid var(--line)",
                                    borderRadius: 12,
                                    padding: 12,
                                  }}
                                >
                                  <div className="row-between wrap">
                                    <div>
                                      <strong className="small">Stage 2 · Parts approval</strong>
                                      <div className="tiny muted">
                                        Compare the workshop quoted price with the assessor
                                        approved price. Variance updates the job card cost and the
                                        insurance bill.
                                      </div>
                                    </div>
                                    <button
                                      className="btn btn-primary btn-sm"
                                      disabled={!canManageInsurance}
                                      onClick={() => savePartsApproval(estimate)}
                                    >
                                      <Check />
                                      Save parts approval
                                    </button>
                                  </div>
                                  <div className="table-wrap">
                                    <table className="data">
                                      <thead>
                                        <tr>
                                          <th>Part</th>
                                          <th className="num">Qty</th>
                                          <th className="num">Workshop quoted</th>
                                          <th className="num">Assessor approved</th>
                                          <th className="num">Variance</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {approvedParts.map((line) => {
                                          const draft =
                                            partsApprovalDraft[line.id] ??
                                            String(line.approvedUnitPrice ?? line.unitPrice);
                                          const approved = Number(draft);
                                          const variance =
                                            (Number.isFinite(approved) ? approved : 0) -
                                            line.unitPrice;
                                          return (
                                            <tr key={line.id}>
                                              <td>{line.description}</td>
                                              <td className="num">{line.qty}</td>
                                              <td className="num">{money(line.unitPrice)}</td>
                                              <td className="num">
                                                <input
                                                  className="input"
                                                  type="number"
                                                  min={0}
                                                  step="0.01"
                                                  style={{ maxWidth: 130, textAlign: "right" }}
                                                  value={draft}
                                                  onChange={(event) =>
                                                    setPartsApprovalDraft((prev) => ({
                                                      ...prev,
                                                      [line.id]: event.target.value,
                                                    }))
                                                  }
                                                />
                                              </td>
                                              <td
                                                className="num"
                                                style={{
                                                  color:
                                                    variance < 0
                                                      ? "var(--danger)"
                                                      : variance > 0
                                                        ? "var(--success, #0f766e)"
                                                        : undefined,
                                                }}
                                              >
                                                {variance > 0 ? "+" : ""}
                                                {money(variance)}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                              <div className="divider" />
                            </div>
                          );
                        })
                      )}
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
                                  {taskWorkerNames(task, state.workers)}
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
                    Split this vehicle into insurer, customer and additional bills. Each bill
                    locks the tasks and parts ticked onto it so nothing is billed twice. Bills are
                    saved as drafts here; Cashier sets the final VAT and sends them.
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
                          <th className="num">Items</th>
                          <th className="num">Net payable</th>
                          <th>Status</th>
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
                              {(bill.taskIds?.length ?? 0) + (bill.partIds?.length ?? 0)}
                            </td>
                            <td className="num">{money(bill.netPayable ?? bill.amount)}</td>
                            <td><StatusBadge status={bill.status ?? "Unpaid"} /></td>
                            <td>
                              <div className="tiny muted">
                                {dateTime(bill.createdAt)}
                                {bill.createdBy ? ` · ${bill.createdBy}` : ""}
                              </div>
                            </td>
                            <td>
                              <div className="row" style={{ justifyContent: "flex-end", gap: 3 }}>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  title="Print this bill"
                                  onClick={() =>
                                    printVehicleBill(
                                      activeJob,
                                      bill,
                                      jobTasks.filter((task) => bill.taskIds?.includes(task.id)),
                                      jobParts.filter((part) => bill.partIds?.includes(part.id)),
                                      state.settings,
                                      insurancePdfData,
                                    )
                                  }
                                >
                                  <Printer />
                                </button>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  title="Download this bill as PDF"
                                  onClick={() =>
                                    downloadVehicleBill(
                                      activeJob,
                                      bill,
                                      jobTasks.filter((task) => bill.taskIds?.includes(task.id)),
                                      jobParts.filter((part) => bill.partIds?.includes(part.id)),
                                      state.settings,
                                      insurancePdfData,
                                    )
                                  }
                                >
                                  <Download />
                                </button>
                                {canManageBilling && bill.status !== "Paid" && bill.status !== "Release Order" && (
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    title="Remove this bill and unlock its items"
                                    onClick={() => {
                                      removeVehicleBill(bill.id);
                                      push(
                                        `${bill.billNo} removed. Its items are available to bill again.`,
                                        "info",
                                      );
                                    }}
                                  >
                                    <Trash2 />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="row wrap">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => openSplitBill("Insurance")}
                    disabled={!canManageBilling}
                  >
                    <Plus />
                    New insurance bill
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => openSplitBill("Customer")}
                    disabled={!canManageBilling}
                  >
                    <Plus />
                    New customer bill
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => openSplitBill("Additional")}
                    disabled={!canManageBilling}
                  >
                    <Plus />
                    New additional bill
                  </button>
                </div>
                <div className="tiny muted">
                  Items already on a bill show an “Already billed” lock in the selector and cannot
                  be ticked twice.
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
              {totals.customerBroughtParts > 0 && (
                <div className="kv">
                  <span>Customer-supplied parts</span>
                  <span>{money(totals.customerBroughtParts)}</span>
                </div>
              )}
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
              ) : job.status === "Awaiting Release Approval" ? (
                <span className="badge badge-amber">
                  <ShieldCheck size={11} /> Waiting for owner/accounting release approval
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
                    const eligible = workers.filter(
                      (worker) =>
                        (!nextSection ||
                          (worker.sectionIds ?? []).length === 0 ||
                          (worker.sectionIds ?? []).includes(nextSection)) &&
                        presentWorkerIds.has(worker.id),
                    );
                    const eligibleIds = new Set(eligible.map((worker) => worker.id));
                    const kept = taskWorkerSelection.filter((id) => eligibleIds.has(id));
                    setTaskWorkerSelection(
                      kept.length > 0 ? kept : eligible[0] ? [eligible[0].id] : [],
                    );
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
            <Field
              label="Technicians"
              required
              full
              hint="Select one or more present workers. Labour and commission are split equally."
            >
              <div className="stack" style={{ gap: 8 }}>
                {taskSelectableWorkers.map((worker) => {
                  const checked = taskWorkerSelection.includes(worker.id);
                  const isPresent = presentWorkerIds.has(worker.id);
                  return (
                    <label className="toggle-row" key={worker.id}>
                      <span>
                        <strong>{worker.fullName}</strong>
                        <div className="tiny muted">
                          {worker.commissionRate}% commission
                          {!isPresent ? " · not marked present today" : ""}
                          {worker.status !== "Active" ? " · inactive" : ""}
                        </div>
                      </span>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!isPresent && !checked}
                        onChange={() => toggleTaskWorker(worker.id)}
                      />
                    </label>
                  );
                })}
                {taskSelectableWorkers.length === 0 && (
                  <div className="tiny muted">
                    No workers are available for this section.
                  </div>
                )}
                {taskSelectableWorkers.length > 0 &&
                  taskAssignableWorkers.length === 0 && (
                    <div className="tiny muted">
                      None of these workers are marked present today.
                    </div>
                  )}
              </div>
            </Field>
          </div>
          {claim && (
            <label className="toggle-row">
              <span>
                <strong>Non-claim / customer extra work</strong>
                <div className="tiny muted">
                  Insurance jobs only. Extra work is excluded from the insurance bill and
                  pre-selected on the customer bill.
                </div>
              </span>
              <input
                type="checkbox"
                checked={taskExtra}
                onChange={(event) => setTaskExtra(event.target.checked)}
              />
            </label>
          )}
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
              <div>
                Commission on this task: <strong>{money(taskCommissionPreviewTotal)}</strong>
                {selectedTaskWorkers.length > 1
                  ? ` split equally across ${selectedTaskWorkers.length} technicians.`
                  : "."}
              </div>
              {taskCommissionPreview.length > 0 && (
                <div className="tiny" style={{ marginTop: 4 }}>
                  {taskCommissionPreview
                    .map(
                      (share) =>
                        `${share.workerName}: ${money(share.laborShare)} × ${share.commissionRate}% = ${money(share.commission)}`,
                    )
                    .join(" · ")}
                </div>
              )}
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
            {partSource === "Customer_Brought" ? (
              <button
                className="btn btn-primary"
                onClick={saveCustomerBroughtPart}
                disabled={!customerPartName.trim()}
              >
                <Package />
                Add customer-brought part
              </button>
            ) : (
              <button className="btn btn-primary" onClick={sendPartRequest} disabled={!selectedItem}>
                <Package />
                Send {formatQty(Number(partQty) || 0.001, selectedItem?.measureUnit ?? selectedItem?.unit)} to stores
              </button>
            )}
          </>
        }
      >
        <div className="stack">
          {claim && (
            <div className="row wrap" style={{ gap: 8 }}>
              <button
                type="button"
                className={`btn btn-sm ${partSource === "Workshop_Store" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setPartSource("Workshop_Store")}
              >
                <Package />
                Workshop store
              </button>
              <button
                type="button"
                className={`btn btn-sm ${partSource === "Customer_Brought" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setPartSource("Customer_Brought")}
              >
                <UserRound />
                Customer brought
              </button>
            </div>
          )}
          {partSource === "Customer_Brought" ? (
            <>
              <Alert tone="info" title="Customer-supplied part">
                This part is billed on the insurance bill only. Stores stock is not deducted and the
                value is excluded from workshop parts revenue.
              </Alert>
              <div className="form-grid">
                <Field label="Part description" required full>
                  <input
                    className="input"
                    placeholder="e.g. Genuine headlamp supplied by customer"
                    value={customerPartName}
                    onChange={(event) => setCustomerPartName(event.target.value)}
                  />
                </Field>
                <Field label="Quantity" required>
                  <input
                    className="input"
                    type="number"
                    min={0.001}
                    step="any"
                    value={customerPartQty}
                    onChange={(event) => setCustomerPartQty(event.target.value)}
                  />
                </Field>
                <Field label="Billable unit value (LKR)" required>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step="0.01"
                    value={customerPartValue}
                    onChange={(event) => setCustomerPartValue(event.target.value)}
                  />
                </Field>
                {sectionsEnabled && (
                  <Field label="Section">
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
              </div>
            </>
          ) : (
            <>
          <Field
            label="Search parts"
            hint="Matching fitment and universal items are shown. Out-of-stock parts are purchased by Stores when issued."
          >
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
                      <span
                        className={`badge ${selectedItem.stock > 0 ? "badge-green" : "badge-amber"}`}
                      >
                        {selectedItem.stock > 0
                          ? `${formatQty(selectedItem.stock, selectedItem.measureUnit ?? selectedItem.unit)} in stock`
                          : "Out of stock · Stores will purchase"}
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
                    hint={
                      selectedItem.stock > 0
                        ? `In stock: ${formatQty(selectedItem.stock, selectedItem.measureUnit ?? selectedItem.unit)}. Any shortage is purchased by Stores at issue. Fractional quantities are allowed for consumables.`
                        : "Out of stock. Stores will purchase this quantity and issue it against a supplier invoice."
                    }
                  >
                    <input
                      className="input"
                      type="number"
                      min={0.001}
                      step="any"
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
                  <p>No part matches this vehicle. Add the part under Stores first.</p>
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

          {claim && (
            <label className="toggle-row">
              <span>
                <strong>Non-claim / customer extra part</strong>
                <div className="tiny muted">
                  Excluded from the insurance bill and pre-selected on the customer bill.
                </div>
              </span>
              <input
                type="checkbox"
                checked={partExtra}
                onChange={(event) => setPartExtra(event.target.checked)}
              />
            </label>
          )}
          <div className="alert alert-warn">
            <Package />
            <div>
              Requests are not limited by stock. If the item is short, Stores purchases the
              balance and issues it — the supplier invoice number is required for that purchase.
            </div>
          </div>
            </>
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(readdPart)}
        onClose={() => setReaddPartId(null)}
        title="Add the same part from store"
        subtitle={
          readdPart
            ? `${readdPart.itemName} · ${activeJob.vehicleNo} · returned to the customer`
            : undefined
        }
        size="wide"
        footer={
          <button className="btn btn-secondary" onClick={() => setReaddPartId(null)}>
            Cancel
          </button>
        }
      >
        {readdPart && (
          <div className="stack">
            <Alert tone="info" title="New store request, no stock movement yet">
              Pick the matching stock item. Stores receives a fresh request and sets the price when
              the part is issued — nothing is deducted until then.
            </Alert>
            <div className="form-grid">
              <Field label="Quantity" required>
                <input
                  className="input"
                  type="number"
                  min={0.001}
                  step="any"
                  value={readdQty}
                  onChange={(event) => setReaddQty(event.target.value)}
                />
              </Field>
              <Field label="Search stock" hint="All store parts are searchable; out-of-stock items are purchased by Stores.">
                <input
                  className="input"
                  placeholder="Search by part name or code…"
                  value={readdSearch}
                  onChange={(event) => setReaddSearch(event.target.value)}
                />
              </Field>
            </div>
            <div
              style={{
                border: "1px solid var(--line)",
                borderRadius: 11,
                maxHeight: 300,
                overflowY: "auto",
              }}
            >
              {readdStockOptions.length === 0 ? (
                <div className="empty" style={{ padding: "22px 14px" }}>
                  <p>No stock item matches that search. Add the part under Stores first.</p>
                </div>
              ) : (
                readdStockOptions.slice(0, 20).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="suggestion"
                    style={{ width: "100%", border: 0, background: "transparent", textAlign: "left" }}
                    onClick={() => readdFromStore(item.id)}
                  >
                    <span className="part-icon">
                      <Package size={14} />
                    </span>
                    <div className="s-main">
                      <strong>{item.name}</strong>
                      <span>
                        {item.code} · {item.make ? `${item.make} ${item.model}` : "Universal"} ·{" "}
                        {formatQty(item.stock, item.measureUnit ?? item.unit)} in stock
                      </span>
                    </div>
                    <span className={`badge ${item.stock > 0 ? "badge-green" : "badge-red"}`}>
                      {item.stock > 0 ? "In stock" : "Purchase"}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={estimateOpen}
        onClose={() => setEstimateOpen(false)}
        title={estimateEditingId ? "Edit estimate" : "Create estimate"}
        subtitle={`${job.vehicleNo} · ${job.customerName}`}
        size="wide"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setEstimateOpen(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={saveEstimate}
              disabled={
                estimateLines.length === 0 ||
                estimateDuplicateLineIds.size > 0 ||
                estimateLines.every(
                  (line) => !line.description.trim() || line.qty <= 0,
                )
              }
            >
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
                disabled={Boolean(estimateEditingId)}
              >
                <option value="Initial">Initial estimate</option>
                <option value="Supplementary">Supplementary estimate</option>
              </select>
            </Field>
            {sectionsEnabled && (
              <Field
                label="Repair section"
                hint="Each section can hold its own estimate, work and bill."
              >
                <select
                  className="select"
                  value={estimateSectionId}
                  onChange={(event) => setEstimateSectionId(event.target.value)}
                  disabled={Boolean(estimateEditingId)}
                >
                  <option value="">Whole job / no section</option>
                  {activeJob.sectionIds?.map((sectionId) => {
                    const section = state.sections.find((entry) => entry.id === sectionId);
                    if (!section) return null;
                    return (
                      <option key={section.id} value={section.id}>
                        {section.name}
                      </option>
                    );
                  })}
                </select>
              </Field>
            )}
            <Field label="Notes" hint="Assessor comments, exclusions or approval context.">
              <input
                className="input"
                value={estimateNotes}
                onChange={(event) => setEstimateNotes(event.target.value)}
              />
            </Field>
          </div>

          {estimateDuplicateLineIds.size > 0 && (
            <Alert tone="warn" title="Duplicate approved line">
              Remove the highlighted lines. They were already approved on an earlier estimate for
              this vehicle.
            </Alert>
          )}

          <datalist id="estimate-part-options">
            {estimatePartSuggestions.map((item) => (
              <option
                key={item.id}
                value={`${item.name}${item.make ? ` — ${item.make} ${item.model}` : ""}`}
              >
                {`${item.code} · ${formatQty(item.stock, item.measureUnit ?? item.unit)} in stock · ${money(item.lastSellingPrice ?? 0)}`}
              </option>
            ))}
          </datalist>

          <div className="stack" style={{ gap: 8 }}>
            {estimateLines.length === 0 ? (
              <div className="empty" style={{ padding: "26px 16px" }}>
                <FileText size={24} className="muted" />
                <h4>Start a clean estimate</h4>
                <p className="small muted">
                  No lines are pre-filled. Add labour and parts below — the estimate opens empty
                  for both initial and supplementary work.
                </p>
                <div className="row wrap" style={{ justifyContent: "center", gap: 8 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setEstimateLines([newEstimateLine("Labour")])}
                  >
                    <Plus />
                    Add labour
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setEstimateLines([newEstimateLine("Part")])}
                  >
                    <Plus />
                    Add part
                  </button>
                </div>
              </div>
            ) : (
              estimateLines.map((line, index) => {
                const duplicate =
                  estimateKind === "Supplementary" && line.description.trim()
                    ? findApprovedDuplicate(
                        state.estimates,
                        activeJob.id,
                        line.type,
                        line.description,
                        estimateEditingId ?? undefined,
                      )
                    : null;
                return (
                  <div
                    className="card"
                    key={line.id}
                    style={
                      duplicate
                        ? { borderColor: "var(--danger)", boxShadow: "0 0 0 1px var(--danger)" }
                        : undefined
                    }
                  >
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
                        <Field
                          label="Description"
                          required
                          hint={
                            line.type === "Part"
                              ? "Type to search current stock. Selecting a part fills its selling price; stock is not deducted until Stores issues it."
                              : undefined
                          }
                        >
                          <input
                            className="input"
                            list={line.type === "Part" ? "estimate-part-options" : undefined}
                            value={line.description}
                            onChange={(event) => {
                              const value = event.target.value;
                              const match =
                                line.type === "Part"
                                  ? state.inventory.find(
                                      (item) =>
                                        `${item.name}${item.make ? ` — ${item.make} ${item.model}` : ""}` ===
                                        value,
                                    )
                                  : undefined;
                              updateEstimateLine(line.id, {
                                description: value,
                                ...(match
                                  ? { unitPrice: Math.max(0, match.lastSellingPrice ?? 0) }
                                  : {}),
                              });
                            }}
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
                      {duplicate && (
                        <div className="tiny" style={{ color: "var(--danger)", marginTop: 6 }}>
                          <XCircle size={12} /> Already approved in{" "}
                          {estimateShortLabel(duplicate)} — remove this duplicate line.
                        </div>
                      )}
                      <div className="row-between" style={{ marginTop: 8 }}>
                        <span className="tiny muted">
                          Line total {money(line.qty * line.unitPrice)}
                        </span>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() =>
                            setEstimateLines((prev) => prev.filter((entry) => entry.id !== line.id))
                          }
                        >
                          <Trash2 />
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            {estimateLines.length > 0 && (
              <div className="row-between wrap">
                <div className="row wrap" style={{ gap: 8 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setEstimateLines((prev) => [...prev, newEstimateLine("Labour")])}
                  >
                    <Plus />
                    Add labour
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setEstimateLines((prev) => [...prev, newEstimateLine("Part")])}
                  >
                    <Plus />
                    Add part
                  </button>
                </div>
                <span className="strong">
                  Estimate total{" "}
                  {money(estimateLines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0))}
                </span>
              </div>
            )}
          </div>

          <Alert tone="info" title="Estimate-only and supplementary work">
            Estimates can be created for vehicles already checked in, or raised as a supplementary
            estimate when hidden damage appears. Approval is recorded separately for the insurer.
            Descriptions already approved on an earlier estimate are blocked.
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
        open={Boolean(approvalEstimate)}
        onClose={() => setApprovalEstimateId(null)}
        title={
          approvalEstimate?.status === "Approved"
            ? "Revise approved prices"
            : "Stage 1 · Scope approval"
        }
        subtitle={
          approvalEstimate
            ? `${estimateDisplayNumber(approvalEstimate)} · ${job.vehicleNo}`
            : undefined
        }
        size="wide"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setApprovalEstimateId(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveApproval}>
              <Check />
              {approvalEstimate?.status === "Approved"
                ? "Save approved prices"
                : "Confirm scope approval"}
            </button>
          </>
        }
      >
        {approvalEstimate && (
          <div className="stack">
            <Alert tone="info" title="Approve the scope line by line">
              Approved lines load to the job card at the assessor price with no technician
              assigned. The supervisor assigns a worker to every task, then chooses whether each
              part is store-supplied or customer-brought. Stores only sees store-supplied
              requests.
            </Alert>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Description</th>
                    <th className="num">Qty</th>
                    <th className="num">Quoted</th>
                    <th>Decision</th>
                    <th className="num">Approved unit price</th>
                  </tr>
                </thead>
                <tbody>
                  {approvalEstimate.lines.map((line) => {
                    const decision =
                      approvalDecisions[line.id] ?? {
                        status: "Approved" as EstimateLineApproval,
                        approvedUnitPrice: String(line.approvedUnitPrice ?? line.unitPrice),
                      };
                    const approved = decision.status === "Approved";
                    return (
                      <tr key={line.id}>
                        <td><span className="chip">{line.type}</span></td>
                        <td>{line.description}</td>
                        <td className="num">{line.qty}</td>
                        <td className="num">{money(line.unitPrice)}</td>
                        <td>
                          <div className="row" style={{ gap: 4 }}>
                            <button
                              type="button"
                              className={`btn btn-sm ${approved ? "btn-primary" : "btn-ghost"}`}
                              onClick={() =>
                                updateApprovalDecision(line.id, { status: "Approved" })
                              }
                            >
                              <Check />
                              Approve
                            </button>
                            <button
                              type="button"
                              className={`btn btn-sm ${!approved ? "btn-secondary" : "btn-ghost"}`}
                              onClick={() =>
                                updateApprovalDecision(line.id, { status: "Rejected" })
                              }
                            >
                              <X />
                              Reject
                            </button>
                          </div>
                        </td>
                        <td className="num">
                          <input
                            className="input"
                            type="number"
                            min={0}
                            step="0.01"
                            style={{ maxWidth: 130, textAlign: "right" }}
                            value={decision.approvedUnitPrice}
                            disabled={!approved}
                            onChange={(event) =>
                              updateApprovalDecision(line.id, {
                                approvedUnitPrice: event.target.value,
                              })
                            }
                          />
                          {approved &&
                            Number(decision.approvedUnitPrice) !== line.unitPrice && (
                              <div className="cell-sub">
                                Variance{" "}
                                {Number(decision.approvedUnitPrice) - line.unitPrice > 0 ? "+" : ""}
                                {money(
                                  Number(decision.approvedUnitPrice) - line.unitPrice,
                                )}
                              </div>
                            )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="tiny muted">
              Approved total{" "}
              {money(
                approvalEstimate.lines.reduce((sum, line) => {
                  const decision = approvalDecisions[line.id];
                  if ((decision?.status ?? "Approved") !== "Approved") return sum;
                  return (
                    sum +
                    line.qty *
                      (Number(decision?.approvedUnitPrice) || line.unitPrice)
                  );
                }, 0),
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={splitBillOpen}
        onClose={() => setSplitBillOpen(false)}
        title={`New ${splitBillKind.toLowerCase()} bill`}
        subtitle={`${job.vehicleNo} · tick the tasks and parts that belong on this bill`}
        size="wide"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setSplitBillOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveSplitBill}>
              <ReceiptText />
              Save draft bill · {money(splitNet)}
            </button>
          </>
        }
      >
        <div className="stack">
          <div className="form-grid">
            <Field label="Bill type" required>
              <select
                className="select"
                value={splitBillKind}
                onChange={(event) => {
                  const next = event.target.value as VehicleBill["kind"];
                  setSplitBillKind(next);
                  setSplitTaskIds([]);
                  setSplitPartIds([]);
                }}
              >
                <option value="Insurance">Insurance</option>
                <option value="Customer">Customer</option>
                <option value="Additional">Additional</option>
              </select>
            </Field>
            <Field label="Bill number" required>
              <input
                className="input"
                value={splitBillNo}
                onChange={(event) => setSplitBillNo(event.target.value)}
              />
            </Field>
            {sectionsEnabled && (
              <Field
                label="Repair section"
                hint="Section bills stay separate; the final bill totals all sections."
              >
                <select
                  className="select"
                  value={splitSectionId}
                  onChange={(event) => setSplitSectionId(event.target.value)}
                >
                  <option value="">Whole job / no section</option>
                  {activeJob.sectionIds?.map((sectionId) => {
                    const section = state.sections.find((entry) => entry.id === sectionId);
                    if (!section) return null;
                    return (
                      <option key={section.id} value={section.id}>
                        {section.name}
                      </option>
                    );
                  })}
                </select>
              </Field>
            )}
            <Field label="Note" full>
              <input
                className="input"
                placeholder="Customer excess, policy depreciation, extra work…"
                value={splitNotes}
                onChange={(event) => setSplitNotes(event.target.value)}
              />
            </Field>
          </div>

          <div>
            <div className="row-between" style={{ marginBottom: 6 }}>
              <strong className="small">Labour tasks</strong>
              <span className="tiny muted">{splitTasks.length} selected</span>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th />
                    <th>Task</th>
                    <th>Flags</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {jobTasks.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="tiny muted">No labour tasks on this job.</td>
                    </tr>
                  ) : (
                    jobTasks.map((task) => {
                      const billed = billById(task.assignedBillId);
                      const blocked =
                        Boolean(task.assignedBillId) ||
                        (splitBillKind === "Insurance" && Boolean(task.isCustomerExtra));
                      return (
                        <tr key={task.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={splitTaskIds.includes(task.id)}
                              disabled={blocked}
                              onChange={() => toggleSplitTask(task.id)}
                            />
                          </td>
                          <td>{task.name}</td>
                          <td>
                            <div className="row wrap" style={{ gap: 4 }}>
                              {task.isCustomerExtra && (
                                <span className="badge badge-amber">Customer extra</span>
                              )}
                              {billed && (
                                <span className="badge badge-slate">
                                  <Lock size={10} /> Already billed ({billed.billNo})
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="num">{money(task.laborCost)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div className="row-between" style={{ marginBottom: 6 }}>
              <strong className="small">Parts & materials</strong>
              <span className="tiny muted">{splitParts.length} selected</span>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th />
                    <th>Part</th>
                    <th>Flags</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {billableParts.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="tiny muted">No issued parts on this job.</td>
                    </tr>
                  ) : (
                    billableParts.map((part) => {
                      const billed = billById(part.assignedBillId);
                      const blocked =
                        Boolean(part.assignedBillId) ||
                        (splitBillKind === "Insurance" && Boolean(part.isCustomerExtra)) ||
                        (splitBillKind !== "Insurance" &&
                          part.partSource === "Customer_Brought");
                      return (
                        <tr key={part.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={splitPartIds.includes(part.id)}
                              disabled={blocked}
                              onChange={() => toggleSplitPart(part.id)}
                            />
                          </td>
                          <td>{part.itemName}</td>
                          <td>
                            <div className="row wrap" style={{ gap: 4 }}>
                              {part.partSource === "Customer_Brought" && (
                                <span className="badge badge-blue">Customer supplied</span>
                              )}
                              {part.isCustomerExtra && (
                                <span className="badge badge-amber">Customer extra</span>
                              )}
                              {billed && (
                                <span className="badge badge-slate">
                                  <Lock size={10} /> Already billed ({billed.billNo})
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="num">
                            {money(part.sellingPrice * partIssueQty(part))}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid cols-3" style={{ gap: 10 }}>
            <Field label="Discount (LKR)">
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                value={splitDiscount}
                onChange={(event) => setSplitDiscount(event.target.value)}
              />
            </Field>
            <Field
              label="VAT on this bill"
              hint="Cashier confirms the final VAT and sends this bill."
            >
              <select
                className="select"
                value={splitVatRate > 0 ? "on" : "off"}
                onChange={(event) =>
                  setSplitVat(
                    event.target.value === "on"
                      ? String(state.settings.defaultVatRate ?? 18)
                      : "0",
                  )
                }
              >
                <option value="off">No VAT</option>
                <option value="on">
                  Add VAT ({state.settings.defaultVatRate ?? 18}%)
                </option>
              </select>
            </Field>
            <Field label="Advance deduction (LKR)">
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                value={splitAdvance}
                onChange={(event) => setSplitAdvance(event.target.value)}
              />
            </Field>
            <Field label="Policy excess (LKR)">
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                value={splitExcess}
                onChange={(event) => setSplitExcess(event.target.value)}
              />
            </Field>
            <Field label="Depreciation (LKR)">
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                value={splitDepreciation}
                onChange={(event) => setSplitDepreciation(event.target.value)}
              />
            </Field>
          </div>

          <div className="card">
            <div className="card-body">
              <div className="kv"><span>Labour subtotal</span><span>{money(splitLabor)}</span></div>
              <div className="kv"><span>Parts subtotal</span><span>{money(splitPartsTotal)}</span></div>
              <div className="kv"><span>Discount</span><span>- {money(splitDiscountValue)}</span></div>
              <div className="kv">
                <span>VAT ({splitVatRate}%)</span>
                <span>{money(splitVatAmount)}</span>
              </div>
              <div className="kv"><span>Advance</span><span>- {money(splitAdvanceValue)}</span></div>
              {splitBillKind === "Insurance" && (
                <>
                  <div className="kv"><span>Policy excess</span><span>- {money(splitExcessValue)}</span></div>
                  <div className="kv"><span>Depreciation</span><span>- {money(splitDepreciationValue)}</span></div>
                </>
              )}
              <div className="kv" style={{ fontSize: 15 }}>
                <span>Net payable</span>
                <span>{money(splitNet)}</span>
              </div>
            </div>
          </div>
        </div>
      </Modal>

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
