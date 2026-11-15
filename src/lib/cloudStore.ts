import type { Session } from "@supabase/supabase-js";
import type {
  AppState,
  Department,
  FeatureFlags,
  WorkshopSettings,
  WorkshopUser,
} from "../types";
import { createEmptyState } from "../data/seed";
import { defaultFeatureFlags } from "./features";
import { getInstallationId, setInstallationId } from "./licence";
import { requireClientSupabase } from "./supabase";

export const CLOUD_SETTINGS_COLLECTION = "settings";
export const CLOUD_SETTINGS_RECORD = "workshop";
export const CLOUD_CACHE_KEY = "torque_cloud_sync_queue_v1";

export const SYNC_COLLECTIONS = [
  "users",
  "workers",
  "checkIns",
  "jobCards",
  "tasks",
  "parts",
  "inventory",
  "suppliers",
  "purchases",
  "supplierCreditNotes",
  "customerCredits",
  "expenses",
  "ledger",
  "marketing",
  "notifications",
  "appointments",
  "estimates",
  "advancePayments",
  "insuranceCompanies",
  "insuranceJobs",
  "vehicleBills",
  "attendance",
  "staffLoans",
  "payslips",
  "wagePayouts",
  "serviceRecords",
  "bankAccounts",
  "bankTransactions",
  "pettyCash",
  "customerCheques",
  "supplierCheques",
  "creditPayments",
  "supplierReturns",
  "stockMovements",
  "workshopLoans",
  "workshopLoanPayments",
  "sections",
  "openContainers",
] as const;

export type SyncCollection = (typeof SYNC_COLLECTIONS)[number];

export interface AppRecordRow {
  workshop_id: string;
  collection: string;
  record_id: string;
  payload: unknown;
  sort_order: number;
  deleted: boolean;
  updated_by?: string | null;
  updated_at?: string;
}

export interface CloudWorkshopRow {
  id: string;
  slug: string;
  company_name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
  brand_color?: string | null;
  accent_color?: string | null;
  google_review_url?: string | null;
  currency?: string | null;
  configured?: boolean | null;
  demo_mode?: boolean | null;
  created_at?: string | null;
  working_days?: number[] | null;
  epf_employee_rate?: number | null;
  epf_employer_rate?: number | null;
  etf_rate?: number | null;
  trial_started_at?: string | null;
  license_key?: string | null;
  license_activated_at?: string | null;
  license_expires_at?: string | null;
  license_holder?: string | null;
  installation_id?: string | null;
  license_status?: string | null;
  license_plan?: string | null;
  last_licence_sync_at?: string | null;
  feature_flags?: FeatureFlags | null;
  stores_topology?: string | null;
  tin_number?: string | null;
  vat_reg_number?: string | null;
  default_vat_rate?: number | null;
  place_of_supply?: string | null;
  footer_inquiry_line?: string | null;
  footer_complaint_line?: string | null;
  printer_mode?: string | null;
  thermal_paper_width?: string | null;
  standard_paper_size?: string | null;
}

export interface CloudProfileRow {
  id: string;
  workshop_id: string;
  full_name: string;
  username: string;
  phone?: string | null;
  email?: string | null;
  is_owner?: boolean | null;
  departments?: string[] | null;
  base_salary?: number | null;
  commission_rate?: number | null;
  gdrive_email?: string | null;
  active?: boolean | null;
  created_at?: string | null;
  notification_preferences?: WorkshopUser["notificationPreferences"] | null;
}

export interface CloudContext {
  session: Session;
  profile: CloudProfileRow;
  workshop: CloudWorkshopRow;
  profiles: CloudProfileRow[];
  records: AppRecordRow[];
}

export interface CloudStateBundle {
  state: AppState;
  records: AppRecordRow[];
  seeded: boolean;
}

export interface CloudChange {
  collection: string;
  recordId: string;
  row?: AppRecordRow;
  deleted: boolean;
}

const DEPARTMENTS: Department[] = ["PRO", "Supervisor", "Cashier", "Accounting", "Stores"];

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function profileToUser(profile: CloudProfileRow): WorkshopUser {
  const departments = (profile.departments ?? []).filter((department): department is Department =>
    DEPARTMENTS.includes(department as Department),
  );
  return {
    id: profile.id,
    name: profile.full_name,
    username: profile.username,
    pin: "",
    isOwner: profile.is_owner === true,
    departments,
    phone: profile.phone ?? "",
    email: profile.email ?? undefined,
    baseSalary: num(profile.base_salary),
    commissionRate: num(profile.commission_rate),
    gdriveEmail: profile.gdrive_email ?? undefined,
    active: profile.active !== false,
    createdAt: profile.created_at ?? new Date().toISOString(),
    notificationPreferences: profile.notification_preferences ?? undefined,
  };
}

