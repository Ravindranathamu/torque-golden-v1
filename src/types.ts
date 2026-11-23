export type Department = "PRO" | "Supervisor" | "Cashier" | "Accounting" | "Stores";

export type Role = "Owner" | Department;

export type FeatureFlagKey =
  | "enable_multi_sections"
  | "enable_paint_module"
  | "enable_insurance_module"
  | "enable_estimates_module"
  | "enable_vat_invoicing"
  | "enable_advanced_accounting"
  | "enable_payroll_epf_etf"
  | "enable_daily_wages"
  | "enable_driver_commissions"
  | "enable_petty_cash"
  | "enable_voice_notifications";

export type FeatureFlags = Record<FeatureFlagKey, boolean>;

export type StoresTopology = "Central" | "PerSection";

export interface WorkshopSection {
  id: string;
  name: string;
  code: string;
  description?: string;
  color: string;
  supervisorIds: string[];
  storekeeperIds: string[];
  workerIds: string[];
  active: boolean;
  createdAt: string;
}

export interface OpenContainerIssue {
  id: string;
  jobCardId: string;
  partId: string;
  qty: number;
  issuedAt: string;
  issuedBy?: string;
}

export interface OpenContainer {
  id: string;
  itemId: string;
  itemName: string;
  sectionId?: string;
  label: string;
  capacity: number;
  remainingQty: number;
  unit: string;
  costPerUnit: number;
  sellingPricePerUnit: number;
  status: "Open" | "Empty" | "Closed";
  openedAt: string;
  openedBy?: string;
  closedAt?: string;
  closedBy?: string;
  issues: OpenContainerIssue[];
}

export type NotificationEventType =
  | "job"
  | "inventory"
  | "payment"
  | "credit"
  | "cheque"
  | "appointment";

export interface UserNotificationPreferences {
  voiceEnabled: boolean;
  jobUpdates: boolean;
  inventoryAlerts: boolean;
  paymentAlerts: boolean;
  chequeAlerts: boolean;
  appointmentAlerts?: boolean;
  /** Event types that are spoken aloud. Empty means none. */
  voiceEvents?: NotificationEventType[];
  /** Enables newly added event types once without re-enabling a later opt-out. */
  voiceEventsVersion?: number;
  /** Optional installed voice name; empty uses the device default. */
  voiceName?: string;
  /** Speech rate between 0.7 and 1.3. */
  voiceRate?: number;
  /** Play a short chime before speaking on mobile. */
  voiceChime?: boolean;
}

export interface WorkshopUser {
  id: string;
  name: string;
  username: string;
  pin: string;
  isOwner: boolean;
  departments: Department[];
  phone: string;
  email?: string;
  baseSalary: number;
  commissionRate: number;
  gdriveEmail?: string;
  workerId?: string;
  sectionIds?: string[];
  active: boolean;
  createdAt: string;
  notificationPreferences?: UserNotificationPreferences;
}

export type CheckInStatus = "Awaiting Approval" | "Accepted" | "Rejected";

