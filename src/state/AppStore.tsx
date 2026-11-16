import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AdvancePayment,
  Appointment,
  AppointmentBookingInput,
  AppState,
  AppNotification,
  AttendanceRecord,
  BankAccount,
  BankTransaction,
  CheckoutInput,
  ChequeDetails,
  CreditPayment,
  CustomerCheque,
  DamagePhoto,
  Department,
  DriverCommission,
  EstimateLine,
  EstimateLineApproval,
  Expense,
  ExpenseCategory,
  FeatureFlagKey,
  FeatureFlags,
  InsuranceClaim,
  InsuranceCompany,
  InventoryItem,
  JobCard,
  JobEstimate,
  JobIntakeType,
  JobPart,
  JobTask,
  NewCheckInInput,
  NotificationDepartment,
  OpenContainer,
  Payslip,
  PettyCashCategory,
  PettyCashEntry,
  PurchaseLine,
  StaffLoan,
  StockMovement,
  SupplierCheque,
  SupplierCreditNote,
  SupplierPurchase,
  SupplierReturn,
  StoresTopology,
  UserNotificationPreferences,
  VehicleBill,
  VehicleBillPaymentMethod,
  WorkshopLoan,
  WorkshopLoanPayment,
  WorkshopSection,
  WorkshopSettings,
  WorkshopUser,
  WorkerProfile,
} from "../types";
import { createDemoState, createEmptyState, STORAGE_KEY } from "../data/seed";
import {
  daysBetween,
  driverCommissionFor,
  estimateDisplayNumber,
  estimateShortLabel,
  findApprovedDuplicate,
  formatQty,
  isoDaysFrom,
  jobTotals,
  money,
  nextEstimateNumber,
  normalizePhone,
  partIssueQty,
  uid,
} from "../lib/utils";
import { uploadBackupToDrive } from "../lib/driveBackup";
import { dailyWageDue, localDateKey } from "../lib/payroll";
import {
  acceptanceMessage,
  afterServiceFollowUpMessage,
  appointmentCancelledMessage,
  appointmentConfirmedMessage,
  appointmentRescheduledMessage,
  handoverMessage,
  marketingMessage,
  ownerIntakeMessage,
} from "../lib/messages";
import { queueWhatsApp } from "../lib/whatsapp";
import {
  getInstallationId,
  getMachineId,
  verifyOfflineToken,
  validateLicenceKey,
} from "../lib/licence";
import { defaultFeatureFlags, featureFlagsFor } from "../lib/features";
import { mergeNotificationPreferences } from "../lib/notifications";
import { licenceServerConfigured, pollRemoteLicence } from "../lib/licenceSync";
import {
  useCloudSync,
  type CloudActionResult,
  type CloudStatus,
} from "./useCloudSync";

interface ActionResult {
  ok: boolean;
  message?: string;
  jobId?: string;
  reference?: string;
}

interface SetupInput {
  companyName: string;
  address: string;
  phone: string;
  email: string;
  ownerName: string;
  ownerPin: string;
  ownerPassword: string;
  googleReviewUrl: string;
  logo?: string;
  brandColor: string;
  accentColor: string;
  tinNumber?: string;
  vatRegNumber?: string;
  defaultVatRate?: number;
  placeOfSupply?: string;
  printerMode?: WorkshopSettings["printerMode"];
  thermalPaperWidth?: WorkshopSettings["thermalPaperWidth"];
  standardPaperSize?: WorkshopSettings["standardPaperSize"];
  whatsappCompanyNumber?: string;
  whatsappGatewayUrl?: string;
  whatsappSession?: string;
  whatsappApiKey?: string;
  featureFlags?: FeatureFlags;
  storesTopology?: StoresTopology;
  sections?: Array<{ name: string; code?: string; description?: string }>;
  bankAccount?: {
    name: string;
    bankName: string;
    branch: string;
    accountNumber: string;
    type: "Bank" | "Cash";
    openingBalance: number;
  };
  staff?: Array<{
    name: string;
    username: string;
    pin: string;
    phone: string;
    departments: Department[];
  }>;
}

interface AppStoreValue {
  state: AppState;
  currentUser: WorkshopUser | null;
  cloudStatus: CloudStatus;
  cloudMessage: string;
  cloudEmail: string | null;
  cloudSignIn: (email: string, password: string) => Promise<CloudActionResult>;
  cloudSignOut: () => Promise<void>;
  cloudRetry: () => void;
  login: (userId: string, pin: string) => ActionResult;
  logout: () => void;
  loadDemo: () => void;
  createWorkshop: (input: SetupInput) => void;
  updateSettings: (patch: Partial<WorkshopSettings>) => void;
  addSection: (section: Omit<WorkshopSection, "id" | "createdAt">) => string;
  updateSection: (section: WorkshopSection) => void;
  removeSection: (sectionId: string) => ActionResult;
  assignUserSections: (userId: string, sectionIds: string[]) => void;
  updateFeatureFlag: (key: FeatureFlagKey, enabled: boolean) => void;
  updateFeatureFlags: (flags: FeatureFlags) => void;
  setStoresTopology: (topology: StoresTopology) => void;
  openConsumableContainer: (input: {
    itemId: string;
    sectionId?: string;
    label?: string;
    qty?: number;
    costPerUnit?: number;
    sellingPricePerUnit?: number;
  }) => ActionResult;
  issueConsumable: (input: {
    jobCardId: string;
    containerId: string;
    qty: number;
    includedInLabor: boolean;
    sectionId?: string;
  }) => ActionResult;
  markContainerEmpty: (containerId: string) => ActionResult;
  togglePartIncludedInLabor: (partId: string, included: boolean) => void;
  updateJobSections: (jobId: string, sectionIds: string[]) => void;
  syncLicence: () => Promise<ActionResult>;
  addUser: (user: Omit<WorkshopUser, "id" | "createdAt">) => string;
  updateUser: (user: WorkshopUser) => void;
  removeUser: (userId: string) => ActionResult;
  addWorker: (worker: Omit<WorkerProfile, "id">) => string;
  updateWorker: (worker: WorkerProfile) => void;
  submitCheckIn: (input: NewCheckInInput) => ActionResult;
  lookupVehicle: (vehicleNo: string) => {
    make: string;
    model: string;
    customerName: string;
    phone: string;
    mileage: number;
    email?: string;
    address?: string;
  } | null;
  rejectCheckIn: (checkInId: string) => void;
  acceptCheckIn: (
    checkInId: string,
    data: {
      repairType: string;
      safetyNotes: string;
      photos: DamagePhoto[];
      intakeType: JobIntakeType;
      driver?: DriverCommission;
      sectionIds?: string[];
    },
  ) => ActionResult;
  addTask: (
    jobId: string,
    name: string,
    laborCost: number,
    workerId: string,
    catalogueItemId?: string,
    sectionId?: string,
    options?: { isCustomerExtra?: boolean },
  ) => ActionResult;
  removeTask: (taskId: string) => void;
  updateTask: (
    taskId: string,
    data: {
      name: string;
      laborCost: number;
      workerId: string;
      sectionId?: string;
      isCustomerExtra?: boolean;
    },
  ) => ActionResult;
  removePart: (partId: string) => ActionResult;
  requestPart: (
    jobId: string,
    itemId: string,
    qty: number,
    sectionId?: string,
    options?: { isCustomerExtra?: boolean },
  ) => ActionResult;
  addCustomerBroughtPart: (
    jobId: string,
    data: { name: string; qty: number; unitPrice: number; sectionId?: string },
  ) => ActionResult;
  fulfillPart: (
    partId: string,
    data: {
      qtyIssued: number;
      costPrice: number;
      marginPercent: number;
      supplierId?: string;
      supplierInvoiceNo: string;
    },
  ) => ActionResult;
  requestExchange: (partId: string) => void;
  requestReturn: (partId: string) => void;
  /** Supervisor chooses store-supplied vs customer-brought before a request reaches stores. */
  setPartSource: (
    partId: string,
    source: "Workshop_Store" | "Customer_Brought",
  ) => ActionResult;
  /** Customer-brought parts go back to the customer, never into stores. */
  returnCustomerBroughtPart: (partId: string, mode: "Return" | "Swap") => ActionResult;
  approveExchange: (
    partId: string,
    data: {
      costPrice: number;
      marginPercent: number;
      supplierId?: string;
      supplierInvoiceNo: string;
    },
  ) => ActionResult;
  approveReturn: (partId: string) => void;
  requestWarrantyClaim: (partId: string, note: string) => ActionResult;
  completeWarrantyClaim: (
    partId: string,
    data: { replacementInvoiceNo: string; creditNoteNo: string; creditNoteAmount: number },
  ) => ActionResult;
  updatePartSalvage: (
    partId: string,
    data: { status: JobPart["salvageStatus"]; reference?: string; note?: string },
  ) => void;
  createEstimate: (
    jobId: string,
    kind: JobEstimate["kind"],
    lines: EstimateLine[],
    notes: string,
    sectionId?: string,
  ) => ActionResult;
  updateEstimate: (
    estimateId: string,
    lines: EstimateLine[],
    notes: string,
  ) => ActionResult;
  removeEstimate: (estimateId: string) => ActionResult;
  approveEstimate: (
    estimateId: string,
    decisions?: Record<
      string,
      { status: EstimateLineApproval; approvedUnitPrice?: number; approvalNote?: string }
    >,
  ) => ActionResult;
  reviseEstimatePrices: (estimateId: string, prices: Record<string, number>) => ActionResult;
  convertEstimateLineToCustomerExtra: (estimateId: string, lineId: string) => ActionResult;
  setEstimateStatus: (estimateId: string, status: JobEstimate["status"]) => void;
  updateDriverCommission: (jobId: string, driver?: DriverCommission) => ActionResult;
  recordAdvancePayment: (
    jobCardId: string,
    amount: number,
    method: AdvancePayment["method"],
    note?: string,
    cheque?: ChequeDetails,
    bankAccountId?: string,
  ) => ActionResult;
  createInsuranceClaim: (
    jobId: string,
    data: {
      insurerId: string;
      claimNo: string;
      policyNo: string;
      assessorName?: string;
      assessorPhone?: string;
    },
  ) => ActionResult;
  updateInsuranceClaim: (claimId: string, patch: Partial<InsuranceClaim>) => void;
  recordInsuranceCheque: (
    claimId: string,
    data: {
      chequeNo: string;
      amount: number;
      bank: string;
      branch: string;
      chequeDate: string;
      bankAccountId?: string;
    },
  ) => ActionResult;
  settleInsuranceClaim: (claimId: string) => ActionResult;
  markAttendance: (
    workerId: string,
    date: string,
    status: AttendanceRecord["status"],
    sectionId?: string,
  ) => void;
  markManyPresent: (workerIds: string[], date: string, sectionId?: string) => void;
  submitAppointmentBooking: (input: AppointmentBookingInput) => ActionResult;
  createStaffAppointment: (input: {
    customerName: string;
    phone: string;
    vehicleNo: string;
    vehicleModel: string;
    repairType: string;
    scheduledAt: string;
    notes?: string;
  }) => ActionResult;
  confirmAppointment: (appointmentId: string) => ActionResult;
  rescheduleAppointment: (
    appointmentId: string,
    scheduledAt: string,
    reason?: string,
  ) => ActionResult;
  cancelAppointment: (appointmentId: string, reason: string) => ActionResult;
  fulfilAppointment: (appointmentId: string, createCheckIn?: boolean) => ActionResult;
  markAppointmentNoShow: (appointmentId: string) => void;
  addStaffLoan: (workerId: string, principal: number, monthlyDeduction: number, reason: string) => void;
  savePayslip: (
    workerId: string,
    data: Omit<Payslip, "id" | "workerId" | "paidAt" | "paidBy">,
  ) => ActionResult;
  payDailyWage: (workerId: string, includeCommission: boolean) => ActionResult;
  addInsuranceCompany: (company: Omit<InsuranceCompany, "id">) => void;
  updateInsuranceCompany: (company: InsuranceCompany) => void;
  removeInsuranceCompany: (companyId: string) => void;
  activateLicence: (key: string) => ActionResult;
  markRepairCompleted: (jobId: string) => ActionResult;
  checkoutJob: (jobId: string, input: CheckoutInput) => ActionResult;
  dispatchJob: (jobId: string) => void;
  overrideBillingGate: (jobId: string, reason: string) => ActionResult;
  addVehicleBill: (input: {
    jobCardId: string;
    kind: VehicleBill["kind"];
    billNo: string;
    amount: number;
    sectionId?: string;
    claimId?: string;
    insurerId?: string;
    notes?: string;
    taskIds?: string[];
    partIds?: string[];
    laborSubtotal?: number;
    partsSubtotal?: number;
    discount?: number;
    vatRate?: number;
    vatAmount?: number;
    advance?: number;
    policyExcess?: number;
    depreciation?: number;
    netPayable?: number;
  }) => ActionResult;
  prepareVehicleBill: (
    billId: string,
    input: {
      /** Cashier discount in rupees, applied before VAT. */
      discount: number;
      /** 0 for No VAT, otherwise the VAT percentage. */
      vatRate: number;
    },
  ) => ActionResult;
  removeVehicleBill: (billId: string) => void;
  settleVehicleBill: (
    billId: string,
    input: {
      method: VehicleBillPaymentMethod;
      amount?: number;
      releaseOrderNo?: string;
      releaseOrderAmount?: number;
      /** Cashier discount in rupees, applied before VAT. */
      discount?: number;
    },
  ) => ActionResult;
  backupToDrive: (manual?: boolean) => Promise<ActionResult>;
  sendMarketingReminder: (id: string) => void;
  markMarketingCompleted: (id: string) => void;
  addExpense: (category: ExpenseCategory, amount: number, description: string, date: string) => void;
  removeExpense: (expenseId: string) => void;
  recordCreditPayment: (
    creditId: string,
    input: {
      amount: number;
      method: "Cash" | "Card" | "Bank Transfer" | "Cheque";
      bankAccountId?: string;
      cheque?: ChequeDetails;
    },
  ) => ActionResult;
  addSupplier: (name: string, phone: string, contactPerson: string) => void;
  addPurchase: (purchase: Omit<SupplierPurchase, "id">) => void;
  addBulkPurchase: (input: {
    supplierId: string;
    invoiceNo: string;
    type: "Cash" | "Credit";
    creditDays: number;
    purchaseDate: string;
    dueDate?: string;
    lines: PurchaseLine[];
    description: string;
  }) => ActionResult;
  markPurchasePaid: (
    purchaseId: string,
    data: {
      method: "Cash" | "Bank Transfer" | "Cheque";
      bankAccountId?: string;
      cheque?: ChequeDetails;
    },
  ) => ActionResult;
  addSupplierReturn: (input: {
    supplierId: string;
    purchaseId?: string;
    invoiceNo: string;
    reason: string;
    lines: { itemId: string; qty: number; costPrice: number }[];
  }) => ActionResult;
  setOpeningStock: (lines: { itemId: string; qty: number; costPrice?: number }[]) => ActionResult;
  addInventoryItem: (item: Omit<InventoryItem, "id">) => void;
  addBankAccount: (account: Omit<BankAccount, "id" | "createdAt">) => void;
  updateBankAccount: (account: BankAccount) => void;
  addBankTransaction: (input: {
    accountId: string;
    direction: BankTransaction["direction"];
    amount: number;
    category: string;
    description: string;
    date?: string;
    reference?: string;
  }) => ActionResult;
  transferBetweenAccounts: (
    fromId: string,
    toId: string,
    amount: number,
    note: string,
  ) => ActionResult;
  addPettyCashTopUp: (
    amount: number,
    bankAccountId: string,
    note: string,
  ) => ActionResult;
  addPettyCashExpense: (input: {
    category: PettyCashCategory;
    amount: number;
    description: string;
    paidTo: string;
    photoDataUrl?: string;
  }) => ActionResult;
  addSupplierCheque: (
    purchaseId: string,
    cheque: ChequeDetails,
  ) => ActionResult;
  clearSupplierCheque: (chequeId: string, bankAccountId: string) => ActionResult;
  takeBackSupplierCheque: (
    chequeId: string,
    bankAccountId: string,
  ) => ActionResult;
  updateCustomerChequeStatus: (
    chequeId: string,
    status: CustomerCheque["status"],
    reason?: string,
    bankAccountId?: string,
  ) => ActionResult;
  addWorkshopLoan: (input: {
    lender: string;
    purpose: string;
    principal: number;
    monthlyInstallment: number;
    startDate: string;
  }) => void;
  payWorkshopLoanInstallment: (
    loanId: string,
    amount: number,
    method: WorkshopLoanPayment["method"],
    bankAccountId?: string,
  ) => ActionResult;
  changeOwnPin: (currentPin: string, nextPin: string) => ActionResult;
  changeOwnerPassword: (currentPassword: string, nextPassword: string) => ActionResult;
  updateNotificationPreferences: (patch: Partial<UserNotificationPreferences>) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  resetAll: () => void;
  importState: (state: AppState) => void;
}

const AppContext = createContext<AppStoreValue | null>(null);

const CURRENT_VERSION = 4;

function normaliseState(raw: AppState): AppState {
  const legacySettings = raw.settings as Partial<WorkshopSettings>;
  const settings = {
    workingDays: [1, 2, 3, 4, 5, 6],
    epfEmployeeRate: 8,
    epfEmployerRate: 12,
    etfRate: 3,
    trialStartedAt: raw.settings.createdAt || new Date().toISOString(),
    tinNumber: "",
    vatRegNumber: "",
    defaultVatRate: 18,
    placeOfSupply: raw.settings.address || "",
    footerInquiryLine: "Any inquiry, please call our workshop hotline.",
    footerComplaintLine:
      "Any suggestion or complaint regarding your vehicle or job, please contact management.",
    printerMode: "Both",
    thermalPaperWidth: "80mm",
    standardPaperSize: "A4",
    bookingToken: `BOOK-${legacySettings.installationId || getInstallationId()}`,
    whatsappMode: "Disabled",
    whatsappSession: "default",
    whatsappAutoSend: true,
    whatsappOwnerNotify: true,
    driveBackupEnabled: false,
    driveBackupHour: 2,
    featureFlags: defaultFeatureFlags(),
    storesTopology: "Central",
    installationId: getInstallationId(),
    ...legacySettings,
  } as WorkshopSettings;
  settings.featureFlags = {
    ...defaultFeatureFlags(),
    ...(legacySettings.featureFlags ?? {}),
  };
  settings.installationId =
    legacySettings.installationId || getInstallationId();

  const estimatesByJob = new Map<string, JobEstimate[]>();
  (raw.estimates ?? []).forEach((estimate) => {
    const list = estimatesByJob.get(estimate.jobCardId) ?? [];
    list.push(estimate);
    estimatesByJob.set(estimate.jobCardId, list);
  });
  const estimates: JobEstimate[] = [];
  estimatesByJob.forEach((list) => {
    list
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .forEach((estimate, index) => {
        const firstInitial = list.find((entry) => entry.kind === "Initial");
        let number = estimate.number;
        if (!number) {
          if (estimate.kind === "Initial") {
            number = "Initial";
          } else {
            const supIndex = list
              .filter((entry) => entry.kind === "Supplementary")
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
              .findIndex((entry) => entry.id === estimate.id);
            number = `SUP-${String(supIndex + 1).padStart(2, "0")}`;
          }
        }
        if (estimate.kind === "Initial" && firstInitial && firstInitial.id !== estimate.id) {
          number = `SUP-${String(index).padStart(2, "0")}`;
        }
        estimates.push({
          ...estimate,
          number,
          revision: estimate.revision ?? 1,
          updatedAt: estimate.updatedAt ?? estimate.createdAt,
        });
      });
  });
  // Upgrade legacy "Initial" / "SUP-01" numbering to globally sequential EST-YYYY-NNNN.
  const maxEstimateByYear = new Map<number, number>();
  estimates.forEach((estimate) => {
    const match = estimate.number.match(/^EST-(\d{4})-(\d{4,})$/);
    if (match) {
      const year = Number(match[1]);
      maxEstimateByYear.set(
        year,
        Math.max(maxEstimateByYear.get(year) ?? 0, Number(match[2])),
      );
    }
  });
  estimates.forEach((estimate) => {
    if (!/^EST-\d{4}-\d{4,}$/.test(estimate.number)) {
      const year = new Date(estimate.createdAt).getFullYear() || new Date().getFullYear();
      const next = (maxEstimateByYear.get(year) ?? 0) + 1;
      maxEstimateByYear.set(year, next);
      estimate.number = `EST-${year}-${String(next).padStart(4, "0")}`;
    }
    if (estimate.kind === "Supplementary" && !estimate.supplementaryNo) {
      const siblings = estimatesByJob
        .get(estimate.jobCardId)
        ?.filter((entry) => entry.kind === "Supplementary")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      estimate.supplementaryNo =
        (siblings?.findIndex((entry) => entry.id === estimate.id) ?? 0) + 1;
    }
  });

  return {
    ...raw,
    version: CURRENT_VERSION,
    settings,
    users: (raw.users ?? []).map((user) => ({
      ...user,
      sectionIds: user.sectionIds ?? [],
      notificationPreferences: mergeNotificationPreferences(user.notificationPreferences),
    })),
    workers: (raw.workers ?? []).map((worker) => {
      const legacy = worker as Partial<WorkerProfile>;
      return {
        payType: "Monthly",
        dailyRate: 0,
        epfEnabled: true,
        etfEnabled: true,
        commissionEnabled: (legacy.commissionRate ?? 0) > 0,
        allowedOffDaysPerMonth: 2,
        sectionIds: legacy.sectionIds ?? [],
        ...legacy,
      } as WorkerProfile;
    }),
    jobCards: (raw.jobCards ?? []).map((job) => {
      const legacy = job as Partial<JobCard>;
      return {
        intakeType: "Repair",
        isVatInvoice: false,
        vatRateApplied: 0,
        vatAmount: 0,
        sectionIds: legacy.sectionIds ?? [],
        ...legacy,
      } as JobCard;
    }),
    parts: (raw.parts ?? []).map((part) => {
      const legacy = part as Partial<JobPart>;
      return {
        warrantyStatus: "None",
        salvageStatus: "Not Required",
        includedInLabor: legacy.includedInLabor ?? false,
        ...legacy,
      } as JobPart;
    }),
    inventory: (raw.inventory ?? []).map((item) => ({
      ...item,
      isOpeningStock: item.isOpeningStock ?? true,
      openingStockSetAt: item.openingStockSetAt ?? raw.settings.createdAt,
      sharedConsumable: item.sharedConsumable ?? false,
      measureUnit:
        item.measureUnit ?? (item.unit === "can" || item.unit === "bottle" ? "ml" : item.unit),
      packSize: item.packSize ?? 1,
      lastCostPrice: item.lastCostPrice ?? 0,
      sectionId: item.sectionId,
    })),
    purchases: (raw.purchases ?? []).map((purchase) => ({
      ...purchase,
      lines: purchase.lines ?? [],
    })),
    insuranceJobs: (raw.insuranceJobs ?? []).map((claim) => ({
      ...claim,
      chequeStatus:
        claim.chequeStatus ?? (claim.chequeNo ? ("In_Safe" as const) : undefined),
    })),
    vehicleBills: (raw.vehicleBills ?? []).map((bill) => ({
      ...bill,
      status: bill.status ?? "Unpaid",
    })),
    advancePayments: (raw.advancePayments ?? []).map((advance) => ({
      ...advance,
      chequeStatus:
        advance.chequeStatus ?? (advance.method === "Cheque" ? ("In_Safe" as const) : undefined),
    })),
    supplierCreditNotes: raw.supplierCreditNotes ?? [],
    appointments: raw.appointments ?? [],
    estimates,
    insuranceCompanies: (raw.insuranceCompanies ?? []).map((company) => ({
      ...company,
      tinNumber: company.tinNumber ?? "",
      active: company.active !== false,
    })),
    attendance: raw.attendance ?? [],
    staffLoans: raw.staffLoans ?? [],
    payslips: raw.payslips ?? [],
    wagePayouts: raw.wagePayouts ?? [],
    serviceRecords: raw.serviceRecords ?? [],
    bankAccounts: raw.bankAccounts ?? [],
    bankTransactions: raw.bankTransactions ?? [],
    pettyCash: raw.pettyCash ?? [],
    customerCheques: raw.customerCheques ?? [],
    supplierCheques: raw.supplierCheques ?? [],
    creditPayments: raw.creditPayments ?? [],
    supplierReturns: raw.supplierReturns ?? [],
    stockMovements: raw.stockMovements ?? [],
    workshopLoans: raw.workshopLoans ?? [],
    workshopLoanPayments: raw.workshopLoanPayments ?? [],
    sections: raw.sections ?? [],
    openContainers: (raw.openContainers ?? []).map((container) => ({
      ...container,
      issues: container.issues ?? [],
    })),
  } as AppState;
}

function loadPersisted(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || !parsed.settings) return null;
    if (typeof parsed.version === "number" && parsed.version > CURRENT_VERSION) return null;
    return normaliseState(parsed);
  } catch {
    return null;
  }
}