export function settingsFromWorkshop(
  workshop: CloudWorkshopRow,
  owner: CloudProfileRow,
): WorkshopSettings {
  const installationId =
    text(workshop.installation_id).trim().toUpperCase() || getInstallationId();
  setInstallationId(installationId);
  return {
    companyName: workshop.company_name,
    address: workshop.address ?? "",
    phone: workshop.phone ?? "",
    email: workshop.email ?? "",
    logo: workshop.logo_url ?? undefined,
    brandColor: workshop.brand_color ?? "#0f766e",
    accentColor: workshop.accent_color ?? "#f59e0b",
    googleReviewUrl: workshop.google_review_url ?? "",
    currency: workshop.currency ?? "LKR",
    qrSlug: workshop.slug,
    ownerPassword: "",
    configured: workshop.configured !== false,
    demoMode: workshop.demo_mode === true,
    createdAt: workshop.created_at ?? new Date().toISOString(),
    workingDays:
      Array.isArray(workshop.working_days) && workshop.working_days.length
        ? workshop.working_days.map((day) => num(day))
        : [1, 2, 3, 4, 5, 6],
    epfEmployeeRate: num(workshop.epf_employee_rate, 8),
    epfEmployerRate: num(workshop.epf_employer_rate, 12),
    etfRate: num(workshop.etf_rate, 3),
    trialStartedAt: workshop.trial_started_at ?? new Date().toISOString(),
    licenseKey: workshop.license_key ?? undefined,
    licenseActivatedAt: workshop.license_activated_at ?? undefined,
    licenseExpiresAt: workshop.license_expires_at ?? undefined,
    licenseHolder: workshop.license_holder ?? owner.full_name,
    installationId,
    licenseStatus: oneOf(
      workshop.license_status,
      ["Trial", "Active", "Expired", "Suspended"] as const,
      "Trial",
    ),
    licensePlan: text(workshop.license_plan, "Starter"),
    lastLicenceSyncAt: workshop.last_licence_sync_at ?? undefined,
    featureFlags: {
      ...defaultFeatureFlags(),
      ...(workshop.feature_flags ?? {}),
    },
    storesTopology: oneOf(
      workshop.stores_topology,
      ["Central", "PerSection"] as const,
      "Central",
    ),
    tinNumber: workshop.tin_number ?? "",
    vatRegNumber: workshop.vat_reg_number ?? "",
    defaultVatRate: num(workshop.default_vat_rate, 18),
    placeOfSupply: workshop.place_of_supply ?? workshop.address ?? "",
    footerInquiryLine:
      workshop.footer_inquiry_line ??
      "Any inquiry, please call our workshop hotline.",
    footerComplaintLine:
      workshop.footer_complaint_line ??
      "Any suggestion or complaint regarding your vehicle or job, please contact management.",
    printerMode: oneOf(
      workshop.printer_mode,
      ["Standard_PC", "Thermal_Only", "Both"] as const,
      "Both",
    ),
    thermalPaperWidth: oneOf(
      workshop.thermal_paper_width,
      ["58mm", "80mm"] as const,
      "80mm",
    ),
    standardPaperSize: oneOf(
      workshop.standard_paper_size,
      ["A4", "A5"] as const,
      "A4",
    ),
    bookingToken: `BOOK-${installationId}`,
    whatsappMode: "Disabled",
    whatsappSession: "default",
    whatsappConnected: false,
    whatsappAutoSend: true,
    whatsappOwnerNotify: true,
  };
}

export function bootstrapState(
  workshop: CloudWorkshopRow,
  profile: CloudProfileRow,
  profiles: CloudProfileRow[],
): AppState {
  const owner = profiles.find((entry) => entry.is_owner) ?? profile;
  const settings = settingsFromWorkshop(workshop, owner);
  const base = createEmptyState(settings, profileToUser(owner));
  const users = profiles.map(profileToUser);
  return {
    ...base,
    users,
    currentUserId: profile.id,
  };
}

