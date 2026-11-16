import type {
  DiscountType,
  EstimateLine,
  JobCard,
  JobEstimate,
  JobPart,
  JobTask,
  LedgerEntry,
  WorkerProfile,
} from "../types";

export function money(value: number, decimals = 0): string {
  return `LKR ${new Intl.NumberFormat("en-LK", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number.isFinite(value) ? value : 0)}`;
}

export function num(value: number): string {
  return new Intl.NumberFormat("en-LK").format(value);
}

/** Formats whole and fractional issue quantities without noisy trailing zeros. */
export function formatQty(value: number, unit?: string): string {
  const rounded = Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000;
  const text = new Intl.NumberFormat("en-LK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(rounded);
  return unit ? `${text} ${unit}` : text;
}

export function partIssueQty(part: Pick<JobPart, "qtyIssued" | "qtyRequested">): number {
  if (part.qtyIssued > 0) return part.qtyIssued;
  return Math.max(0, part.qtyRequested);
}

type TaskWorkerInput = Pick<JobTask, "laborCost"> & {
  workerIds?: string[];
  workerId?: string;
};

/** All technicians on a task, including the legacy single-worker field. */
export function taskWorkerIds(task: Pick<JobTask, "workerIds" | "workerId">): string[] {
  const ids = (task.workerIds ?? []).filter(Boolean);
  if (ids.length > 0) return Array.from(new Set(ids));
  return task.workerId ? [task.workerId] : [];
}

export function taskWorkers(
  task: Pick<JobTask, "workerIds" | "workerId">,
  workers: WorkerProfile[],
): WorkerProfile[] {
  return taskWorkerIds(task)
    .map((workerId) => workers.find((worker) => worker.id === workerId))
    .filter((worker): worker is WorkerProfile => Boolean(worker));
}

export function taskWorkerNames(
  task: Pick<JobTask, "workerIds" | "workerId">,
  workers: WorkerProfile[],
  fallback = "Unassigned",
): string {
  const names = taskWorkers(task, workers).map((worker) => worker.fullName);
  return names.length > 0 ? names.join(", ") : fallback;
}

export interface TaskCommissionShare {
  workerId: string;
  workerName: string;
  commissionRate: number;
  laborShare: number;
  commission: number;
}

/**
 * A task's labour is split equally between its technicians, and each
 * technician earns their own commission rate on their share.
 */
export function taskCommissionShares(
  task: TaskWorkerInput,
  workers: WorkerProfile[],
): TaskCommissionShare[] {
  const workerIds = taskWorkerIds(task);
  if (workerIds.length === 0 || task.laborCost <= 0) return [];
  const laborShare = task.laborCost / workerIds.length;
  return workerIds.map((workerId) => {
    const worker = workers.find((entry) => entry.id === workerId);
    const commissionRate = Math.max(0, worker?.commissionRate ?? 0);
    return {
      workerId,
      workerName: worker?.fullName ?? "Unassigned",
      commissionRate,
      laborShare: Math.round(laborShare * 100) / 100,
      commission: Math.round(laborShare * commissionRate) / 100,
    };
  });
}

export function taskCommission(task: TaskWorkerInput, workers: WorkerProfile[]): number {
  const total = taskCommissionShares(task, workers).reduce(
    (sum, share) => sum + share.commission,
    0,
  );
  return Math.round(total * 100) / 100;
}

/** Reads split commission when present, else the legacy single-worker entry. */
export function ledgerCommissionForWorker(entry: LedgerEntry, workerId: string): number {
  const split = entry.workerCommissions?.find((row) => row.workerId === workerId);
  if (split) return split.commission;
  if (entry.workerCommissions && entry.workerCommissions.length > 0) return 0;
  return entry.workerId === workerId ? entry.commission : 0;
}

export function shortDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function dateTime(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(iso?: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return shortDate(iso);
}

export function todayISO(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

export function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

export function isoDaysFrom(base: string | Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function daysAgoISO(days: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 15, 0, 0);
  return d.toISOString();
}

export function daysUntil(iso?: string): number {
  if (!iso) return 0;
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

export function daysBetween(a: string, b: string): number {
  const start = new Date(a);
  const end = new Date(b);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
}

/** Normalise a Sri Lankan number to WhatsApp format: 94771234567 */
export function normalizePhone(input: string): string {
  let digits = String(input || "").replace(/[^\d]/g, "");
  if (digits.startsWith("94")) return digits;
  if (digits.startsWith("0")) digits = digits.slice(1);
  return `94${digits}`;
}

export function displayPhone(input: string): string {
  const n = normalizePhone(input);
  if (n.length < 11) return input;
  return `+${n.slice(0, 2)} ${n.slice(2, 4)} ${n.slice(4, 7)} ${n.slice(7)}`;
}

/** Demo mode routes every outbound customer message to the developer test number. */
export const DEMO_WHATSAPP_NUMBER = "94755756803";

export function isDemoMode(): boolean {
  try {
    const raw = localStorage.getItem("torque_workshop_erp_v1");
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { settings?: { demoMode?: boolean } };
    return parsed.settings?.demoMode === true;
  } catch {
    return false;
  }
}

export function waLink(phone: string, message: string): string {
  const recipient = isDemoMode() ? DEMO_WHATSAPP_NUMBER : normalizePhone(phone);
  return `https://wa.me/${recipient}?text=${encodeURIComponent(message)}`;
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export interface JobTotals {
  labor: number;
  parts: number;
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  partsCost: number;
  commission: number;
  issuedParts: JobPart[];
  billableParts: JobPart[];
  includedParts: JobPart[];
  activeTasks: JobTask[];
  /** Workshop-supplied billable parts (excludes customer-brought parts). */
  workshopParts: number;
  /** Customer-supplied parts billed to the insurer, never workshop revenue. */
  customerBroughtParts: number;
  /** Labour + workshop parts + customer-brought parts, used by insurance documents. */
  insuranceSubtotal: number;
}

export function jobTotals(
  job: JobCard,
  tasks: JobTask[],
  parts: JobPart[],
  workers: WorkerProfile[],
): JobTotals {
  const activeTasks = tasks.filter((t) => t.jobCardId === job.id);
  const allIssuedParts = parts.filter(
    (p) =>
      p.jobCardId === job.id &&
      (p.status === "Issued" || p.status === "Exchange Pending" || p.status === "Return Pending"),
  );
  const billableParts = allIssuedParts.filter(
    (p) => !p.includedInLabor && p.sellingPrice > 0,
  );
  const includedParts = allIssuedParts.filter(
    (p) => p.includedInLabor || p.sellingPrice <= 0,
  );
  const issuedParts = billableParts.filter(
    (part) => part.partSource !== "Customer_Brought",
  );
  const labor = activeTasks.reduce((sum, t) => sum + t.laborCost, 0);
  const workshopParts = billableParts
    .filter((part) => part.partSource !== "Customer_Brought")
    .reduce((sum, part) => sum + part.sellingPrice * partIssueQty(part), 0);
  const customerBroughtParts = billableParts
    .filter((part) => part.partSource === "Customer_Brought")
    .reduce((sum, part) => sum + part.sellingPrice * partIssueQty(part), 0);
  const partsTotal = workshopParts;
  const partsCost = allIssuedParts
    .filter((part) => part.partSource !== "Customer_Brought")
    .reduce((sum, part) => sum + part.costPrice * partIssueQty(part), 0);
  const subtotal = labor + partsTotal;
  let discount = 0;
  if (job.discount > 0) {
    discount =
      job.discountType === "Percentage"
        ? (subtotal * job.discount) / 100
        : job.discount;
  }
  discount = Math.min(discount, subtotal);
  const commission = activeTasks.reduce(
    (sum, task) => sum + taskCommission(task, workers),
    0,
  );
  const vat = Math.max(0, job.vatAmount ?? 0);
  return {
    labor,
    parts: partsTotal,
    subtotal,
    discount,
    vat,
    total: Math.max(0, subtotal - discount + vat),
    partsCost,
    commission,
    issuedParts,
    billableParts,
    includedParts,
    activeTasks,
    workshopParts,
    customerBroughtParts,
    insuranceSubtotal: labor + partsTotal + customerBroughtParts,
  };
}

export function discountValue(
  subtotal: number,
  value: number,
  type: DiscountType,
): number {
  if (!value) return 0;
  return Math.min(
    subtotal,
    type === "Percentage" ? (subtotal * value) / 100 : value,
  );
}

export function driverCommissionFor(
  job: JobCard,
  totals: Pick<JobTotals, "labor" | "total">,
): number {
  if (!job.driver || job.driver.value <= 0) return 0;
  const base = job.driver.basis === "Labour" ? totals.labor : totals.total;
  const amount =
    job.driver.type === "Percentage" ? (base * job.driver.value) / 100 : job.driver.value;
  return Math.max(0, Math.round(amount * 100) / 100);
}

export function isWithinRange(iso: string, range: "today" | "month" | "year"): boolean {
  const d = new Date(iso);
  const now = new Date();
  if (range === "today") {
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }
  if (range === "month") {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }
  return d.getFullYear() === now.getFullYear();
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
}

export function classNames(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** Next globally sequential estimate number in the form EST-YYYY-0001. */
export function nextEstimateNumber(estimates: JobEstimate[], now = new Date()): string {
  const year = now.getFullYear();
  const pattern = new RegExp(`^EST-${year}-(\\d{4,})$`);
  let highest = 0;
  estimates.forEach((estimate) => {
    const match = estimate.number.match(pattern);
    if (match) highest = Math.max(highest, Number(match[1]));
  });
  return `EST-${year}-${String(highest + 1).padStart(4, "0")}`;
}

/** Human label: EST-2026-0001 or EST-2026-0002 (SUP-01 • Rev 1). */
export function estimateDisplayNumber(
  estimate: Pick<JobEstimate, "number" | "kind" | "revision" | "supplementaryNo">,
): string {
  const base = /^EST-\d{4}-\d{4,}$/.test(estimate.number)
    ? estimate.number
    : estimate.number || "Estimate";
  if (estimate.kind !== "Supplementary") return base;
  const supplementary = String(estimate.supplementaryNo ?? 1).padStart(2, "0");
  return `${base} (SUP-${supplementary} • Rev ${estimate.revision})`;
}

export function estimateKindLabel(
  estimate: Pick<JobEstimate, "kind" | "supplementaryNo">,
): string {
  if (estimate.kind === "Initial") return "Initial estimate";
  const supplementary = String(estimate.supplementaryNo ?? 1).padStart(2, "0");
  return `Supplementary #${supplementary}`;
}

/** Short label used in duplicate warnings: "Initial" or "SUP-01". */
export function estimateShortLabel(
  estimate: Pick<JobEstimate, "kind" | "supplementaryNo">,
): string {
  if (estimate.kind === "Initial") return "Initial";
  const supplementary = String(estimate.supplementaryNo ?? 1).padStart(2, "0");
  return `SUP-${supplementary}`;
}

/**
 * Finds an already approved line with the same type and description on another
 * estimate for the same job card. Used to block duplicate supplementary lines.
 */
export function findApprovedDuplicate(
  estimates: JobEstimate[],
  jobCardId: string,
  type: EstimateLine["type"],
  description: string,
  excludeEstimateId?: string,
): JobEstimate | null {
  const needle = description.trim().toLowerCase();
  if (!needle) return null;
  const match = estimates.find(
    (estimate) =>
      estimate.jobCardId === jobCardId &&
      estimate.id !== excludeEstimateId &&
      estimate.lines.some(
        (line) =>
          line.type === type &&
          line.approvalStatus === "Approved" &&
          line.description.trim().toLowerCase() === needle,
      ),
  );
  return match ?? null;
}