function notify(
  state: AppState,
  departments: NotificationDepartment[],
  title: string,
  message: string,
  priority: AppNotification["priority"],
  link?: string,
  meta?: { vehicleNo?: string; eventType?: AppNotification["eventType"] },
): AppNotification[] {
  return [
    {
      id: uid("ntf"),
      departments,
      title,
      message,
      priority,
      createdAt: new Date().toISOString(),
      read: false,
      link,
      vehicleNo: meta?.vehicleNo,
      eventType: meta?.eventType,
    },
    ...state.notifications,
  ].slice(0, 120);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => loadPersisted() ?? normaliseState({
    version: 4,
    settings: {
      companyName: "",
      address: "",
      phone: "",
      email: "",
      brandColor: "#0f766e",
      accentColor: "#f59e0b",
      googleReviewUrl: "",
      currency: "LKR",
      qrSlug: "",
      ownerPassword: "",
      configured: false,
      demoMode: false,
      createdAt: new Date().toISOString(),
      workingDays: [1, 2, 3, 4, 5, 6],
      epfEmployeeRate: 8,
      epfEmployerRate: 12,
      etfRate: 3,
      trialStartedAt: new Date().toISOString(),
      defaultVatRate: 18,
      footerInquiryLine: "Any inquiry, please call our workshop hotline.",
      footerComplaintLine:
        "Any suggestion or complaint regarding your vehicle or job, please contact management.",
      printerMode: "Both",
      thermalPaperWidth: "80mm",
      standardPaperSize: "A4",
    },
    users: [],
    workers: [],
    checkIns: [],
    jobCards: [],
    tasks: [],
    parts: [],
    inventory: [],
    suppliers: [],
    purchases: [],
    supplierCreditNotes: [],
    customerCredits: [],
    expenses: [],
    ledger: [],
    marketing: [],
    notifications: [],
    appointments: [],
    estimates: [],
    advancePayments: [],
    insuranceCompanies: [],
    insuranceJobs: [],
    vehicleBills: [],
    attendance: [],
    staffLoans: [],
    payslips: [],
    wagePayouts: [],
    serviceRecords: [],
    bankAccounts: [],
    bankTransactions: [],
    pettyCash: [],
    customerCheques: [],
    supplierCheques: [],
    creditPayments: [],
    supplierReturns: [],
    stockMovements: [],
    workshopLoans: [],
    workshopLoanPayments: [],
    sections: [],
    openContainers: [],
    currentUserId: null,
  } as AppState));

  const cloud = useCloudSync(state, setState);

  const lastSerialised = useRef<string>("");
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    try {
      const serialised = JSON.stringify(state);
      if (serialised === lastSerialised.current) return;
      lastSerialised.current = serialised;
      localStorage.setItem(STORAGE_KEY, serialised);
    } catch (error) {
      console.warn("Unable to persist workshop data", error);
    }
  }, [state]);

  // Keep tabs of the same browser in sync (staff screen + public check-in),
  // and avoid echoing the same snapshot back and forth.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      if (event.newValue === lastSerialised.current) return;
      try {
        const parsed = JSON.parse(event.newValue) as AppState;
        if (!parsed || !parsed.settings) return;
        if (typeof parsed.version === "number" && parsed.version > CURRENT_VERSION) return;
        lastSerialised.current = event.newValue;
        setState(normaliseState(parsed));
      } catch {
        // Ignore malformed snapshots from another tab.
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--brand", state.settings.brandColor || "#0f766e");
    document.documentElement.style.setProperty("--accent", state.settings.accentColor || "#f59e0b");
  }, [state.settings.brandColor, state.settings.accentColor]);

  const currentUser = useMemo(
    () => state.users.find((u) => u.id === state.currentUserId) ?? null,
    [state.users, state.currentUserId],
  );

  const login = useCallback(
    (userId: string, pin: string): ActionResult => {
      if (cloud.status !== "disabled") {
        return {
          ok: false,
          message: "This installation uses the workshop cloud account. Sign in with your email.",
        };
      }
      const user = state.users.find((u) => u.id === userId && u.active);
      if (!user) return { ok: false, message: "Account not found or inactive." };
      if (user.pin !== pin) return { ok: false, message: "Incorrect PIN. Please try again." };
      setState((prev) => ({ ...prev, currentUserId: user.id }));
      return { ok: true };
    },
    [cloud.status, state.users],
  );

  const logout = useCallback(() => {
    if (cloud.status !== "disabled") {
      void cloud.signOut();
      return;
    }
    setState((prev) => ({ ...prev, currentUserId: null }));
  }, [cloud]);

  const loadDemo = useCallback(() => {
    const demo = createDemoState();
    setState({ ...demo, currentUserId: null });
  }, []);

  const createWorkshop = useCallback((input: SetupInput) => {
    const owner: WorkshopUser = {
      id: "usr_owner",
      name: input.ownerName,
      username: "owner",
      pin: input.ownerPin,
      isOwner: true,
      departments: [],
      phone: input.phone,
      email: input.email,
      baseSalary: 0,
      commissionRate: 0,
      active: true,
      createdAt: new Date().toISOString(),
    };
    const settings: WorkshopSettings = {
      companyName: input.companyName,
      address: input.address,
      phone: input.phone,
      email: input.email,
      logo: input.logo,
      brandColor: input.brandColor,
      accentColor: input.accentColor,
      googleReviewUrl: input.googleReviewUrl,
      currency: "LKR",
      qrSlug: input.companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      ownerPassword: input.ownerPassword,
      configured: true,
      demoMode: false,
      createdAt: new Date().toISOString(),
      workingDays: [1, 2, 3, 4, 5, 6],
      epfEmployeeRate: 8,
      epfEmployerRate: 12,
      etfRate: 3,
      trialStartedAt: new Date().toISOString(),
      licenseHolder: input.companyName,
      tinNumber: input.tinNumber?.trim() ?? "",
      vatRegNumber: input.vatRegNumber?.trim() ?? "",
      defaultVatRate: input.defaultVatRate ?? 18,
      placeOfSupply: input.placeOfSupply?.trim() || input.address,
      footerInquiryLine: "Any inquiry, please call our workshop hotline.",
      footerComplaintLine:
        "Any suggestion or complaint regarding your vehicle or job, please contact management.",
      printerMode: input.printerMode ?? "Both",
      thermalPaperWidth: input.thermalPaperWidth ?? "80mm",
      standardPaperSize: input.standardPaperSize ?? "A4",
      bookingToken: `BOOK-${getInstallationId()}`,
      whatsappMode: input.whatsappGatewayUrl?.trim() ? "WAHA" : "Disabled",
      whatsappGatewayUrl: input.whatsappGatewayUrl?.trim() || undefined,
      whatsappSession: input.whatsappSession?.trim() || "default",
      whatsappApiKey: input.whatsappApiKey?.trim() || undefined,
      whatsappCompanyNumber: input.whatsappCompanyNumber?.trim() || input.phone,
      whatsappConnected: false,
      whatsappAutoSend: true,
      whatsappOwnerNotify: true,
      featureFlags: {
        ...defaultFeatureFlags(),
        ...(input.featureFlags ?? {}),
      },
      storesTopology: input.storesTopology ?? "Central",
      installationId: getInstallationId(),
      licenseStatus: "Trial",
    };
    const base = createEmptyState(settings, owner);
    const sections: WorkshopSection[] = (input.sections ?? [])
      .filter((section) => section.name.trim())
      .map((section, index) => ({
        id: uid("sec"),
        name: section.name.trim(),
        code:
          section.code?.trim().toUpperCase() ||
          section.name
            .split(/\s+/)
            .map((word) => word[0])
            .join("")
            .slice(0, 4)
            .toUpperCase(),
        description: section.description?.trim() || undefined,
        color: ["#0f766e", "#2563eb", "#f59e0b", "#db2777", "#7c3aed"][index % 5],
        supervisorIds: [],
        storekeeperIds: [],
        workerIds: [],
        active: true,
        createdAt: new Date().toISOString(),
      }));
    const bankAccount: BankAccount | undefined = input.bankAccount
      ? {
          id: uid("bank"),
          name: input.bankAccount.name,
          bankName: input.bankAccount.bankName,
          branch: input.bankAccount.branch,
          accountNumber: input.bankAccount.accountNumber,
          type: input.bankAccount.type,
          openingBalance: input.bankAccount.openingBalance,
          active: true,
          createdAt: new Date().toISOString(),
        }
      : undefined;
    const staff = (input.staff ?? []).map((person) => ({
      id: uid("usr"),
      name: person.name,
      username: person.username.toLowerCase(),
      pin: person.pin,
      isOwner: false,
      departments: person.departments,
      phone: person.phone,
      baseSalary: 0,
      commissionRate: 0,
      active: true,
      createdAt: new Date().toISOString(),
    }));
    setState({
      ...base,
      users: [owner, ...staff],
      bankAccounts: bankAccount ? [bankAccount] : base.bankAccounts,
      bankTransactions: base.bankTransactions,
      sections,
      inventory: [],
      openContainers: [],
    });
  }, []);

  const updateSettings = useCallback((patch: Partial<WorkshopSettings>) => {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
  }, []);

  const backupToDrive = useCallback(async (manual = false): Promise<ActionResult> => {
    const current = stateRef.current;
    if (!manual && !current.settings.driveBackupEnabled) {
      return { ok: false, message: "Daily Google Drive backup is disabled." };
    }
    const result = await uploadBackupToDrive(current);
    const now = new Date().toISOString();
    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        lastDriveBackupAt: result.ok ? now : prev.settings.lastDriveBackupAt,
        lastDriveBackupStatus: result.ok
          ? `OK · ${result.filename ?? "backup uploaded"}`
          : `Failed · ${result.message}`,
        lastDriveBackupFile: result.ok
          ? result.filename
          : prev.settings.lastDriveBackupFile,
      },
    }));
    return {
      ok: result.ok,
      message: result.message,
      reference: result.filename,
    };
  }, []);

  const driveBackupAttemptedRef = useRef<string | null>(null);
  useEffect(() => {
    const settings = state.settings;
    if (!settings.driveBackupEnabled || !settings.driveBackupUrl?.trim()) return;
    const today = localDateKey();
    if (
      settings.lastDriveBackupAt &&
      localDateKey(new Date(settings.lastDriveBackupAt)) === today
    ) {
      return;
    }
    const hour = Math.max(0, Math.min(23, settings.driveBackupHour ?? 2));
    if (new Date().getHours() < hour) return;
    if (driveBackupAttemptedRef.current === today) return;
    driveBackupAttemptedRef.current = today;
    void backupToDrive(false);
  }, [state.settings, backupToDrive]);

  const addSection = useCallback((section: Omit<WorkshopSection, "id" | "createdAt">) => {
    const id = uid("sec");
    setState((prev) => ({
      ...prev,
      sections: [
        ...prev.sections,
        {
          ...section,
          id,
          createdAt: new Date().toISOString(),
        },
      ],
    }));
    return id;
  }, []);

  const updateSection = useCallback((section: WorkshopSection) => {
    setState((prev) => ({
      ...prev,
      sections: prev.sections.map((entry) => (entry.id === section.id ? section : entry)),
    }));
  }, []);

  const removeSection = useCallback(
    (sectionId: string): ActionResult => {
      const section = state.sections.find((entry) => entry.id === sectionId);
      if (!section) return { ok: false, message: "Section not found." };
      const inUse =
        state.jobCards.some((job) => job.sectionIds?.includes(sectionId)) ||
        state.tasks.some((task) => task.sectionId === sectionId) ||
        state.parts.some((part) => part.sectionId === sectionId) ||
        state.inventory.some((item) => item.sectionId === sectionId);
      if (inUse) {
        return {
          ok: false,
          message:
            "This section is still tagged on jobs, tasks, parts or stock. Reassign those records before deleting it.",
        };
      }
      setState((prev) => ({
        ...prev,
        sections: prev.sections.filter((entry) => entry.id !== sectionId),
        workers: prev.workers.map((worker) => ({
          ...worker,
          sectionIds: (worker.sectionIds ?? []).filter((id) => id !== sectionId),
        })),
        users: prev.users.map((user) => ({
          ...user,
          sectionIds: (user.sectionIds ?? []).filter((id) => id !== sectionId),
        })),
      }));
      return { ok: true };
    },
    [state.sections, state.jobCards, state.tasks, state.parts, state.inventory],
  );

  const assignUserSections = useCallback((userId: string, sectionIds: string[]) => {
    setState((prev) => {
      const target = prev.users.find((user) => user.id === userId);
      const sectionSet = new Set(sectionIds);
      const supervises = Boolean(target?.departments.includes("Supervisor"));
      const keepsStores = Boolean(target?.departments.includes("Stores"));
      return {
        ...prev,
        users: prev.users.map((user) =>
          user.id === userId ? { ...user, sectionIds } : user,
        ),
        workers: prev.workers.map((worker) =>
          target?.workerId && worker.id === target.workerId
            ? { ...worker, sectionIds }
            : worker,
        ),
        sections: prev.sections.map((section) => ({
          ...section,
          supervisorIds:
            target && supervises && sectionSet.has(section.id)
              ? Array.from(new Set([...section.supervisorIds, userId]))
              : section.supervisorIds.filter((entry) => entry !== userId),
          storekeeperIds:
            target && keepsStores && sectionSet.has(section.id)
              ? Array.from(new Set([...section.storekeeperIds, userId]))
              : section.storekeeperIds.filter((entry) => entry !== userId),
          workerIds: target?.workerId
            ? sectionSet.has(section.id)
              ? Array.from(new Set([...section.workerIds, target.workerId]))
              : section.workerIds.filter((entry) => entry !== target.workerId)
            : section.workerIds,
        })),
      };
    });
  }, []);

  const updateFeatureFlag = useCallback((key: FeatureFlagKey, enabled: boolean) => {
    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        featureFlags: {
          ...defaultFeatureFlags(),
          ...(prev.settings.featureFlags ?? {}),
          [key]: enabled,
        },
      },
    }));
  }, []);

  const updateFeatureFlags = useCallback((flags: FeatureFlags) => {
    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        featureFlags: { ...defaultFeatureFlags(), ...flags },
      },
    }));
  }, []);

  const setStoresTopology = useCallback((topology: StoresTopology) => {
    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, storesTopology: topology },
    }));
  }, []);

  const openConsumableContainer = useCallback(
    (input: {
      itemId: string;
      sectionId?: string;
      label?: string;
      qty?: number;
      costPerUnit?: number;
      sellingPricePerUnit?: number;
    }): ActionResult => {
      const item = state.inventory.find((entry) => entry.id === input.itemId);
      if (!item) return { ok: false, message: "Inventory item not found." };
      if (item.type !== "Consumable") {
        return { ok: false, message: "Only consumable items can be opened on the shop floor." };
      }
      const capacity = Math.max(0.001, input.qty ?? item.packSize ?? 1);
      if (capacity > item.stock) {
        return {
          ok: false,
          message: `Only ${formatQty(item.stock, item.measureUnit || item.unit)} is in stock.`,
        };
      }
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const unit = item.measureUnit || item.unit;
      const costPerUnit =
        input.costPerUnit ??
        (item.packSize && item.lastCostPrice
          ? item.lastCostPrice / item.packSize
          : item.lastCostPrice ?? 0);
      const sellingPerUnit =
        input.sellingPricePerUnit ??
        (item.packSize && item.lastSellingPrice
          ? item.lastSellingPrice / item.packSize
          : item.lastSellingPrice ?? 0);
      const container: OpenContainer = {
        id: uid("can"),
        itemId: item.id,
        itemName: item.name,
        sectionId: input.sectionId,
        label: input.label?.trim() || `${item.name} · open container`,
        capacity,
        remainingQty: capacity,
        unit,
        costPerUnit,
        sellingPricePerUnit: sellingPerUnit,
        status: "Open",
        openedAt: new Date().toISOString(),
        openedBy: user?.name,
        issues: [],
      };
      setState((prev) => ({
        ...prev,
        openContainers: [container, ...prev.openContainers],
        stockMovements: [
          ...prev.stockMovements,
          {
            id: uid("mov"),
            itemId: item.id,
            itemName: item.name,
            date: new Date().toISOString(),
            type: "Container_Open",
            qty: 0,
            reference: container.id,
            note: `Opened ${formatQty(capacity, unit)} on the shop floor. Warehouse stock unchanged until issued.`,
            createdBy: user?.name,
          },
        ],
      }));
      return { ok: true, reference: container.id };
    },
    [state.inventory, state.users, state.currentUserId],
  );

  const issueConsumable = useCallback(
    (input: {
      jobCardId: string;
      containerId: string;
      qty: number;
      includedInLabor: boolean;
      sectionId?: string;
    }): ActionResult => {
      const container = state.openContainers.find((entry) => entry.id === input.containerId);
      if (!container || container.status !== "Open") {
        return { ok: false, message: "That shop-floor container is not open." };
      }
      const item = state.inventory.find((entry) => entry.id === container.itemId);
      if (!item) return { ok: false, message: "Inventory item not found." };
      const job = state.jobCards.find((entry) => entry.id === input.jobCardId);
      if (!job) return { ok: false, message: "Choose a valid job card." };
      const qty = Number(input.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        return { ok: false, message: "Enter a quantity greater than zero." };
      }
      if (qty > container.remainingQty + 1e-6) {
        return {
          ok: false,
          message: `Only ${formatQty(container.remainingQty, container.unit)} remains in this container.`,
        };
      }
      if (qty > item.stock + 1e-6) {
        return {
          ok: false,
          message: `Warehouse stock only has ${formatQty(item.stock, container.unit)}.`,
        };
      }
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const now = new Date().toISOString();
      const sectionId = input.sectionId || container.sectionId || job.sectionIds?.[0];
      const marginPercent =
        container.costPerUnit > 0
          ? ((container.sellingPricePerUnit - container.costPerUnit) / container.costPerUnit) * 100
          : 0;
      const partId = uid("jp");
      const part: JobPart = {
        id: partId,
        jobCardId: job.id,
        itemId: item.id,
        itemName: `${container.itemName} · shop-floor issue`,
        qtyRequested: qty,
        qtyIssued: qty,
        costPrice: container.costPerUnit,
        marginPercent,
        sellingPrice: container.sellingPricePerUnit,
        status: "Issued",
        sectionId,
        includedInLabor: input.includedInLabor,
        measuredQty: true,
        supplierId: item.supplierId,
        supplierInvoiceNo: "SHOP-FLOOR",
        warrantyStatus: "None",
        salvageStatus: "Not Required",
        createdAt: now,
        updatedAt: now,
      };
      const issue = {
        id: uid("canissue"),
        jobCardId: job.id,
        partId,
        qty,
        issuedAt: now,
        issuedBy: user?.name,
      };
      setState((prev) => ({
        ...prev,
        parts: [part, ...prev.parts],
        inventory: prev.inventory.map((entry) =>
          entry.id === item.id ? { ...entry, stock: Math.max(0, entry.stock - qty) } : entry,
        ),
        openContainers: prev.openContainers.map((entry) =>
          entry.id === container.id
            ? {
                ...entry,
                remainingQty: Math.max(0, entry.remainingQty - qty),
                issues: [issue, ...entry.issues],
              }
            : entry,
        ),
        stockMovements: [
          ...prev.stockMovements,
          {
            id: uid("mov"),
            itemId: item.id,
            itemName: item.name,
            date: now,
            type: "Job_Issue",
            qty: -qty,
            reference: job.id,
            note: `${formatQty(qty, container.unit)} issued from ${container.label}${input.includedInLabor ? " · included in labour" : ""}`,
            createdBy: user?.name,
          },
        ],
      }));
      return { ok: true, reference: partId };
    },
    [state.openContainers, state.inventory, state.jobCards, state.users, state.currentUserId],
  );

  const markContainerEmpty = useCallback(
    (containerId: string): ActionResult => {
      const container = state.openContainers.find((entry) => entry.id === containerId);
      if (!container) return { ok: false, message: "Container not found." };
      if (container.status !== "Open") return { ok: false, message: "This container is already closed." };
      const item = state.inventory.find((entry) => entry.id === container.itemId);
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const now = new Date().toISOString();
      const writeOff = Math.min(container.remainingQty, item?.stock ?? container.remainingQty);
      setState((prev) => ({
        ...prev,
        inventory: prev.inventory.map((entry) =>
          entry.id === container.itemId
            ? { ...entry, stock: Math.max(0, entry.stock - writeOff) }
            : entry,
        ),
        openContainers: prev.openContainers.map((entry) =>
          entry.id === container.id
            ? {
                ...entry,
                status: "Empty" as const,
                remainingQty: 0,
                closedAt: now,
                closedBy: user?.name,
              }
            : entry,
        ),
        stockMovements: [
          ...prev.stockMovements,
          {
            id: uid("mov"),
            itemId: container.itemId,
            itemName: container.itemName,
            date: now,
            type: "Container_Empty",
            qty: -writeOff,
            reference: container.id,
            note: `Marked empty · ${formatQty(writeOff, container.unit)} written off as shop-floor wastage/residue.`,
            createdBy: user?.name,
          },
        ],
      }));
      return { ok: true };
    },
    [state.openContainers, state.inventory, state.users, state.currentUserId],
  );

  const togglePartIncludedInLabor = useCallback((partId: string, included: boolean) => {
    setState((prev) => ({
      ...prev,
      parts: prev.parts.map((part) =>
        part.id === partId
          ? { ...part, includedInLabor: included, updatedAt: new Date().toISOString() }
          : part,
      ),
    }));
  }, []);

  const updateJobSections = useCallback((jobId: string, sectionIds: string[]) => {
    setState((prev) => ({
      ...prev,
      jobCards: prev.jobCards.map((job) =>
        job.id === jobId ? { ...job, sectionIds: Array.from(new Set(sectionIds)) } : job,
      ),
    }));
  }, []);

  const addUser = useCallback((user: Omit<WorkshopUser, "id" | "createdAt">) => {
    const id = uid("usr");
    setState((prev) => {
      const sectionIds = new Set(user.sectionIds ?? []);
      const supervises = user.departments.includes("Supervisor");
      const keepsStores = user.departments.includes("Stores");
      return {
        ...prev,
        users: [
          ...prev.users,
          { ...user, id, createdAt: new Date().toISOString() },
        ],
        workers: prev.workers.map((worker) =>
          user.workerId && worker.id === user.workerId
            ? { ...worker, sectionIds: Array.from(sectionIds) }
            : worker,
        ),
        sections: prev.sections.map((section) => ({
          ...section,
          supervisorIds:
            supervises && sectionIds.has(section.id)
              ? Array.from(new Set([...section.supervisorIds, id]))
              : section.supervisorIds.filter((entry) => entry !== id),
          storekeeperIds:
            keepsStores && sectionIds.has(section.id)
              ? Array.from(new Set([...section.storekeeperIds, id]))
              : section.storekeeperIds.filter((entry) => entry !== id),
        })),
      };
    });
    return id;
  }, []);

  const updateUser = useCallback((user: WorkshopUser) => {
    setState((prev) => {
      const sectionIds = new Set(user.sectionIds ?? []);
      const supervises = user.departments.includes("Supervisor");
      const keepsStores = user.departments.includes("Stores");
      return {
        ...prev,
        users: prev.users.map((u) => (u.id === user.id ? user : u)),
        sections: prev.sections.map((section) => ({
          ...section,
          supervisorIds:
            supervises && sectionIds.has(section.id)
              ? Array.from(new Set([...section.supervisorIds, user.id]))
              : section.supervisorIds.filter((entry) => entry !== user.id),
          storekeeperIds:
            keepsStores && sectionIds.has(section.id)
              ? Array.from(new Set([...section.storekeeperIds, user.id]))
              : section.storekeeperIds.filter((entry) => entry !== user.id),
        })),
      };
    });
  }, []);

  const removeUser = useCallback(
    (userId: string): ActionResult => {
      const user = state.users.find((u) => u.id === userId);
      if (!user) return { ok: false, message: "User not found." };
      if (user.isOwner) return { ok: false, message: "The owner account cannot be removed." };
      setState((prev) => ({
        ...prev,
        users: prev.users.filter((u) => u.id !== userId),
        currentUserId: prev.currentUserId === userId ? null : prev.currentUserId,
      }));
      return { ok: true };
    },
    [state.users],
  );

  const addWorker = useCallback((worker: Omit<WorkerProfile, "id">) => {
    const id = uid("wrk");
    setState((prev) => {
      const sectionIds = new Set(worker.sectionIds ?? []);
      return {
        ...prev,
        workers: [...prev.workers, { ...worker, id }],
        sections: prev.sections.map((section) =>
          sectionIds.has(section.id)
            ? {
                ...section,
                workerIds: Array.from(new Set([...section.workerIds, id])),
              }
            : section.workerIds.includes(id)
              ? { ...section, workerIds: section.workerIds.filter((entry) => entry !== id) }
              : section,
        ),
      };
    });
    return id;
  }, []);

  const updateWorker = useCallback((worker: WorkerProfile) => {
    setState((prev) => {
      const sectionIds = new Set(worker.sectionIds ?? []);
      return {
        ...prev,
        workers: prev.workers.map((w) => (w.id === worker.id ? worker : w)),
        users: prev.users.map((user) =>
          user.workerId === worker.id
            ? { ...user, sectionIds: Array.from(sectionIds) }
            : user,
        ),
        sections: prev.sections.map((section) =>
          sectionIds.has(section.id)
            ? {
                ...section,
                workerIds: Array.from(new Set([...section.workerIds, worker.id])),
              }
            : section.workerIds.includes(worker.id)
              ? { ...section, workerIds: section.workerIds.filter((entry) => entry !== worker.id) }
              : section,
        ),
      };
    });
  }, []);

  const lookupVehicle = useCallback(
    (vehicleNo: string) => {
      const needle = vehicleNo.trim().toLowerCase().replace(/\s+/g, " ");
      if (!needle) return null;
      const job = [...state.jobCards]
        .filter((j) => j.vehicleNo.trim().toLowerCase().replace(/\s+/g, " ") === needle)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (job) {
        return {
          make: job.make,
          model: job.model,
          customerName: job.customerName,
          phone: job.phone,
          mileage: job.mileage,
          address: job.customerAddress,
          email: undefined,
        };
      }
      const checkIn = [...state.checkIns]
        .filter((c) => c.vehicleNo.trim().toLowerCase().replace(/\s+/g, " ") === needle)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (checkIn) {
        return {
          make: checkIn.make,
          model: checkIn.model,
          customerName: checkIn.customerName,
          phone: checkIn.phone,
          mileage: checkIn.mileage,
          email: checkIn.email,
          address: checkIn.address,
        };
      }
      return null;
    },
    [state.jobCards, state.checkIns],
  );

  const submitCheckIn = useCallback(
    (input: NewCheckInInput): ActionResult => {
      const reference = `CI-${2044 + state.checkIns.length}`;
      const checkIn = {
        id: reference,
        createdAt: new Date().toISOString(),
        vehicleNo: input.vehicleNo.trim().toUpperCase(),
        make: input.make,
        model: input.model,
        customerName: input.customerName.trim(),
        phone: `+${normalizePhone(input.phone)}`,
        mileage: input.mileage,
        email: input.email?.trim(),
        address: input.address?.trim(),
        driverName: input.driverName?.trim() || undefined,
        driverPhone: input.driverPhone?.trim() || undefined,
        driverBasis: input.driverBasis,
        driverType: input.driverType,
        driverValue: input.driverValue,
        status: "Awaiting Approval" as const,
      };
      setState((prev) => ({
        ...prev,
        checkIns: [checkIn, ...prev.checkIns],
        notifications: notify(
          prev,
          ["PRO"],
          "New vehicle at the gate",
          `${checkIn.vehicleNo} (${checkIn.make} ${checkIn.model}) is waiting for inspection.`,
          "high",
          "/gate",
          { vehicleNo: checkIn.vehicleNo, eventType: "job" },
        ),
      }));
      return { ok: true, reference };
    },
    [state.checkIns.length],
  );

  const rejectCheckIn = useCallback((checkInId: string) => {
    setState((prev) => ({
      ...prev,
      checkIns: prev.checkIns.map((c) =>
        c.id === checkInId ? { ...c, status: "Rejected" as const } : c,
      ),
    }));
  }, []);

  const acceptCheckIn = useCallback(
    (
      checkInId: string,
      data: {
        repairType: string;
        safetyNotes: string;
        photos: DamagePhoto[];
        intakeType: JobIntakeType;
        driver?: DriverCommission;
        sectionIds?: string[];
      },
    ): ActionResult => {
      const checkIn = state.checkIns.find((c) => c.id === checkInId);
      if (!checkIn) return { ok: false, message: "Check-in not found." };
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const now = new Date().toISOString();
      const nextNum =
        state.jobCards.reduce((max, job) => Math.max(max, job.numericId), 1000) + 1;
      const jobId = `JC-${nextNum}`;
      const job: JobCard = {
        id: jobId,
        numericId: nextNum,
        checkInId: checkIn.id,
        createdAt: checkIn.createdAt,
        acceptedAt: now,
        vehicleNo: checkIn.vehicleNo,
        make: checkIn.make,
        model: checkIn.model,
        customerName: checkIn.customerName,
        phone: checkIn.phone,
        customerAddress: checkIn.address,
        mileage: checkIn.mileage,
        repairType: data.repairType,
        intakeType: data.intakeType,
        sectionIds: data.sectionIds ?? [],
        safetyNotes: data.safetyNotes,
        photos: data.photos,
        driveFolderId: `gdrive://Workshop_Job_Cards/Job_Card_${nextNum}`,
        status: "In Progress",
        discount: 0,
        discountType: "Fixed",
        driver: data.driver
          ? {
              ...data.driver,
              addedBy: user?.name,
              addedAt: now,
            }
          : undefined,
      };
      setState((prev) => ({
        ...prev,
        checkIns: prev.checkIns.map((c) =>
          c.id === checkInId ? { ...c, status: "Accepted" as const } : c,
        ),
        jobCards: [job, ...prev.jobCards],
        notifications: notify(
          prev,
          ["Supervisor"],
          data.intakeType === "Estimate"
            ? "Estimate job accepted — prepare a quotation"
            : "Vehicle accepted into the workshop",
          data.intakeType === "Estimate"
            ? `${jobId} · ${job.vehicleNo} · ${job.make} ${job.model} needs an estimate before repair work starts.`
            : `${jobId} · ${job.vehicleNo} · ${job.make} ${job.model} is ready on the floor.`,
          "high",
          `/jobs/${jobId}`,
          { vehicleNo: job.vehicleNo, eventType: "job" },
        ),
      }));
      queueWhatsApp(job.phone, acceptanceMessage(job, state.settings), state.settings);
      const ownerUser = state.users.find((entry) => entry.isOwner && entry.active);
      if (ownerUser?.phone && state.settings.whatsappOwnerNotify !== false) {
        queueWhatsApp(ownerUser.phone, ownerIntakeMessage(job, state.settings), state.settings);
      }
      return { ok: true, jobId };
    },
    [state.checkIns, state.jobCards, state.users, state.currentUserId, state.settings],
  );

  const addTask = useCallback(
    (
      jobId: string,
      name: string,
      laborCost: number,
      workerId: string,
      catalogueItemId?: string,
      sectionId?: string,
      options?: { isCustomerExtra?: boolean },
    ): ActionResult => {
      const today = localDateKey();
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const attendance = state.attendance.find(
        (record) => record.workerId === workerId && record.date === today,
      );
      if (!attendance || attendance.status !== "Present") {
        return {
          ok: false,
          message:
            "Mark this worker present in morning attendance before assigning a labour task.",
        };
      }
      setState((prev) => ({
        ...prev,
        tasks: [
          ...prev.tasks,
          {
            id: uid("tsk"),
            jobCardId: jobId,
            name,
            laborCost,
            workerId,
            sectionId,
            catalogueItemId,
            createdAt: new Date().toISOString(),
            addedBy: user?.name,
            addedAt: new Date().toISOString(),
            isCustomerExtra: options?.isCustomerExtra || undefined,
          },
        ],
      }));
      return { ok: true };
    },
    [state.attendance, state.users, state.currentUserId],
  );

  const removeTask = useCallback((taskId: string) => {
    setState((prev) => ({ ...prev, tasks: prev.tasks.filter((t) => t.id !== taskId) }));
  }, []);

  const updateTask = useCallback(
    (
      taskId: string,
      data: {
        name: string;
        laborCost: number;
        workerId: string;
        sectionId?: string;
        isCustomerExtra?: boolean;
      },
    ): ActionResult => {
      const task = state.tasks.find((entry) => entry.id === taskId);
      if (!task) return { ok: false, message: "Labour task not found." };
      const name = data.name.trim();
      if (!name) return { ok: false, message: "Enter the labour task name." };
      if (!Number.isFinite(data.laborCost) || data.laborCost <= 0) {
        return { ok: false, message: "Enter the labour charge." };
      }
      if (!data.workerId) {
        return { ok: false, message: "Choose the technician who performed the task." };
      }
      setState((prev) => ({
        ...prev,
        tasks: prev.tasks.map((entry) =>
          entry.id === taskId
            ? {
                ...entry,
                name,
                laborCost: data.laborCost,
                workerId: data.workerId,
                sectionId: data.sectionId,
                isCustomerExtra: data.isCustomerExtra || undefined,
              }
            : entry,
        ),
      }));
      return { ok: true };
    },
    [state.tasks],
  );

  const removePart = useCallback(
    (partId: string): ActionResult => {
      const part = state.parts.find((entry) => entry.id === partId);
      if (!part) return { ok: false, message: "Part line not found." };
      if (part.status !== "Requested" && part.status !== "Backordered") {
        return {
          ok: false,
          message:
            "Issued parts must go through exchange or return so stock and supplier records stay correct.",
        };
      }
      setState((prev) => ({
        ...prev,
        parts: prev.parts.filter((entry) => entry.id !== partId),
      }));
      return { ok: true };
    },
    [state.parts],
  );

  const requestPart = useCallback(
    (
      jobId: string,
      itemId: string,
      qty: number,
      sectionId?: string,
      options?: { isCustomerExtra?: boolean },
    ): ActionResult => {
      const item = state.inventory.find((i) => i.id === itemId);
      if (!item) return { ok: false, message: "Item not found." };
      const job = state.jobCards.find((j) => j.id === jobId);
      if (!job) return { ok: false, message: "Job card not found." };
      const requestedQty = Math.max(0.001, Number(qty) || 1);
      const unit = item.measureUnit || item.unit;
      const record: JobPart = {
        id: uid("jp"),
        jobCardId: jobId,
        itemId,
        itemName: `${item.name}${item.make ? ` — ${item.make} ${item.model}` : ""}`,
        qtyRequested: requestedQty,
        qtyIssued: 0,
        costPrice: 0,
        marginPercent: 20,
        sellingPrice: 0,
        status: "Requested",
        sectionId: sectionId || job.sectionIds?.[0] || item.sectionId,
        includedInLabor: false,
        measuredQty: item.type === "Consumable" || requestedQty % 1 !== 0,
        supplierId: item.supplierId,
        partSource: "Workshop_Store",
        isCustomerExtra: options?.isCustomerExtra || undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setState((prev) => ({
        ...prev,
        parts: [...prev.parts, record],
        notifications: notify(
          prev,
          ["Stores"],
          "New parts request",
          `${jobId} · ${job.vehicleNo} needs ${formatQty(requestedQty, unit)} of ${item.name}.`,
          "high",
          "/stores",
          { vehicleNo: job.vehicleNo, eventType: "inventory" },
        ),
      }));
      return { ok: true, reference: record.id };
    },
    [state.inventory, state.jobCards],
  );

  const addCustomerBroughtPart = useCallback(
    (
      jobId: string,
      data: { name: string; qty: number; unitPrice: number; sectionId?: string },
    ): ActionResult => {
      const job = state.jobCards.find((entry) => entry.id === jobId);
      if (!job) return { ok: false, message: "Job card not found." };
      if (!job.insuranceClaimId) {
        return {
          ok: false,
          message: "Customer-brought parts are only available on insurance jobs.",
        };
      }
      const name = data.name.trim();
      if (!name) return { ok: false, message: "Enter the part description." };
      const qty = Number(data.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        return { ok: false, message: "Enter a valid quantity." };
      }
      const unitPrice = Math.max(0, Number(data.unitPrice) || 0);
      const now = new Date().toISOString();
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const record: JobPart = {
        id: uid("jp"),
        jobCardId: jobId,
        itemId: `customer_${uid("part")}`,
        itemName: name,
        qtyRequested: qty,
        qtyIssued: qty,
        costPrice: 0,
        marginPercent: 0,
        sellingPrice: unitPrice,
        quotedSellingPrice: unitPrice,
        insuranceApprovedPrice: unitPrice,
        status: "Issued",
        sectionId: data.sectionId || job.sectionIds?.[0],
        includedInLabor: false,
        partSource: "Customer_Brought",
        createdAt: now,
        updatedAt: now,
        warrantyStatus: "None",
        salvageStatus: "Not Required",
      };
      setState((prev) => ({
        ...prev,
        parts: [...prev.parts, record],
        notifications: notify(
          prev,
          ["Supervisor", "Stores", "Cashier"],
          "Customer-brought part added",
          `${jobId} · ${job.vehicleNo} · ${name} · ${formatQty(qty)} at ${unitPrice.toLocaleString()}. Insurance bill only — no stock deduction. Added by ${user?.name ?? "staff"}.`,
          "normal",
          `/jobs/${jobId}`,
          { vehicleNo: job.vehicleNo, eventType: "inventory" },
        ),
      }));
      return { ok: true, reference: record.id };
    },
    [state.jobCards, state.users, state.currentUserId],
  );

  const fulfillPart = useCallback(
    (
      partId: string,
      data: {
        qtyIssued: number;
        costPrice: number;
        marginPercent: number;
        supplierId?: string;
        supplierInvoiceNo: string;
      },
    ): ActionResult => {
      const part = state.parts.find((p) => p.id === partId);
      if (!part) return { ok: false, message: "Part request not found." };
      const item = state.inventory.find((i) => i.id === part.itemId);
      if (!item) return { ok: false, message: "Inventory item not found." };
      const unit = item.measureUnit || item.unit;
      const remaining = Math.max(0, part.qtyRequested - part.qtyIssued);
      const requested = part.qtyIssued > 0 ? remaining : part.qtyRequested;
      const rawQty = Number(data.qtyIssued) || requested;
      const qty = Math.max(0.001, Math.min(rawQty, requested));
      const stockAvailable = Math.max(0, item.stock);
      const shortfall = Math.max(0, Math.round((qty - stockAvailable) * 1000) / 1000);
      const needsPurchase = shortfall > 0.0001;
      const invoiceNo = data.supplierInvoiceNo.trim();
      const purchaseSupplierId = data.supplierId || part.supplierId || item.supplierId;
      if (needsPurchase && !invoiceNo) {
        return {
          ok: false,
          message: `Stock is short by ${formatQty(shortfall, unit)}. Enter the supplier purchase invoice number to buy the balance and issue it.`,
        };
      }
      if (needsPurchase && !purchaseSupplierId) {
        return {
          ok: false,
          message: "Choose the supplier for the purchased quantity.",
        };
      }
      if (
        needsPurchase &&
        !state.suppliers.some((supplier) => supplier.id === purchaseSupplierId)
      ) {
        return { ok: false, message: "The selected supplier no longer exists." };
      }
      const selling = Math.round(data.costPrice * (1 + data.marginPercent / 100) * 100) / 100;
      const now = new Date().toISOString();
      const job = state.jobCards.find((j) => j.id === part.jobCardId);
      const user = state.users.find((entry) => entry.id === state.currentUserId);

      setState((prev) => {
        const nextParts = prev.parts.map((p) =>
          p.id === partId
            ? {
                ...p,
                qtyIssued: qty,
                qtyRequested: qty,
                costPrice: data.costPrice,
                marginPercent: data.marginPercent,
                sellingPrice:
                  p.insuranceApprovedPrice !== undefined && p.insuranceApprovedPrice > 0
                    ? p.insuranceApprovedPrice
                    : p.estimateId && p.sellingPrice > 0
                      ? p.sellingPrice
                      : selling,
                status: "Issued" as const,
                supplierId: purchaseSupplierId ?? p.supplierId,
                supplierInvoiceNo: invoiceNo || p.supplierInvoiceNo,
                measuredQty: p.measuredQty || qty % 1 !== 0,
                updatedAt: now,
              }
            : p,
        );
        const leftover = requested - qty;
        if (leftover > 0.0001) {
          nextParts.push({
            ...part,
            id: uid("jp"),
            qtyRequested: leftover,
            qtyIssued: 0,
            costPrice: 0,
            sellingPrice: 0,
            status: "Backordered",
            createdAt: now,
            updatedAt: now,
          });
        }
        const nextInventory = prev.inventory.map((i) =>
          i.id === item.id
            ? {
                ...i,
                stock: Math.max(0, i.stock - qty),
                lastSellingPrice: item.type === "Consumable" && item.packSize ? selling * item.packSize : selling,
                lastCostPrice: item.type === "Consumable" && item.packSize ? data.costPrice * item.packSize : data.costPrice,
              }
            : i,
        );
        const updatedItem = nextInventory.find((i) => i.id === item.id);
        const movements: StockMovement[] = [
          {
            id: uid("stk"),
            itemId: item.id,
            itemName: item.name,
            date: now,
            type: "Job_Issue",
            qty: -qty,
            reference: part.jobCardId,
            note: `Issued ${formatQty(qty, unit)} to ${part.jobCardId}`,
            createdBy: user?.name,
          },
        ];
        const nextPurchases = [...prev.purchases];
        if (needsPurchase && purchaseSupplierId) {
          movements.unshift({
            id: uid("stk"),
            itemId: item.id,
            itemName: item.name,
            date: now,
            type: "Purchase",
            qty: shortfall,
            reference: invoiceNo,
            note: `Direct purchase for ${part.jobCardId}${job ? ` · ${job.vehicleNo}` : ""}`,
            createdBy: user?.name,
          });
          nextPurchases.unshift({
            id: `PO-${8843 + prev.purchases.length}`,
            supplierId: purchaseSupplierId,
            invoiceNo,
            amount: Math.round(shortfall * data.costPrice * 100) / 100,
            type: "Cash",
            creditDays: 0,
            purchaseDate: now,
            status: "Paid",
            description: `Direct purchase for ${part.jobCardId}${job ? ` · ${job.vehicleNo}` : ""} · ${item.name}`,
            lines: [
              {
                id: uid("pl"),
                itemId: item.id,
                itemName: item.name,
                qty: shortfall,
                costPrice: data.costPrice,
                sellingPrice: selling,
              },
            ],
            goodsConfirmedBy: user?.name,
            goodsConfirmedAt: now,
            paidBy: user?.name,
            paidAt: now,
            paymentMethod: "Cash",
          });
        }
        let notifications = prev.notifications;
        if (job) {
          notifications = notify(
            { ...prev, notifications },
            ["Supervisor"],
            needsPurchase ? "Part purchased and issued" : "Part issued",
            `${formatQty(qty, unit)} of ${item.name} issued to ${job.id} (${job.vehicleNo}).${needsPurchase ? ` ${formatQty(shortfall, unit)} purchased on ${invoiceNo}.` : ""} Selling price updated.`,
            "normal",
            `/jobs/${job.id}`,
            { vehicleNo: job.vehicleNo, eventType: "inventory" },
          );
        }
        if (updatedItem && updatedItem.stock < updatedItem.minStock) {
          const supplier = prev.suppliers.find((s) => s.id === updatedItem.supplierId);
          notifications = notify(
            { ...prev, notifications },
            ["Stores", "Supervisor", "Accounting"],
            `Low stock: ${updatedItem.name}`,
            `Only ${formatQty(updatedItem.stock, updatedItem.measureUnit || updatedItem.unit)} left (minimum ${formatQty(updatedItem.minStock, updatedItem.measureUnit || updatedItem.unit)}). Supplier: ${supplier?.name ?? "not set"}.`,
            "high",
            "/stores",
            { eventType: "inventory" },
          );
        }
        return {
          ...prev,
          parts: nextParts,
          inventory: nextInventory,
          purchases: nextPurchases,
          notifications,
          stockMovements: [...movements, ...prev.stockMovements],
        };
      });
      return { ok: true };
    },
    [state.parts, state.inventory, state.suppliers, state.jobCards, state.users, state.currentUserId],
  );

  const requestExchange = useCallback((partId: string) => {
    setState((prev) => {
      const part = prev.parts.find((p) => p.id === partId);
      const job = prev.jobCards.find((j) => j.id === part?.jobCardId);
      return {
        ...prev,
        parts: prev.parts.map((p) =>
          p.id === partId ? { ...p, status: "Exchange Pending" as const, updatedAt: new Date().toISOString() } : p,
        ),
        notifications: notify(
          prev,
          ["Stores"],
          "Exchange requested",
          `${job?.id ?? ""} · ${part?.itemName ?? "Part"} needs a replacement. Enter the new cost price when the part is swapped.`,
          "high",
          "/stores",
        ),
      };
    });
  }, []);

  const requestReturn = useCallback((partId: string) => {
    setState((prev) => {
      const part = prev.parts.find((p) => p.id === partId);
      const job = prev.jobCards.find((j) => j.id === part?.jobCardId);
      return {
        ...prev,
        parts: prev.parts.map((p) =>
          p.id === partId ? { ...p, status: "Return Pending" as const, updatedAt: new Date().toISOString() } : p,
        ),
        notifications: notify(
          prev,
          ["Stores"],
          "Return requested",
          `${job?.id ?? ""} · ${part?.itemName ?? "Part"} will be returned to the shelf. Approve after physically receiving it.`,
          "high",
          "/stores",
        ),
      };
    });
  }, []);

  const setPartSource = useCallback(
    (partId: string, source: "Workshop_Store" | "Customer_Brought"): ActionResult => {
      const part = state.parts.find((p) => p.id === partId);
      if (!part) return { ok: false, message: "Part request not found." };
      const job = state.jobCards.find((j) => j.id === part.jobCardId);
      if (!job) return { ok: false, message: "Job card not found." };
      if (part.assignedBillId) {
        return { ok: false, message: "This part is already on a bill." };
      }
      if (source === "Customer_Brought" && !job.insuranceClaimId) {
        return {
          ok: false,
          message: "Customer-brought parts are only available on insurance jobs.",
        };
      }
      if (part.status !== "Requested") {
        return {
          ok: false,
          message: "The part source can only be changed while the request is pending.",
        };
      }
      const now = new Date().toISOString();
      const unit = state.inventory.find((item) => item.id === part.itemId);
      setState((prev) => ({
        ...prev,
        parts: prev.parts.map((entry) =>
          entry.id === partId
            ? source === "Customer_Brought"
              ? {
                  ...entry,
                  partSource: "Customer_Brought" as const,
                  status: "Issued" as const,
                  qtyIssued: entry.qtyRequested,
                  costPrice: 0,
                  marginPercent: 0,
                  updatedAt: now,
                }
              : { ...entry, partSource: "Workshop_Store" as const, updatedAt: now }
            : entry,
        ),
        notifications:
          source === "Customer_Brought"
            ? notify(
                prev,
                ["Supervisor", "Stores", "Cashier"],
                "Customer-brought part — stores skipped",
                `${job.id} · ${job.vehicleNo} · ${part.itemName} is supplied by the customer. No stock request was sent and no stock was deducted.`,
                "normal",
                `/jobs/${job.id}`,
                { vehicleNo: job.vehicleNo, eventType: "inventory" },
              )
            : notify(
                prev,
                ["Stores"],
                "New parts request",
                `${job.id} · ${job.vehicleNo} needs ${part.qtyRequested}${
                  unit ? ` ${unit.measureUnit || unit.unit}` : ""
                } of ${part.itemName}.`,
                "high",
                "/stores",
                { vehicleNo: job.vehicleNo, eventType: "inventory" },
              ),
      }));
      return { ok: true, reference: part.itemName };
    },
    [state.parts, state.jobCards, state.inventory],
  );

  const returnCustomerBroughtPart = useCallback(
    (partId: string, mode: "Return" | "Swap"): ActionResult => {
      const part = state.parts.find((p) => p.id === partId);
      if (!part) return { ok: false, message: "Part not found." };
      if (part.partSource !== "Customer_Brought") {
        return {
          ok: false,
          message: "Only customer-brought parts are handed back to the customer.",
        };
      }
      if (part.assignedBillId) {
        return {
          ok: false,
          message: "This part is already on a bill. Reverse the bill before returning it.",
        };
      }
      const job = state.jobCards.find((j) => j.id === part.jobCardId);
      if (!job) return { ok: false, message: "Job card not found." };
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const now = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        parts: prev.parts.map((entry) =>
          entry.id === partId
            ? {
                ...entry,
                status: "Returned" as const,
                qtyIssued: 0,
                customerReturnAt: now,
                customerReturnMode: mode,
                customerReturnNote:
                  mode === "Swap"
                    ? "Customer is bringing a replacement part. Original part handed back."
                    : "Part handed back to the customer.",
                updatedAt: now,
              }
            : entry,
        ),
        notifications: notify(
          prev,
          ["Supervisor", "Cashier"],
          mode === "Swap"
            ? "Customer-brought part returned for swap"
            : "Customer-brought part returned",
          `${job.id} · ${job.vehicleNo} · ${part.itemName} goes back to the customer — never into stores. WhatsApp the owner to ${
            mode === "Swap" ? "bring the replacement part" : "collect the part"
          }. Recorded by ${user?.name ?? "staff"}.`,
          "normal",
          `/jobs/${job.id}`,
          { vehicleNo: job.vehicleNo, eventType: "inventory" },
        ),
      }));
      return { ok: true, reference: part.itemName };
    },
    [state.parts, state.jobCards, state.users, state.currentUserId],
  );

  const approveExchange = useCallback(
    (
      partId: string,
      data: {
        costPrice: number;
        marginPercent: number;
        supplierId?: string;
        supplierInvoiceNo: string;
      },
    ): ActionResult => {
      const part = state.parts.find((p) => p.id === partId);
      if (!part) return { ok: false, message: "Part not found." };
      const selling = Math.round(data.costPrice * (1 + data.marginPercent / 100) * 100) / 100;
      const job = state.jobCards.find((j) => j.id === part.jobCardId);
      setState((prev) => ({
        ...prev,
        parts: prev.parts.map((p) =>
          p.id === partId
            ? {
                ...p,
                costPrice: data.costPrice,
                marginPercent: data.marginPercent,
                sellingPrice:
                  p.insuranceApprovedPrice !== undefined && p.insuranceApprovedPrice > 0
                    ? p.insuranceApprovedPrice
                    : selling,
                status: "Issued" as const,
                supplierId: data.supplierId ?? p.supplierId,
                supplierInvoiceNo: data.supplierInvoiceNo.trim() || p.supplierInvoiceNo,
                warrantyStatus: "Replaced" as const,
                updatedAt: new Date().toISOString(),
              }
            : p,
        ),
        notifications: notify(
          prev,
          ["Supervisor"],
          "Exchange completed",
          `${job?.id ?? ""} · ${part.itemName} was swapped. The invoice now reflects ${selling.toFixed(0)}.`,
          "normal",
          job ? `/jobs/${job.id}` : "/stores",
        ),
      }));
      return { ok: true };
    },
    [state.parts, state.jobCards],
  );

  const approveReturn = useCallback((partId: string) => {
    setState((prev) => {
      const part = prev.parts.find((p) => p.id === partId);
      const job = prev.jobCards.find((j) => j.id === part?.jobCardId);
      const item = prev.inventory.find((i) => i.id === part?.itemId);
      const now = new Date().toISOString();
      const movement: StockMovement | null = part && item
        ? {
            id: uid("stk"),
            itemId: item.id,
            itemName: item.name,
            date: now,
            type: "Job_Return",
            qty: partIssueQty(part),
            reference: part.jobCardId,
            note: "Returned unused part to shelf",
            createdBy: prev.users.find((entry) => entry.id === prev.currentUserId)?.name,
          }
        : null;
      return {
        ...prev,
        parts: prev.parts.map((p) =>
          p.id === partId
            ? {
                ...p,
                sellingPrice: 0,
                status: "Returned" as const,
                updatedAt: now,
              }
            : p,
        ),
        inventory: part
          ? prev.inventory.map((i) =>
              i.id === part.itemId
                ? { ...i, stock: i.stock + partIssueQty(part) }
                : i,
            )
          : prev.inventory,
        stockMovements: movement
          ? [movement, ...prev.stockMovements]
          : prev.stockMovements,
        notifications: notify(
          prev,
          ["Supervisor"],
          "Return approved",
          `${job?.id ?? ""} · ${part?.itemName ?? "Part"} is back in stock. The customer bill was reduced to zero for this line.`,
          "normal",
          job ? `/jobs/${job.id}` : "/stores",
        ),
      };
    });
  }, []);

  const requestWarrantyClaim = useCallback(
    (partId: string, note: string): ActionResult => {
      const part = state.parts.find((entry) => entry.id === partId);
      if (!part) return { ok: false, message: "Part not found." };
      if (!part.supplierInvoiceNo) {
        return {
          ok: false,
          message: "Record the supplier purchase invoice number before raising a warranty claim.",
        };
      }
      setState((prev) => ({
        ...prev,
        parts: prev.parts.map((entry) =>
          entry.id === partId
            ? {
                ...entry,
                warrantyStatus: "Claimed" as const,
                warrantyNote: note.trim() || "Warranty claim raised.",
                updatedAt: new Date().toISOString(),
              }
            : entry,
        ),
        notifications: notify(
          prev,
          ["Stores", "Accounting"],
          "Warranty claim raised",
          `${part.itemName} · supplier invoice ${part.supplierInvoiceNo}. Awaiting replacement or credit note.`,
          "high",
          "/stores",
        ),
      }));
      return { ok: true };
    },
    [state.parts],
  );

  const completeWarrantyClaim = useCallback(
    (
      partId: string,
      data: { replacementInvoiceNo: string; creditNoteNo: string; creditNoteAmount: number },
    ): ActionResult => {
      const part = state.parts.find((entry) => entry.id === partId);
      if (!part) return { ok: false, message: "Part not found." };
      if (data.creditNoteAmount > 0 && !data.creditNoteNo.trim()) {
        return { ok: false, message: "Enter the supplier credit note number." };
      }
      const now = new Date().toISOString();
      const originalInvoiceNo = part.supplierInvoiceNo?.trim() || "";
      const replacementInvoiceNo = data.replacementInvoiceNo.trim() || originalInvoiceNo;
      const creditNote: SupplierCreditNote | null =
        data.creditNoteAmount > 0
          ? {
              id: uid("scn"),
              supplierId: part.supplierId ?? "",
              partId: part.id,
              jobCardId: part.jobCardId,
              supplierInvoiceNo: originalInvoiceNo,
              creditNoteNo: data.creditNoteNo.trim(),
              amount: data.creditNoteAmount,
              date: now,
              reason:
                part.warrantyNote ??
                `Warranty replacement for ${part.itemName}${
                  originalInvoiceNo ? ` (original invoice ${originalInvoiceNo})` : ""
                }.`,
              status: "Recorded",
            }
          : null;
      setState((prev) => ({
        ...prev,
        parts: prev.parts.map((entry) =>
          entry.id === partId
            ? {
                ...entry,
                supplierInvoiceNo: entry.supplierInvoiceNo || replacementInvoiceNo || undefined,
                warrantyReplacementInvoiceNo: replacementInvoiceNo || undefined,
                warrantyStatus:
                  data.creditNoteAmount > 0 ? ("Credited" as const) : ("Replaced" as const),
                creditNoteNo: data.creditNoteNo.trim() || undefined,
                creditNoteAmount: data.creditNoteAmount || undefined,
                updatedAt: now,
              }
            : entry,
        ),
        supplierCreditNotes: creditNote
          ? [creditNote, ...prev.supplierCreditNotes]
          : prev.supplierCreditNotes,
        notifications: notify(
          prev,
          ["Supervisor", "Accounting"],
          "Warranty replacement completed",
          `${part.itemName} was replaced under warranty.${creditNote ? ` Credit note ${creditNote.creditNoteNo} recorded for LKR ${creditNote.amount.toLocaleString()}.` : ""}`,
          "normal",
          "/stores",
        ),
      }));
      return { ok: true, reference: creditNote?.creditNoteNo };
    },
    [state.parts],
  );

  const updatePartSalvage = useCallback(
    (
      partId: string,
      data: { status: JobPart["salvageStatus"]; reference?: string; note?: string },
    ) => {
      setState((prev) => ({
        ...prev,
        parts: prev.parts.map((part) =>
          part.id === partId
            ? {
                ...part,
                salvageStatus: data.status,
                salvageRef: data.reference,
                salvageNote: data.note,
                updatedAt: new Date().toISOString(),
              }
            : part,
        ),
      }));
    },
    [],
  );

  const createEstimate = useCallback(
    (
      jobId: string,
      kind: JobEstimate["kind"],
      lines: EstimateLine[],
      notes: string,
      sectionId?: string,
    ): ActionResult => {
      const job = state.jobCards.find((entry) => entry.id === jobId);
      if (!job) {
        return { ok: false, message: "Job card not found." };
      }
      if (lines.length === 0) {
        return { ok: false, message: "Add at least one estimate line." };
      }
      const existing = state.estimates.filter((entry) => entry.jobCardId === jobId);
      if (
        kind === "Initial" &&
        existing.some(
          (entry) => entry.kind === "Initial" && entry.sectionId === sectionId,
        )
      ) {
        return {
          ok: false,
          message: sectionId
            ? "This section already has an Initial estimate. Create a Supplementary estimate for extra work."
            : "Only one Initial estimate is allowed per job. Pick a different section or create a Supplementary estimate.",
        };
      }
      if (kind === "Supplementary") {
        const seen = new Set<string>();
        for (const line of lines) {
          const key = `${line.type}:${line.description.trim().toLowerCase()}`;
          if (seen.has(key)) {
            return {
              ok: false,
              message: `"${line.description.trim()}" appears twice in this supplementary estimate.`,
            };
          }
          seen.add(key);
          const duplicate = findApprovedDuplicate(
            state.estimates,
            jobId,
            line.type,
            line.description,
          );
          if (duplicate) {
            return {
              ok: false,
              message: `"${line.description.trim()}" was already approved in ${estimateShortLabel(duplicate)}. Remove the duplicate line.`,
            };
          }
        }
      }
      const supplementaryNo =
        kind === "Supplementary"
          ? existing.filter((entry) => entry.kind === "Supplementary").length + 1
          : undefined;
      const number = nextEstimateNumber(state.estimates);
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const now = new Date().toISOString();
      const estimate: JobEstimate = {
        id: uid("est"),
        jobCardId: jobId,
        sectionId,
        kind,
        number,
        supplementaryNo,
        revision: 1,
        status: "Awaiting Approval",
        lines: lines.map((line) => ({
          ...line,
          description: line.description.trim(),
          approvalStatus: line.approvalStatus ?? "Pending",
        })),
        notes: notes.trim(),
        createdAt: now,
        updatedAt: now,
        createdBy: user?.name,
      };
      setState((prev) => ({
        ...prev,
        estimates: [estimate, ...prev.estimates],
        notifications: notify(
          prev,
          ["Supervisor", "Owner"],
          `${kind} estimate ready for approval`,
          `${jobId} · ${estimateDisplayNumber(estimate)} · ${lines.length} line${lines.length === 1 ? "" : "s"} · ${notes.trim() || "No notes"}`,
          "normal",
          `/jobs/${jobId}`,
          { vehicleNo: job.vehicleNo, eventType: "job" },
        ),
      }));
      return { ok: true, reference: estimate.id };
    },
    [state.jobCards, state.estimates, state.users, state.currentUserId],
  );

  const updateEstimate = useCallback(
    (estimateId: string, lines: EstimateLine[], notes: string): ActionResult => {
      const estimate = state.estimates.find((entry) => entry.id === estimateId);
      if (!estimate) return { ok: false, message: "Estimate not found." };
      if (estimate.status === "Approved") {
        return {
          ok: false,
          message: "Approved estimates are locked. Raise a Supplementary estimate for changes.",
        };
      }
      if (lines.length === 0) return { ok: false, message: "Add at least one estimate line." };
      if (estimate.kind === "Supplementary") {
        const seen = new Set<string>();
        for (const line of lines) {
          const key = `${line.type}:${line.description.trim().toLowerCase()}`;
          if (seen.has(key)) {
            return {
              ok: false,
              message: `"${line.description.trim()}" appears twice in this supplementary estimate.`,
            };
          }
          seen.add(key);
          const duplicate = findApprovedDuplicate(
            state.estimates,
            estimate.jobCardId,
            line.type,
            line.description,
            estimate.id,
          );
          if (duplicate) {
            return {
              ok: false,
              message: `"${line.description.trim()}" was already approved in ${estimateShortLabel(duplicate)}. Remove the duplicate line.`,
            };
          }
        }
      }
      const now = new Date().toISOString();
      const estimateJob = state.jobCards.find((entry) => entry.id === estimate.jobCardId);
      setState((prev) => ({
        ...prev,
        estimates: prev.estimates.map((entry) =>
          entry.id === estimateId
            ? {
                ...entry,
                lines: lines.map((line) => {
                  const previous = entry.lines.find((old) => old.id === line.id);
                  const unchanged =
                    previous &&
                    previous.type === line.type &&
                    previous.description.trim() === line.description.trim() &&
                    previous.qty === line.qty &&
                    previous.unitPrice === line.unitPrice;
                  return {
                    ...line,
                    description: line.description.trim(),
                    approvalStatus: unchanged
                      ? previous.approvalStatus ?? "Pending"
                      : ("Pending" as EstimateLineApproval),
                    approvedUnitPrice: unchanged ? previous.approvedUnitPrice : undefined,
                    approvalNote: unchanged ? previous.approvalNote : undefined,
                  };
                }),
                notes: notes.trim(),
                status: "Awaiting Approval" as const,
                revision: (entry.revision ?? 1) + 1,
                updatedAt: now,
              }
            : entry,
        ),
        notifications: notify(
          prev,
          ["Supervisor", "Owner"],
          "Estimate revised",
          `${estimate.jobCardId} · ${estimateDisplayNumber(estimate)} is now Rev ${(estimate.revision ?? 1) + 1} and needs approval.`,
          "normal",
          `/jobs/${estimate.jobCardId}`,
          { vehicleNo: estimateJob?.vehicleNo, eventType: "job" },
        ),
      }));
      return { ok: true };
    },
    [state.estimates, state.jobCards],
  );

  const removeEstimate = useCallback(
    (estimateId: string): ActionResult => {
      const estimate = state.estimates.find((entry) => entry.id === estimateId);
      if (!estimate) return { ok: false, message: "Estimate not found." };
      if (estimate.status === "Approved") {
        return {
          ok: false,
          message: "Approved estimates are locked. Raise a Supplementary estimate for changes.",
        };
      }
      setState((prev) => ({
        ...prev,
        estimates: prev.estimates.filter((entry) => entry.id !== estimateId),
      }));
      return { ok: true };
    },
    [state.estimates],
  );

  const approveEstimate = useCallback(
    (
      estimateId: string,
      decisions?: Record<
        string,
        { status: EstimateLineApproval; approvedUnitPrice?: number; approvalNote?: string }
      >,
    ): ActionResult => {
      const estimate = state.estimates.find((entry) => entry.id === estimateId);
      if (!estimate) return { ok: false, message: "Estimate not found." };
      if (estimate.status === "Approved") {
        return {
          ok: false,
          message:
            "This estimate is already approved. Edit the assessor approved prices in Parts approval.",
        };
      }
      const job = state.jobCards.find((entry) => entry.id === estimate.jobCardId);
      if (!job) return { ok: false, message: "Job card not found." };
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const now = new Date().toISOString();
      const resolvedLines = estimate.lines.map((line) => {
        const decision = decisions?.[line.id];
        const status = decision?.status ?? line.approvalStatus ?? "Approved";
        const approvedUnitPrice =
          decision?.approvedUnitPrice ?? line.approvedUnitPrice ?? line.unitPrice;
        return {
          ...line,
          approvalStatus: status,
          approvedUnitPrice:
            status === "Approved" ? approvedUnitPrice : line.approvedUnitPrice,
          approvalNote: decision?.approvalNote ?? line.approvalNote,
        };
      });
      const approvedLines = resolvedLines.filter(
        (line) => line.approvalStatus === "Approved",
      );
      if (approvedLines.length === 0) {
        return {
          ok: false,
          message: "Approve at least one line before confirming the estimate.",
        };
      }
      const labourLines = approvedLines.filter((line) => line.type === "Labour");
      const partLines = approvedLines.filter((line) => line.type === "Part");
      const newTasks: JobTask[] = labourLines.map((line) => ({
        id: uid("tsk"),
        jobCardId: job.id,
        name: line.description,
        laborCost:
          Math.round(line.qty * (line.approvedUnitPrice ?? line.unitPrice) * 100) / 100,
        quotedLaborCost: Math.round(line.qty * line.unitPrice * 100) / 100,
        workerId: "",
        sectionId: estimate.sectionId ?? job.sectionIds?.[0],
        createdAt: now,
        addedBy: user?.name,
        addedAt: now,
        estimateId: estimate.id,
        estimateLineId: line.id,
      }));
      const newParts: JobPart[] = partLines.map((line) => {
        const match = state.inventory.find(
          (item) => item.name.toLowerCase() === line.description.trim().toLowerCase(),
        );
        const approvedPrice =
          Math.round((line.approvedUnitPrice ?? line.unitPrice) * 100) / 100;
        return {
          id: uid("jp"),
          jobCardId: job.id,
          itemId: match?.id ?? `est_${line.id}`,
          itemName: line.description,
          qtyRequested: line.qty,
          qtyIssued: 0,
          costPrice: 0,
          marginPercent: 0,
          sellingPrice: approvedPrice,
          quotedSellingPrice: line.unitPrice,
          insuranceApprovedPrice: approvedPrice,
          status: "Requested" as const,
          sectionId: estimate.sectionId ?? job.sectionIds?.[0] ?? match?.sectionId,
          measuredQty: line.qty % 1 !== 0,
          supplierId: match?.supplierId,
          partSource: line.partSource,
          estimateId: estimate.id,
          estimateLineId: line.id,
          createdAt: now,
          updatedAt: now,
          warrantyStatus: "None" as const,
          salvageStatus: "Not Required" as const,
        };
      });
      setState((prev) => ({
        ...prev,
        tasks: [...prev.tasks, ...newTasks],
        parts: [...prev.parts, ...newParts],
        estimates: prev.estimates.map((entry) =>
          entry.id === estimateId
            ? {
                ...entry,
                lines: resolvedLines,
                status: "Approved" as const,
                approvedAt: now,
                approvedBy: user?.name,
                updatedAt: now,
              }
            : entry,
        ),
        jobCards: prev.jobCards.map((entry) =>
          entry.id === job.id
            ? { ...entry, status: "In Progress" as const, completedAt: undefined }
            : entry,
        ),
        insuranceJobs: job.insuranceClaimId
          ? prev.insuranceJobs.map((claim) =>
              claim.id === job.insuranceClaimId
                ? {
                    ...claim,
                    estimateStatus: "Approved" as const,
                    estimateApprovedAt: now,
                    status:
                      claim.status === "Parts Approved"
                        ? claim.status
                        : ("Estimate Approved" as const),
                  }
                : claim,
            )
          : prev.insuranceJobs,
        notifications: notify(
          prev,
          ["Supervisor", "Cashier", "Stores"],
          "Estimate approved — approved lines loaded",
          `${job.id} · ${estimateDisplayNumber(estimate)} approved. ${labourLines.length} labour task(s) and ${partLines.length} part(s) loaded at assessor-approved prices. Tasks are unassigned — the supervisor assigns a technician to each before completing the repair. Part requests reach stores only after the supervisor marks each part as store-supplied or customer-brought.`,
          "high",
          `/jobs/${job.id}`,
          { vehicleNo: job.vehicleNo, eventType: "job" },
        ),
      }));
      return { ok: true, reference: estimateDisplayNumber(estimate) };
    },
    [state.estimates, state.jobCards, state.inventory, state.workers, state.users, state.currentUserId],
  );

  const reviseEstimatePrices = useCallback(
    (estimateId: string, prices: Record<string, number>): ActionResult => {
      const estimate = state.estimates.find((entry) => entry.id === estimateId);
      if (!estimate) return { ok: false, message: "Estimate not found." };
      if (estimate.status !== "Approved") {
        return {
          ok: false,
          message: "Approve the estimate before recording assessor price revisions.",
        };
      }
      const changed = estimate.lines.filter((line) => {
        const price = prices[line.id];
        return (
          Number.isFinite(price) &&
          price >= 0 &&
          price !== (line.approvedUnitPrice ?? line.unitPrice)
        );
      });
      if (changed.length === 0) {
        return { ok: false, message: "No approved price changes to save." };
      }
      const now = new Date().toISOString();
      const priceById = new Map(changed.map((line) => [line.id, prices[line.id]]));
      const lineById = new Map(estimate.lines.map((line) => [line.id, line]));
      setState((prev) => ({
        ...prev,
        estimates: prev.estimates.map((entry) =>
          entry.id === estimateId
            ? {
                ...entry,
                lines: entry.lines.map((line) => {
                  const price = priceById.get(line.id);
                  return price === undefined
                    ? line
                    : {
                        ...line,
                        approvedUnitPrice: price,
                        approvalStatus:
                          line.approvalStatus === "Rejected"
                            ? line.approvalStatus
                            : ("Approved" as EstimateLineApproval),
                      };
                }),
                updatedAt: now,
              }
            : entry,
        ),
        tasks: prev.tasks.map((task) => {
          if (task.estimateId !== estimateId || !task.estimateLineId) return task;
          const price = priceById.get(task.estimateLineId);
          if (price === undefined) return task;
          const line = lineById.get(task.estimateLineId);
          return {
            ...task,
            laborCost: Math.round((line ? line.qty : 1) * price * 100) / 100,
            quotedLaborCost: line
              ? Math.round(line.qty * line.unitPrice * 100) / 100
              : task.quotedLaborCost,
          };
        }),
        parts: prev.parts.map((part) => {
          if (part.estimateId !== estimateId || !part.estimateLineId) return part;
          const price = priceById.get(part.estimateLineId);
          if (price === undefined) return part;
          const line = lineById.get(part.estimateLineId);
          return {
            ...part,
            sellingPrice: price,
            insuranceApprovedPrice: price,
            quotedSellingPrice: line?.unitPrice ?? part.quotedSellingPrice,
            updatedAt: now,
          };
        }),
        notifications: notify(
          prev,
          ["Supervisor", "Cashier", "Accounting"],
          "Assessor prices updated",
          `${estimate.jobCardId} · ${estimateDisplayNumber(estimate)} · ${changed.length} approved price${changed.length === 1 ? "" : "s"} revised. Job card costs and the insurance bill now use the assessor figures.`,
          "normal",
          `/jobs/${estimate.jobCardId}`,
          { eventType: "job" },
        ),
      }));
      return { ok: true };
    },
    [state.estimates],
  );

  const convertEstimateLineToCustomerExtra = useCallback(
    (estimateId: string, lineId: string): ActionResult => {
      const estimate = state.estimates.find((entry) => entry.id === estimateId);
      if (!estimate) return { ok: false, message: "Estimate not found." };
      const line = estimate.lines.find((entry) => entry.id === lineId);
      if (!line) return { ok: false, message: "Estimate line not found." };
      const job = state.jobCards.find((entry) => entry.id === estimate.jobCardId);
      if (!job) return { ok: false, message: "Job card not found." };
      if (!job.insuranceClaimId) {
        return {
          ok: false,
          message: "Non-claim / customer extra work only applies to insurance jobs.",
        };
      }
      if (line.approvalStatus === "Approved") {
        return {
          ok: false,
          message:
            "This line is already approved and loaded. Reject it first, then move it to customer extra.",
        };
      }
      const alreadyLoaded =
        line.type === "Labour"
          ? state.tasks.some((task) => task.estimateLineId === line.id)
          : state.parts.some((part) => part.estimateLineId === line.id);
      if (alreadyLoaded) {
        return { ok: false, message: "This line is already on the job card." };
      }
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const now = new Date().toISOString();
      const task: JobTask | null =
        line.type === "Labour"
          ? {
              id: uid("tsk"),
              jobCardId: job.id,
              name: line.description,
              laborCost: Math.round(line.qty * line.unitPrice * 100) / 100,
              workerId: "",
              sectionId: estimate.sectionId ?? job.sectionIds?.[0],
              createdAt: now,
              addedBy: user?.name,
              addedAt: now,
              isCustomerExtra: true,
              estimateId: estimate.id,
              estimateLineId: line.id,
            }
          : null;
      const part: JobPart | null =
        line.type === "Part"
          ? {
              id: uid("jp"),
              jobCardId: job.id,
              itemId: `est_extra_${line.id}`,
              itemName: line.description,
              qtyRequested: line.qty,
              qtyIssued: 0,
              costPrice: 0,
              marginPercent: 0,
              sellingPrice: line.unitPrice,
              quotedSellingPrice: line.unitPrice,
              status: "Requested",
              sectionId: estimate.sectionId ?? job.sectionIds?.[0],
              measuredQty: line.qty % 1 !== 0,
              partSource: line.partSource,
              isCustomerExtra: true,
              estimateId: estimate.id,
              estimateLineId: line.id,
              createdAt: now,
              updatedAt: now,
              warrantyStatus: "None",
              salvageStatus: "Not Required",
            }
          : null;
      setState((prev) => ({
        ...prev,
        tasks: task ? [...prev.tasks, task] : prev.tasks,
        parts: part ? [...prev.parts, part] : prev.parts,
        estimates: prev.estimates.map((entry) =>
          entry.id === estimateId
            ? {
                ...entry,
                lines: entry.lines.map((row) =>
                  row.id === lineId
                    ? {
                        ...row,
                        approvalStatus: "Rejected" as EstimateLineApproval,
                        approvalNote: "Moved to Non-Claim / Customer Extra",
                      }
                    : row,
                ),
                updatedAt: now,
              }
            : entry,
        ),
        notifications: notify(
          prev,
          ["Supervisor", "Cashier"],
          "Rejected line moved to customer extra",
          `${job.id} · ${line.description} will be billed to the customer, not the insurer.`,
          "normal",
          `/jobs/${job.id}`,
          { vehicleNo: job.vehicleNo, eventType: "job" },
        ),
      }));
      return { ok: true };
    },
    [state.estimates, state.jobCards, state.tasks, state.parts, state.workers, state.users, state.currentUserId],
  );

  const setEstimateStatus = useCallback(
    (estimateId: string, status: JobEstimate["status"]) => {
      setState((prev) => {
        const estimate = prev.estimates.find((entry) => entry.id === estimateId);
        if (!estimate) return prev;
        return {
          ...prev,
          estimates: prev.estimates.map((entry) =>
            entry.id === estimateId ? { ...entry, status } : entry,
          ),
          notifications: notify(
            prev,
            ["Supervisor", "Cashier"],
            `Estimate ${status.toLowerCase()}`,
            `${estimate.jobCardId} · ${estimate.kind} estimate ${status.toLowerCase()}.`,
            status === "Rejected" ? "high" : "normal",
            `/jobs/${estimate.jobCardId}`,
            { eventType: "job" },
          ),
        };
      });
    },
    [],
  );

  const updateDriverCommission = useCallback(
    (jobId: string, driver?: DriverCommission): ActionResult => {
      const job = state.jobCards.find((entry) => entry.id === jobId);
      if (!job) return { ok: false, message: "Job card not found." };
      if (driver) {
        if (!driver.name.trim() || !driver.phone.trim()) {
          return { ok: false, message: "Enter the driver name and phone number." };
        }
        if (!Number.isFinite(driver.value) || driver.value <= 0) {
          return { ok: false, message: "Enter a valid driver commission value." };
        }
      }
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const now = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        jobCards: prev.jobCards.map((entry) =>
          entry.id === jobId
            ? {
                ...entry,
                driver: driver
                  ? {
                      ...driver,
                      addedBy: entry.driver?.addedBy ?? user?.name,
                      addedAt: entry.driver?.addedAt ?? now,
                      updatedBy: user?.name,
                      updatedAt: now,
                    }
                  : undefined,
              }
            : entry,
        ),
        notifications: notify(
          prev,
          ["Cashier", "Accounting"],
          driver ? "Driver commission updated" : "Driver commission removed",
          `${job.id} · ${job.vehicleNo}${driver ? ` · ${driver.name} · ${driver.type} ${driver.value}${driver.type === "Percentage" ? "%" : " LKR"}` : ""}. Internal only — never printed on customer documents.`,
          "normal",
          `/jobs/${job.id}`,
        ),
      }));
      return { ok: true };
    },
    [state.jobCards, state.users, state.currentUserId],
  );

  const recordAdvancePayment = useCallback(
    (
      jobCardId: string,
      amount: number,
      method: AdvancePayment["method"],
      note?: string,
      cheque?: ChequeDetails,
      bankAccountId?: string,
    ): ActionResult => {
      const job = state.jobCards.find(
        (entry) =>
          entry.id.toLowerCase() === jobCardId.trim().toLowerCase() ||
          entry.vehicleNo.toLowerCase() === jobCardId.trim().toLowerCase(),
      );
      if (!job) return { ok: false, message: "No job card matches that job number or vehicle." };
      if (!Number.isFinite(amount) || amount <= 0) {
        return { ok: false, message: "Enter a valid advance amount." };
      }
      if (method === "Cheque") {
        if (!cheque?.chequeNo.trim() || !cheque.bank.trim() || !cheque.branch.trim()) {
          return { ok: false, message: "Enter the cheque number, bank and branch." };
        }
        if (!cheque.chequeDate) return { ok: false, message: "Enter the cheque date." };
      }
      const totals = jobTotals(job, state.tasks, state.parts, state.workers);
      const already = state.advancePayments
        .filter((entry) => entry.jobCardId === job.id && entry.chequeStatus !== "Bounced")
        .reduce((sum, entry) => sum + entry.amount, 0);
      if (already + amount > totals.total) {
        return {
          ok: false,
          message: `The advance cannot exceed the job balance of LKR ${(totals.total - already).toLocaleString()}.`,
        };
      }
      const receiptNo = `ADV-${4001 + state.advancePayments.length}`;
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const now = new Date().toISOString();
      const chequeId = cheque ? uid("chq") : undefined;
      const advance: AdvancePayment = {
        id: uid("adv"),
        jobCardId: job.id,
        customerName: job.customerName,
        vehicleNo: job.vehicleNo,
        phone: job.phone,
        amount,
        method,
        receiptNo,
        note: note?.trim(),
        createdAt: now,
        recordedBy: user?.name,
        chequeId,
        chequeNo: cheque?.chequeNo.trim(),
        chequeBank: cheque?.bank.trim(),
        chequeBranch: cheque?.branch.trim(),
        chequeDate: cheque?.chequeDate,
        chequeStatus: cheque ? "In_Safe" : undefined,
      };
      const chequeRecord: CustomerCheque | null = cheque && chequeId
        ? {
            id: chequeId,
            source: "Advance",
            jobCardId: job.id,
            advanceId: advance.id,
            customerName: job.customerName,
            vehicleNo: job.vehicleNo,
            phone: job.phone,
            chequeNo: cheque.chequeNo.trim(),
            bank: cheque.bank.trim(),
            branch: cheque.branch.trim(),
            chequeDate: cheque.chequeDate,
            amount,
            status: "In_Safe",
            receivedAt: now,
            receivedBy: user?.name,
            bankAccountId,
            note: note?.trim(),
          }
        : null;
      setState((prev) => ({
        ...prev,
        advancePayments: [advance, ...prev.advancePayments],
        customerCheques: chequeRecord
          ? [chequeRecord, ...prev.customerCheques]
          : prev.customerCheques,
        notifications: notify(
          prev,
          ["Cashier", "Accounting"],
          chequeRecord ? "Dated cheque advance received" : "Advance payment received",
          `${receiptNo} · ${job.vehicleNo} · LKR ${amount.toLocaleString()} against ${job.id}.${chequeRecord ? ` Cheque ${chequeRecord.chequeNo} held in safe until realisation.` : ""}`,
          "normal",
          "/cashier",
          { vehicleNo: job.vehicleNo, eventType: "payment" },
        ),
      }));
      return { ok: true, reference: receiptNo, jobId: job.id };
    },
    [state.jobCards, state.tasks, state.parts, state.workers, state.advancePayments, state.users, state.currentUserId],
  );

  const createInsuranceClaim = useCallback(
    (
      jobId: string,
      data: {
        insurerId: string;
        claimNo: string;
        policyNo: string;
        assessorName?: string;
        assessorPhone?: string;
      },
    ): ActionResult => {
      const job = state.jobCards.find((entry) => entry.id === jobId);
      if (!job) return { ok: false, message: "Job card not found." };
      if (job.insuranceClaimId) {
        return { ok: false, message: "This job already has an insurance claim." };
      }
      if (!data.insurerId) return { ok: false, message: "Choose the insurance company." };
      if (!data.claimNo.trim() || !data.policyNo.trim()) {
        return { ok: false, message: "Enter both the claim number and policy number." };
      }
      const claim: InsuranceClaim = {
        id: uid("clm"),
        jobCardId: jobId,
        insurerId: data.insurerId,
        claimNo: data.claimNo.trim(),
        policyNo: data.policyNo.trim(),
        assessorName: data.assessorName?.trim(),
        assessorPhone: data.assessorPhone?.trim(),
        estimateStatus: "Pending",
        partsStatus: "Pending",
        salvageStatus: "Pending",
        status: "Open",
        createdAt: new Date().toISOString(),
      };
      setState((prev) => ({
        ...prev,
        insuranceJobs: [claim, ...prev.insuranceJobs],
        jobCards: prev.jobCards.map((entry) =>
          entry.id === jobId ? { ...entry, insuranceClaimId: claim.id } : entry,
        ),
        notifications: notify(
          prev,
          ["Supervisor", "Accounting"],
          "Insurance claim opened",
          `${job.vehicleNo} · claim ${claim.claimNo} · policy ${claim.policyNo}. Submit the estimate for approval.`,
          "high",
          `/jobs/${jobId}`,
          { vehicleNo: job.vehicleNo, eventType: "job" },
        ),
      }));
      return { ok: true, reference: claim.id };
    },
    [state.jobCards],
  );

  const updateInsuranceClaim = useCallback(
    (claimId: string, patch: Partial<InsuranceClaim>) => {
      setState((prev) => ({
        ...prev,
        insuranceJobs: prev.insuranceJobs.map((claim) =>
          claim.id === claimId ? { ...claim, ...patch } : claim,
        ),
      }));
    },
    [],
  );

  const recordInsuranceCheque = useCallback(
    (
      claimId: string,
      data: {
        chequeNo: string;
        amount: number;
        bank: string;
        branch: string;
        chequeDate: string;
        bankAccountId?: string;
      },
    ): ActionResult => {
      const claim = state.insuranceJobs.find((entry) => entry.id === claimId);
      if (!claim) return { ok: false, message: "Insurance claim not found." };
      if (!data.chequeNo.trim()) return { ok: false, message: "Enter the cheque number." };
      if (!data.bank.trim() || !data.branch.trim()) {
        return { ok: false, message: "Enter the cheque bank and branch." };
      }
      if (!data.chequeDate) return { ok: false, message: "Enter the cheque date." };
      if (!Number.isFinite(data.amount) || data.amount <= 0) {
        return { ok: false, message: "Enter a valid cheque amount." };
      }
      const job = state.jobCards.find((entry) => entry.id === claim.jobCardId);
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const now = new Date().toISOString();
      const chequeId = uid("chq");
      const cheque: CustomerCheque = {
        id: chequeId,
        source: "Insurance",
        jobCardId: claim.jobCardId,
        insuranceClaimId: claim.id,
        customerName: job?.customerName ?? "Insurance settlement",
        vehicleNo: job?.vehicleNo ?? "—",
        phone: job?.phone ?? "",
        chequeNo: data.chequeNo.trim(),
        bank: data.bank.trim(),
        branch: data.branch.trim(),
        chequeDate: data.chequeDate,
        amount: data.amount,
        status: "In_Safe",
        receivedAt: now,
        receivedBy: user?.name,
        bankAccountId: data.bankAccountId,
      };
      setState((prev) => ({
        ...prev,
        insuranceJobs: prev.insuranceJobs.map((entry) =>
          entry.id === claimId
            ? {
                ...entry,
                chequeNo: cheque.chequeNo,
                chequeAmount: data.amount,
                chequeReceivedAt: now,
                chequeBank: cheque.bank,
                chequeBranch: cheque.branch,
                chequeDate: cheque.chequeDate,
                chequeStatus: "In_Safe" as const,
                chequeId,
                status: "Awaiting Payment" as const,
              }
            : entry,
        ),
        customerCheques: [cheque, ...prev.customerCheques],
        notifications: notify(
          prev,
          ["Accounting", "Owner"],
          "Insurance cheque received",
          `${claim.claimNo} · ${cheque.bank} ${cheque.branch} · cheque ${cheque.chequeNo} for LKR ${data.amount.toLocaleString()} held in safe.`,
          "high",
          "/accounting",
          { vehicleNo: job?.vehicleNo, eventType: "cheque" },
        ),
      }));
      return { ok: true };
    },
    [state.insuranceJobs, state.jobCards, state.users, state.currentUserId],
  );

  const settleInsuranceClaim = useCallback(
    (claimId: string): ActionResult => {
      const claim = state.insuranceJobs.find((entry) => entry.id === claimId);
      if (!claim) return { ok: false, message: "Insurance claim not found." };
      const amount = claim.chequeAmount ?? claim.insuranceBillAmount ?? 0;
      if (amount <= 0) {
        return { ok: false, message: "Record the insurance bill or cheque amount first." };
      }
      const now = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        insuranceJobs: prev.insuranceJobs.map((entry) =>
          entry.id === claimId
            ? { ...entry, chequeClearedAt: now, status: "Settled" as const }
            : entry,
        ),
        ledger: [
          {
            id: uid("led"),
            date: now,
            laborRevenue: 0,
            partsRevenue: 0,
            partsCost: 0,
            commission: 0,
            discount: 0,
            paymentMethod: "Insurance Settlement",
            settlementAmount: amount,
            insuranceClaimId: claim.id,
            description: `Insurance settlement — ${claim.claimNo}`,
          },
          ...prev.ledger,
        ],
        notifications: notify(
          prev,
          ["Owner", "Accounting"],
          "Insurance cheque cleared",
          `${claim.claimNo} · LKR ${amount.toLocaleString()} received. Claim marked settled.`,
          "normal",
          `/jobs/${claim.jobCardId}`,
        ),
      }));
      return { ok: true, reference: claim.claimNo };
    },
    [state.insuranceJobs],
  );

  const markAttendance = useCallback(
    (
      workerId: string,
      date: string,
      status: AttendanceRecord["status"],
      sectionId?: string,
    ) => {
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const worker = state.workers.find((entry) => entry.id === workerId);
      setState((prev) => {
        const existing = prev.attendance.find(
          (record) => record.workerId === workerId && record.date === date,
        );
        const record: AttendanceRecord = {
          id: existing?.id ?? uid("att"),
          workerId,
          sectionId: sectionId ?? existing?.sectionId ?? worker?.sectionIds?.[0],
          date,
          status,
          markedAt: new Date().toISOString(),
          markedBy: user?.name,
        };
        return {
          ...prev,
          attendance: existing
            ? prev.attendance.map((entry) => (entry.id === existing.id ? record : entry))
            : [record, ...prev.attendance],
        };
      });
    },
    [state.users, state.currentUserId, state.workers],
  );

  const markManyPresent = useCallback(
    (workerIds: string[], date: string, sectionId?: string) => {
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const now = new Date().toISOString();
      setState((prev) => {
        const additions: AttendanceRecord[] = [];
        const updates = new Map<string, AttendanceRecord>();
        workerIds.forEach((workerId) => {
          const existing = prev.attendance.find(
            (record) => record.workerId === workerId && record.date === date,
          );
          const worker = prev.workers.find((entry) => entry.id === workerId);
          const record: AttendanceRecord = {
            id: existing?.id ?? uid("att"),
            workerId,
            sectionId: sectionId ?? existing?.sectionId ?? worker?.sectionIds?.[0],
            date,
            status: "Present",
            markedAt: now,
            markedBy: user?.name,
          };
          if (existing) updates.set(existing.id, record);
          else additions.push(record);
        });
        return {
          ...prev,
          attendance: [
            ...additions,
            ...prev.attendance.map((entry) => updates.get(entry.id) ?? entry),
          ],
        };
      });
    },
    [state.users, state.currentUserId],
  );

  const submitAppointmentBooking = useCallback(
    (input: AppointmentBookingInput): ActionResult => {
      const expected = (state.settings.bookingToken ?? "").trim();
      if (!expected || input.token.trim() !== expected) {
        return {
          ok: false,
          message: "This booking link has expired or does not belong to the workshop.",
        };
      }
      const name = input.customerName.trim();
      const phone = normalizePhone(input.phone);
      const vehicleNo = input.vehicleNo.trim().toUpperCase();
      const model = input.vehicleModel.trim();
      const repairType = input.repairType.trim();
      const scheduled = new Date(input.scheduledAt);
      if (!name) return { ok: false, message: "Enter the customer name." };
      if (!/^947\d{8}$/.test(phone)) {
        return { ok: false, message: "Enter a valid Sri Lankan mobile number." };
      }
      if (!vehicleNo) return { ok: false, message: "Enter the vehicle number." };
      if (!model) return { ok: false, message: "Enter the vehicle make and model." };
      if (!repairType) return { ok: false, message: "Choose the repair type." };
      if (Number.isNaN(scheduled.getTime())) {
        return { ok: false, message: "Choose the appointment date and time." };
      }
      const now = Date.now();
      if (scheduled.getTime() < now - 60 * 60 * 1000) {
        return { ok: false, message: "Choose a date and time in the future." };
      }
      const next = state.appointments.reduce((max, entry) => {
        const value = Number(entry.reference.replace(/\D/g, ""));
        return Number.isFinite(value) ? Math.max(max, value) : max;
      }, 1000) + 1;
      const reference = `APT-${next}`;
      const timestamp = new Date().toISOString();
      const appointment: Appointment = {
        id: uid("apt"),
        reference,
        createdAt: timestamp,
        updatedAt: timestamp,
        token: expected,
        customerName: name,
        phone: `+${phone}`,
        vehicleNo,
        vehicleModel: model,
        repairType,
        scheduledAt: scheduled.toISOString(),
        notes: input.notes?.trim() || undefined,
        status: "Pending",
        source: "Booking link",
      };
      setState((prev) => ({
        ...prev,
        appointments: [appointment, ...prev.appointments],
        notifications: notify(
          prev,
          ["Supervisor", "Owner"],
          "New reservation request",
          `${vehicleNo} · ${model} · ${repairType} · ${scheduled.toLocaleString()}`,
          "high",
          "/appointments",
        ).map((entry) => ({ ...entry, vehicleNo, eventType: "appointment" as const })),
      }));
      return { ok: true, reference };
    },
    [state.appointments, state.settings.bookingToken],
  );

  const createStaffAppointment = useCallback(
    (input: {
      customerName: string;
      phone: string;
      vehicleNo: string;
      vehicleModel: string;
      repairType: string;
      scheduledAt: string;
      notes?: string;
    }): ActionResult => {
      const phone = normalizePhone(input.phone);
      if (!/^947\d{8}$/.test(phone)) {
        return { ok: false, message: "Enter a valid Sri Lankan mobile number." };
      }
      if (!input.customerName.trim() || !input.vehicleNo.trim() || !input.scheduledAt) {
        return { ok: false, message: "Name, vehicle number and appointment time are required." };
      }
      const next = state.appointments.reduce((max, entry) => {
        const value = Number(entry.reference.replace(/\D/g, ""));
        return Number.isFinite(value) ? Math.max(max, value) : max;
      }, 1000) + 1;
      const reference = `APT-${next}`;
      const timestamp = new Date().toISOString();
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const appointment: Appointment = {
        id: uid("apt"),
        reference,
        createdAt: timestamp,
        updatedAt: timestamp,
        token: state.settings.bookingToken ?? "",
        customerName: input.customerName.trim(),
        phone: `+${phone}`,
        vehicleNo: input.vehicleNo.trim().toUpperCase(),
        vehicleModel: input.vehicleModel.trim(),
        repairType: input.repairType.trim() || "Repair",
        scheduledAt: new Date(input.scheduledAt).toISOString(),
        notes: input.notes?.trim() || undefined,
        status: "Confirmed",
        source: "Staff",
        createdBy: user?.name,
        confirmedAt: timestamp,
        confirmedBy: user?.name,
      };
      setState((prev) => ({
        ...prev,
        appointments: [appointment, ...prev.appointments],
      }));
      return { ok: true, reference };
    },
    [
      state.appointments,
      state.currentUserId,
      state.settings.bookingToken,
      state.users,
    ],
  );

  const confirmAppointment = useCallback(
    (appointmentId: string): ActionResult => {
      const appointment = state.appointments.find((entry) => entry.id === appointmentId);
      if (!appointment) return { ok: false, message: "Appointment not found." };
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const timestamp = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        appointments: prev.appointments.map((entry) =>
          entry.id === appointmentId
            ? {
                ...entry,
                status: "Confirmed",
                confirmedAt: timestamp,
                confirmedBy: user?.name,
                updatedAt: timestamp,
              }
            : entry,
        ),
      }));
      queueWhatsApp(
        appointment.phone,
        appointmentConfirmedMessage(
          appointment.customerName,
          appointment.vehicleNo,
          appointment.scheduledAt,
          state.settings,
        ),
        state.settings,
      );
      return { ok: true, reference: appointment.reference };
    },
    [state.appointments, state.currentUserId, state.users, state.settings],
  );

  const rescheduleAppointment = useCallback(
    (appointmentId: string, scheduledAt: string, reason?: string): ActionResult => {
      const appointment = state.appointments.find((entry) => entry.id === appointmentId);
      if (!appointment) return { ok: false, message: "Appointment not found." };
      const next = new Date(scheduledAt);
      if (Number.isNaN(next.getTime())) {
        return { ok: false, message: "Choose a new date and time." };
      }
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const timestamp = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        appointments: prev.appointments.map((entry) =>
          entry.id === appointmentId
            ? {
                ...entry,
                scheduledAt: next.toISOString(),
                rescheduledFrom: appointment.scheduledAt,
                status: "Confirmed",
                confirmedAt: timestamp,
                confirmedBy: user?.name,
                employeeNote: reason?.trim() || entry.employeeNote,
                updatedAt: timestamp,
              }
            : entry,
        ),
      }));
      queueWhatsApp(
        appointment.phone,
        appointmentRescheduledMessage(
          appointment.customerName,
          appointment.vehicleNo,
          next.toISOString(),
          state.settings,
        ),
        state.settings,
      );
      return { ok: true, reference: appointment.reference };
    },
    [state.appointments, state.currentUserId, state.users, state.settings],
  );

  const cancelAppointment = useCallback(
    (appointmentId: string, reason: string): ActionResult => {
      const appointment = state.appointments.find((entry) => entry.id === appointmentId);
      if (!appointment) return { ok: false, message: "Appointment not found." };
      if (!reason.trim()) {
        return { ok: false, message: "Enter the reason so the customer can be informed." };
      }
      const timestamp = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        appointments: prev.appointments.map((entry) =>
          entry.id === appointmentId
            ? {
                ...entry,
                status: "Cancelled",
                cancelReason: reason.trim(),
                cancelledAt: timestamp,
                updatedAt: timestamp,
              }
            : entry,
        ),
      }));
      queueWhatsApp(
        appointment.phone,
        appointmentCancelledMessage(
          appointment.customerName,
          appointment.vehicleNo,
          appointment.scheduledAt,
          reason.trim(),
          state.settings,
        ),
        state.settings,
      );
      return { ok: true, reference: appointment.reference };
    },
    [state.appointments, state.settings],
  );

  const fulfilAppointment = useCallback(
    (appointmentId: string, createCheckIn = false): ActionResult => {
      const appointment = state.appointments.find((entry) => entry.id === appointmentId);
      if (!appointment) return { ok: false, message: "Appointment not found." };
      const timestamp = new Date().toISOString();
      let checkInId = appointment.checkInId;
      if (createCheckIn && !checkInId) {
        checkInId = `CI-${2044 + state.checkIns.length}`;
        const modelWords = appointment.vehicleModel.trim().split(/\s+/);
        const checkIn = {
          id: checkInId,
          createdAt: timestamp,
          vehicleNo: appointment.vehicleNo,
          make: modelWords[0] || "",
          model: modelWords.slice(1).join(" ") || appointment.vehicleModel,
          customerName: appointment.customerName,
          phone: appointment.phone,
          mileage: 0,
          status: "Awaiting Approval" as const,
        };
        setState((prev) => ({
          ...prev,
          checkIns: [checkIn, ...prev.checkIns],
          appointments: prev.appointments.map((entry) =>
            entry.id === appointmentId
              ? {
                  ...entry,
                  status: "Fulfilled",
                  fulfilledAt: timestamp,
                  checkInId,
                  updatedAt: timestamp,
                }
              : entry,
          ),
          notifications: notify(
            prev,
            ["PRO"],
            "Reserved vehicle arrived",
            `${appointment.vehicleNo} · ${appointment.vehicleModel} checked in from ${appointment.reference}.`,
            "high",
            "/gate",
          ).map((entry) => ({
            ...entry,
            vehicleNo: appointment.vehicleNo,
            eventType: "appointment" as const,
          })),
        }));
        return { ok: true, reference: checkInId, jobId: checkInId };
      }
      setState((prev) => ({
        ...prev,
        appointments: prev.appointments.map((entry) =>
          entry.id === appointmentId
            ? {
                ...entry,
                status: "Fulfilled",
                fulfilledAt: timestamp,
                checkInId,
                updatedAt: timestamp,
              }
            : entry,
        ),
      }));
      return { ok: true, reference: appointment.reference };
    },
    [state.appointments, state.checkIns.length],
  );

  const markAppointmentNoShow = useCallback((appointmentId: string) => {
    const timestamp = new Date().toISOString();
    setState((prev) => ({
      ...prev,
      appointments: prev.appointments.map((entry) =>
        entry.id === appointmentId
          ? { ...entry, status: "No Show", updatedAt: timestamp }
          : entry,
      ),
    }));
  }, []);

  const addStaffLoan = useCallback(
    (workerId: string, principal: number, monthlyDeduction: number, reason: string) => {
      if (principal <= 0 || monthlyDeduction <= 0) return;
      const loan: StaffLoan = {
        id: uid("loan"),
        workerId,
        date: new Date().toISOString(),
        principal,
        balance: principal,
        monthlyDeduction,
        reason,
        status: "Active",
      };
      setState((prev) => ({ ...prev, staffLoans: [loan, ...prev.staffLoans] }));
    },
    [],
  );

  const savePayslip = useCallback(
    (
      workerId: string,
      data: Omit<Payslip, "id" | "workerId" | "paidAt" | "paidBy">,
    ): ActionResult => {
      const worker = state.workers.find((entry) => entry.id === workerId);
      if (!worker) return { ok: false, message: "Worker not found." };
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const payslip: Payslip = {
        ...data,
        id: uid("pay"),
        workerId,
        paidAt: new Date().toISOString(),
        paidBy: user?.name,
      };
      setState((prev) => {
        let remaining = data.loanDeduction;
        const loans = prev.staffLoans.map((loan) => {
          if (loan.workerId !== workerId || loan.status !== "Active" || remaining <= 0) {
            return loan;
          }
          const deduction = Math.min(loan.balance, loan.monthlyDeduction, remaining);
          remaining -= deduction;
          const balance = Math.max(0, loan.balance - deduction);
          return {
            ...loan,
            balance,
            status: balance <= 0 ? ("Settled" as const) : loan.status,
          };
        });
        return {
          ...prev,
          staffLoans: loans,
          payslips: [payslip, ...prev.payslips],
          notifications: notify(
            prev,
            ["Owner", "Accounting"],
            "Payslip issued",
            `${worker.fullName} · net LKR ${payslip.net.toLocaleString()} · ${payslip.periodStart} to ${payslip.periodEnd}.`,
            "normal",
            "/accounting",
            { eventType: "payment" },
          ),
        };
      });
      return { ok: true, reference: payslip.id };
    },
    [state.workers, state.users, state.currentUserId],
  );

  const payDailyWage = useCallback(
    (workerId: string, includeCommission: boolean): ActionResult => {
      const worker = state.workers.find((entry) => entry.id === workerId);
      if (!worker) return { ok: false, message: "Worker not found." };
      if (worker.payType !== "Daily") {
        return { ok: false, message: "This worker is on monthly pay." };
      }
      const due = dailyWageDue(state, worker, includeCommission);
      if (due.days <= 0 && due.commissionAmount <= 0) {
        return { ok: false, message: "No unpaid attendance or commission to pay." };
      }
      const receiptNo = `WAGE-${9001 + state.wagePayouts.length}`;
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const payout = {
        id: uid("wage"),
        workerId,
        date: localDateKey(),
        days: due.days,
        baseAmount: due.baseAmount,
        commissionAmount: due.commissionAmount,
        commissionIncluded: due.commissionIncluded,
        amount: due.amount,
        receiptNo,
        paidAt: new Date().toISOString(),
        paidBy: user?.name,
      };
      setState((prev) => ({
        ...prev,
        wagePayouts: [payout, ...prev.wagePayouts],
        notifications: notify(
          prev,
          ["Owner", "Accounting"],
          "Daily wage paid",
          `${worker.fullName} · ${due.days} day${due.days === 1 ? "" : "s"} · LKR ${due.amount.toLocaleString()} · ${receiptNo}.`,
          "normal",
          "/accounting",
          { eventType: "payment" },
        ),
      }));
      return { ok: true, reference: receiptNo };
    },
    [state, state.currentUserId],
  );

  const addInsuranceCompany = useCallback((company: Omit<InsuranceCompany, "id">) => {
    setState((prev) => ({
      ...prev,
      insuranceCompanies: [...prev.insuranceCompanies, { ...company, id: uid("ins") }],
    }));
  }, []);

  const updateInsuranceCompany = useCallback((company: InsuranceCompany) => {
    setState((prev) => ({
      ...prev,
      insuranceCompanies: prev.insuranceCompanies.map((entry) =>
        entry.id === company.id ? company : entry,
      ),
    }));
  }, []);

  const removeInsuranceCompany = useCallback((companyId: string) => {
    setState((prev) => ({
      ...prev,
      insuranceCompanies: prev.insuranceCompanies.filter(
        (entry) => entry.id !== companyId,
      ),
    }));
  }, []);

  const activateLicence = useCallback(
    (key: string): ActionResult => {
      const clean = key.trim();
      if (clean.toUpperCase().startsWith("TRQ2.")) {
        const validation = verifyOfflineToken(
          clean,
          state.settings.installationId || getInstallationId(),
        );
        if (!validation.ok || !validation.payload) {
          return { ok: false, message: validation.message };
        }
        const payload = validation.payload;
        setState((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            licenseKey: clean,
            licenseActivatedAt: new Date().toISOString(),
            licenseExpiresAt: new Date(payload.expiresAt).toISOString(),
            licenseHolder: payload.holder || prev.settings.licenseHolder,
            licenseStatus: payload.status,
            licensePlan: payload.plan,
            featureFlags: { ...defaultFeatureFlags(), ...payload.featureFlags },
            licenceClockRollback: false,
            lastLicenceSyncAt: new Date().toISOString(),
            lastLicenceServerTime: new Date().toISOString(),
          },
        }));
        return { ok: true, message: validation.message };
      }
      const result = validateLicenceKey(clean, getMachineId());
      if (!result.ok || !result.expiresAt) {
        return { ok: false, message: result.message };
      }
      setState((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          licenseKey: clean.toUpperCase(),
          licenseActivatedAt: new Date().toISOString(),
          licenseExpiresAt: result.expiresAt,
          licenseStatus: "Active",
          lastLicenceSyncAt: new Date().toISOString(),
          licenceClockRollback: false,
        },
      }));
      return { ok: true, message: result.message };
    },
    [state.settings.installationId],
  );

  const syncLicence = useCallback(async (): Promise<ActionResult> => {
    if (!licenceServerConfigured()) {
      return {
        ok: false,
        message:
          "Master licence server is not configured. Set VITE_MASTER_LICENSE_URL to enable remote checks.",
      };
    }
    const result = await pollRemoteLicence(state.settings);
    if (result.clockRollback) {
      setState((prev) => ({
        ...prev,
        settings: { ...prev.settings, licenceClockRollback: true },
      }));
      return { ok: false, message: result.message };
    }
    if (!result.ok) return { ok: false, message: result.message };
    const now = new Date().toISOString();
    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        licenseStatus: result.status ?? prev.settings.licenseStatus,
        licensePlan: result.plan ?? prev.settings.licensePlan,
        licenseExpiresAt: result.expiresAt ?? prev.settings.licenseExpiresAt,
        licenseHolder: result.holder ?? prev.settings.licenseHolder,
        featureFlags: result.featureFlags ?? featureFlagsFor(prev.settings),
        lastLicenceSyncAt: now,
        lastLicenceServerTime: result.serverTime ?? now,
        licenceClockRollback: false,
      },
    }));
    return { ok: true, message: result.message };
  }, [state.settings]);

  const markRepairCompleted = useCallback(
    (jobId: string): ActionResult => {
      const job = state.jobCards.find((entry) => entry.id === jobId);
      if (!job) return { ok: false, message: "Job card not found." };
      const jobTasks = state.tasks.filter((task) => task.jobCardId === jobId);
      const unassigned = jobTasks.filter((task) => !task.workerId);
      if (unassigned.length > 0) {
        return {
          ok: false,
          message: `${unassigned.length} task(s) have no technician. Assign a worker to every task before completing the repair — ${unassigned
            .map((task) => task.name)
            .slice(0, 3)
            .join(", ")}${unassigned.length > 3 ? "…" : ""}.`,
        };
      }
      const now = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        jobCards: prev.jobCards.map((entry) =>
          entry.id === jobId
            ? { ...entry, status: "Repair Completed" as const, completedAt: now }
            : entry,
        ),
        notifications: notify(
          prev,
          ["Cashier"],
          "Repair completed — ready to bill",
          `${jobId} · ${job.vehicleNo} is waiting in the billing queue.`,
          "high",
          "/cashier",
          { vehicleNo: job.vehicleNo, eventType: "job" },
        ),
      }));
      return { ok: true };
    },
    [state.jobCards, state.tasks],
  );

  const checkoutJob = useCallback(
    (jobId: string, input: CheckoutInput): ActionResult => {
      const job = state.jobCards.find((j) => j.id === jobId);
      if (!job) return { ok: false, message: "Job card not found." };
      if (job.status !== "Repair Completed") {
        return { ok: false, message: "This job is not ready for billing." };
      }
      if (state.vehicleBills.some((bill) => bill.jobCardId === jobId)) {
        return {
          ok: false,
          message:
            "This vehicle has separate insurance/customer bills. Settle them in Cashier → Separate bills.",
        };
      }
      const draftJob: JobCard = {
        ...job,
        discount: input.discount,
        discountType: input.discountType,
        isVatInvoice: Boolean(input.isVatInvoice),
        vatAmount: 0,
      };
      const baseTotals = jobTotals(draftJob, state.tasks, state.parts, state.workers);
      const vatRate = input.isVatInvoice
        ? Math.max(0, input.vatRate ?? state.settings.defaultVatRate ?? 18)
        : 0;
      const vatAmount =
        vatRate > 0 ? Math.round(baseTotals.total * vatRate) / 100 : 0;
      const ratedJob: JobCard = {
        ...draftJob,
        vatRateApplied: vatRate,
        vatAmount,
      };
      const totals = jobTotals(ratedJob, state.tasks, state.parts, state.workers);
      if (input.paymentMethod === "Credit" && (!input.graceDays || input.graceDays < 1)) {
        return { ok: false, message: "Enter a credit grace period in days." };
      }
      const driverCommission = driverCommissionFor(draftJob, {
        labor: totals.labor,
        total: Math.max(0, totals.total - totals.vat),
      });
      const advancePaid = state.advancePayments
        .filter(
          (advance) =>
            advance.jobCardId === jobId && advance.chequeStatus !== "Bounced",
        )
        .reduce((sum, advance) => sum + advance.amount, 0);
      const balanceDue = Math.max(0, totals.total - advancePaid);
      const now = new Date().toISOString();
      if (input.paymentMethod === "Cheque") {
        if (!input.cheque?.chequeNo.trim() || !input.cheque.bank.trim() || !input.cheque.branch.trim()) {
          return { ok: false, message: "Enter the cheque number, bank and branch." };
        }
        if (!input.cheque.chequeDate) {
          return { ok: false, message: "Enter the post-dated cheque date." };
        }
        if (Math.abs(input.cheque.amount - balanceDue) > 0.5) {
          return {
            ok: false,
            message: `The cheque amount must equal the balance due of LKR ${balanceDue.toLocaleString()}.`,
          };
        }
      }
      const paidStatus = input.paymentMethod === "Credit" ? "Released on Credit" : "Paid";
      const dueDate =
        input.paymentMethod === "Credit"
          ? isoDaysFrom(now, input.graceDays ?? 30)
          : undefined;
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const chequeId = input.paymentMethod === "Cheque" ? uid("chq") : undefined;
      const chequeRecord: CustomerCheque | null =
        input.paymentMethod === "Cheque" && input.cheque && chequeId
          ? {
              id: chequeId,
              source: "Checkout",
              jobCardId: job.id,
              customerName: job.customerName,
              vehicleNo: job.vehicleNo,
              phone: job.phone,
              chequeNo: input.cheque.chequeNo.trim(),
              bank: input.cheque.bank.trim(),
              branch: input.cheque.branch.trim(),
              chequeDate: input.cheque.chequeDate,
              amount: input.cheque.amount,
              status: "In_Safe",
              receivedAt: now,
              receivedBy: user?.name,
              bankAccountId: input.bankAccountId,
            }
          : null;
      const bankTransaction: BankTransaction | null =
        input.bankAccountId &&
        input.paymentMethod !== "Credit" &&
        input.paymentMethod !== "Insurance" &&
        input.paymentMethod !== "Cheque"
          ? {
              id: uid("btx"),
              accountId: input.bankAccountId,
              date: now,
              direction: "Credit_In",
              amount: balanceDue,
              category: "Vehicle Payment",
              description: `${job.id} · ${job.vehicleNo} · ${input.paymentMethod}`,
              reference: job.id,
              linkedType: "Job",
              linkedId: job.id,
              createdBy: user?.name,
            }
          : null;
      const ledgerEntries = [] as AppState["ledger"];
      const activeTasks = totals.activeTasks;
      const sectionFallback = job.sectionIds?.[0] ?? "__unassigned";
      const sectionMap = new Map<
        string,
        {
          sectionId: string;
          sectionName: string;
          laborRevenue: number;
          partsRevenue: number;
          partsCost: number;
          commission: number;
        }
      >();
      const sectionRow = (sectionId: string) => {
        const existing = sectionMap.get(sectionId);
        if (existing) return existing;
        const row = {
          sectionId,
          sectionName:
            state.sections.find((section) => section.id === sectionId)?.name ??
            (sectionId === "__unassigned" ? "Unassigned" : "Section"),
          laborRevenue: 0,
          partsRevenue: 0,
          partsCost: 0,
          commission: 0,
        };
        sectionMap.set(sectionId, row);
        return row;
      };
      activeTasks.forEach((task) => {
        const row = sectionRow(task.sectionId ?? sectionFallback);
        const worker = state.workers.find((entry) => entry.id === task.workerId);
        row.laborRevenue += task.laborCost;
        row.commission += (task.laborCost * (worker?.commissionRate ?? 0)) / 100;
      });
      state.parts
        .filter(
          (part) =>
            part.jobCardId === job.id &&
            (part.status === "Issued" ||
              part.status === "Exchange Pending" ||
              part.status === "Return Pending"),
        )
        .forEach((part) => {
          const row = sectionRow(part.sectionId ?? sectionFallback);
          if (!part.includedInLabor && part.sellingPrice > 0) {
            row.partsRevenue += part.sellingPrice * partIssueQty(part);
          }
          row.partsCost += part.costPrice * partIssueQty(part);
        });
      const sectionBreakdown = Array.from(sectionMap.values());
      const distributed =
        activeTasks.length > 0
          ? activeTasks
          : [
              {
                id: uid("tsk"),
                jobCardId: jobId,
                name: "Workshop labour",
                laborCost: totals.labor,
                workerId: "",
                createdAt: now,
              },
            ];
      distributed.forEach((task, index) => {
        const worker = state.workers.find((w) => w.id === task.workerId);
        ledgerEntries.push({
          id: uid("led"),
          jobCardId: jobId,
          date: now,
          laborRevenue: task.laborCost,
          partsRevenue: index === 0 ? totals.parts : 0,
          partsCost: index === 0 ? totals.partsCost : 0,
          commission: (task.laborCost * (worker?.commissionRate ?? 0)) / 100,
          discount: index === 0 ? totals.discount : 0,
          paymentMethod: input.paymentMethod,
          workerId: task.workerId || undefined,
          driverCommission: index === 0 ? driverCommission : 0,
          insuranceClaimId: job.insuranceClaimId,
          sectionBreakdown: index === 0 ? sectionBreakdown : undefined,
          description: `${job.vehicleNo} — ${task.name}`,
        });
      });
      let nextCredits = state.customerCredits;
      if (input.paymentMethod === "Credit") {
        nextCredits = [
          {
            id: uid("CR"),
            jobCardId: jobId,
            customerName: job.customerName,
            vehicleNo: job.vehicleNo,
            phone: job.phone,
            total: balanceDue,
            paid: 0,
            creditDate: now,
            dueDate: dueDate ?? isoDaysFrom(now, 30),
            graceDays: input.graceDays ?? 30,
            status: "Unpaid" as const,
          },
          ...state.customerCredits,
        ];
      }
      setState((prev) => ({
        ...prev,
        jobCards: prev.jobCards.map((j) =>
          j.id === jobId
            ? {
                ...j,
                status: paidStatus,
                paymentMethod: input.paymentMethod,
                discount: input.discount,
                discountType: input.discountType,
                creditGraceDays: input.graceDays,
                paidAt: now,
                chequeId,
                customerTinNumber: input.customerTinNumber?.trim() || j.customerTinNumber,
                isVatInvoice: Boolean(input.isVatInvoice),
                vatRateApplied: vatRate,
                vatAmount,
              }
            : j,
        ),
        ledger: [...ledgerEntries, ...prev.ledger],
        customerCheques: chequeRecord
          ? [chequeRecord, ...prev.customerCheques]
          : prev.customerCheques,
        bankTransactions: bankTransaction
          ? [bankTransaction, ...prev.bankTransactions]
          : prev.bankTransactions,
        customerCredits: nextCredits,
        insuranceJobs:
          input.paymentMethod === "Insurance" && job.insuranceClaimId
            ? prev.insuranceJobs.map((claim) =>
                claim.id === job.insuranceClaimId
                  ? {
                      ...claim,
                      insuranceBillAmount:
                        Math.round(
                          (totals.insuranceSubtotal - totals.discount + totals.vat) * 100,
                        ) / 100,
                      customerBillNo: job.id,
                      customerBillAmount: 0,
                      isVatInvoice: Boolean(input.isVatInvoice),
                      vatRateApplied: vatRate,
                      vatAmount,
                      status: "Awaiting Payment" as const,
                    }
                  : claim,
              )
            : prev.insuranceJobs,
        notifications: notify(
          prev,
          ["PRO", "Accounting"],
          input.paymentMethod === "Credit"
            ? "Gate clearance: released on credit"
            : input.paymentMethod === "Cheque"
              ? "Gate clearance: dated cheque held in safe"
              : "Gate clearance: vehicle paid",
          `${job.id} · ${job.vehicleNo} is ready for handover.${input.paymentMethod === "Cheque" ? ` Cheque ${input.cheque?.chequeNo} must clear before funds are released.` : ""}`,
          "high",
          "/gate",
          { vehicleNo: job.vehicleNo, eventType: "payment" },
        ),
      }));
      return { ok: true };
    },
    [
      state.jobCards,
      state.tasks,
      state.parts,
      state.workers,
      state.sections,
      state.customerCredits,
      state.advancePayments,
      state.users,
      state.currentUserId,
      state.settings.defaultVatRate,
      state.vehicleBills,
    ],
  );

  const dispatchJob = useCallback((jobId: string) => {
    const dispatchedJob = state.jobCards.find((entry) => entry.id === jobId);
    setState((prev) => {
      const job = prev.jobCards.find((j) => j.id === jobId);
      if (!job) return prev;
      const now = new Date();
      const nowISO = now.toISOString();
      let marketing = prev.marketing;
      if (job.repairType === "Periodic Service") {
        const previous = prev.jobCards
          .filter(
            (j) =>
              j.id !== job.id &&
              j.vehicleNo === job.vehicleNo &&
              j.repairType === "Periodic Service" &&
              j.dispatchedAt,
          )
          .sort((a, b) => (b.dispatchedAt ?? "").localeCompare(a.dispatchedAt ?? ""))[0];
        const gap = previous?.dispatchedAt ? daysBetween(previous.dispatchedAt, nowISO) : 0;
        const cycle = gap > 5 ? gap : 90;
        if (
          !prev.marketing.some(
            (m) =>
              m.vehicleNo === job.vehicleNo &&
              m.triggerType === "Periodic Cycle" &&
              m.status === "Pending",
          )
        ) {
          marketing = [
            {
              id: uid("mkt"),
              vehicleNo: job.vehicleNo,
              customerName: job.customerName,
              phone: job.phone,
              triggerType: "Periodic Cycle",
              targetDate: isoDaysFrom(now, cycle),
              dispatchDate: nowISO,
              readyAt: isoDaysFrom(now, 2),
              status: "Pending",
              avgCycleDays: cycle,
              createdAt: nowISO,
            },
            ...prev.marketing,
          ];
        }
      } else {
        const rounded = Math.ceil(job.mileage / 5000) * 5000;
        const nextMilestone = rounded === job.mileage ? rounded + 5000 : rounded;
        if (
          nextMilestone - job.mileage <= 300 &&
          !prev.marketing.some(
            (m) =>
              m.vehicleNo === job.vehicleNo &&
              m.triggerType === "Mileage Milestone" &&
              m.status === "Pending",
          )
        ) {
          marketing = [
            {
              id: uid("mkt"),
              vehicleNo: job.vehicleNo,
              customerName: job.customerName,
              phone: job.phone,
              triggerType: "Mileage Milestone",
              targetMileage: nextMilestone,
              dispatchDate: nowISO,
              readyAt: isoDaysFrom(now, 2),
              status: "Pending",
              createdAt: nowISO,
            },
            ...prev.marketing,
          ];
        }
      }
      const jobTasks = prev.tasks.filter((task) => task.jobCardId === job.id);
      const jobParts = prev.parts.filter((part) => part.jobCardId === job.id);
      const totals = jobTotals(job, prev.tasks, prev.parts, prev.workers);
      const serviceRecords = prev.serviceRecords.some(
        (record) => record.jobCardId === job.id,
      )
        ? prev.serviceRecords
        : [
            {
              id: uid("svc"),
              jobCardId: job.id,
              vehicleNo: job.vehicleNo,
              make: job.make,
              model: job.model,
              customerName: job.customerName,
              date: nowISO,
              mileage: job.mileage,
              repairType: job.repairType,
              tasks: jobTasks.map((task) => ({
                name: task.name,
                workerId: task.workerId,
                workerName:
                  prev.workers.find((worker) => worker.id === task.workerId)?.fullName ??
                  "Unassigned",
                laborCost: task.laborCost,
              })),
              parts: jobParts.map((partEntry) => ({
                itemName: partEntry.itemName,
                supplierId: partEntry.supplierId,
                supplierInvoiceNo: partEntry.supplierInvoiceNo,
                qty: partIssueQty(partEntry),
                sellingPrice: partEntry.sellingPrice,
                status: partEntry.status,
              })),
              total: totals.total,
            },
            ...prev.serviceRecords,
          ];
      return {
        ...prev,
        jobCards: prev.jobCards.map((j) =>
          j.id === jobId
            ? { ...j, status: "Dispatched" as const, dispatchedAt: nowISO }
            : j,
        ),
        marketing,
        serviceRecords,
        notifications: [
          ...(job.billingOverrideReason
            ? notify(
                { ...prev, marketing },
                ["Owner", "Cashier", "Accounting"],
                "Vehicle exited on PRO override",
                `${job.vehicleNo} left the gate with an unpaid balance. Override by ${job.billingOverrideBy ?? "PRO"}: ${job.billingOverrideReason}`,
                "critical",
                "/accounting",
                { vehicleNo: job.vehicleNo, eventType: "payment" },
              )
            : []),
          ...notify(
            { ...prev, marketing },
            ["Owner", "PRO"],
            "Vehicle handed over",
            `${job.vehicleNo} has left the workshop. Any 2-day follow-up has been queued in Marketing.`,
            "normal",
            "/marketing",
            { vehicleNo: job.vehicleNo, eventType: "job" },
          ),
        ],
      };
    });
    if (dispatchedJob) {
      queueWhatsApp(
        dispatchedJob.phone,
        handoverMessage(dispatchedJob, state.settings),
        state.settings,
      );
    }
  }, [state.jobCards, state.settings]);

  const overrideBillingGate = useCallback(
    (jobId: string, reason: string): ActionResult => {
      const job = state.jobCards.find((entry) => entry.id === jobId);
      if (!job) return { ok: false, message: "Job card not found." };
      if (job.status !== "Repair Completed") {
        return {
          ok: false,
          message: "Only a completed job that is waiting for billing can be overridden.",
        };
      }
      const cleanReason = reason.trim();
      if (cleanReason.length < 8) {
        return { ok: false, message: "Enter a clear reason (at least 8 characters) for the override." };
      }
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      if (!user || (!user.isOwner && !user.departments.includes("PRO"))) {
        return { ok: false, message: "Only the PRO or owner can override the billing gate." };
      }
      const totals = jobTotals(job, state.tasks, state.parts, state.workers);
      const now = new Date().toISOString();
      const dueDate = isoDaysFrom(now, 7);
      const existingCredit = state.customerCredits.find(
        (entry) => entry.jobCardId === job.id && entry.status !== "Settled",
      );
      setState((prev) => ({
        ...prev,
        jobCards: prev.jobCards.map((entry) =>
          entry.id === job.id
            ? {
                ...entry,
                status: "Released on Credit" as const,
                paymentMethod: "Credit" as const,
                creditGraceDays: 7,
                billingOverrideReason: cleanReason,
                billingOverrideBy: user.name,
                billingOverrideAt: now,
              }
            : entry,
        ),
        customerCredits: existingCredit
          ? prev.customerCredits
          : [
              {
                id: uid("CR"),
                jobCardId: job.id,
                customerName: job.customerName,
                vehicleNo: job.vehicleNo,
                phone: job.phone,
                total: totals.total,
                paid: 0,
                creditDate: now,
                dueDate,
                graceDays: 7,
                status: "Unpaid" as const,
              },
              ...prev.customerCredits,
            ],
        notifications: notify(
          prev,
          ["Owner", "Cashier", "Accounting"],
          "PRO billing override — vehicle released",
          `${job.vehicleNo} was released without payment. Reason: ${cleanReason}. Recorded by ${user.name}; a 7-day credit balance of LKR ${totals.total.toLocaleString()} was opened.`,
          "critical",
          "/accounting",
          { vehicleNo: job.vehicleNo, eventType: "payment" },
        ),
      }));
      return { ok: true, reference: job.id };
    },
    [state.jobCards, state.tasks, state.parts, state.workers, state.users, state.currentUserId, state.customerCredits],
  );

  const addVehicleBill = useCallback(
    (input: {
      jobCardId: string;
      kind: VehicleBill["kind"];
      billNo: string;
      amount: number;
      sectionId?: string;
      claimId?: string;
      insurerId?: string;
      notes?: string;
      taskIds?: string[];
      partIds?: string[];
      laborSubtotal?: number;
      partsSubtotal?: number;
      discount?: number;
      vatRate?: number;
      vatAmount?: number;
      advance?: number;
      policyExcess?: number;
      depreciation?: number;
      netPayable?: number;
    }): ActionResult => {
      const job = state.jobCards.find((entry) => entry.id === input.jobCardId);
      if (!job) return { ok: false, message: "Job card not found." };
      const billNo = input.billNo.trim();
      if (!billNo) return { ok: false, message: "Enter a bill number." };
      const taskIds = input.taskIds ?? [];
      const partIds = input.partIds ?? [];
      if (taskIds.length === 0 && partIds.length === 0) {
        return { ok: false, message: "Tick at least one task or part for this bill." };
      }
      const netPayable = Number.isFinite(input.netPayable)
        ? Number(input.netPayable)
        : Number(input.amount);
      if (!Number.isFinite(netPayable) || netPayable <= 0) {
        return { ok: false, message: "The bill net payable must be greater than zero." };
      }
      if (state.vehicleBills.some((entry) => entry.billNo.toLowerCase() === billNo.toLowerCase())) {
        return { ok: false, message: "That bill number is already recorded." };
      }
      const lockedTask = state.tasks.find(
        (task) => taskIds.includes(task.id) && task.assignedBillId,
      );
      const lockedPart = state.parts.find(
        (part) => partIds.includes(part.id) && part.assignedBillId,
      );
      if (lockedTask || lockedPart) {
        const bill = state.vehicleBills.find(
          (entry) => entry.id === (lockedTask?.assignedBillId ?? lockedPart?.assignedBillId),
        );
        return {
          ok: false,
          message: `${lockedTask?.name ?? lockedPart?.itemName ?? "That item"} is already billed${
            bill ? ` on ${bill.billNo}` : ""
          }. Untick it or remove the earlier bill first.`,
        };
      }
      if (input.kind !== "Insurance") {
        const customerBrought = state.parts.find(
          (part) =>
            partIds.includes(part.id) && part.partSource === "Customer_Brought",
        );
        if (customerBrought) {
          return {
            ok: false,
            message: `${customerBrought.itemName} was supplied by the customer. It can only be priced on the insurance bill, never charged to the customer.`,
          };
        }
      }
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const bill: VehicleBill = {
        id: uid("bill"),
        jobCardId: job.id,
        vehicleNo: job.vehicleNo,
        kind: input.kind,
        billNo,
        sectionId: input.sectionId,
        amount: Math.round(netPayable * 100) / 100,
        createdAt: new Date().toISOString(),
        createdBy: user?.name,
        claimId: input.claimId,
        insurerId: input.insurerId,
        notes: input.notes?.trim() || undefined,
        taskIds,
        partIds,
        laborSubtotal: input.laborSubtotal,
        partsSubtotal: input.partsSubtotal,
        discount: input.discount,
        vatRate: input.vatRate,
        vatAmount: input.vatAmount,
        advance: input.advance,
        policyExcess: input.policyExcess,
        depreciation: input.depreciation,
        netPayable: Math.round(netPayable * 100) / 100,
        status: "Draft",
      };
      setState((prev) => ({
        ...prev,
        vehicleBills: [bill, ...prev.vehicleBills],
        tasks: prev.tasks.map((task) =>
          taskIds.includes(task.id) ? { ...task, assignedBillId: bill.id } : task,
        ),
        parts: prev.parts.map((part) =>
          partIds.includes(part.id) ? { ...part, assignedBillId: bill.id } : part,
        ),
        notifications: notify(
          prev,
          ["Cashier", "Accounting"],
          `${input.kind} draft bill saved`,
          `${job.vehicleNo} · ${billNo} · ${money(netPayable)}. ${taskIds.length} task(s) and ${partIds.length} part(s) locked to this draft. Cashier sets VAT and sends it.`,
          "normal",
          "/cashier",
          { vehicleNo: job.vehicleNo, eventType: "payment" },
        ),
      }));
      return { ok: true, reference: bill.id };
    },
    [state.jobCards, state.vehicleBills, state.tasks, state.parts, state.users, state.currentUserId],
  );

  const prepareVehicleBill = useCallback(
    (
      billId: string,
      input: { discount: number; vatRate: number },
    ): ActionResult => {
      const bill = state.vehicleBills.find((entry) => entry.id === billId);
      if (!bill) return { ok: false, message: "Bill not found." };
      if (bill.status === "Paid" || bill.status === "Release Order") {
        return { ok: false, message: "This bill is already settled." };
      }
      if (bill.status !== "Draft") {
        return {
          ok: false,
          message:
            "This bill has already been sent. VAT is fixed before sending, so it can no longer be changed.",
        };
      }
      const job = state.jobCards.find((entry) => entry.id === bill.jobCardId);
      if (!job) return { ok: false, message: "Job card not found." };
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const now = new Date().toISOString();
      const billTasks = state.tasks.filter((task) => bill.taskIds?.includes(task.id));
      const billParts = state.parts.filter((part) => bill.partIds?.includes(part.id));
      const laborRevenue = billTasks.reduce((sum, task) => sum + task.laborCost, 0);
      const dueParts =
        bill.kind === "Insurance"
          ? billParts
          : billParts.filter((part) => part.partSource !== "Customer_Brought");
      const partsSubtotal = dueParts.reduce(
        (sum, part) => sum + part.sellingPrice * partIssueQty(part),
        0,
      );
      const hasLines = billTasks.length > 0 || billParts.length > 0;
      const isShortfall = Boolean(bill.parentBillId);
      // Auto-created shortfall bills store their payable total without line items.
      const gross =
        isShortfall && !hasLines
          ? Math.max(0, Math.round((bill.netPayable ?? bill.amount ?? 0) * 100) / 100)
          : laborRevenue + partsSubtotal;
      const discount = Math.max(
        0,
        Math.min(
          Math.round((Number(input.discount) || 0) * 100) / 100,
          gross,
        ),
      );
      // VAT belongs to the shortfall parent bill, never to the adjustment bill.
      const vatRate =
        isShortfall && !hasLines
          ? 0
          : Math.max(0, Math.round((Number(input.vatRate) || 0) * 100) / 100);
      const supply = Math.max(0, gross - discount);
      const vatAmount =
        vatRate === 0 ? 0 : Math.round(supply * vatRate) / 100;
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
      if (net <= 0) return { ok: false, message: "This bill has no payable amount." };
      const status =
        bill.kind === "Insurance" ? ("Awaiting Release Order" as const) : ("Unpaid" as const);
      const sendLabel =
        bill.kind === "Insurance" ? "sent to the insurer" : "ready for customer billing";
      setState((prev) => ({
        ...prev,
        vehicleBills: prev.vehicleBills.map((entry) =>
          entry.id === bill.id
            ? {
                ...entry,
                ...(hasLines
                  ? {
                      laborSubtotal: Math.round(laborRevenue * 100) / 100,
                      partsSubtotal: Math.round(partsSubtotal * 100) / 100,
                    }
                  : {}),
                discount,
                vatRate,
                vatAmount,
                netPayable: net,
                amount: net,
                status,
                sentAt: now,
                sentBy: user?.name,
              }
            : entry,
        ),
        insuranceJobs: bill.claimId
          ? prev.insuranceJobs.map((claim) => {
              if (claim.id !== bill.claimId) return claim;
              if (bill.kind === "Insurance") {
                return {
                  ...claim,
                  insuranceBillNo: bill.billNo,
                  insuranceBillAmount: net,
                  insuranceBillAt: now,
                  isVatInvoice: vatRate > 0,
                  vatRateApplied: vatRate,
                  vatAmount,
                  status:
                    claim.status === "Settled"
                      ? ("Settled" as const)
                      : ("Awaiting Payment" as const),
                };
              }
              if (bill.kind === "Customer") {
                return {
                  ...claim,
                  customerBillNo: bill.billNo,
                  customerBillAmount: net,
                };
              }
              return claim;
            })
          : prev.insuranceJobs,
        notifications: notify(
          prev,
          ["Cashier", "Accounting"],
          `${bill.kind} bill ${sendLabel}`,
          `${job.vehicleNo} · ${bill.billNo} · ${money(net)}${
            vatRate > 0 ? ` including VAT ${money(vatAmount)} at ${vatRate}%` : " with no VAT"
          }.`,
          "normal",
          "/cashier",
          { vehicleNo: job.vehicleNo, eventType: "payment" },
        ),
      }));
      return { ok: true, reference: bill.id };
    },
    [
      state.vehicleBills,
      state.jobCards,
      state.tasks,
      state.parts,
      state.users,
      state.currentUserId,
    ],
  );

  const removeVehicleBill = useCallback((billId: string) => {
    setState((prev) => {
      const bill = prev.vehicleBills.find((entry) => entry.id === billId);
      if (bill && (bill.status === "Paid" || bill.status === "Release Order")) {
        return prev;
      }
      return {
        ...prev,
        vehicleBills: prev.vehicleBills.filter((entry) => entry.id !== billId),
        tasks: prev.tasks.map((task) =>
          task.assignedBillId === billId ? { ...task, assignedBillId: undefined } : task,
        ),
        parts: prev.parts.map((part) =>
          part.assignedBillId === billId ? { ...part, assignedBillId: undefined } : part,
        ),
      };
    });
  }, []);

  const settleVehicleBill = useCallback(
    (
      billId: string,
      input: {
        method: VehicleBillPaymentMethod;
        amount?: number;
        releaseOrderNo?: string;
        releaseOrderAmount?: number;
        /** Cashier discount in rupees, applied before VAT. */
        discount?: number;
      },
    ): ActionResult => {
      const bill = state.vehicleBills.find((entry) => entry.id === billId);
      if (!bill) return { ok: false, message: "Bill not found." };
      if (bill.status === "Paid" || bill.status === "Release Order") {
        return { ok: false, message: "This bill is already settled." };
      }
      const job = state.jobCards.find((entry) => entry.id === bill.jobCardId);
      if (!job) return { ok: false, message: "Job card not found." };
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const now = new Date().toISOString();

      const billTasks = state.tasks.filter((task) => bill.taskIds?.includes(task.id));
      const billParts = state.parts.filter((part) => bill.partIds?.includes(part.id));
      const workshopParts = billParts.filter(
        (part) => part.partSource !== "Customer_Brought",
      );
      const laborRevenue = billTasks.reduce((sum, task) => sum + task.laborCost, 0);
      const dueParts = bill.kind === "Insurance" ? billParts : workshopParts;
      const partsSubtotal = dueParts.reduce(
        (sum, part) => sum + part.sellingPrice * partIssueQty(part),
        0,
      );
      const partsRevenue = workshopParts.reduce(
        (sum, part) => sum + part.sellingPrice * partIssueQty(part),
        0,
      );
      const partsCost = workshopParts.reduce(
        (sum, part) => sum + part.costPrice * partIssueQty(part),
        0,
      );
      const hasLines = billTasks.length > 0 || billParts.length > 0;
      const isShortfall = Boolean(bill.parentBillId);
      // Auto-created shortfall bills store the payable total without line items.
      const gross =
        isShortfall && !hasLines
          ? Math.max(0, Math.round((bill.netPayable ?? bill.amount ?? 0) * 100) / 100)
          : laborRevenue + partsSubtotal;
      const appliedDiscount = Math.max(
        0,
        Math.min(
          Math.round((input.discount ?? bill.discount ?? 0) * 100) / 100,
          gross,
        ),
      );
      const appliedVatRate =
        isShortfall && !hasLines
          ? 0
          : Math.max(
              0,
              bill.vatRate ??
                (job.isVatInvoice ? state.settings.defaultVatRate ?? 18 : 0),
            );
      const supply = Math.max(0, gross - appliedDiscount);
      const vatAmount =
        isShortfall || appliedVatRate === 0
          ? 0
          : Math.round(supply * appliedVatRate) / 100;
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
      if (net <= 0) return { ok: false, message: "This bill has no payable amount." };

      const commission = billTasks.reduce((sum, task) => {
        const worker = state.workers.find((entry) => entry.id === task.workerId);
        return sum + (task.laborCost * (worker?.commissionRate ?? 0)) / 100;
      }, 0);
      const discount = appliedDiscount;
      const driverCommission = driverCommissionFor(job, {
        labor: laborRevenue,
        total: Math.max(0, laborRevenue + partsRevenue - discount),
      });
      const chargeFields = {
        ...(hasLines
          ? {
              laborSubtotal: Math.round(laborRevenue * 100) / 100,
              partsSubtotal: Math.round(partsSubtotal * 100) / 100,
            }
          : {}),
        discount: appliedDiscount,
        vatRate: appliedVatRate,
        vatAmount,
        netPayable: net,
        amount: net,
      };

      if (input.method === "Release Order") {
        if (bill.kind !== "Insurance") {
          return {
            ok: false,
            message: "Only insurance bills can be settled with a release order.",
          };
        }
        const releaseOrderNo = input.releaseOrderNo?.trim();
        if (!releaseOrderNo) {
          return { ok: false, message: "Enter the insurer release order number." };
        }
        const approved = Math.round(
          (input.releaseOrderAmount ?? net) * 100,
        ) / 100;
        if (!Number.isFinite(approved) || approved <= 0) {
          return { ok: false, message: "Enter the approved release order amount." };
        }
        const paidAmount = Math.min(net, approved);
        const grossShortfall = Math.max(
          0,
          Math.round((net - paidAmount) * 100) / 100,
        );
        const customerBroughtValue = billParts
          .filter((part) => part.partSource === "Customer_Brought")
          .reduce((sum, part) => sum + part.sellingPrice * partIssueQty(part), 0);
        const customerPartsCredit = Math.min(
          grossShortfall,
          Math.round(
            customerBroughtValue * (1 + Math.max(0, appliedVatRate) / 100) * 100,
          ) / 100,
        );
        const shortfall = Math.max(
          0,
          Math.round((grossShortfall - customerPartsCredit) * 100) / 100,
        );
        const shortfallId = shortfall > 0.005 ? uid("bill") : undefined;
        let shortfallBillNo = "";
        if (shortfallId) {
          const count = state.vehicleBills.filter(
            (entry) => entry.jobCardId === bill.jobCardId && entry.kind === "Additional",
          ).length;
          let next = count + 1;
          shortfallBillNo = `ADD-${bill.jobCardId}-${next}`;
          while (state.vehicleBills.some((entry) => entry.billNo === shortfallBillNo)) {
            next += 1;
            shortfallBillNo = `ADD-${bill.jobCardId}-${next}`;
          }
        }
        const ledgerEntry = {
          id: uid("led"),
          jobCardId: job.id,
          date: now,
          laborRevenue,
          partsRevenue,
          partsCost,
          commission,
          discount,
          paymentMethod: "Insurance" as const,
          settlementAmount: paidAmount,
          driverCommission,
          insuranceClaimId: job.insuranceClaimId,
          description: `${job.vehicleNo} — ${bill.kind} bill ${bill.billNo}`,
        };
        setState((prev) => {
          const nextBills = prev.vehicleBills.map((entry) =>
            entry.id === bill.id
              ? {
                  ...entry,
                  ...chargeFields,
                  status: "Release Order" as const,
                  paidAmount,
                  paidAt: now,
                  paidBy: user?.name,
                  paymentMethod: "Release Order" as const,
                  releaseOrderNo,
                  releaseOrderAmount: approved,
                  releaseOrderAt: now,
                  shortfallBillId: shortfallId,
                  customerPartsCredit:
                    customerPartsCredit > 0 ? customerPartsCredit : undefined,
                }
              : entry,
          );
          if (shortfallId) {
            nextBills.unshift({
              id: shortfallId,
              jobCardId: job.id,
              vehicleNo: job.vehicleNo,
              kind: "Additional",
              billNo: shortfallBillNo,
              amount: shortfall,
              netPayable: shortfall,
              createdAt: now,
              createdBy: user?.name,
              claimId: bill.claimId ?? job.insuranceClaimId,
              insurerId: bill.insurerId,
              sectionId: bill.sectionId,
              customerPartsCredit:
                customerPartsCredit > 0 ? customerPartsCredit : undefined,
              notes:
                customerPartsCredit > 0
                  ? `Release order ${releaseOrderNo} shortfall (penalty / under-value). Customer-supplied parts already paid ${money(
                      customerPartsCredit,
                    )} are credited, so the customer pays the remaining ${money(
                      shortfall,
                    )}.`
                  : `Release order ${releaseOrderNo} shortfall (penalty / under-value) — payable by the customer.`,
              status: "Unpaid",
              parentBillId: bill.id,
            });
          }
          const jobBills = nextBills.filter((entry) => entry.jobCardId === job.id);
          const allSettled =
            jobBills.length > 0 &&
            jobBills.every(
              (entry) => entry.status === "Paid" || entry.status === "Release Order",
            );
          const readyJob = allSettled && job.status === "Repair Completed";
          const notifications = notify(
            prev,
            ["Cashier", "Accounting", "PRO"],
            shortfall > 0.005
              ? "Insurance bill released — shortfall moved to customer"
              : "Insurance bill released",
            `${job.vehicleNo} · ${bill.billNo} · release order ${releaseOrderNo} for ${money(paidAmount)}${
              shortfall > 0.005
                ? `. Shortfall ${money(shortfall)} added to ${shortfallBillNo} for the customer.`
                : customerPartsCredit > 0
                  ? `. Customer-supplied parts already paid ${money(
                      customerPartsCredit,
                    )} were credited, so no shortfall bill is needed.`
                  : "."
            }${readyJob ? " All separate bills are settled — vehicle ready for gate release." : ""}`,
            shortfall > 0.005 || readyJob ? "high" : "normal",
            readyJob ? "/gate" : "/cashier",
            { vehicleNo: job.vehicleNo, eventType: "payment" },
          );
          return {
            ...prev,
            vehicleBills: nextBills,
            ledger: [ledgerEntry, ...prev.ledger],
            insuranceJobs: prev.insuranceJobs.map((claim) =>
              claim.id === bill.claimId
                ? {
                    ...claim,
                    releaseOrderNo,
                    releaseOrderReceivedAt: now,
                    insuranceBillNo: claim.insuranceBillNo || bill.billNo,
                    insuranceBillAmount: claim.insuranceBillAmount ?? net,
                    insuranceBillAt: claim.insuranceBillAt ?? now,
                    status: claim.status === "Settled" ? "Settled" : "Awaiting Payment",
                  }
                : claim,
            ),
            jobCards: readyJob
              ? prev.jobCards.map((entry) =>
                  entry.id === job.id
                    ? {
                        ...entry,
                        status: "Paid" as const,
                        paidAt: now,
                        paymentMethod: "Insurance" as const,
                      }
                    : entry,
                )
              : prev.jobCards,
            notifications,
          };
        });
        return { ok: true, reference: shortfallId };
      }

      if (bill.kind === "Insurance") {
        return {
          ok: false,
          message: "Settle the insurance bill with the insurer release order.",
        };
      }
      const amount = Math.round((input.amount ?? net) * 100) / 100;
      if (!Number.isFinite(amount) || amount < net - 0.5) {
        return {
          ok: false,
          message: `Collect the full net payable of ${money(net)}.`,
        };
      }
      const ledgerEntry = {
        id: uid("led"),
        jobCardId: job.id,
        date: now,
        laborRevenue: isShortfall ? 0 : laborRevenue,
        partsRevenue: isShortfall ? 0 : partsRevenue,
        partsCost: isShortfall ? 0 : partsCost,
        commission: isShortfall ? 0 : commission,
        discount: isShortfall ? 0 : discount,
        paymentMethod: (isShortfall
          ? "Insurance Settlement"
          : input.method) as "Cash" | "Card" | "Bank Transfer" | "Cheque" | "Insurance Settlement",
        settlementAmount: net,
        driverCommission: isShortfall ? 0 : driverCommission,
        insuranceClaimId: job.insuranceClaimId,
        description: isShortfall
          ? `${job.vehicleNo} — release order shortfall ${bill.billNo}`
          : `${job.vehicleNo} — ${bill.kind} bill ${bill.billNo}`,
      };
      setState((prev) => {
        const nextBills = prev.vehicleBills.map((entry) =>
          entry.id === bill.id
            ? {
                ...entry,
                ...chargeFields,
                status: "Paid" as const,
                paidAmount: net,
                paidAt: now,
                paidBy: user?.name,
                paymentMethod: input.method,
              }
            : entry,
        );
        const jobBills = nextBills.filter((entry) => entry.jobCardId === job.id);
        const allSettled =
          jobBills.length > 0 &&
          jobBills.every(
            (entry) => entry.status === "Paid" || entry.status === "Release Order",
          );
        const readyJob = allSettled && job.status === "Repair Completed";
        const notifications = notify(
          prev,
          readyJob ? ["PRO", "Accounting"] : ["Cashier", "Accounting"],
          readyJob ? "All separate bills settled — gate release ready" : "Customer bill paid",
          `${job.vehicleNo} · ${bill.billNo} · ${money(net)} collected by ${input.method}${
            readyJob
              ? ". Insurance and customer bills are settled; the vehicle can be released at the gate."
              : ". The insurer release order is still pending."
          }`,
          readyJob ? "high" : "normal",
          readyJob ? "/gate" : "/cashier",
          { vehicleNo: job.vehicleNo, eventType: "payment" },
        );
        return {
          ...prev,
          vehicleBills: nextBills,
          ledger: [ledgerEntry, ...prev.ledger],
          jobCards: readyJob
            ? prev.jobCards.map((entry) =>
                entry.id === job.id
                  ? {
                      ...entry,
                      status: "Paid" as const,
                      paidAt: now,
                      paymentMethod:
                        input.method === "Cheque"
                          ? ("Cheque" as const)
                          : input.method === "Card"
                            ? ("Card" as const)
                            : ("Cash" as const),
                    }
                  : entry,
              )
            : prev.jobCards,
          notifications,
        };
      });
      return { ok: true };
    },
    [
      state.vehicleBills,
      state.jobCards,
      state.tasks,
      state.parts,
      state.workers,
      state.users,
      state.currentUserId,
    ],
  );

  const sendMarketingReminder = useCallback((id: string) => {
    const reminder = state.marketing.find((entry) => entry.id === id);
    if (reminder) {
      const message =
        reminder.status === "Pending"
          ? marketingMessage(reminder, state.settings)
          : afterServiceFollowUpMessage(reminder, state.settings);
      queueWhatsApp(reminder.phone, message, state.settings);
    }
    setState((prev) => ({
      ...prev,
      marketing: prev.marketing.map((m) =>
        m.id === id ? { ...m, status: "Reminder Sent" as const } : m,
      ),
    }));
  }, [state.marketing, state.settings]);

  const markMarketingCompleted = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      marketing: prev.marketing.map((m) =>
        m.id === id ? { ...m, status: "Completed" as const } : m,
      ),
    }));
  }, []);

  const addExpense = useCallback(
    (category: ExpenseCategory, amount: number, description: string, date: string) => {
      const expense: Expense = {
        id: uid("exp"),
        category,
        amount,
        description,
        date: new Date(`${date}T12:00:00`).toISOString(),
      };
      setState((prev) => ({ ...prev, expenses: [expense, ...prev.expenses] }));
    },
    [],
  );

  const removeExpense = useCallback((expenseId: string) => {
    setState((prev) => ({
      ...prev,
      expenses: prev.expenses.filter((expense) => expense.id !== expenseId),
    }));
  }, []);

  const recordCreditPayment = useCallback(
    (
      creditId: string,
      input: {
        amount: number;
        method: "Cash" | "Card" | "Bank Transfer" | "Cheque";
        bankAccountId?: string;
        cheque?: ChequeDetails;
      },
    ): ActionResult => {
      const credit = state.customerCredits.find((c) => c.id === creditId);
      if (!credit) return { ok: false, message: "Credit record not found." };
      const value = Math.max(0, Math.min(input.amount, credit.total - credit.paid));
      if (value <= 0) return { ok: false, message: "Enter a valid payment amount." };
      if (input.method === "Cheque") {
        if (!input.cheque?.chequeNo.trim() || !input.cheque.bank.trim() || !input.cheque.branch.trim()) {
          return { ok: false, message: "Enter the cheque number, bank and branch." };
        }
        if (!input.cheque.chequeDate) {
          return { ok: false, message: "Enter the cheque date." };
        }
        if (Math.abs(input.cheque.amount - value) > 0.5) {
          return { ok: false, message: "The cheque amount must match the settlement amount." };
        }
      }
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const now = new Date().toISOString();
      const chequeId = input.method === "Cheque" ? uid("chq") : undefined;
      const chequeRecord: CustomerCheque | null =
        input.method === "Cheque" && input.cheque && chequeId
          ? {
              id: chequeId,
              source: "Credit",
              creditId,
              jobCardId: credit.jobCardId,
              customerName: credit.customerName,
              vehicleNo: credit.vehicleNo,
              phone: credit.phone,
              chequeNo: input.cheque.chequeNo.trim(),
              bank: input.cheque.bank.trim(),
              branch: input.cheque.branch.trim(),
              chequeDate: input.cheque.chequeDate,
              amount: value,
              status: "In_Safe",
              receivedAt: now,
              receivedBy: user?.name,
              bankAccountId: input.bankAccountId,
            }
          : null;
      const payment: CreditPayment = {
        id: uid("crp"),
        creditId,
        amount: value,
        method: input.method,
        date: now,
        chequeId,
        bankAccountId: input.bankAccountId,
        recordedBy: user?.name,
      };
      const bankTransaction: BankTransaction | null =
        input.bankAccountId && input.method !== "Cheque"
          ? {
              id: uid("btx"),
              accountId: input.bankAccountId,
              date: now,
              direction: "Credit_In",
              amount: value,
              category: "Credit Settlement",
              description: `${credit.customerName} · ${credit.vehicleNo}`,
              reference: creditId,
              linkedType: "Credit",
              linkedId: creditId,
              createdBy: user?.name,
            }
          : null;
      const newPaid = credit.paid + value;
      const settled = newPaid >= credit.total;
      setState((prev) => ({
        ...prev,
        customerCredits: prev.customerCredits.map((c) =>
          c.id === creditId
            ? {
                ...c,
                paid: newPaid,
                status: settled ? ("Settled" as const) : ("Partially Paid" as const),
              }
            : c,
        ),
        creditPayments: [payment, ...prev.creditPayments],
        customerCheques: chequeRecord
          ? [chequeRecord, ...prev.customerCheques]
          : prev.customerCheques,
        bankTransactions: bankTransaction
          ? [bankTransaction, ...prev.bankTransactions]
          : prev.bankTransactions,
        ledger: [
          {
            id: uid("led"),
            date: now,
            laborRevenue: 0,
            partsRevenue: 0,
            partsCost: 0,
            commission: 0,
            discount: 0,
            paymentMethod: "Credit Settlement",
            settlementAmount: value,
            description: `Credit settlement — ${credit.customerName} (${credit.vehicleNo})${input.method === "Cheque" ? " · dated cheque in safe" : ` · ${input.method}`}`,
          },
          ...prev.ledger,
        ],
      }));
      return {
        ok: true,
        message: settled
          ? `Credit fully settled. Send the thank-you note to ${credit.customerName}.`
          : `Payment recorded. Remaining balance: LKR ${(credit.total - newPaid).toLocaleString()}.`,
      };
    },
    [state.customerCredits, state.users, state.currentUserId],
  );

  const addSupplier = useCallback((name: string, phone: string, contactPerson: string) => {
    setState((prev) => ({
      ...prev,
      suppliers: [
        ...prev.suppliers,
        { id: uid("sup"), name, phone, contactPerson, outstandingCredit: 0 },
      ],
    }));
  }, []);

  const addPurchase = useCallback((purchase: Omit<SupplierPurchase, "id">) => {
    setState((prev) => ({
      ...prev,
      purchases: [{ ...purchase, id: `PO-${8843 + prev.purchases.length}` }, ...prev.purchases],
      suppliers: prev.suppliers.map((s) =>
        s.id === purchase.supplierId && purchase.type === "Credit" && purchase.status === "Unpaid"
          ? { ...s, outstandingCredit: s.outstandingCredit + purchase.amount }
          : s,
      ),
    }));
  }, []);

  const addBulkPurchase = useCallback(
    (input: {
      supplierId: string;
      invoiceNo: string;
      type: "Cash" | "Credit";
      creditDays: number;
      purchaseDate: string;
      dueDate?: string;
      lines: PurchaseLine[];
      description: string;
    }): ActionResult => {
      const supplier = state.suppliers.find((entry) => entry.id === input.supplierId);
      if (!supplier) return { ok: false, message: "Choose the supplier." };
      if (!input.invoiceNo.trim()) return { ok: false, message: "Enter the supplier invoice number." };
      const cleanLines = input.lines.filter((line) => line.itemId && line.qty > 0);
      if (cleanLines.length === 0) {
        return { ok: false, message: "Add at least one part row with a quantity." };
      }
      for (const line of cleanLines) {
        const item = state.inventory.find((entry) => entry.id === line.itemId);
        if (!item) return { ok: false, message: "A selected inventory item no longer exists." };
        if (line.costPrice < 0) return { ok: false, message: `Enter a valid cost for ${item.name}.` };
      }
      const amount = cleanLines.reduce((sum, line) => sum + line.qty * line.costPrice, 0);
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const now = new Date().toISOString();
      const purchaseDate = input.purchaseDate
        ? new Date(`${input.purchaseDate}T12:00:00`).toISOString()
        : now;
      const dueDate =
        input.type === "Credit"
          ? input.dueDate
            ? new Date(`${input.dueDate}T12:00:00`).toISOString()
            : isoDaysFrom(purchaseDate, input.creditDays || 30)
          : undefined;
      const purchase: SupplierPurchase = {
        id: `PO-${8843 + state.purchases.length}`,
        supplierId: input.supplierId,
        invoiceNo: input.invoiceNo.trim(),
        amount,
        type: input.type,
        creditDays: input.creditDays,
        purchaseDate,
        dueDate,
        status: "Unpaid",
        description:
          input.description.trim() ||
          cleanLines.map((line) => line.itemName).join(", ").slice(0, 180),
        lines: cleanLines,
        goodsConfirmedBy: user?.name,
        goodsConfirmedAt: now,
        paymentMethod: undefined,
      };
      const movements: StockMovement[] = cleanLines.map((line) => ({
        id: uid("stk"),
        itemId: line.itemId,
        itemName: line.itemName,
        date: now,
        type: "Purchase",
        qty: line.qty,
        reference: purchase.invoiceNo,
        note: `Bulk purchase ${purchase.id}`,
        createdBy: user?.name,
      }));
      setState((prev) => ({
        ...prev,
        purchases: [purchase, ...prev.purchases],
        inventory: prev.inventory.map((item) => {
          const line = cleanLines.find((entry) => entry.itemId === item.id);
          if (!line) return item;
          return {
            ...item,
            stock: item.stock + line.qty,
            lastSellingPrice: line.sellingPrice ?? item.lastSellingPrice,
          };
        }),
        stockMovements: [...movements, ...prev.stockMovements],
        suppliers: prev.suppliers.map((entry) =>
          entry.id === input.supplierId && input.type === "Credit"
            ? { ...entry, outstandingCredit: entry.outstandingCredit + amount }
            : entry,
        ),
        notifications: notify(
          prev,
          ["Accounting"],
          "Supplier invoice awaiting payment",
          `${supplier.name} · ${purchase.invoiceNo} · LKR ${amount.toLocaleString()}. Goods received and confirmed by ${user?.name ?? "Stores"}.`,
          "high",
          "/accounting",
          { eventType: "payment" },
        ),
      }));
      return { ok: true, reference: purchase.id };
    },
    [state.suppliers, state.inventory, state.purchases.length, state.users, state.currentUserId],
  );

  const markPurchasePaid = useCallback(
    (
      purchaseId: string,
      data: {
        method: "Cash" | "Bank Transfer" | "Cheque";
        bankAccountId?: string;
        cheque?: ChequeDetails;
      },
    ): ActionResult => {
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const canPay =
        user?.isOwner ||
        user?.departments.includes("Accounting") ||
        user?.departments.includes("Cashier");
      if (!canPay) {
        return {
          ok: false,
          message: "Only Accounting or Cashier can mark a supplier invoice as paid.",
        };
      }
      const purchase = state.purchases.find((p) => p.id === purchaseId);
      if (!purchase) return { ok: false, message: "Purchase not found." };
      if (purchase.status === "Paid") return { ok: false, message: "This invoice is already paid." };
      if (data.method === "Cheque") {
        if (!data.cheque?.chequeNo.trim() || !data.cheque.bank.trim() || !data.cheque.branch.trim()) {
          return { ok: false, message: "Enter the cheque number, bank and branch." };
        }
        if (!data.cheque.chequeDate) return { ok: false, message: "Enter the cheque date." };
      }
      const now = new Date().toISOString();
      const chequeId = data.method === "Cheque" ? uid("schq") : undefined;
      const chequeRecord: SupplierCheque | null =
        data.method === "Cheque" && data.cheque && chequeId
          ? {
              id: chequeId,
              supplierId: purchase.supplierId,
              purchaseId: purchase.id,
              chequeNo: data.cheque.chequeNo.trim(),
              bank: data.cheque.bank.trim(),
              branch: data.cheque.branch.trim(),
              chequeDate: data.cheque.chequeDate,
              amount: data.cheque.amount,
              status: "Issued_PDC",
              issuedAt: now,
              issuedBy: user?.name,
              note: `Payment for ${purchase.invoiceNo}`,
            }
          : null;
      const bankTransaction: BankTransaction | null =
        data.bankAccountId && data.method !== "Cheque"
          ? {
              id: uid("btx"),
              accountId: data.bankAccountId,
              date: now,
              direction: "Debit_Out",
              amount: purchase.amount,
              category: "Supplier Payment",
              description: `${purchase.invoiceNo} · ${purchase.id}`,
              reference: purchase.id,
              linkedType: "Supplier",
              linkedId: purchase.supplierId,
              createdBy: user?.name,
            }
          : null;
      setState((prev) => ({
        ...prev,
        purchases: prev.purchases.map((entry) =>
          entry.id === purchaseId
            ? {
                ...entry,
                status: chequeRecord ? entry.status : ("Paid" as const),
                paidBy: user?.name,
                paidAt: now,
                paymentMethod: data.method,
                bankAccountId: data.bankAccountId,
                chequeId: chequeId ?? entry.chequeId,
              }
            : entry,
        ),
        suppliers: chequeRecord
          ? prev.suppliers
          : prev.suppliers.map((entry) =>
              entry.id === purchase.supplierId
                ? {
                    ...entry,
                    outstandingCredit: Math.max(0, entry.outstandingCredit - purchase.amount),
                  }
                : entry,
            ),
        supplierCheques: chequeRecord
          ? [chequeRecord, ...prev.supplierCheques]
          : prev.supplierCheques,
        bankTransactions: bankTransaction
          ? [bankTransaction, ...prev.bankTransactions]
          : prev.bankTransactions,
        notifications: notify(
          prev,
          ["Accounting", "Owner"],
          chequeRecord ? "Supplier post-dated cheque issued" : "Supplier invoice paid",
          `${purchase.invoiceNo} · LKR ${purchase.amount.toLocaleString()}${chequeRecord ? ` · cheque ${chequeRecord.chequeNo} held as PDC` : ` · ${data.method}`}.`,
          "normal",
          "/accounting",
          { eventType: chequeRecord ? "cheque" : "payment" },
        ),
      }));
      return { ok: true };
    },
    [state.users, state.currentUserId, state.purchases],
  );

  const addSupplierReturn = useCallback(
    (input: {
      supplierId: string;
      purchaseId?: string;
      invoiceNo: string;
      reason: string;
      lines: { itemId: string; qty: number; costPrice: number }[];
    }): ActionResult => {
      const supplier = state.suppliers.find((entry) => entry.id === input.supplierId);
      if (!supplier) return { ok: false, message: "Choose the supplier." };
      const cleanLines = input.lines.filter((line) => line.itemId && line.qty > 0);
      if (cleanLines.length === 0) {
        return { ok: false, message: "Add at least one part and quantity to return." };
      }
      for (const line of cleanLines) {
        const item = state.inventory.find((entry) => entry.id === line.itemId);
        if (!item) return { ok: false, message: "A selected inventory item no longer exists." };
        if (item.stock < line.qty) {
          return {
            ok: false,
            message: `${item.name}: only ${item.stock} in stock, cannot return ${line.qty}.`,
          };
        }
      }
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const now = new Date().toISOString();
      const total = cleanLines.reduce((sum, line) => sum + line.qty * line.costPrice, 0);
      const record: SupplierReturn = {
        id: `SR-${6001 + state.supplierReturns.length}`,
        supplierId: input.supplierId,
        purchaseId: input.purchaseId,
        invoiceNo: input.invoiceNo.trim() || "—",
        date: now,
        total,
        reason: input.reason.trim() || "Returned to supplier",
        lines: cleanLines.map((line) => {
          const item = state.inventory.find((entry) => entry.id === line.itemId);
          return {
            itemId: line.itemId,
            itemName: item?.name ?? "Item",
            qty: line.qty,
            costPrice: line.costPrice,
          };
        }),
        createdBy: user?.name,
      };
      const movements: StockMovement[] = cleanLines.map((line) => {
        const item = state.inventory.find((entry) => entry.id === line.itemId);
        return {
          id: uid("stk"),
          itemId: line.itemId,
          itemName: item?.name ?? "Item",
          date: now,
          type: "Supplier_Return",
          qty: -line.qty,
          reference: record.id,
          note: input.reason.trim(),
          createdBy: user?.name,
        };
      });
      setState((prev) => ({
        ...prev,
        supplierReturns: [record, ...prev.supplierReturns],
        inventory: prev.inventory.map((item) => {
          const line = cleanLines.find((entry) => entry.itemId === item.id);
          return line ? { ...item, stock: Math.max(0, item.stock - line.qty) } : item;
        }),
        stockMovements: [...movements, ...prev.stockMovements],
        suppliers: prev.suppliers.map((entry) =>
          entry.id === input.supplierId
            ? {
                ...entry,
                outstandingCredit: Math.max(0, entry.outstandingCredit - total),
              }
            : entry,
        ),
        notifications: notify(
          prev,
          ["Accounting"],
          "Supplier return recorded",
          `${record.id} · ${supplier.name} · ${cleanLines.length} line(s) · LKR ${total.toLocaleString()} credited against the supplier account.`,
          "normal",
          "/stores",
          { eventType: "inventory" },
        ),
      }));
      return { ok: true, reference: record.id };
    },
    [state.suppliers, state.inventory, state.supplierReturns.length, state.users, state.currentUserId],
  );

  const setOpeningStock = useCallback(
    (lines: { itemId: string; qty: number; costPrice?: number }[]): ActionResult => {
      const cleanLines = lines.filter((line) => line.itemId && line.qty >= 0);
      if (cleanLines.length === 0) {
        return { ok: false, message: "Enter opening quantities for at least one item." };
      }
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const now = new Date().toISOString();
      const movements: StockMovement[] = cleanLines.map((line) => {
        const item = state.inventory.find((entry) => entry.id === line.itemId);
        return {
          id: uid("stk"),
          itemId: line.itemId,
          itemName: item?.name ?? "Item",
          date: now,
          type: "Opening_Stock",
          qty: line.qty,
          reference: "OPENING",
          note: "Initial opening stock setup",
          createdBy: user?.name,
          isOpeningStock: true,
        };
      });
      setState((prev) => ({
        ...prev,
        inventory: prev.inventory.map((item) => {
          const line = cleanLines.find((entry) => entry.itemId === item.id);
          if (!line) return item;
          return {
            ...item,
            stock: line.qty,
            lastSellingPrice:
              line.costPrice && line.costPrice > 0
                ? Math.round(line.costPrice * 1.25)
                : item.lastSellingPrice,
            isOpeningStock: true,
            openingStockSetAt: now,
          };
        }),
        stockMovements: [...movements, ...prev.stockMovements],
      }));
      return { ok: true };
    },
    [state.inventory, state.users, state.currentUserId],
  );

  const addInventoryItem = useCallback((item: Omit<InventoryItem, "id">) => {
    const id = uid("itm");
    const now = new Date().toISOString();
    const user = state.users.find((entry) => entry.id === state.currentUserId);
    const opening: StockMovement | null =
      item.stock > 0
        ? {
            id: uid("stk"),
            itemId: id,
            itemName: item.name,
            date: now,
            type: "Opening_Stock",
            qty: item.stock,
            reference: "OPENING",
            note: "Opening stock recorded when the item was created",
            createdBy: user?.name,
            isOpeningStock: true,
          }
        : null;
    setState((prev) => ({
      ...prev,
      inventory: [
        ...prev.inventory,
        {
          ...item,
          id,
          isOpeningStock: true,
          openingStockSetAt: now,
        },
      ],
      stockMovements: opening
        ? [opening, ...prev.stockMovements]
        : prev.stockMovements,
    }));
  }, [state.users, state.currentUserId]);

  const addBankAccount = useCallback((account: Omit<BankAccount, "id" | "createdAt">) => {
    const now = new Date().toISOString();
    const id = uid("bnk");
    const record: BankAccount = { ...account, id, createdAt: now };
    setState((prev) => ({
      ...prev,
      bankAccounts: [...prev.bankAccounts, record],
    }));
  }, []);

  const updateBankAccount = useCallback((account: BankAccount) => {
    setState((prev) => ({
      ...prev,
      bankAccounts: prev.bankAccounts.map((entry) =>
        entry.id === account.id ? account : entry,
      ),
    }));
  }, []);

  const addBankTransaction = useCallback(
    (input: {
      accountId: string;
      direction: BankTransaction["direction"];
      amount: number;
      category: string;
      description: string;
      date?: string;
      reference?: string;
    }): ActionResult => {
      const account = state.bankAccounts.find((entry) => entry.id === input.accountId);
      if (!account) return { ok: false, message: "Choose a bank or cash account." };
      if (!Number.isFinite(input.amount) || input.amount <= 0) {
        return { ok: false, message: "Enter a valid amount." };
      }
      if (!input.description.trim()) return { ok: false, message: "Enter a description." };
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const transaction: BankTransaction = {
        id: uid("btx"),
        accountId: input.accountId,
        date: input.date
          ? new Date(`${input.date}T12:00:00`).toISOString()
          : new Date().toISOString(),
        direction: input.direction,
        amount: input.amount,
        category: input.category.trim() || "Manual",
        description: input.description.trim(),
        reference: input.reference?.trim(),
        linkedType: "Manual",
        createdBy: user?.name,
      };
      setState((prev) => ({
        ...prev,
        bankTransactions: [transaction, ...prev.bankTransactions],
      }));
      return { ok: true, reference: transaction.id };
    },
    [state.bankAccounts, state.users, state.currentUserId],
  );

  const transferBetweenAccounts = useCallback(
    (fromId: string, toId: string, amount: number, note: string): ActionResult => {
      if (fromId === toId) return { ok: false, message: "Choose two different accounts." };
      const from = state.bankAccounts.find((entry) => entry.id === fromId);
      const to = state.bankAccounts.find((entry) => entry.id === toId);
      if (!from || !to) return { ok: false, message: "Choose both accounts." };
      if (!Number.isFinite(amount) || amount <= 0) {
        return { ok: false, message: "Enter a valid transfer amount." };
      }
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const now = new Date().toISOString();
      const group = uid("trf");
      const transactions: BankTransaction[] = [
        {
          id: uid("btx"),
          accountId: fromId,
          date: now,
          direction: "Debit_Out",
          amount,
          category: "Internal Transfer",
          description: note.trim() || `Transfer to ${to.name}`,
          linkedType: "Transfer",
          linkedId: toId,
          transferGroup: group,
          createdBy: user?.name,
        },
        {
          id: uid("btx"),
          accountId: toId,
          date: now,
          direction: "Credit_In",
          amount,
          category: "Internal Transfer",
          description: note.trim() || `Transfer from ${from.name}`,
          linkedType: "Transfer",
          linkedId: fromId,
          transferGroup: group,
          createdBy: user?.name,
        },
      ];
      setState((prev) => ({
        ...prev,
        bankTransactions: [...transactions, ...prev.bankTransactions],
      }));
      return { ok: true, reference: group };
    },
    [state.bankAccounts, state.users, state.currentUserId],
  );

  const addPettyCashTopUp = useCallback(
    (amount: number, bankAccountId: string, note: string): ActionResult => {
      const account = state.bankAccounts.find((entry) => entry.id === bankAccountId);
      if (!account) return { ok: false, message: "Choose the bank account funding the float." };
      if (!Number.isFinite(amount) || amount <= 0) {
        return { ok: false, message: "Enter a valid top-up amount." };
      }
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const now = new Date().toISOString();
      const count = state.pettyCash.filter((entry) => entry.type === "Float_Topup").length;
      const topUp: PettyCashEntry = {
        id: uid("pc"),
        date: now,
        type: "Float_Topup",
        category: "Float",
        amount,
        description: note.trim() || "Petty cash float top-up",
        receiptNo: `PCT-${5001 + count}`,
        createdAt: now,
        recordedBy: user?.name,
        bankAccountId,
      };
      const bankTransaction: BankTransaction = {
        id: uid("btx"),
        accountId: bankAccountId,
        date: now,
        direction: "Debit_Out",
        amount,
        category: "Petty Cash Top-up",
        description: topUp.description,
        reference: topUp.receiptNo,
        linkedType: "Petty_Cash",
        linkedId: topUp.id,
        createdBy: user?.name,
      };
      setState((prev) => ({
        ...prev,
        pettyCash: [topUp, ...prev.pettyCash],
        bankTransactions: [bankTransaction, ...prev.bankTransactions],
      }));
      return { ok: true, reference: topUp.receiptNo };
    },
    [state.bankAccounts, state.pettyCash, state.users, state.currentUserId],
  );

  const addPettyCashExpense = useCallback(
    (input: {
      category: PettyCashCategory;
      amount: number;
      description: string;
      paidTo: string;
      photoDataUrl?: string;
    }): ActionResult => {
      if (!Number.isFinite(input.amount) || input.amount <= 0) {
        return { ok: false, message: "Enter a valid voucher amount." };
      }
      if (!input.description.trim()) return { ok: false, message: "Enter the expense description." };
      const balance = state.pettyCash.reduce(
        (sum, entry) => sum + (entry.type === "Float_Topup" ? entry.amount : -entry.amount),
        0,
      );
      if (input.amount > balance) {
        return {
          ok: false,
          message: `The float only has LKR ${balance.toLocaleString()}. Top up the petty cash first.`,
        };
      }
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const now = new Date().toISOString();
      const count = state.pettyCash.filter((entry) => entry.type === "Expense").length;
      const voucherNo = `PCV-${7001 + count}`;
      const voucher: PettyCashEntry = {
        id: uid("pc"),
        voucherNo,
        date: now,
        type: "Expense",
        category: input.category,
        amount: input.amount,
        description: input.description.trim(),
        paidTo: input.paidTo.trim(),
        photoDataUrl: input.photoDataUrl,
        receiptNo: voucherNo,
        createdAt: now,
        recordedBy: user?.name,
      };
      const nextBalance = balance - input.amount;
      setState((prev) => ({
        ...prev,
        pettyCash: [voucher, ...prev.pettyCash],
        notifications:
          nextBalance < 3000
            ? notify(
                prev,
                ["Cashier", "Accounting", "Owner"],
                "Petty cash low balance",
                `${voucherNo} left the float at LKR ${nextBalance.toLocaleString()} — below the LKR 3,000 minimum. Top up from bank.`,
                "critical",
                "/accounting",
                { eventType: "payment" },
              )
            : prev.notifications,
      }));
      return { ok: true, reference: voucherNo };
    },
    [state.pettyCash, state.users, state.currentUserId],
  );

  const addSupplierCheque = useCallback(
    (purchaseId: string, cheque: ChequeDetails): ActionResult => {
      const purchase = state.purchases.find((entry) => entry.id === purchaseId);
      if (!purchase) return { ok: false, message: "Purchase not found." };
      if (!cheque.chequeNo.trim() || !cheque.bank.trim() || !cheque.branch.trim()) {
        return { ok: false, message: "Enter the cheque number, bank and branch." };
      }
      if (!cheque.chequeDate) return { ok: false, message: "Enter the cheque date." };
      if (!Number.isFinite(cheque.amount) || cheque.amount <= 0) {
        return { ok: false, message: "Enter a valid cheque amount." };
      }
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const now = new Date().toISOString();
      const record: SupplierCheque = {
        id: uid("schq"),
        supplierId: purchase.supplierId,
        purchaseId: purchase.id,
        chequeNo: cheque.chequeNo.trim(),
        bank: cheque.bank.trim(),
        branch: cheque.branch.trim(),
        chequeDate: cheque.chequeDate,
        amount: cheque.amount,
        status: "Issued_PDC",
        issuedAt: now,
        issuedBy: user?.name,
        note: `Post-dated cheque for ${purchase.invoiceNo}`,
      };
      setState((prev) => ({
        ...prev,
        supplierCheques: [record, ...prev.supplierCheques],
        purchases: prev.purchases.map((entry) =>
          entry.id === purchaseId ? { ...entry, chequeId: record.id } : entry,
        ),
      }));
      return { ok: true, reference: record.id };
    },
    [state.purchases, state.users, state.currentUserId],
  );

  const clearSupplierCheque = useCallback(
    (chequeId: string, bankAccountId: string): ActionResult => {
      const cheque = state.supplierCheques.find((entry) => entry.id === chequeId);
      if (!cheque) return { ok: false, message: "Supplier cheque not found." };
      if (cheque.status === "Cleared") return { ok: false, message: "Cheque already cleared." };
      const purchase = state.purchases.find((entry) => entry.id === cheque.purchaseId);
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const now = new Date().toISOString();
      const bankTransaction: BankTransaction | null = bankAccountId
        ? {
            id: uid("btx"),
            accountId: bankAccountId,
            date: now,
            direction: "Debit_Out",
            amount: cheque.amount,
            category: "Supplier Cheque",
            description: `Cheque ${cheque.chequeNo} cleared${purchase ? ` · ${purchase.invoiceNo}` : ""}`,
            reference: cheque.chequeNo,
            linkedType: "Cheque",
            linkedId: cheque.id,
            createdBy: user?.name,
          }
        : null;
      setState((prev) => ({
        ...prev,
        supplierCheques: prev.supplierCheques.map((entry) =>
          entry.id === chequeId
            ? { ...entry, status: "Cleared" as const, clearedAt: now }
            : entry,
        ),
        purchases: prev.purchases.map((entry) =>
          entry.id === cheque.purchaseId && purchase && cheque.amount >= purchase.amount
            ? { ...entry, status: "Paid" as const, paidAt: now, paidBy: user?.name }
            : entry,
        ),
        suppliers: prev.suppliers.map((entry) =>
          entry.id === cheque.supplierId
            ? {
                ...entry,
                outstandingCredit: Math.max(0, entry.outstandingCredit - cheque.amount),
              }
            : entry,
        ),
        bankTransactions: bankTransaction
          ? [bankTransaction, ...prev.bankTransactions]
          : prev.bankTransactions,
      }));
      return { ok: true };
    },
    [state.supplierCheques, state.purchases, state.users, state.currentUserId],
  );

  const takeBackSupplierCheque = useCallback(
    (chequeId: string, bankAccountId: string): ActionResult => {
      const cheque = state.supplierCheques.find((entry) => entry.id === chequeId);
      if (!cheque) return { ok: false, message: "Supplier cheque not found." };
      if (cheque.status !== "Issued_PDC") {
        return { ok: false, message: "Only a post-dated cheque still in hand can be taken back." };
      }
      const purchase = state.purchases.find((entry) => entry.id === cheque.purchaseId);
      if (!purchase) return { ok: false, message: "Linked purchase not found." };
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const now = new Date().toISOString();
      const bankTransaction: BankTransaction | null = bankAccountId
        ? {
            id: uid("btx"),
            accountId: bankAccountId,
            date: now,
            direction: "Debit_Out",
            amount: purchase.amount,
            category: "Supplier Payment",
            description: `Cheque ${cheque.chequeNo} taken back — paid cash · ${purchase.invoiceNo}`,
            reference: purchase.invoiceNo,
            linkedType: "Supplier",
            linkedId: purchase.supplierId,
            createdBy: user?.name,
          }
        : null;
      setState((prev) => ({
        ...prev,
        supplierCheques: prev.supplierCheques.map((entry) =>
          entry.id === chequeId
            ? { ...entry, status: "Taken_Back_Paid_Cash" as const, takenBackAt: now }
            : entry,
        ),
        purchases: prev.purchases.map((entry) =>
          entry.id === purchase.id
            ? {
                ...entry,
                status: "Paid" as const,
                paidAt: now,
                paidBy: user?.name,
                paymentMethod: "Cash" as const,
              }
            : entry,
        ),
        suppliers: prev.suppliers.map((entry) =>
          entry.id === purchase.supplierId
            ? {
                ...entry,
                outstandingCredit: Math.max(0, entry.outstandingCredit - purchase.amount),
              }
            : entry,
        ),
        bankTransactions: bankTransaction
          ? [bankTransaction, ...prev.bankTransactions]
          : prev.bankTransactions,
        notifications: notify(
          prev,
          ["Accounting", "Owner"],
          "Post-dated cheque taken back",
          `${cheque.chequeNo} was returned by the supplier and ${purchase.invoiceNo} was settled in cash.`,
          "normal",
          "/accounting",
          { eventType: "cheque" },
        ),
      }));
      return { ok: true };
    },
    [state.supplierCheques, state.purchases, state.users, state.currentUserId],
  );

  const updateCustomerChequeStatus = useCallback(
    (
      chequeId: string,
      status: CustomerCheque["status"],
      reason?: string,
      bankAccountId?: string,
    ): ActionResult => {
      const cheque = state.customerCheques.find((entry) => entry.id === chequeId);
      if (!cheque) return { ok: false, message: "Cheque not found." };
      if (cheque.status === status) return { ok: true };
      if (status === "Bounced" && !reason?.trim()) {
        return { ok: false, message: "Enter the bank bounce reason." };
      }
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const now = new Date().toISOString();
      const resolvedBank = bankAccountId ?? cheque.bankAccountId;
      const bankTransaction: BankTransaction | null =
        status === "Cleared" && resolvedBank
          ? {
              id: uid("btx"),
              accountId: resolvedBank,
              date: now,
              direction: "Credit_In",
              amount: cheque.amount,
              category: "Cheque Realisation",
              description: `Cheque ${cheque.chequeNo} · ${cheque.customerName}`,
              reference: cheque.chequeNo,
              linkedType: "Cheque",
              linkedId: cheque.id,
              createdBy: user?.name,
            }
          : null;

      setState((prev) => {
        let jobCards = prev.jobCards;
        let customerCredits = prev.customerCredits;
        let advancePayments = prev.advancePayments;
        let insuranceJobs = prev.insuranceJobs;
        let creditPayments = prev.creditPayments;
        let ledger = prev.ledger;
        let notifications = prev.notifications;

        if (status === "Bounced") {
          if (cheque.source === "Checkout" && cheque.jobCardId) {
            const job = prev.jobCards.find((entry) => entry.id === cheque.jobCardId);
            jobCards = prev.jobCards.map((entry) =>
              entry.id === cheque.jobCardId
                ? {
                    ...entry,
                    status: "Repair Completed" as const,
                    paidAt: undefined,
                    paymentMethod: undefined,
                    chequeId: undefined,
                  }
                : entry,
            );
            const hasCredit = prev.customerCredits.some(
              (entry) => entry.jobCardId === cheque.jobCardId,
            );
            if (job && !hasCredit) {
              customerCredits = [
                {
                  id: uid("CR"),
                  jobCardId: job.id,
                  customerName: job.customerName,
                  vehicleNo: job.vehicleNo,
                  phone: job.phone,
                  total: cheque.amount,
                  paid: 0,
                  creditDate: now,
                  dueDate: isoDaysFrom(now, 7),
                  graceDays: 7,
                  status: "Unpaid" as const,
                },
                ...prev.customerCredits,
              ];
            }
          }
          if (cheque.source === "Advance" && cheque.advanceId) {
            advancePayments = prev.advancePayments.map((entry) =>
              entry.id === cheque.advanceId
                ? { ...entry, chequeStatus: "Bounced" as const }
                : entry,
            );
          }
          if (cheque.source === "Credit" && cheque.creditId) {
            const payment = prev.creditPayments.find(
              (entry) => entry.chequeId === cheque.id && !entry.reversed,
            );
            if (payment) {
              creditPayments = prev.creditPayments.map((entry) =>
                entry.id === payment.id ? { ...entry, reversed: true } : entry,
              );
              customerCredits = prev.customerCredits.map((entry) => {
                if (entry.id !== cheque.creditId) return entry;
                const paid = Math.max(0, entry.paid - payment.amount);
                return {
                  ...entry,
                  paid,
                  status:
                    paid <= 0
                      ? ("Unpaid" as const)
                      : paid >= entry.total
                        ? ("Settled" as const)
                        : ("Partially Paid" as const),
                };
              });
            }
          }
          if (cheque.source === "Insurance" && cheque.insuranceClaimId) {
            insuranceJobs = prev.insuranceJobs.map((entry) =>
              entry.id === cheque.insuranceClaimId
                ? {
                    ...entry,
                    status: "Awaiting Payment" as const,
                    chequeStatus: "Bounced" as const,
                    chequeBounceReason: reason?.trim(),
                    chequeClearedAt: undefined,
                  }
                : entry,
            );
            ledger = prev.ledger.filter(
              (entry) =>
                !(
                  entry.insuranceClaimId === cheque.insuranceClaimId &&
                  entry.paymentMethod === "Insurance Settlement"
                ),
            );
          }
          notifications = notify(
            { ...prev, notifications },
            ["Owner", "Accounting", "Cashier"],
            "Customer cheque bounced",
            `${cheque.chequeNo} · ${cheque.bank} · LKR ${cheque.amount.toLocaleString()} · ${reason?.trim()}. The linked balance has been reopened.`,
            "critical",
            "/accounting",
            { vehicleNo: cheque.vehicleNo, eventType: "cheque" },
          );
        } else {
          if (cheque.source === "Advance" && cheque.advanceId) {
            advancePayments = prev.advancePayments.map((entry) =>
              entry.id === cheque.advanceId
                ? { ...entry, chequeStatus: status }
                : entry,
            );
          }
          if (cheque.source === "Insurance" && cheque.insuranceClaimId) {
            insuranceJobs = prev.insuranceJobs.map((entry) =>
              entry.id === cheque.insuranceClaimId
                ? {
                    ...entry,
                    chequeStatus: status,
                    chequeClearedAt: status === "Cleared" ? now : entry.chequeClearedAt,
                    status:
                      status === "Cleared" ? ("Settled" as const) : entry.status,
                  }
                : entry,
            );
            if (status === "Cleared") {
              const claim = prev.insuranceJobs.find(
                (entry) => entry.id === cheque.insuranceClaimId,
              );
              const already = prev.ledger.some(
                (entry) =>
                  entry.insuranceClaimId === cheque.insuranceClaimId &&
                  entry.paymentMethod === "Insurance Settlement",
              );
              if (claim && !already) {
                ledger = [
                  {
                    id: uid("led"),
                    date: now,
                    laborRevenue: 0,
                    partsRevenue: 0,
                    partsCost: 0,
                    commission: 0,
                    discount: 0,
                    paymentMethod: "Insurance Settlement",
                    settlementAmount: cheque.amount,
                    insuranceClaimId: claim.id,
                    description: `Insurance cheque cleared — ${claim.claimNo}`,
                  },
                  ...prev.ledger,
                ];
              }
            }
          }
        }

        return {
          ...prev,
          customerCheques: prev.customerCheques.map((entry) =>
            entry.id === chequeId
              ? {
                  ...entry,
                  status,
                  bounceReason: status === "Bounced" ? reason?.trim() : entry.bounceReason,
                  clearedAt: status === "Cleared" ? now : entry.clearedAt,
                  bankAccountId: resolvedBank,
                }
              : entry,
          ),
          jobCards,
          customerCredits,
          advancePayments,
          insuranceJobs,
          creditPayments,
          ledger,
          bankTransactions: bankTransaction
            ? [bankTransaction, ...prev.bankTransactions]
            : prev.bankTransactions,
          notifications,
        };
      });
      return { ok: true };
    },
    [state.customerCheques, state.users, state.currentUserId],
  );

  const addWorkshopLoan = useCallback(
    (input: {
      lender: string;
      purpose: string;
      principal: number;
      monthlyInstallment: number;
      startDate: string;
    }) => {
      if (!input.lender.trim() || input.principal <= 0 || input.monthlyInstallment <= 0) return;
      const start = input.startDate
        ? new Date(`${input.startDate}T12:00:00`).toISOString()
        : new Date().toISOString();
      const loan: WorkshopLoan = {
        id: uid("wloan"),
        lender: input.lender.trim(),
        purpose: input.purpose.trim() || "Workshop loan",
        principal: input.principal,
        balance: input.principal,
        monthlyInstallment: input.monthlyInstallment,
        startDate: start,
        nextDueDate: isoDaysFrom(start, 30),
        status: "Active",
        createdAt: new Date().toISOString(),
      };
      setState((prev) => ({ ...prev, workshopLoans: [loan, ...prev.workshopLoans] }));
    },
    [],
  );

  const payWorkshopLoanInstallment = useCallback(
    (
      loanId: string,
      amount: number,
      method: WorkshopLoanPayment["method"],
      bankAccountId?: string,
    ): ActionResult => {
      const loan = state.workshopLoans.find((entry) => entry.id === loanId);
      if (!loan) return { ok: false, message: "Loan not found." };
      if (loan.status === "Settled") return { ok: false, message: "This loan is already settled." };
      if (!Number.isFinite(amount) || amount <= 0) {
        return { ok: false, message: "Enter a valid installment amount." };
      }
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      const now = new Date().toISOString();
      const value = Math.min(amount, loan.balance);
      const payment: WorkshopLoanPayment = {
        id: uid("wlpay"),
        loanId,
        amount: value,
        date: now,
        method,
        bankAccountId,
        receiptNo: `WL-${8001 + state.workshopLoanPayments.length}`,
        recordedBy: user?.name,
      };
      const bankTransaction: BankTransaction | null =
        bankAccountId && method !== "Cash"
          ? {
              id: uid("btx"),
              accountId: bankAccountId,
              date: now,
              direction: "Debit_Out",
              amount: value,
              category: "Loan Installment",
              description: `${loan.lender} · ${loan.purpose}`,
              reference: payment.receiptNo,
              linkedType: "Loan",
              linkedId: loan.id,
              createdBy: user?.name,
            }
          : null;
      setState((prev) => ({
        ...prev,
        workshopLoanPayments: [payment, ...prev.workshopLoanPayments],
        workshopLoans: prev.workshopLoans.map((entry) => {
          if (entry.id !== loanId) return entry;
          const balance = Math.max(0, entry.balance - value);
          return {
            ...entry,
            balance,
            status: balance <= 0 ? ("Settled" as const) : entry.status,
            nextDueDate: isoDaysFrom(entry.nextDueDate, 30),
          };
        }),
        bankTransactions: bankTransaction
          ? [bankTransaction, ...prev.bankTransactions]
          : prev.bankTransactions,
      }));
      return { ok: true, reference: payment.receiptNo };
    },
    [state.workshopLoans, state.workshopLoanPayments.length, state.users, state.currentUserId],
  );

  const changeOwnPin = useCallback(
    (currentPin: string, nextPin: string): ActionResult => {
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      if (!user) return { ok: false, message: "Sign in again to change your PIN." };
      if (user.pin !== currentPin) return { ok: false, message: "The current PIN is incorrect." };
      if (!/^\d{4,6}$/.test(nextPin)) {
        return { ok: false, message: "The new PIN must be 4 to 6 digits." };
      }
      if (nextPin === currentPin) {
        return { ok: false, message: "Choose a PIN different from the current one." };
      }
      setState((prev) => ({
        ...prev,
        users: prev.users.map((entry) =>
          entry.id === user.id ? { ...entry, pin: nextPin } : entry,
        ),
      }));
      return { ok: true, message: "Your PIN has been updated." };
    },
    [state.users, state.currentUserId],
  );

  const changeOwnerPassword = useCallback(
    (currentPassword: string, nextPassword: string): ActionResult => {
      const user = state.users.find((entry) => entry.id === state.currentUserId);
      if (!user?.isOwner) return { ok: false, message: "Only the owner can change the master password." };
      if (state.settings.ownerPassword !== currentPassword) {
        return { ok: false, message: "The current master password is incorrect." };
      }
      if (nextPassword.trim().length < 6) {
        return { ok: false, message: "Use at least 6 characters for the master password." };
      }
      setState((prev) => ({
        ...prev,
        settings: { ...prev.settings, ownerPassword: nextPassword.trim() },
      }));
      return { ok: true, message: "Master password updated." };
    },
    [state.users, state.currentUserId, state.settings.ownerPassword],
  );

  const updateNotificationPreferences = useCallback(
    (patch: Partial<UserNotificationPreferences>) => {
      setState((prev) => ({
        ...prev,
        users: prev.users.map((entry) =>
          entry.id === prev.currentUserId
            ? {
                ...entry,
                notificationPreferences: mergeNotificationPreferences({
                  ...(entry.notificationPreferences ?? {}),
                  ...patch,
                }),
              }
            : entry,
        ),
      }));
    },
    [],
  );

  const markNotificationRead = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    }));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => ({ ...n, read: true })),
    }));
  }, []);

  const resetAll = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState((prev) => ({
      ...prev,
      checkIns: [],
      jobCards: [],
      tasks: [],
      parts: [],
      supplierCreditNotes: [],
      customerCredits: [],
      expenses: [],
      ledger: [],
      marketing: [],
      notifications: [],
      appointments: [],
      estimates: [],
      advancePayments: [],
      insuranceJobs: [],
      attendance: [],
      staffLoans: [],
      payslips: [],
      wagePayouts: [],
      serviceRecords: [],
      bankAccounts: [],
      bankTransactions: [],
      pettyCash: [],
      customerCheques: [],
      supplierCheques: [],
      creditPayments: [],
      supplierReturns: [],
      stockMovements: [],
      workshopLoans: [],
      workshopLoanPayments: [],
      currentUserId: null,
    }));
  }, []);

  const importState = useCallback((next: AppState) => {
    setState({ ...normaliseState(next), currentUserId: null });
  }, []);

  const syncLicenceRef = useRef(syncLicence);
  syncLicenceRef.current = syncLicence;

  useEffect(() => {
    if (!licenceServerConfigured()) return;
    const run = () => {
      void syncLicenceRef.current();
    };
    run();
    const timer = window.setInterval(run, 6 * 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const value = useMemo<AppStoreValue>(
    () => ({
      state,
      currentUser,
      cloudStatus: cloud.status,
      cloudMessage: cloud.message,
      cloudEmail: cloud.email,
      cloudSignIn: cloud.signIn,
      cloudSignOut: cloud.signOut,
      cloudRetry: cloud.retry,
      login,
      logout,
      loadDemo,
      createWorkshop,
      updateSettings,
      addSection,
      updateSection,
      removeSection,
      assignUserSections,
      updateFeatureFlag,
      updateFeatureFlags,
      setStoresTopology,
      openConsumableContainer,
      issueConsumable,
      markContainerEmpty,
      togglePartIncludedInLabor,
      updateJobSections,
      syncLicence,
      addUser,
      updateUser,
      removeUser,
      addWorker,
      updateWorker,
      submitCheckIn,
      lookupVehicle,
      rejectCheckIn,
      acceptCheckIn,
      addTask,
      removeTask,
      updateTask,
      removePart,
      requestPart,
      addCustomerBroughtPart,
      fulfillPart,
      requestExchange,
      requestReturn,
      setPartSource,
      returnCustomerBroughtPart,
      approveExchange,
      approveReturn,
      requestWarrantyClaim,
      completeWarrantyClaim,
      updatePartSalvage,
      createEstimate,
      updateEstimate,
      removeEstimate,
      approveEstimate,
      reviseEstimatePrices,
      convertEstimateLineToCustomerExtra,
      setEstimateStatus,
      updateDriverCommission,
      recordAdvancePayment,
      createInsuranceClaim,
      updateInsuranceClaim,
      recordInsuranceCheque,
      settleInsuranceClaim,
      markAttendance,
      markManyPresent,
      submitAppointmentBooking,
      createStaffAppointment,
      confirmAppointment,
      rescheduleAppointment,
      cancelAppointment,
      fulfilAppointment,
      markAppointmentNoShow,
      addStaffLoan,
      savePayslip,
      payDailyWage,
      addInsuranceCompany,
      updateInsuranceCompany,
      removeInsuranceCompany,
      activateLicence,
      markRepairCompleted,
      checkoutJob,
      dispatchJob,
      overrideBillingGate,
      addVehicleBill,
      prepareVehicleBill,
      removeVehicleBill,
      settleVehicleBill,
      backupToDrive,
      sendMarketingReminder,
      markMarketingCompleted,
      addExpense,
      removeExpense,
      recordCreditPayment,
      addSupplier,
      addPurchase,
      addBulkPurchase,
      markPurchasePaid,
      addSupplierReturn,
      setOpeningStock,
      addInventoryItem,
      addBankAccount,
      updateBankAccount,
      addBankTransaction,
      transferBetweenAccounts,
      addPettyCashTopUp,
      addPettyCashExpense,
      addSupplierCheque,
      clearSupplierCheque,
      takeBackSupplierCheque,
      updateCustomerChequeStatus,
      addWorkshopLoan,
      payWorkshopLoanInstallment,
      changeOwnPin,
      changeOwnerPassword,
      updateNotificationPreferences,
      markNotificationRead,
      markAllNotificationsRead,
      resetAll,
      importState,
    }),
    [
      state,
      currentUser,
      cloud,
      login,
      logout,
      loadDemo,
      createWorkshop,
      updateSettings,
      addSection,
      updateSection,
      removeSection,
      assignUserSections,
      updateFeatureFlag,
      updateFeatureFlags,
      setStoresTopology,
      openConsumableContainer,
      issueConsumable,
      markContainerEmpty,
      togglePartIncludedInLabor,
      updateJobSections,
      syncLicence,
      addUser,
      updateUser,
      removeUser,
      addWorker,
      updateWorker,
      submitCheckIn,
      lookupVehicle,
      rejectCheckIn,
      acceptCheckIn,
      addTask,
      removeTask,
      updateTask,
      removePart,
      requestPart,
      addCustomerBroughtPart,
      fulfillPart,
      requestExchange,
      requestReturn,
      setPartSource,
      returnCustomerBroughtPart,
      approveExchange,
      approveReturn,
      requestWarrantyClaim,
      completeWarrantyClaim,
      updatePartSalvage,
      createEstimate,
      updateEstimate,
      removeEstimate,
      approveEstimate,
      reviseEstimatePrices,
      convertEstimateLineToCustomerExtra,
      setEstimateStatus,
      updateDriverCommission,
      recordAdvancePayment,
      createInsuranceClaim,
      updateInsuranceClaim,
      recordInsuranceCheque,
      settleInsuranceClaim,
      markAttendance,
      markManyPresent,
      submitAppointmentBooking,
      createStaffAppointment,
      confirmAppointment,
      rescheduleAppointment,
      cancelAppointment,
      fulfilAppointment,
      markAppointmentNoShow,
      addStaffLoan,
      savePayslip,
      payDailyWage,
      addInsuranceCompany,
      updateInsuranceCompany,
      removeInsuranceCompany,
      activateLicence,
      markRepairCompleted,
      checkoutJob,
      dispatchJob,
      overrideBillingGate,
      addVehicleBill,
      prepareVehicleBill,
      removeVehicleBill,
      settleVehicleBill,
      backupToDrive,
      sendMarketingReminder,
      markMarketingCompleted,
      addExpense,
      removeExpense,
      recordCreditPayment,
      addSupplier,
      addPurchase,
      addBulkPurchase,
      markPurchasePaid,
      addSupplierReturn,
      setOpeningStock,
      addInventoryItem,
      addBankAccount,
      updateBankAccount,
      addBankTransaction,
      transferBetweenAccounts,
      addPettyCashTopUp,
      addPettyCashExpense,
      addSupplierCheque,
      clearSupplierCheque,
      takeBackSupplierCheque,
      updateCustomerChequeStatus,
      addWorkshopLoan,
      payWorkshopLoanInstallment,
      changeOwnPin,
      changeOwnerPassword,
      updateNotificationPreferences,
      markNotificationRead,
      markAllNotificationsRead,
      resetAll,
      importState,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppStoreValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

export function hasDepartment(user: WorkshopUser | null, dept: Department): boolean {
  if (!user) return false;
  return user.isOwner || user.departments.includes(dept);
}

export function hasAnyDepartment(user: WorkshopUser | null, depts: Department[]): boolean {
  if (!user) return false;
  return user.isOwner || depts.some((d) => user.departments.includes(d));
}