function collectionItems(state: AppState, collection: SyncCollection): Array<{ id: string }> {
  const value: unknown = state[collection];
  if (!Array.isArray(value)) return [];
  return (value as unknown[]).filter(
    (item): item is { id: string } =>
      Boolean(item) && typeof item === "object" && typeof (item as { id?: unknown }).id === "string",
  );
}

export function stateToRows(state: AppState): AppRecordRow[] {
  const rows: AppRecordRow[] = [
    {
      workshop_id: "",
      collection: CLOUD_SETTINGS_COLLECTION,
      record_id: CLOUD_SETTINGS_RECORD,
      payload: state.settings,
      sort_order: 0,
      deleted: false,
    },
  ];

  for (const collection of SYNC_COLLECTIONS) {
    collectionItems(state, collection).forEach((item, index) => {
      rows.push({
        workshop_id: "",
        collection,
        record_id: item.id,
        payload: item,
        sort_order: index,
        deleted: false,
      });
    });
  }

  return rows;
}

export function recordKey(row: Pick<AppRecordRow, "collection" | "record_id">): string {
  return `${row.collection}\u0000${row.record_id}`;
}

function rowSignature(row: AppRecordRow): string {
  return JSON.stringify({
    payload: row.payload,
    sortOrder: row.sort_order,
    deleted: row.deleted,
  });
}

export interface RowDiff {
  upserts: AppRecordRow[];
  deletes: AppRecordRow[];
}

export function diffRows(previous: AppRecordRow[], next: AppRecordRow[]): RowDiff {
  const before = new Map(previous.map((row) => [recordKey(row), row]));
  const after = new Set(next.map((row) => recordKey(row)));
  const upserts: AppRecordRow[] = [];
  const deletes: AppRecordRow[] = [];

  for (const row of next) {
    const existing = before.get(recordKey(row));
    if (!existing || rowSignature(existing) !== rowSignature(row)) {
      upserts.push(row);
    }
  }

  for (const row of previous) {
    if (after.has(recordKey(row)) || row.deleted) continue;
    deletes.push({
      ...row,
      payload: {},
      deleted: true,
    });
  }

  return { upserts, deletes };
}

export function recordsToState(records: AppRecordRow[], fallback: AppState): AppState {
  const next = { ...fallback } as AppState;
  const settings = records.find(
    (row) =>
      row.collection === CLOUD_SETTINGS_COLLECTION &&
      row.record_id === CLOUD_SETTINGS_RECORD &&
      !row.deleted,
  );
  if (settings && settings.payload && typeof settings.payload === "object") {
    next.settings = {
      ...fallback.settings,
      ...(settings.payload as Partial<WorkshopSettings>),
    };
  }

  for (const collection of SYNC_COLLECTIONS) {
    const rows = records
      .filter((row) => row.collection === collection && !row.deleted)
      .sort((a, b) => a.sort_order - b.sort_order);
    (next as unknown as Record<string, unknown>)[collection] = rows.map((row) => row.payload);
  }

  return next;
}

export function applyCloudRow(state: AppState, row: AppRecordRow): AppState {
  if (row.collection === CLOUD_SETTINGS_COLLECTION) {
    if (row.deleted || !row.payload || typeof row.payload !== "object") return state;
    return {
      ...state,
      settings: {
        ...state.settings,
        ...(row.payload as Partial<WorkshopSettings>),
      },
    };
  }

  if (!(SYNC_COLLECTIONS as readonly string[]).includes(row.collection)) return state;

  const collection = row.collection as SyncCollection;
  const items = [...collectionItems(state, collection)];
  const index = items.findIndex((item) => item.id === row.record_id);

  if (row.deleted) {
    if (index < 0) return state;
    items.splice(index, 1);
  } else if (index >= 0) {
    items[index] = row.payload as { id: string };
  } else {
    const at = Math.max(0, Math.min(row.sort_order, items.length));
    items.splice(at, 0, row.payload as { id: string });
  }

  return {
    ...state,
    [collection]: items,
  } as AppState;
}

export async function fetchCloudRecords(workshopId: string): Promise<AppRecordRow[]> {
  const client = requireClientSupabase();
  const rows: AppRecordRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("app_records")
      .select("*")
      .eq("workshop_id", workshopId)
      .order("collection")
      .order("sort_order")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as AppRecordRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

export async function pushCloudRecords(
  workshopId: string,
  rows: AppRecordRow[],
): Promise<void> {
  if (!rows.length) return;
  const client = requireClientSupabase();
  const batchSize = 400;

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize).map((row) => ({
      ...row,
      workshop_id: workshopId,
    }));
    const { error } = await client
      .from("app_records")
      .upsert(batch, { onConflict: "workshop_id,collection,record_id" });
    if (error) throw error;
  }
}