export interface DriverCommission {
  name: string;
  phone: string;
  basis: "Labour" | "Total Bill";
  type: "Fixed" | "Percentage";
  value: number;
  addedBy?: string;
  addedAt?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface CheckIn {
  id: string;
  createdAt: string;
  vehicleNo: string;
  make: string;
  model: string;
  customerName: string;
  phone: string;
  mileage: number;
  email?: string;
  address?: string;
  driverName?: string;
  driverPhone?: string;
  driverBasis?: DriverCommission["basis"];
  driverType?: DriverCommission["type"];
  driverValue?: number;
  status: CheckInStatus;
}

export interface DamagePhoto {
  id: string;
  name: string;
  dataUrl: string;
}

export type JobStatus =
  | "In Progress"
  | "Repair Completed"
  | "Awaiting Release Approval"
  | "Paid"
  | "Released on Credit"
  | "Dispatched";

export type PaymentMethod = "Cash" | "Card" | "Credit" | "Insurance" | "Cheque";
export type DiscountType = "Fixed" | "Percentage";

export type JobIntakeType = "Repair" | "Estimate";

export interface JobCard {
  id: string;
  numericId: number;
  checkInId?: string;
  createdAt: string;
  acceptedAt?: string;
  completedAt?: string;
  paidAt?: string;
  dispatchedAt?: string;
  vehicleNo: string;
  make: string;
  model: string;
  customerName: string;
  phone: string;
  customerAddress?: string;
  mileage: number;
  repairType: string;
  intakeType: JobIntakeType;
  sectionIds?: string[];
  safetyNotes?: string;
  photos: DamagePhoto[];
  driveFolderId?: string;
  status: JobStatus;
  discount: number;
  discountType: DiscountType;
  paymentMethod?: PaymentMethod;
  creditGraceDays?: number;
  /** Amount collected at the counter when the customer settles only part of the bill. */
  partPaymentCollected?: number;
  /** Outstanding balance moved to customer credit after a part payment. */
  partPaymentCredit?: number;
  partPaymentAt?: string;
  /** Set while the vehicle waits for Owner / Accounting release approval. */
  releaseApprovalRequestedAt?: string;
  releaseApprovalRequestedBy?: string;
  releaseApprovedBy?: string;
  releaseApprovedAt?: string;
  releaseApprovalNote?: string;
  /** Cashier has cleared the vehicle to leave; the PRO performs the actual handover. */
  exitApprovedBy?: string;
  exitApprovedAt?: string;
  dispatchedBy?: string;
  /** Cashier gate override — vehicle left without payment. */
  billingOverrideReason?: string;
  billingOverrideBy?: string;
  billingOverrideAt?: string;
  driver?: DriverCommission;
  insuranceClaimId?: string;
  chequeId?: string;
  customerTinNumber?: string;
  isVatInvoice?: boolean;
  vatRateApplied?: number;
  vatAmount?: number;
}

export interface JobTask {
  id: string;
  jobCardId: string;
  name: string;
  laborCost: number;
  /** One or more technicians on this task. Labour and commission split equally. */
  workerIds?: string[];
  /** @deprecated Legacy single-technician field kept for older saved data. */
  workerId?: string;
  sectionId?: string;
  catalogueItemId?: string;
  createdAt: string;
  addedBy?: string;
  addedAt?: string;
  /** Split bill this task was ticked onto. */
  assignedBillId?: string;
  /** Original workshop quoted labour when the assessor approved a different figure. */
  quotedLaborCost?: number;
  /** Insurance job only — work outside the claim, billed to the customer. */
  isCustomerExtra?: boolean;
  /** Estimate line that auto-loaded this task. */
  estimateId?: string;
  estimateLineId?: string;
}

export type PartStatus =
  | "Requested"
  | "Issued"
  | "Exchange Pending"
  | "Return Pending"
  | "Returned"
  | "Backordered";

export interface JobPart {
  id: string;
  jobCardId: string;
  itemId: string;
  itemName: string;
  qtyRequested: number;
  qtyIssued: number;
  costPrice: number;
  marginPercent: number;
  sellingPrice: number;
  status: PartStatus;
  sectionId?: string;
  includedInLabor?: boolean;
  measuredQty?: boolean;
  supplierId?: string;
  supplierInvoiceNo?: string;
  warrantyReplacementInvoiceNo?: string;
  warrantyStatus?: "None" | "Claimed" | "Replaced" | "Credited";
  warrantyNote?: string;
  creditNoteNo?: string;
  creditNoteAmount?: number;
  salvageStatus?: "Pending" | "Submitted" | "Not Required";
  salvageNote?: string;
  salvageRef?: string;
  createdAt: string;
  updatedAt: string;
  /** Split bill this part was ticked onto. */
  assignedBillId?: string;
  /** Store-supplied, customer-supplied, or a part Stores must buy in from outside. */
  partSource?: "Workshop_Store" | "Customer_Brought" | "Outside_Purchase";
  /** Customer-brought part handed back / swapped back to the owner. */
  customerReturnAt?: string;
  customerReturnMode?: "Return" | "Swap";
  customerReturnNote?: string;
  /** Insurance job only — workshop parts added outside the claim. */
  isCustomerExtra?: boolean;
  /** Workshop quoted price retained when the assessor approves a different figure. */
  quotedSellingPrice?: number;
  /** Assessor approved unit price that drives the insurance bill. */
  insuranceApprovedPrice?: number;
  /** Estimate line that auto-loaded this part. */
  estimateId?: string;
  estimateLineId?: string;
}

export interface SupplierCreditNote {
  id: string;
  supplierId: string;
  partId?: string;
  jobCardId?: string;
  supplierInvoiceNo: string;
  creditNoteNo: string;
  amount: number;
  date: string;
  reason: string;
  status: "Recorded" | "Applied";
}

export type EstimateLineApproval = "Pending" | "Approved" | "Rejected";

export interface EstimateLine {
  id: string;
  type: "Labour" | "Part";
  description: string;
  qty: number;
  unitPrice: number;
  /** Assessor scope decision. Pending lines are never loaded onto the job card. */
  approvalStatus?: EstimateLineApproval;
  /** Assessor approved unit price; falls back to unitPrice when blank. */
  approvedUnitPrice?: number;
  /** Rejection reason or assessor price note. */
  approvalNote?: string;
  /** Supervisor choice when the approved part is loaded onto the job. */
  partSource?: "Workshop_Store" | "Customer_Brought";
}

export interface JobEstimate {
  id: string;
  jobCardId: string;
  /** Repair section when the workshop runs multiple sections. */
  sectionId?: string;
  kind: "Initial" | "Supplementary";
  /** Globally sequential document number: EST-YYYY-0001. */
  number: string;
  /** Supplementary sequence (1 = SUP-01). Undefined on the initial estimate. */
  supplementaryNo?: number;
  revision: number;
  status: "Draft" | "Awaiting Approval" | "Approved" | "Rejected";
  lines: EstimateLine[];
  notes: string;
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
  approvedAt?: string;
  approvedBy?: string;
}

export interface InsuranceCompany {
  id: string;
  name: string;
  address: string;
  email: string;
  hotline: string;
  website?: string;
  tinNumber?: string;
  active?: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export interface InsuranceClaim {
  id: string;
  jobCardId: string;
  insurerId: string;
  claimNo: string;
  policyNo: string;
  assessorName?: string;
  assessorPhone?: string;
  estimateStatus: "Pending" | "Submitted" | "Approved";
  estimateApprovedAt?: string;
  partsStatus: "Pending" | "Submitted" | "Approved";
  partsApprovedAt?: string;
  insuranceBillNo?: string;
  insuranceBillAmount?: number;
  insuranceBillAt?: string;
  customerBillNo?: string;
  customerBillAmount?: number;
  releaseOrderNo?: string;
  releaseOrderReceivedAt?: string;
  salvageStatus: "Pending" | "Submitted" | "Not Required";
  salvageSubmittedAt?: string;
  salvageReference?: string;
  chequeNo?: string;
  chequeAmount?: number;
  chequeReceivedAt?: string;
  chequeClearedAt?: string;
  chequeBank?: string;
  chequeBranch?: string;
  chequeDate?: string;
  chequeStatus?: ChequeStatus;
  chequeBounceReason?: string;
  chequeId?: string;
  branchAddressOverride?: string;
  isVatInvoice?: boolean;
  vatRateApplied?: number;
  vatAmount?: number;
  status: "Open" | "Estimate Approved" | "Parts Approved" | "Awaiting Payment" | "Settled";
  createdAt: string;
}

export interface AdvancePayment {
  id: string;
  jobCardId: string;
  customerName: string;
  vehicleNo: string;
  phone: string;
  amount: number;
  method: "Cash" | "Card" | "Bank Transfer" | "Cheque";
  receiptNo: string;
  note?: string;
  createdAt: string;
  recordedBy?: string;
  chequeId?: string;
  chequeNo?: string;
  chequeBank?: string;
  chequeBranch?: string;
  chequeDate?: string;
  chequeStatus?: ChequeStatus;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  workerId: string;
  sectionId?: string;
  status: "Present" | "Absent" | "Off Day";
  markedAt: string;
  markedBy?: string;
}

export type AppointmentStatus =
  | "Pending"
  | "Confirmed"
  | "Rescheduled"
  | "Arrived"
  | "Fulfilled"
  | "Cancelled"
  | "No Show";

export interface Appointment {
  id: string;
  reference: string;
  createdAt: string;
  updatedAt: string;
  token: string;
  customerName: string;
  phone: string;
  vehicleNo: string;
  vehicleModel: string;
  repairType: string;
  scheduledAt: string;
  notes?: string;
  status: AppointmentStatus;
  source: "Booking link" | "Staff";
  createdBy?: string;
  confirmedAt?: string;
  confirmedBy?: string;
  cancelledAt?: string;
  cancelReason?: string;
  rescheduledFrom?: string;
  employeeNote?: string;
  fulfilledAt?: string;
  checkInId?: string;
}

export interface AppointmentBookingInput {
  token: string;
  customerName: string;
  phone: string;
  vehicleNo: string;
  vehicleModel: string;
  repairType: string;
  scheduledAt: string;
  notes?: string;
}

export interface StaffLoan {
  id: string;
  workerId: string;
  date: string;
  principal: number;
  balance: number;
  monthlyDeduction: number;
  reason: string;
  status: "Active" | "Settled";
}

export interface Payslip {
  id: string;
  workerId: string;
  periodStart: string;
  periodEnd: string;
  workedDays: number;
  workingDays: number;
  basic: number;
  commission: number;
  loanDeduction: number;
  epfEmployee: number;
  epfEmployer: number;
  etfEmployer: number;
  otherDeductions: number;
  gross: number;
  net: number;
  paidAt: string;
  paidBy?: string;
  note?: string;
}

export interface WagePayout {
  id: string;
  workerId: string;
  date: string;
  days: number;
  baseAmount: number;
  commissionAmount: number;
  commissionIncluded: boolean;
  amount: number;
  receiptNo: string;
  paidAt: string;
  paidBy?: string;
}

export interface ServiceRecord {
  id: string;
  jobCardId: string;
  vehicleNo: string;
  make: string;
  model: string;
  customerName: string;
  date: string;
  mileage: number;
  repairType: string;
  tasks: {
    name: string;
    workerId: string;
    workerName: string;
    laborCost: number;
  }[];
  parts: {
    itemName: string;
    supplierId?: string;
    supplierInvoiceNo?: string;
    qty: number;
    sellingPrice: number;
    status: PartStatus;
  }[];
  total: number;
}

export type StockType = "Spare Part" | "Consumable";

export interface InventoryItem {
  id: string;
  code: string;
  name: string;
  type: StockType;
  make?: string;
  model?: string;
  stock: number;
  minStock: number;
  unit: string;
  lastSellingPrice?: number;
  lastCostPrice?: number;
  sectionId?: string;
  /** Consumables can be measured out of an open shop-floor container. */
  sharedConsumable?: boolean;
  /** Base measure used for fractional issues, e.g. g, ml, pc. */
  measureUnit?: string;
  /** Units in one sealed pack, e.g. 1000 for a 1 kg tin measured in g. */
  packSize?: number;
  packLabel?: string;
  supplierId?: string;
  isOpeningStock?: boolean;
  openingStockSetAt?: string;
}

export interface PurchaseLine {
  id: string;
  itemId: string;
  itemName: string;
  qty: number;
  costPrice: number;
  sellingPrice?: number;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  contactPerson?: string;
  outstandingCredit: number;
}

export interface SupplierPurchase {
  id: string;
  supplierId: string;
  invoiceNo: string;
  amount: number;
  type: "Cash" | "Credit";
  creditDays: number;
  purchaseDate: string;
  dueDate?: string;
  status: "Unpaid" | "Paid";
  description: string;
  lines?: PurchaseLine[];
  goodsConfirmedBy?: string;
  goodsConfirmedAt?: string;
  paidBy?: string;
  paidAt?: string;
  paymentMethod?: "Cash" | "Bank Transfer" | "Cheque";
  bankAccountId?: string;
  chequeId?: string;
}

export interface CustomerCredit {
  id: string;
  jobCardId: string;
  customerName: string;
  vehicleNo: string;
  phone: string;
  total: number;
  paid: number;
  creditDate: string;
  dueDate: string;
  graceDays: number;
  status: "Unpaid" | "Partially Paid" | "Settled";
  /** Part-payment balance raised at checkout, versus a normal credit sale. */
  kind?: "Credit Sale" | "Part Payment";
  /** Vehicle bill whose balance this part payment covers. */
  billId?: string;
}

export type ExpenseCategory =
  | "Rental"
  | "Electricity"
  | "Water"
  | "Operational Cost"
  | "Other Expenses";

export interface Expense {
  id: string;
  date: string;
  category: ExpenseCategory;
  amount: number;
  description: string;
}

export type LedgerPaymentMethod =
  | "Cash"
  | "Card"
  | "Bank Transfer"
  | "Credit"
  | "Credit Settlement"
  | "Cheque"
  | "Cheque Settlement"
  | "Insurance"
  | "Insurance Settlement";

export interface LedgerSectionBreakdown {
  sectionId: string;
  sectionName: string;
  laborRevenue: number;
  partsRevenue: number;
  partsCost: number;
  commission: number;
}

export interface LedgerEntry {
  id: string;
  jobCardId?: string;
  date: string;
  laborRevenue: number;
  partsRevenue: number;
  partsCost: number;
  commission: number;
  discount: number;
  paymentMethod: LedgerPaymentMethod;
  settlementAmount?: number;
  workerId?: string;
  /** Per-worker commission when several technicians share one task. */
  workerCommissions?: { workerId: string; commission: number }[];
  driverCommission?: number;
  insuranceClaimId?: string;
  sectionBreakdown?: LedgerSectionBreakdown[];
  description: string;
}

export type MarketingType = "Periodic Cycle" | "Mileage Milestone";
export type MarketingStatus = "Pending" | "Reminder Sent" | "Completed";

export interface MarketingReminder {
  id: string;
  vehicleNo: string;
  customerName: string;
  phone: string;
  triggerType: MarketingType;
  targetDate?: string;
  targetMileage?: number;
  dispatchDate?: string;
  readyAt?: string;
  status: MarketingStatus;
  avgCycleDays?: number;
  createdAt: string;
}

export type NotificationDepartment = Department | "Owner";

export interface AppNotification {
  id: string;
  departments: NotificationDepartment[];
  title: string;
  message: string;
  priority: "normal" | "high" | "critical";
  createdAt: string;
  read: boolean;
  link?: string;
  /** Used for short, vehicle-only voice announcements. */
  vehicleNo?: string;
  /** Spoken instead of the title when the alert needs a richer announcement. */
  voiceText?: string;
  eventType?: NotificationEventType;
}

export type PrinterMode = "Standard_PC" | "Thermal_Only" | "Both";
export type ThermalPaperWidth = "58mm" | "80mm";
export type StandardPaperSize = "A4" | "A5";

export type LicenceStatus = "Trial" | "Active" | "Suspended" | "Expired";
export type LicencePlan = "Lite" | "Starter" | "Growth" | "Pro" | "Enterprise";

export interface WorkshopSettings {
  companyName: string;
  address: string;
  phone: string;
  email: string;
  logo?: string;
  brandColor: string;
  accentColor: string;
  googleReviewUrl: string;
  currency: string;
  qrSlug: string;
  /** Public app URL used inside printed QR codes. Falls back to the current origin. */
  publicBaseUrl?: string;
  ownerPassword: string;
  /** Owner's opening capital; shown as equity in the trial balance. */
  ownerCapital?: number;
  configured: boolean;
  demoMode: boolean;
  createdAt: string;
  workingDays: number[];
  epfEmployeeRate: number;
  epfEmployerRate: number;
  etfRate: number;
  trialStartedAt: string;
  licenseKey?: string;
  licenseActivatedAt?: string;
  licenseExpiresAt?: string;
  licenseHolder?: string;
  installationId?: string;
  licenseStatus?: LicenceStatus;
  licensePlan?: LicencePlan | string;
  lastLicenceSyncAt?: string;
  lastLicenceServerTime?: string;
  licenceClockRollback?: boolean;
  featureFlags?: FeatureFlags;
  storesTopology?: StoresTopology;
  tinNumber?: string;
  vatRegNumber?: string;
  defaultVatRate?: number;
  placeOfSupply?: string;
  footerInquiryLine?: string;
  footerComplaintLine?: string;
  printerMode?: PrinterMode;
  thermalPaperWidth?: ThermalPaperWidth;
  standardPaperSize?: StandardPaperSize;
  /** Secret token embedded in the public reservation link. */
  bookingToken?: string;
  /** Self-hosted WAHA WhatsApp gateway settings. */
  whatsappMode?: "Disabled" | "WAHA";
  whatsappGatewayUrl?: string;
  whatsappSession?: string;
  whatsappApiKey?: string;
  whatsappCompanyNumber?: string;
  whatsappConnected?: boolean;
  whatsappAutoSend?: boolean;
  whatsappOwnerNotify?: boolean;
  whatsappLastQrAt?: string;
  /** Daily Google Drive backup through a Google Apps Script / edge-function webhook. */
  driveBackupEnabled?: boolean;
  driveBackupUrl?: string;
  driveBackupKey?: string;
  driveBackupFolderId?: string;
  /** Local hour (0-23) after which the daily catch-up backup may run. */
  driveBackupHour?: number;
  lastDriveBackupAt?: string;
  lastDriveBackupStatus?: string;
  lastDriveBackupFile?: string;
}

export interface WorkerProfile {
  id: string;
  fullName: string;
  position?: string;
  etfNumber?: string;
  phone: string;
  nic: string;
  address: string;
  emergencyName: string;
  emergencyPhone: string;
  baseSalary: number;
  commissionRate: number;
  joined: string;
  status: "Active" | "Suspended" | "Terminated";
  bankName: string;
  accountNumber: string;
  userId?: string;
  sectionIds?: string[];
  payType: "Monthly" | "Daily";
  dailyRate: number;
  epfEnabled: boolean;
  etfEnabled: boolean;
  commissionEnabled: boolean;
  allowedOffDaysPerMonth: number;
}

export type ChequeStatus = "In_Safe" | "Deposited" | "Cleared" | "Bounced";

export type ChequeSource = "Checkout" | "Advance" | "Credit" | "Insurance";

export interface ChequeDetails {
  chequeNo: string;
  bank: string;
  branch: string;
  chequeDate: string;
  amount: number;
}

export interface CustomerCheque extends ChequeDetails {
  id: string;
  source: ChequeSource;
  jobCardId?: string;
  creditId?: string;
  advanceId?: string;
  insuranceClaimId?: string;
  customerName: string;
  vehicleNo: string;
  phone: string;
  status: ChequeStatus;
  bounceReason?: string;
  receivedAt: string;
  receivedBy?: string;
  clearedAt?: string;
  bankAccountId?: string;
  note?: string;
}

export interface CreditPayment {
  id: string;
  creditId: string;
  amount: number;
  method: "Cash" | "Card" | "Bank Transfer" | "Cheque";
  date: string;
  chequeId?: string;
  bankAccountId?: string;
  recordedBy?: string;
  reversed?: boolean;
}

export type SupplierChequeStatus =
  | "Issued_PDC"
  | "Cleared"
  | "Taken_Back_Paid_Cash";

export interface SupplierCheque extends ChequeDetails {
  id: string;
  supplierId: string;
  purchaseId?: string;
  status: SupplierChequeStatus;
  issuedAt: string;
  issuedBy?: string;
  clearedAt?: string;
  takenBackAt?: string;
  note?: string;
}

export type StockMovementType =
  | "Opening_Stock"
  | "Purchase"
  | "Job_Issue"
  | "Supplier_Return"
  | "Job_Return"
  | "Container_Open"
  | "Container_Empty";

export interface StockMovement {
  id: string;
  itemId: string;
  itemName: string;
  date: string;
  type: StockMovementType;
  qty: number;
  reference: string;
  note?: string;
  createdBy?: string;
  isOpeningStock?: boolean;
}

export interface SupplierReturnLine {
  itemId: string;
  itemName: string;
  qty: number;
  costPrice: number;
}

export interface SupplierReturn {
  id: string;
  supplierId: string;
  purchaseId?: string;
  invoiceNo: string;
  date: string;
  total: number;
  reason: string;
  lines: SupplierReturnLine[];
  createdBy?: string;
  creditNoteNo?: string;
}

export type BankAccountType = "Bank" | "Cash";

export interface BankAccount {
  id: string;
  name: string;
  bankName: string;
  branch: string;
  accountNumber: string;
  type: BankAccountType;
  openingBalance: number;
  active: boolean;
  createdAt: string;
}

export type BankDirection = "Credit_In" | "Debit_Out";

export interface BankTransaction {
  id: string;
  accountId: string;
  date: string;
  direction: BankDirection;
  amount: number;
  category: string;
  description: string;
  reference?: string;
  linkedType?:
    | "Opening_Balance"
    | "Job"
    | "Credit"
    | "Cheque"
    | "Supplier"
    | "Petty_Cash"
    | "Loan"
    | "Transfer"
    | "Manual";
  linkedId?: string;
  transferGroup?: string;
  createdBy?: string;
}

export type PettyCashCategory =
  | "Fuel"
  | "Transport"
  | "Office Supplies"
  | "Refreshments"
  | "Repairs"
  | "Other";

export interface PettyCashEntry {
  id: string;
  voucherNo?: string;
  date: string;
  type: "Float_Topup" | "Expense";
  category: PettyCashCategory | "Float";
  amount: number;
  description: string;
  paidTo?: string;
  photoDataUrl?: string;
  receiptNo: string;
  createdAt: string;
  recordedBy?: string;
  bankAccountId?: string;
}

export interface WorkshopLoan {
  id: string;
  lender: string;
  purpose: string;
  principal: number;
  balance: number;
  monthlyInstallment: number;
  startDate: string;
  nextDueDate: string;
  status: "Active" | "Settled";
  createdAt: string;
}

export interface WorkshopLoanPayment {
  id: string;
  loanId: string;
  amount: number;
  date: string;
  method: "Cash" | "Bank Transfer" | "Cheque";
  bankAccountId?: string;
  receiptNo: string;
  recordedBy?: string;
}

export type VehicleBillStatus =
  | "Draft"
  | "Unpaid"
  | "Partially Paid"
  | "Awaiting Release Order"
  | "Paid"
  | "Release Order";
export type VehicleBillPaymentMethod =
  | "Cash"
  | "Card"
  | "Bank Transfer"
  | "Cheque"
  | "Release Order";

export interface VehicleBill {
  id: string;
  jobCardId: string;
  vehicleNo: string;
  kind: "Insurance" | "Customer" | "Additional";
  billNo: string;
  /** Net payable after discount, VAT, advance, excess and depreciation. */
  amount: number;
  createdAt: string;
  createdBy?: string;
  claimId?: string;
  insurerId?: string;
  notes?: string;
  /** Tasks ticked onto this bill. */
  taskIds?: string[];
  /** Parts ticked onto this bill. */
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
  /** Set when the cashier chooses VAT and sends the bill to the insurer/customer. */
  sentAt?: string;
  sentBy?: string;
  /** Unpaid until the insurer release order or customer payment settles it. */
  status?: VehicleBillStatus;
  paidAmount?: number;
  paidAt?: string;
  paidBy?: string;
  paymentMethod?: VehicleBillPaymentMethod;
  /** Insurer release order that settled an insurance bill. */
  releaseOrderNo?: string;
  releaseOrderAmount?: number;
  releaseOrderAt?: string;
  /** Additional customer bill created when the release order is short. */
  shortfallBillId?: string;
  /** Insurance bill that produced this shortfall adjustment. */
  parentBillId?: string;
  /** Customer-brought part value already paid, credited against a shortfall. */
  customerPartsCredit?: number;
  /** Repair section this bill belongs to when the workshop runs multiple sections. */
  sectionId?: string;
}

export interface AppState {
  version: number;
  settings: WorkshopSettings;
  users: WorkshopUser[];
  workers: WorkerProfile[];
  checkIns: CheckIn[];
  jobCards: JobCard[];
  tasks: JobTask[];
  parts: JobPart[];
  inventory: InventoryItem[];
  suppliers: Supplier[];
  purchases: SupplierPurchase[];
  supplierCreditNotes: SupplierCreditNote[];
  customerCredits: CustomerCredit[];
  expenses: Expense[];
  ledger: LedgerEntry[];
  marketing: MarketingReminder[];
  notifications: AppNotification[];
  appointments: Appointment[];
  estimates: JobEstimate[];
  advancePayments: AdvancePayment[];
  insuranceCompanies: InsuranceCompany[];
  insuranceJobs: InsuranceClaim[];
  vehicleBills: VehicleBill[];
  attendance: AttendanceRecord[];
  staffLoans: StaffLoan[];
  payslips: Payslip[];
  wagePayouts: WagePayout[];
  serviceRecords: ServiceRecord[];
  bankAccounts: BankAccount[];
  bankTransactions: BankTransaction[];
  pettyCash: PettyCashEntry[];
  customerCheques: CustomerCheque[];
  supplierCheques: SupplierCheque[];
  creditPayments: CreditPayment[];
  supplierReturns: SupplierReturn[];
  stockMovements: StockMovement[];
  workshopLoans: WorkshopLoan[];
  workshopLoanPayments: WorkshopLoanPayment[];
  sections: WorkshopSection[];
  openContainers: OpenContainer[];
  currentUserId: string | null;
}

export interface NewCheckInInput {
  vehicleNo: string;
  make: string;
  model: string;
  customerName: string;
  phone: string;
  mileage: number;
  email?: string;
  address?: string;
  driverName?: string;
  driverPhone?: string;
  driverBasis?: DriverCommission["basis"];
  driverType?: DriverCommission["type"];
  driverValue?: number;
}

export interface CheckoutInput {
  paymentMethod: PaymentMethod;
  discount: number;
  discountType: DiscountType;
  graceDays?: number;
  cheque?: ChequeDetails;
  bankAccountId?: string;
  isVatInvoice?: boolean;
  vatRate?: number;
  customerTinNumber?: string;
  /** Amount collected now. A lower figure leaves the balance on customer credit. */
  amountPaid?: number;
}