export async function loadCloudContext(): Promise<CloudContext | null> {
  const client = requireClientSupabase();
  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session) return null;

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) {
    throw new Error(
      "This account has no workshop profile yet. Ask RAVsoft to provision the installation.",
    );
  }

  const typedProfile = profile as CloudProfileRow;
  const { data: workshop, error: workshopError } = await client
    .from("workshops")
    .select("*")
    .eq("id", typedProfile.workshop_id)
    .maybeSingle();
  if (workshopError) throw workshopError;
  if (!workshop) {
    throw new Error(
      "This account is linked to a missing workshop. Ask RAVsoft to repair the installation.",
    );
  }

  const { data: profiles, error: profilesError } = await client
    .from("profiles")
    .select("*")
    .eq("workshop_id", typedProfile.workshop_id)
    .order("created_at");
  if (profilesError) throw profilesError;

  const records = await fetchCloudRecords(typedProfile.workshop_id);

  return {
    session,
    profile: typedProfile,
    workshop: workshop as CloudWorkshopRow,
    profiles: ((profiles ?? []) as CloudProfileRow[]).length
      ? (profiles as CloudProfileRow[])
      : [typedProfile],
    records,
  };
}

export async function ensureCloudState(context: CloudContext): Promise<CloudStateBundle> {
  const fallback = bootstrapState(context.workshop, context.profile, context.profiles);
  const hasSettings = context.records.some(
    (row) =>
      row.collection === CLOUD_SETTINGS_COLLECTION &&
      row.record_id === CLOUD_SETTINGS_RECORD &&
      !row.deleted,
  );

  if (!hasSettings) {
    const state = {
      ...fallback,
      currentUserId: context.profile.id,
    };
    const rows = stateToRows(state);
    await pushCloudRecords(context.workshop.id, rows);
    return {
      state,
      records: rows.map((row) => ({
        ...row,
        workshop_id: context.workshop.id,
      })),
      seeded: true,
    };
  }

  const state = recordsToState(context.records, fallback);
  const canonicalInstallationId = text(context.workshop.installation_id).trim().toUpperCase();
  if (canonicalInstallationId) {
    state.settings.installationId = canonicalInstallationId;
    setInstallationId(canonicalInstallationId);
  }
  if (!state.users.some((user) => user.id === context.profile.id)) {
    state.users = [profileToUser(context.profile), ...state.users];
  }
  if (!state.users.length) {
    state.users = context.profiles.map(profileToUser);
  }
  state.currentUserId = context.profile.id;

  return { state, records: context.records, seeded: false };
}

export function subscribeCloudRecords(
  workshopId: string,
  onChange: (change: CloudChange) => void,
): () => void {
  const client = requireClientSupabase();
  const channel = client
    .channel(`app-records-${workshopId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "app_records",
        filter: `workshop_id=eq.${workshopId}`,
      },
      (payload) => {
        if (payload.eventType === "DELETE") {
          const old = payload.old as Partial<AppRecordRow>;
          if (!old.collection || !old.record_id) return;
          onChange({
            collection: old.collection,
            recordId: old.record_id,
            deleted: true,
          });
          return;
        }
        const row = payload.new as AppRecordRow;
        if (!row?.collection || !row.record_id) return;
        onChange({
          collection: row.collection,
          recordId: row.record_id,
          row,
          deleted: row.deleted === true,
        });
      },
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

export function mergePendingRows(
  existing: AppRecordRow[],
  incoming: AppRecordRow[],
): AppRecordRow[] {
  const merged = new Map(existing.map((row) => [recordKey(row), row]));
  for (const row of incoming) merged.set(recordKey(row), row);
  return [...merged.values()];
}

export function readCloudQueue(): AppRecordRow[] {
  try {
    const raw = localStorage.getItem(CLOUD_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as AppRecordRow[]) : [];
  } catch {
    return [];
  }
}

export function writeCloudQueue(rows: AppRecordRow[]): void {
  try {
    if (!rows.length) {
      localStorage.removeItem(CLOUD_CACHE_KEY);
      return;
    }
    localStorage.setItem(CLOUD_CACHE_KEY, JSON.stringify(rows.slice(-800)));
  } catch {
    /* storage unavailable */
  }
}
