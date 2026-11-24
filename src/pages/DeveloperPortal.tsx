import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  BadgeCheck,
  Banknote,
  CalendarClock,
  CircleAlert,
  Cloud,
  CloudOff,
  Copy,
  Download,
  KeyRound,
  Layers,
  Loader2,
  LogOut,
  Mail,
  MessageCircle,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ToggleRight,
  Truck,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import type {
  FeatureFlagKey,
  FeatureFlags,
  LicencePlan,
  LicenceStatus,
} from "../types";
import {
  FEATURE_FLAGS,
  MODULE_PRESETS,
  allFeatureFlags,
  defaultFeatureFlags,
} from "../lib/features";
import {
  generateOfflineToken,
  getInstallationId,
  verifyOfflineToken,
} from "../lib/licence";
import { money, shortDate, uid } from "../lib/utils";
import { cloudConfigured, masterSupabase, portalConfigured } from "../lib/supabase";

const PORTAL_KEY = "ravsoft_master_portal_v1";
const LEGACY_PORTAL_KEY = "torque_master_portal_v1";
const SOFTWARE_OPTIONS = ["Torque ERP", "ScanPlan", "TAW", "RAVBsoft"];
const SCANPLAN_LABEL = "ScanPlan";
const TAW_LABEL = "TAW";

/** Each product has its own release train; a deploy never crosses products. */
const LATEST_VERSIONS: Record<string, string> = {
  "Torque ERP": "1.4.0",
  ScanPlan: "1.0.0",
  TAW: "0.1.0",
  RAVBsoft: "1.4.0",
};

function latestVersionFor(softwareName: string): string {
  return LATEST_VERSIONS[softwareName.trim()] ?? LATEST_VERSIONS["Torque ERP"];
}

/** Kept as a default for generic copy; product screens use latestVersionFor(). */
const LATEST_APP_VERSION = LATEST_VERSIONS["Torque ERP"];

interface ReleaseEntry {
  product: string;
  version: string;
  date: string;
  title: string;
  changes: string;
  migrations: string;
}

const RELEASES: ReleaseEntry[] = [
  {
    product: "Torque ERP",
    version: "1.4.0",
    date: "2026-11-10",
    title: "Reservations, demo routing and thermal vouchers",
    changes: "Booking links, appointment review, WAHA gateway settings, demo-mode override, voucher printing.",
    migrations: "Additive only · no data rewrite",
  },
  {
    product: "Torque ERP",
    version: "1.3.1",
    date: "2026-10-22",
    title: "Estimate editing and gate override",
    changes: "Editable estimate lines, PRO override with reason, multiple bills per vehicle.",
    migrations: "Additive only · no data rewrite",
  },
  {
    product: "Torque ERP",
    version: "1.2.3",
    date: "2026-09-18",
    title: "Payroll and attendance",
    changes: "Staff payroll, employer EPF/ETF in P&L, attendance locking.",
    migrations: "Additive only · no data rewrite",
  },
  {
    product: "ScanPlan",
    version: "1.0.0",
    date: "2026-11-18",
    title: "Attendance golden master",
    changes: "QR check-in, GPS geofence, department shifts, approvals and Excel reports.",
    migrations: "Additive only · no data rewrite",
  },
  {
    product: TAW_LABEL,
    version: "0.1.0",
    date: "2026-11-24",
    title: "TAW vehicle carrier golden master",
    changes: "Login-based owner/driver roles, map pinning, WAHA, automatic GPS, partner fallback and IRD billing.",
    migrations: "Additive only · no client data",
  },
];

interface PortalClient {
  id: string;
  workshopName: string;
  softwareName: string;
  serverAddress?: string;
  appVersion: string;
  latestVersion?: string;
  gitBranch?: string;
  customBuild?: boolean;
  customisationSummary?: string;
  deployWebhookUrl?: string;
  lastDeployedAt?: string;
  lastDeployedBy?: string;
  ownerName: string;
  phone: string;
  email?: string;
  district: string;
  address?: string;
  plan: LicencePlan;
  /** Monthly licence fee typed by the RAVBsoft admin. Falls back to the plan rate card. */
  monthlyFee?: number;
  status: LicenceStatus;
  expiresAt: string;
  lastSeenAt?: string;
  featureFlags: FeatureFlags;
  notes?: string;
  createdAt: string;
}

type PaymentMethod = "Bank Transfer" | "Cash" | "Card" | "Online";

interface PortalPayment {
  id: string;
  clientId: string;
  workshopName: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  months: number;
  note?: string;
}

interface PortalData {
  clients: PortalClient[];
  payments: PortalPayment[];
}

interface PortalClientRow {
  id: string;
  workshop_name?: string | null;
  software_name?: string | null;
  server_address?: string | null;
  app_version?: string | null;
  latest_version?: string | null;
  git_branch?: string | null;
  custom_build?: boolean | null;
  customisation_summary?: string | null;
  deploy_webhook_url?: string | null;
  last_deployed_at?: string | null;
  last_deployed_by?: string | null;
  owner_name?: string | null;
  phone?: string | null;
  email?: string | null;
  district?: string | null;
  address?: string | null;
  plan?: string | null;
  monthly_fee?: number | null;
  status?: string | null;
  expires_at?: string | null;
  last_seen_at?: string | null;
  feature_flags?: unknown;
  notes?: string | null;
  created_at?: string | null;
}

interface PortalPaymentRow {
  id: string;
  client_id: string;
  workshop_name?: string | null;
  paid_at?: string | null;
  amount?: number | null;
  method?: string | null;
  reference?: string | null;
  months?: number | null;
  note?: string | null;
}

// Torque ERP installations use WS-LK-*, ScanPlan uses SP-LK-*, and TAW carrier
// installations use TAW-LK-*. One developer portal licenses every app.
const INSTALLATION_ID_PATTERN = /^(WS|SP|TAW)-LK-[A-Z0-9]{6,16}$/;

function isScanPlanClient(softwareName: string): boolean {
  return softwareName.trim().toLowerCase() === SCANPLAN_LABEL.toLowerCase();
}

function isTawClient(softwareName: string): boolean {
  return softwareName.trim().toLowerCase() === TAW_LABEL.toLowerCase();
}

function installationPrefix(softwareName: string): string {
  if (isScanPlanClient(softwareName)) return "SP-LK";
  if (isTawClient(softwareName)) return "TAW-LK";
  return "WS-LK";
}

function installationIdHint(softwareName: string): string {
  return `${installationPrefix(softwareName)}-XXXXXXXX (6–16 letters or digits)`;
}

function validInstallationId(id: string, softwareName: string): boolean {
  if (!INSTALLATION_ID_PATTERN.test(id)) return false;
  return id.startsWith(`${installationPrefix(softwareName)}-`);
}

function defaultPresetForSoftware(softwareName: string): string {
  if (isScanPlanClient(softwareName)) return "scanplan";
  if (isTawClient(softwareName)) return "taw-fleet";
  return "quick-lube";
}

function productOptions(clients: PortalClient[]): string[] {
  const names = new Set(SOFTWARE_OPTIONS);
  clients.forEach((entry) => {
    const name = entry.softwareName.trim();
    if (name) names.add(name);
  });
  return [...names].sort((a, b) => a.localeCompare(b));
}

function planFromValue(value: unknown): LicencePlan {
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw === "Professional") return "Growth";
  return PLAN_ORDER.includes(raw as LicencePlan) ? (raw as LicencePlan) : "Growth";
}

function statusFromValue(value: unknown): LicenceStatus {
  return ["Trial", "Active", "Expired", "Suspended"].includes(value as string)
    ? (value as LicenceStatus)
    : "Trial";
}

function paymentMethodFromValue(value: unknown): PaymentMethod {
  return ["Bank Transfer", "Cash", "Card", "Online"].includes(value as string)
    ? (value as PaymentMethod)
    : "Bank Transfer";
}

function clientFromRow(row: PortalClientRow): PortalClient {
  const softwareName = row.software_name?.trim() || "Torque ERP";
  return {
    id: row.id,
    workshopName: row.workshop_name ?? "Unnamed client",
    softwareName,
    serverAddress: row.server_address ?? undefined,
    appVersion: row.app_version?.trim() || latestVersionFor(softwareName),
    latestVersion: row.latest_version ?? latestVersionFor(softwareName),
    gitBranch: row.git_branch ?? undefined,
    customBuild: row.custom_build === true,
    customisationSummary: row.customisation_summary ?? undefined,
    deployWebhookUrl: row.deploy_webhook_url ?? undefined,
    lastDeployedAt: row.last_deployed_at ?? undefined,
    lastDeployedBy: row.last_deployed_by ?? undefined,
    ownerName: row.owner_name ?? "",
    phone: row.phone ?? "",
    email: row.email ?? undefined,
    district: row.district ?? "",
    address: row.address ?? undefined,
    plan: planFromValue(row.plan),
    monthlyFee: row.monthly_fee == null ? undefined : Number(row.monthly_fee) || 0,
    status: statusFromValue(row.status),
    expiresAt: row.expires_at ?? new Date().toISOString(),
    lastSeenAt: row.last_seen_at ?? undefined,
    featureFlags: {
      ...defaultFeatureFlags(),
      ...((row.feature_flags && typeof row.feature_flags === "object"
        ? row.feature_flags
        : {}) as Partial<FeatureFlags>),
    },
    notes: row.notes ?? undefined,
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function clientToRow(clientRecord: PortalClient): PortalClientRow {
  return {
    id: clientRecord.id,
    workshop_name: clientRecord.workshopName,
    software_name: clientRecord.softwareName,
    server_address: clientRecord.serverAddress ?? null,
    app_version: clientRecord.appVersion,
    latest_version: clientRecord.latestVersion ?? latestVersionFor(clientRecord.softwareName),
    git_branch: clientRecord.gitBranch ?? null,
    custom_build: clientRecord.customBuild ?? false,
    customisation_summary: clientRecord.customisationSummary ?? null,
    deploy_webhook_url: clientRecord.deployWebhookUrl ?? null,
    last_deployed_at: clientRecord.lastDeployedAt ?? null,
    last_deployed_by: clientRecord.lastDeployedBy ?? null,
    owner_name: clientRecord.ownerName,
    phone: clientRecord.phone,
    email: clientRecord.email ?? null,
    district: clientRecord.district,
    address: clientRecord.address ?? null,
    plan: clientRecord.plan,
    monthly_fee: clientRecord.monthlyFee ?? null,
    status: clientRecord.status,
    expires_at: clientRecord.expiresAt,
    last_seen_at: clientRecord.lastSeenAt ?? null,
    feature_flags: clientRecord.featureFlags,
    notes: clientRecord.notes ?? null,
  };
}

function paymentFromRow(row: PortalPaymentRow): PortalPayment {
  return {
    id: row.id,
    clientId: row.client_id,
    workshopName: row.workshop_name ?? "",
    date: row.paid_at ?? new Date().toISOString(),
    amount: Number(row.amount) || 0,
    method: paymentMethodFromValue(row.method),
    reference: row.reference ?? undefined,
    months: Number(row.months) || 1,
    note: row.note ?? undefined,
  };
}

function paymentToRow(payment: PortalPayment): PortalPaymentRow {
  return {
    id: payment.id,
    client_id: payment.clientId,
    workshop_name: payment.workshopName,
    paid_at: payment.date,
    amount: payment.amount,
    method: payment.method,
    reference: payment.reference ?? null,
    months: payment.months,
    note: payment.note ?? null,
  };
}

const PLAN_PRICES: Record<LicencePlan, number> = {
  Lite: 1900,
  Starter: 4900,
  Growth: 8900,
  Pro: 16900,
  Enterprise: 29900,
};

/** ScanPlan is priced per client; it has no fixed public rate card yet. */
const PRODUCT_RATE_CARDS: Record<string, Partial<Record<LicencePlan, number>>> = {
  "Torque ERP": PLAN_PRICES,
  RAVBsoft: PLAN_PRICES,
  TAW: PLAN_PRICES,
  ScanPlan: {},
};

const PLAN_ORDER: LicencePlan[] = ["Lite", "Starter", "Growth", "Pro", "Enterprise"];

const PLAN_DESCRIPTIONS: Record<LicencePlan, string> = {
  Lite: "Small garage — job cards, estimates, basic stock and credit. No ledger or payroll modules.",
  Starter: "Growing workshop — billing, inventory, suppliers, staff and core reports.",
  Growth: "Multi-bay garage — insurance, sections, commissions and advanced stock.",
  Pro: "Busy operation — payroll, banking, cheques, marketing and full reporting.",
  Enterprise: "Multi-branch groups — every module, attendance, API access and priority support.",
};

const SCANPLAN_PLAN_DESCRIPTIONS: Record<LicencePlan, string> = {
  Lite: "Single company — QR check-in, GPS geofence and daily attendance.",
  Starter: "Growing team — department shifts, pending approvals and Excel reports.",
  Growth: "Multi-department — NB/OT rules, company branding and full reports.",
  Pro: "Busy sites — priority support and custom attendance rules.",
  Enterprise: "Multi-site groups — every ScanPlan feature and dedicated support.",
};

const TAW_PLAN_DESCRIPTIONS: Record<LicencePlan, string> = {
  Lite: "Single operator — owner login, dispatch, one truck and customer tracking links.",
  Starter: "Small carrier — driver login, automatic GPS, map pins, WAHA and IRD invoices.",
  Growth: "Growing fleet — carrier matching, partner handover, fuel and compliance alerts.",
  Pro: "Full carrier — maintenance, warranties, payroll, P&L and live fleet map.",
  Enterprise: "Multi-branch carrier groups — every TAW module and dedicated support.",
};

function planDescription(softwareName: string, plan: LicencePlan): string {
  if (isScanPlanClient(softwareName)) return SCANPLAN_PLAN_DESCRIPTIONS[plan];
  if (isTawClient(softwareName)) return TAW_PLAN_DESCRIPTIONS[plan];
  return PLAN_DESCRIPTIONS[plan];
}

/** Fixed monthly rate for a product and plan. Undefined means "set a client fee". */
function rateFor(softwareName: string, plan: LicencePlan): number | undefined {
  return PRODUCT_RATE_CARDS[softwareName.trim()]?.[plan];
}

function feePlaceholder(softwareName: string, plan: LicencePlan): string {
  return rateFor(softwareName, plan) === undefined
    ? "Enter the agreed monthly fee"
    : String(rateFor(softwareName, plan));
}


/** Default module preset applied to each plan. */
const PLAN_PRESETS: Record<LicencePlan, string> = {
  Lite: "garage-lite",
  Starter: "quick-lube",
  Growth: "full-workshop",
  Pro: "full-workshop",
  Enterprise: "full-workshop",
};

/** Annual billing is 10 months for 12 — two months free. */
const ANNUAL_MONTHS_CHARGED = 10;

/** Lifetime is a one-time outright purchase priced at 60 monthly instalments. */
const LIFETIME_MONTHS_CHARGED = 60;

/**
 * A lifetime sale is stored as a far-future expiry so it works on the existing
 * registry without a schema change. The portal and the client app both treat
 * any expiry more than 50 years away as outright ownership.
 */
const LIFETIME_TERM_MONTHS = 100 * 12;
const LIFETIME_DAYS_THRESHOLD = 365 * 50;

/** True when a registry row represents an outright lifetime purchase. */
function isLifetimeLicence(client: { expiresAt: string }): boolean {
  return daysUntil(client.expiresAt) > LIFETIME_DAYS_THRESHOLD;
}

function monthlyFeeFor(client: {
  plan: LicencePlan;
  monthlyFee?: number;
  softwareName?: string;
}): number {
  const custom = Number(client.monthlyFee);
  if (client.monthlyFee !== undefined && Number.isFinite(custom) && custom >= 0) return custom;
  return rateFor(client.softwareName ?? "Torque ERP", client.plan) ?? 0;
}

function isoDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function addMonths(iso: string, months: number): string {
  const base = new Date(iso);
  const from = Number.isNaN(base.getTime()) ? new Date() : base;
  const next = new Date(from);
  next.setMonth(next.getMonth() + months);
  return next.toISOString();
}

function allFlags(enabled: boolean): FeatureFlags {
  return allFeatureFlags(enabled);
}

function flagsFromPreset(presetId: string): FeatureFlags {
  const preset = MODULE_PRESETS.find((entry) => entry.id === presetId);
  const flags = allFlags(false);
  (preset?.flags ?? FEATURE_FLAGS.map((flag) => flag.key)).forEach((key) => {
    flags[key] = true;
  });
  return flags;
}

function seedPortal(): PortalData {
  const enterprise = allFlags(true);
  return {
    clients: [
      {
        id: "WS-LK-DEMO0001",
        workshopName: "Vezel Masters Kandy",
        softwareName: "Torque ERP",
        serverAddress: "https://torque.vezelmasters.lk",
        appVersion: LATEST_APP_VERSION,
        latestVersion: LATEST_APP_VERSION,
        gitBranch: "main",
        customBuild: false,
        ownerName: "Ravindu Jayasinghe",
        phone: "+94 81 234 5678",
        email: "owner@vezelmasters.lk",
        district: "Kandy",
        address: "No. 12, Peradeniya Road, Kandy",
        plan: "Enterprise",
        status: "Active",
        expiresAt: isoDays(128),
        lastSeenAt: new Date().toISOString(),
        featureFlags: enterprise,
        notes: "Demo installation bundled with the workshop tour.",
        createdAt: isoDays(-420),
      },
      {
        id: "WS-LK-C9A412B7",
        workshopName: "AutoLanka Service Centre",
        softwareName: "Torque ERP",
        serverAddress: "https://erp.autolanka.lk",
        appVersion: "1.2.3",
        latestVersion: LATEST_APP_VERSION,
        gitBranch: "client/autolanka",
        customBuild: false,
        ownerName: "Dinesh Perera",
        phone: "+94 77 350 1180",
        email: "dinesh@autolanka.lk",
        district: "Colombo",
        address: "122, High Level Road, Nugegoda",
        plan: "Growth",
        status: "Active",
        expiresAt: isoDays(21),
        lastSeenAt: isoDays(-1),
        featureFlags: flagsFromPreset("full-workshop"),
        notes: "Renewal reminder due this month.",
        createdAt: isoDays(-240),
      },
      {
        id: "WS-LK-5EE920A1",
        workshopName: "Ruhunu Paint & Body",
        softwareName: "Torque ERP",
        serverAddress: "https://ruhunupaint.ravsoft.lk",
        appVersion: "1.3.1",
        latestVersion: LATEST_APP_VERSION,
        gitBranch: "client/ruhunu",
        customBuild: true,
        customisationSummary:
          "Custom insurance estimate layout, Ruhunu branch address and paint-booth labour rates.",
        ownerName: "Sanjaya Weerakoon",
        phone: "+94 71 909 4422",
        email: "sanjaya@ruhunupaint.lk",
        district: "Matara",
        address: "Station Road, Matara",
        plan: "Enterprise",
        status: "Active",
        expiresAt: isoDays(9),
        lastSeenAt: isoDays(-3),
        featureFlags: flagsFromPreset("insurance-bay"),
        notes: "Paint booth expansion — consider Enterprise renewal.",
        createdAt: isoDays(-180),
      },
      {
        id: "WS-LK-71BC0D38",
        workshopName: "Speedy Lube Kadawatha",
        softwareName: "Torque ERP",
        serverAddress: "https://speedylube.ravsoft.lk",
        appVersion: "1.1.0",
        latestVersion: LATEST_APP_VERSION,
        gitBranch: "client/speedylube",
        customBuild: true,
        customisationSummary:
          "Quick-lube express bay layout and a reduced service menu.",
        ownerName: "Nimal Fernando",
        phone: "+94 76 812 0033",
        district: "Gampaha",
        featureFlags: flagsFromPreset("quick-lube"),
        plan: "Starter",
        status: "Suspended",
        expiresAt: isoDays(-12),
        lastSeenAt: isoDays(-16),
        notes: "Suspended after two unpaid renewal reminders.",
        createdAt: isoDays(-310),
      },
      {
        id: "SP-LK-DEMO0001",
        workshopName: "Mr Paint Srilanka — Peradeniya",
        softwareName: "ScanPlan",
        serverAddress: "https://mrpperaatten-repo.netlify.app",
        appVersion: "1.0.0",
        latestVersion: "1.0.0",
        gitBranch: "client/scanplan-demo",
        customBuild: false,
        ownerName: "Ravindu Jayasinghe",
        phone: "+94 77 557 5680",
        email: "ravindranath@hotmail.co.uk",
        district: "Kandy",
        address: "Peradeniya, Kandy",
        plan: "Growth",
        status: "Trial",
        expiresAt: isoDays(14),
        lastSeenAt: isoDays(-1),
        featureFlags: allFlags(true),
        notes: "ScanPlan attendance demo installation.",
        createdAt: isoDays(-14),
      },
      {
        id: "TAW-LK-DEMO001",
        workshopName: "TAW Carrier Demo",
        softwareName: TAW_LABEL,
        serverAddress: "https://taw-demo.ravsoft.lk",
        appVersion: latestVersionFor(TAW_LABEL),
        latestVersion: latestVersionFor(TAW_LABEL),
        gitBranch: "main",
        customBuild: false,
        ownerName: "Ravindu Jayasinghe",
        phone: "+94 75 575 6803",
        email: "ravindranath@hotmail.co.uk",
        district: "Colombo",
        address: "Colombo, Sri Lanka",
        plan: "Growth",
        status: "Trial",
        expiresAt: isoDays(30),
        lastSeenAt: isoDays(-1),
        featureFlags: flagsFromPreset("taw-fleet"),
        notes: "TAW vehicle-carrier golden-master demo installation.",
        createdAt: isoDays(-7),
      },
    ],
    payments: [
      {
        id: "pay_demo_01",
        clientId: "WS-LK-DEMO0001",
        workshopName: "Vezel Masters Kandy",
        date: isoDays(-330),
        amount: 390000,
        method: "Bank Transfer",
        reference: "BOC-882114",
        months: 12,
        note: "Annual enterprise licence.",
      },
      {
        id: "pay_demo_02",
        clientId: "WS-LK-C9A412B7",
        workshopName: "AutoLanka Service Centre",
        date: isoDays(-225),
        amount: 111000,
        method: "Online",
        reference: "PAY-55190",
        months: 6,
        note: "Growth plan, six months.",
      },
      {
        id: "pay_demo_03",
        clientId: "WS-LK-5EE920A1",
        workshopName: "Ruhunu Paint & Body",
        date: isoDays(-60),
        amount: 97500,
        method: "Cash",
        months: 3,
        note: "Quarterly renewal collected on site.",
      },
      {
        id: "pay_demo_04",
        clientId: "SP-LK-DEMO0001",
        workshopName: "Mr Paint Srilanka — Peradeniya",
        date: isoDays(-14),
        amount: 89000,
        method: "Online",
        reference: "SCAN-TRIAL-01",
        months: 1,
        note: "ScanPlan trial setup.",
      },
    ],
  };
}

function loadPortal(): PortalData {
  try {
    const raw = localStorage.getItem(PORTAL_KEY) ?? localStorage.getItem(LEGACY_PORTAL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PortalData;
      if (Array.isArray(parsed.clients) && Array.isArray(parsed.payments)) {
        const seedById = new Map(seedPortal().clients.map((entry) => [entry.id, entry]));
        return {
          clients: parsed.clients.map((client) => ({
            ...client,
            softwareName:
              client.softwareName?.trim() || seedById.get(client.id)?.softwareName || "Torque ERP",
            serverAddress:
              client.serverAddress?.trim() || seedById.get(client.id)?.serverAddress,
            appVersion:
              client.appVersion?.trim() || seedById.get(client.id)?.appVersion || "1.0.0",
            latestVersion: latestVersionFor(
              client.softwareName?.trim() || seedById.get(client.id)?.softwareName || "Torque ERP",
            ),
            gitBranch:
              client.gitBranch?.trim() ||
              seedById.get(client.id)?.gitBranch ||
              `client/${client.workshopName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
            customBuild: client.customBuild ?? seedById.get(client.id)?.customBuild ?? false,
            customisationSummary:
              client.customisationSummary ?? seedById.get(client.id)?.customisationSummary,
            deployWebhookUrl:
              client.deployWebhookUrl ?? seedById.get(client.id)?.deployWebhookUrl,
            lastDeployedAt: client.lastDeployedAt,
            lastDeployedBy: client.lastDeployedBy,
            featureFlags: { ...defaultFeatureFlags(), ...(client.featureFlags ?? {}) },
          })),
          payments: parsed.payments,
        };
      }
    }
  } catch {
    /* fall through to seed */
  }
  return seedPortal();
}

function shortServerAddress(address?: string): string {
  if (!address) return "Not set";
  const host = address
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "");
  return host.length <= 6 ? host : `${host.slice(0, 6)}…`;
}

function whatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("94")) return digits;
  if (digits.startsWith("0")) return `94${digits.slice(1)}`;
  return digits;
}

function statusTone(status: LicenceStatus): string {
  if (status === "Active") return "badge-green";
  if (status === "Trial") return "badge-blue";
  if (status === "Suspended") return "badge-red";
  return "badge-amber";
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

function moduleCount(flags: FeatureFlags): number {
  return FEATURE_FLAGS.filter((flag) => flags[flag.key]).length;
}

const masterUrl = (import.meta.env.VITE_MASTER_LICENSE_URL ?? "").replace(/\/+$/, "");
const remoteConfigured = portalConfigured;

function DeveloperPortalLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!masterSupabase) {
      setError("The master portal project is not configured in this build.");
      return;
    }
    if (!email.trim() || !password) {
      setError("Enter the RAVBsoft administrator email and password.");
      return;
    }
    setBusy(true);
    setError("");
    const { data, error: signInError } = await masterSupabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    if (data.user?.app_metadata?.role !== "ravsoft_admin") {
      await masterSupabase.auth.signOut();
      setError(
        "This account is not a RAVBsoft administrator. Ask the account owner to add app_metadata.role = ravsoft_admin.",
      );
    }
  }

  return (
    <div className="auth-shell">
      <aside className="auth-art">
        <div className="auth-brand">
          <img
            className="developer-logo"
            src="/brand/ravbsoft-mark.jpg"
            alt="RAVBsoft"
          />
          <div>
            <strong>RAVBsoft</strong>
            <span>Developer portal</span>
          </div>
        </div>
        <div className="auth-hero">
          <h2>
            One registry,
            <br />
            every client,
            <br />
            <em>one trusted sign-in.</em>
          </h2>
          <p>
            The master portal holds client installations, licence payments and
            release runs. Only a RAVBsoft administrator account can read or change
            this registry.
          </p>
          <div className="auth-features">
            <div className="auth-feature">
              <ShieldCheck />
              <span>Supabase Auth with an admin-only role policy</span>
            </div>
            <div className="auth-feature">
              <Cloud />
              <span>Client servers stay isolated; only licence polls leave the workshop</span>
            </div>
            <div className="auth-feature">
              <Activity />
              <span>Every deployment is queued and recorded before a version is promoted</span>
            </div>
          </div>
        </div>
        <div className="auth-art-foot">
          <div>RAVBsoft · application licensing · v1.4</div>
        </div>
      </aside>

      <main className="auth-panel">
        <div className="auth-card">
          <span className="badge badge-brand">
            <ShieldCheck size={11} /> Master portal
          </span>
          <h1 style={{ marginTop: 12 }}>Administrator sign in</h1>
          <p className="sub">
            Use the Supabase Auth account that carries the{" "}
            <code>ravsoft_admin</code> role. Workshop owner accounts cannot open
            this portal.
          </p>

          {error && (
            <div style={{ marginTop: 14 }}>
              <CircleAlert />
              <div className="alert alert-danger" style={{ marginTop: 8 }}>
                {error}
              </div>
            </div>
          )}

          <form
            className="stack"
            style={{ marginTop: 16 }}
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div className="field">
              <label htmlFor="portal-email">Email</label>
              <input
                id="portal-email"
                className="input"
                type="email"
                autoComplete="email"
                placeholder="admin@ravsoft.lk"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="portal-password">Password</label>
              <input
                id="portal-password"
                className="input"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError("");
                }}
              />
            </div>
            <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
              {busy ? <Loader2 className="spin" /> : <Mail />}
              {busy ? "Signing in…" : "Sign in to the portal"}
            </button>
          </form>

          <div className="auth-hint" style={{ marginTop: 18 }}>
            <ShieldCheck />
            <div>
              <strong style={{ display: "block", color: "var(--ink-2)", marginBottom: 2 }}>
                Admin role required
              </strong>
              Set <code>app_metadata.role = "ravsoft_admin"</code> on the Auth user.
              Row-level security rejects every other account.
            </div>
          </div>

          <div className="auth-legal">
            <Link to="/" className="btn btn-ghost btn-sm">
              <ArrowLeft size={13} /> Back to the app
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

export function DeveloperPortalPage() {
  const [data, setData] = useState<PortalData>(() => loadPortal());
  const [tab, setTab] = useState<"fleet" | "payments" | "releases" | "plans" | "offline">("fleet");
  const [query, setQuery] = useState("");
  const [softwareFilter, setSoftwareFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | LicenceStatus>("all");
  const [notice, setNotice] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(
    null,
  );
  const [registerOpen, setRegisterOpen] = useState(false);
  const [manageId, setManageId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editor, setEditor] = useState({
    workshopName: "",
    softwareName: "Torque ERP",
    serverAddress: "",
    ownerName: "",
    phone: "",
    email: "",
    district: "",
    address: "",
    plan: "Starter" as LicencePlan,
    monthlyFee: "",
    months: 12,
    preset: "quick-lube",
    notes: "",
    gitBranch: "",
    customBuild: false,
    customisationSummary: "",
    deployWebhookUrl: "",
    installationId: "",
  });
  const [renewMonths, setRenewMonths] = useState(12);
  const [renewMethod, setRenewMethod] = useState<PaymentMethod>("Bank Transfer");
  const [renewReference, setRenewReference] = useState("");
  const [tokenText, setTokenText] = useState("");
  const [tokenInstallation, setTokenInstallation] = useState(getInstallationId());
  const [tokenHolder, setTokenHolder] = useState("");
  const [tokenPlan, setTokenPlan] = useState<LicencePlan>("Enterprise");
  const [tokenMonths, setTokenMonths] = useState(12);
  const [tokenLifetime, setTokenLifetime] = useState(false);
  const [tokenFlags, setTokenFlags] = useState<FeatureFlags>(() => allFlags(true));
  const [licenceKeyHolder, setLicenceKeyHolder] = useState("");
  const [licenceKeyPlan, setLicenceKeyPlan] = useState<LicencePlan>("Growth");
  const [licenceKeyMonths, setLicenceKeyMonths] = useState(12);
  const [licenceKeyText, setLicenceKeyText] = useState("");
  const [licenceKeyBusy, setLicenceKeyBusy] = useState(false);
  const [verifyText, setVerifyText] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [portalSession, setPortalSession] = useState<Session | null>(null);
  const [portalAuthReady, setPortalAuthReady] = useState(!portalConfigured);
  const [portalDenied, setPortalDenied] = useState(false);
  const [remoteLoaded, setRemoteLoaded] = useState(!portalConfigured);
  const [remoteError, setRemoteError] = useState("");
  const [newInstallationId, setNewInstallationId] = useState("");

  useEffect(() => {
    if (!masterSupabase) {
      setPortalAuthReady(true);
      return;
    }
    let mounted = true;
    // A slow or unreachable auth endpoint must never leave the portal stuck on
    // "Checking portal session". Show the sign-in form after a short wait.
    const authTimeout = window.setTimeout(() => {
      if (mounted) setPortalAuthReady(true);
    }, 8000);
    void masterSupabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setPortalSession(data.session ?? null);
        setPortalAuthReady(true);
      })
      .catch(() => {
        if (mounted) setPortalAuthReady(true);
      })
      .finally(() => window.clearTimeout(authTimeout));
    const { data: listener } = masterSupabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setPortalSession(session ?? null);
      setPortalAuthReady(true);
    });
    return () => {
      mounted = false;
      window.clearTimeout(authTimeout);
      listener.subscription.unsubscribe();
    };
  }, []);

  const loadRemote = useCallback(async () => {
    if (!masterSupabase || !portalSession) return;
    if (portalSession.user.app_metadata?.role !== "ravsoft_admin") {
      setPortalDenied(true);
      setRemoteLoaded(true);
      return;
    }
    setPortalDenied(false);
    setSyncing(true);
    try {
      const [clientsResult, paymentsResult] = await Promise.all([
        masterSupabase
          .from("developer_client_installations")
          .select("*")
          .order("created_at", { ascending: false }),
        masterSupabase
          .from("developer_license_payments")
          .select("*")
          .order("paid_at", { ascending: false }),
      ]);
      if (clientsResult.error) throw clientsResult.error;
      if (paymentsResult.error) throw paymentsResult.error;
      setData({
        clients: ((clientsResult.data ?? []) as PortalClientRow[]).map(clientFromRow),
        payments: ((paymentsResult.data ?? []) as PortalPaymentRow[]).map(paymentFromRow),
      });
      setRemoteError("");
    } catch (error) {
      setRemoteError(
        error instanceof Error ? error.message : "The master registry could not be loaded.",
      );
    } finally {
      setSyncing(false);
      setRemoteLoaded(true);
    }
  }, [portalSession]);

  useEffect(() => {
    if (!portalConfigured) {
      setRemoteLoaded(true);
      return;
    }
    if (!portalSession) {
      setRemoteLoaded(false);
      return;
    }
    void loadRemote();
  }, [loadRemote, portalSession]);

  useEffect(() => {
    try {
      localStorage.setItem(PORTAL_KEY, JSON.stringify(data));
    } catch {
      /* storage unavailable */
    }
  }, [data]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const previous = document.title;
    document.title = "RAVBsoft — Developer Portal";
    return () => {
      document.title = previous;
    };
  }, []);

  const client = data.clients.find((entry) => entry.id === manageId) ?? null;
  const clientIsLifetime = client ? isLifetimeLicence(client) : false;
  const softwareChoices = useMemo(() => productOptions(data.clients), [data.clients]);
  const rateCardProduct = softwareFilter === "all" ? SOFTWARE_OPTIONS[0] : softwareFilter;
  const releaseProduct = softwareFilter === "all" ? "" : softwareFilter;
  const visibleReleases = RELEASES.filter(
    (release) => !releaseProduct || release.product === releaseProduct,
  );
  const releaseLatestVersion = releaseProduct
    ? latestVersionFor(releaseProduct)
    : LATEST_APP_VERSION;
  const productClients = useMemo(
    () =>
      softwareFilter === "all"
        ? data.clients
        : data.clients.filter((entry) => entry.softwareName === softwareFilter),
    [data.clients, softwareFilter],
  );
  const productClientIds = useMemo(
    () => new Set(productClients.map((entry) => entry.id)),
    [productClients],
  );
  const productPayments = useMemo(
    () => data.payments.filter((payment) => productClientIds.has(payment.clientId)),
    [data.payments, productClientIds],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return productClients
      .filter((entry) => (statusFilter === "all" ? true : entry.status === statusFilter))
      .filter((entry) => {
        if (!needle) return true;
        return `${entry.id} ${entry.workshopName} ${entry.softwareName} ${entry.serverAddress ?? ""} ${entry.ownerName} ${entry.phone} ${entry.district} ${entry.plan}`
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  }, [productClients, query, statusFilter]);

  const activeClients = productClients.filter((entry) => entry.status === "Active");
  const expiring = activeClients.filter((entry) => {
    const days = daysUntil(entry.expiresAt);
    return days >= 0 && days <= 30;
  });
  const suspended = productClients.filter((entry) => entry.status === "Suspended");
  const monthKey = new Date().toISOString().slice(0, 7);
  const collectedThisMonth = productPayments
    .filter((payment) => payment.date.slice(0, 7) === monthKey)
    .reduce((sum, payment) => sum + payment.amount, 0);
  const lifetimeCount = activeClients.filter(isLifetimeLicence).length;
  const annualValue = activeClients
    .filter((entry) => !isLifetimeLicence(entry))
    .reduce((sum, entry) => sum + monthlyFeeFor(entry) * ANNUAL_MONTHS_CHARGED, 0);
  const onlineCount = productClients.filter(
    (entry) => entry.lastSeenAt && daysUntil(entry.lastSeenAt) >= -2,
  ).length;

  if (portalConfigured && !portalAuthReady) {
    return (
      <div className="auth-shell">
        <main className="auth-panel">
          <div className="auth-card">
            <Loader2 className="spin" />
            <h1 style={{ marginTop: 12 }}>Checking portal session</h1>
            <p className="sub">Verifying the RAVBsoft administrator sign-in.</p>
          </div>
        </main>
      </div>
    );
  }

  if (portalConfigured && !portalSession) {
    return <DeveloperPortalLogin />;
  }

  if (portalConfigured && portalDenied) {
    return (
      <div className="auth-shell">
        <main className="auth-panel">
          <div className="auth-card">
            <span className="badge badge-amber">
              <ShieldCheck size={11} /> Not authorized
            </span>
            <h1 style={{ marginTop: 12 }}>Administrator role required</h1>
            <p className="sub">
              This account is signed in, but it does not carry{" "}
              <code>app_metadata.role = "ravsoft_admin"</code>. The portal will not
              read the client registry with this session.
            </p>
            <div className="stack" style={{ marginTop: 16 }}>
              <button
                className="btn btn-secondary btn-block"
                type="button"
                onClick={() => {
                  void masterSupabase?.auth.signOut();
                }}
              >
                <LogOut /> Sign out
              </button>
              <Link to="/" className="btn btn-ghost btn-sm">
                <ArrowLeft size={13} /> Back to the app
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (portalConfigured && !remoteLoaded) {
    return (
      <div className="auth-shell">
        <main className="auth-panel">
          <div className="auth-card">
            <Loader2 className="spin" />
            <h1 style={{ marginTop: 12 }}>Loading the client registry</h1>
            <p className="sub">
              Reading installations and licence payments from the master project.
            </p>
          </div>
        </main>
      </div>
    );
  }

  function openRegister() {
    const softwareName =
      softwareFilter === "all" ? SOFTWARE_OPTIONS[0] : softwareFilter;
    setEditor({
      workshopName: "",
      softwareName,
      serverAddress: "",
      ownerName: "",
      phone: "",
      email: "",
      district: "",
      address: "",
      plan: "Starter",
      monthlyFee:
        rateFor(softwareName, "Starter") === undefined
          ? ""
          : String(rateFor(softwareName, "Starter")),
      months: 12,
      preset: defaultPresetForSoftware(softwareName),
      notes: "",
      gitBranch: "",
      customBuild: false,
      customisationSummary: "",
      deployWebhookUrl: "",
      installationId: "",
    });
    setRegisterOpen(true);
  }

  function editorMonthly(): number | undefined {
    const value = Number(editor.monthlyFee);
    return editor.monthlyFee.trim() !== "" && Number.isFinite(value) && value >= 0
      ? value
      : undefined;
  }

  function changeEditorSoftware(softwareName: string) {
    setEditor((prev) => ({
      ...prev,
      softwareName,
      preset: defaultPresetForSoftware(softwareName),
      monthlyFee:
        rateFor(softwareName, prev.plan) === undefined
          ? ""
          : String(rateFor(softwareName, prev.plan)),
    }));
  }

  async function submitRegister() {
    if (!editor.workshopName.trim() || !editor.ownerName.trim() || !editor.phone.trim()) {
      setNotice({ tone: "error", text: "Client name, owner and phone are required." });
      return;
    }
    if (!editor.softwareName.trim()) {
      setNotice({ tone: "error", text: "Enter the software name this client is licensed for." });
      return;
    }
    const softwareName = editor.softwareName.trim();
    if (rateFor(softwareName, editor.plan) === undefined && editorMonthly() === undefined) {
      setNotice({
        tone: "error",
        text: `${softwareName} has no fixed rate card. Enter the agreed monthly fee.`,
      });
      return;
    }
    const requestedId = editor.installationId.trim().toUpperCase();
    if (requestedId && !validInstallationId(requestedId, softwareName)) {
      setNotice({
        tone: "error",
        text: `A ${softwareName} installation ID must look like ${installationIdHint(softwareName)}.`,
      });
      return;
    }
    if (requestedId && data.clients.some((entry) => entry.id === requestedId)) {
      setNotice({ tone: "error", text: `Installation ID ${requestedId} is already registered.` });
      return;
    }
    const prefix = installationPrefix(softwareName);
    const id =
      requestedId || `${prefix}-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
    const clientRecord: PortalClient = {
      id,
      workshopName: editor.workshopName.trim(),
      softwareName,
      serverAddress: editor.serverAddress.trim() || undefined,
      ownerName: editor.ownerName.trim(),
      phone: editor.phone.trim(),
      email: editor.email.trim() || undefined,
      district: editor.district.trim(),
      address: editor.address.trim() || undefined,
      plan: editor.plan,
      monthlyFee: editorMonthly(),
      status: "Trial",
      appVersion: latestVersionFor(softwareName),
      latestVersion: latestVersionFor(softwareName),
      gitBranch:
        editor.gitBranch.trim() ||
        `client/${editor.workshopName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      customBuild: editor.customBuild,
      customisationSummary: editor.customisationSummary.trim() || undefined,
      deployWebhookUrl: editor.deployWebhookUrl.trim() || undefined,
      expiresAt: addMonths(new Date().toISOString(), editor.months),
      lastSeenAt: undefined,
      featureFlags: flagsFromPreset(editor.preset),
      notes: editor.notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    const pushError = await pushClient(clientRecord);
    if (pushError) {
      setNotice({
        tone: "error",
        text: `The master database rejected this registration: ${pushError}`,
      });
      return;
    }
    setData((prev) => ({ ...prev, clients: [clientRecord, ...prev.clients] }));
    setRegisterOpen(false);
    setManageId(id);
    setNotice({
      tone: "ok",
      text: `${clientRecord.workshopName} (${clientRecord.softwareName}) registered as ${id}. Generate an offline token to activate it.`,
    });
  }

  async function updateClient(updated: PortalClient): Promise<boolean> {
    setData((prev) => ({
      ...prev,
      clients: prev.clients.map((entry) => (entry.id === updated.id ? updated : entry)),
    }));
    const pushError = await pushClient(updated);
    if (pushError) {
      setNotice({
        tone: "error",
        text: `Saved on this device, but the master registry rejected the change: ${pushError}`,
      });
      return false;
    }
    return true;
  }

  async function saveDetails() {
    if (!client) return;
    if (!editor.workshopName.trim() || !editor.ownerName.trim() || !editor.phone.trim()) {
      setNotice({ tone: "error", text: "Client name, owner and phone are required." });
      return;
    }
    const softwareName = editor.softwareName.trim();
    if (!softwareName) {
      setNotice({ tone: "error", text: "Software name is required." });
      return;
    }
    if (!validInstallationId(client.id, softwareName)) {
      setNotice({
        tone: "error",
        text: `Repoint the installation ID to ${installationIdHint(softwareName)} before changing the product.`,
      });
      return;
    }
    if (rateFor(softwareName, editor.plan) === undefined && editorMonthly() === undefined) {
      setNotice({
        tone: "error",
        text: `${softwareName} has no fixed rate card. Enter the agreed monthly fee.`,
      });
      return;
    }
    const saved = await updateClient({
      ...client,
      workshopName: editor.workshopName.trim(),
      softwareName,
      serverAddress: editor.serverAddress.trim() || undefined,
      ownerName: editor.ownerName.trim(),
      phone: editor.phone.trim(),
      email: editor.email.trim() || undefined,
      district: editor.district.trim(),
      address: editor.address.trim() || undefined,
      notes: editor.notes.trim() || undefined,
      plan: editor.plan,
      monthlyFee: editorMonthly(),
      gitBranch:
        editor.gitBranch.trim() ||
        client.gitBranch ||
        `client/${editor.workshopName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      customBuild: editor.customBuild,
      customisationSummary: editor.customisationSummary.trim() || undefined,
      deployWebhookUrl: editor.deployWebhookUrl.trim() || undefined,
    });
    if (!saved) return;
    setEditing(false);
    setNotice({ tone: "ok", text: "Client details updated." });
  }

  async function deployClient(clientRecord: PortalClient) {
    const version = latestVersionFor(clientRecord.softwareName);
    if (masterSupabase && portalSession) {
      const { data: runId, error: queueError } = await masterSupabase.rpc(
        "portal_request_client_update",
        {
          p_client_id: clientRecord.id,
          p_to_version: version,
        },
      );
      if (queueError) {
        setNotice({
          tone: "error",
          text: `Could not queue the update: ${queueError.message}`,
        });
        return;
      }

      setData((prev) => ({
        ...prev,
        clients: prev.clients.map((entry) =>
          entry.id === clientRecord.id ? { ...entry, latestVersion: version } : entry,
        ),
      }));

      if (!clientRecord.deployWebhookUrl) {
        setNotice({
          tone: "warn",
          text: `v${version} queued for ${clientRecord.workshopName}, but no deploy webhook is configured. Add one to run the update automatically.`,
        });
        return;
      }

      let detail = "";
      let deployed = false;
      try {
        const response = await fetch(clientRecord.deployWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId,
            clientId: clientRecord.id,
            software: clientRecord.softwareName,
            branch: clientRecord.gitBranch,
            fromVersion: clientRecord.appVersion,
            toVersion: version,
            strategy: "additive-migrations",
            preserveClientData: true,
            requestedAt: new Date().toISOString(),
          }),
        });
        deployed = response.ok;
        detail = response.ok
          ? "Deploy webhook accepted the release."
          : `Deploy webhook returned ${response.status}.`;
      } catch (error) {
        detail =
          error instanceof Error
            ? `Deploy webhook unreachable: ${error.message}`
            : "Deploy webhook unreachable.";
      }

      const { error: resultError } = await masterSupabase.rpc(
        "portal_record_client_update_result",
        {
          p_run_id: runId,
          p_status: deployed ? "Deployed" : "Failed",
          p_detail: detail,
        },
      );

      await loadRemote();

      if (!deployed) {
        setNotice({
          tone: "error",
          text: `${clientRecord.workshopName} was not updated. ${detail} The run is recorded as Failed; client data is untouched.`,
        });
        return;
      }

      setNotice({
        tone: resultError ? "warn" : "ok",
        text: resultError
          ? `${clientRecord.workshopName} deployed to v${version}, but the run result could not be saved: ${resultError.message}`
          : `${clientRecord.workshopName} deployed to v${version}. ${detail} Client data is preserved by additive migrations.`,
      });
      return;
    }

    const updated: PortalClient = {
      ...clientRecord,
      appVersion: version,
      latestVersion: version,
      lastDeployedAt: new Date().toISOString(),
      lastDeployedBy: "RAVBsoft portal",
    };
    await updateClient(updated);
    let webhookNote = "Registry updated.";
    if (clientRecord.deployWebhookUrl) {
      try {
        const response = await fetch(clientRecord.deployWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: clientRecord.id,
            software: clientRecord.softwareName,
            branch: clientRecord.gitBranch,
            fromVersion: clientRecord.appVersion,
            toVersion: version,
            strategy: "additive-migrations",
            preserveClientData: true,
            requestedAt: new Date().toISOString(),
          }),
        });
        webhookNote = response.ok
          ? "Deploy webhook accepted the release."
          : `Webhook returned ${response.status}; retry from the server.`;
      } catch {
        webhookNote =
          "Deploy webhook could not be reached from this browser; the release is queued in the registry.";
      }
    }
    setNotice({
      tone: "ok",
      text: `${clientRecord.workshopName} updated to v${version}. ${webhookNote} Client data is preserved by additive migrations.`,
    });
  }

  function startEdit() {
    if (!client) return;
    setEditor({
      workshopName: client.workshopName,
      softwareName: client.softwareName,
      serverAddress: client.serverAddress ?? "",
      ownerName: client.ownerName,
      phone: client.phone,
      email: client.email ?? "",
      district: client.district,
      address: client.address ?? "",
      plan: client.plan,
      monthlyFee: String(client.monthlyFee ?? PLAN_PRICES[client.plan]),
      months: 12,
      preset: defaultPresetForSoftware(client.softwareName),
      notes: client.notes ?? "",
      gitBranch: client.gitBranch ?? "",
      customBuild: client.customBuild ?? false,
      customisationSummary: client.customisationSummary ?? "",
      deployWebhookUrl: client.deployWebhookUrl ?? "",
      installationId: client.id,
    });
    setTokenInstallation(client.id);
    setTokenHolder(client.workshopName);
    setTokenPlan(client.plan);
    setTokenText("");
    setNewInstallationId(client.id);
    setEditing(true);
  }

  async function sellLifetime() {
    if (!client) return;
    if (isLifetimeLicence(client)) {
      setNotice({
        tone: "warn",
        text: "This client already owns a lifetime licence.",
      });
      return;
    }
    const amount = monthlyFeeFor(client) * LIFETIME_MONTHS_CHARGED;
    if (amount <= 0) {
      setNotice({
        tone: "error",
        text: `Set a monthly fee for ${client.softwareName} before selling a lifetime licence.`,
      });
      return;
    }
    const expiresAt = addMonths(new Date().toISOString(), LIFETIME_TERM_MONTHS);
    const payment: PortalPayment = {
      id: uid("pay"),
      clientId: client.id,
      workshopName: client.workshopName,
      date: new Date().toISOString(),
      amount,
      method: renewMethod,
      reference: renewReference.trim() || undefined,
      months: LIFETIME_TERM_MONTHS,
      note: "Lifetime outright purchase — no subscription",
    };
    setData((prev) => ({
      ...prev,
      payments: [payment, ...prev.payments],
      clients: prev.clients.map((entry) =>
        entry.id === client.id
          ? { ...entry, status: "Active", expiresAt, lastSeenAt: new Date().toISOString() }
          : entry,
      ),
    }));
    setRenewReference("");
    const clientError = await pushClient({ ...client, status: "Active", expiresAt });
    const paymentError = await pushPayment(payment);
    const pushError = clientError ?? paymentError;
    setNotice({
      tone: pushError ? "error" : "ok",
      text: pushError
        ? `Lifetime sale saved on this device, but the master registry rejected it: ${pushError}`
        : `${client.workshopName} now owns ${client.softwareName} outright. ${money(amount)} recorded once — no subscription or renewal.`,
    });
  }

  async function renewClient() {
    if (!client) return;
    if (isLifetimeLicence(client)) {
      setNotice({
        tone: "warn",
        text: "This client owns a lifetime licence. No renewal is due.",
      });
      return;
    }
    const months = Math.max(1, Math.round(renewMonths));
    const startFrom =
      daysUntil(client.expiresAt) > 0 ? client.expiresAt : new Date().toISOString();
    const expiresAt = addMonths(startFrom, months);
    const billedMonths = months === 12 ? ANNUAL_MONTHS_CHARGED : months;
    const amount = monthlyFeeFor(client) * billedMonths;
    if (amount <= 0) {
      setNotice({
        tone: "error",
        text: `Set a monthly fee for ${client.softwareName} before recording a payment.`,
      });
      return;
    }
    const payment: PortalPayment = {
      id: uid("pay"),
      clientId: client.id,
      workshopName: client.workshopName,
      date: new Date().toISOString(),
      amount,
      method: renewMethod,
      reference: renewReference.trim() || undefined,
      months,
      note:
        months === 12
          ? `Annual renewal · 12 months billed as ${ANNUAL_MONTHS_CHARGED}`
          : `Renewed ${months} month${months === 1 ? "" : "s"}`,
    };
    setData((prev) => ({
      ...prev,
      payments: [payment, ...prev.payments],
      clients: prev.clients.map((entry) =>
        entry.id === client.id
          ? { ...entry, status: "Active", expiresAt, lastSeenAt: new Date().toISOString() }
          : entry,
      ),
    }));
    setRenewReference("");
    const clientError = await pushClient({ ...client, status: "Active", expiresAt });
    const paymentError = await pushPayment(payment);
    const pushError = clientError ?? paymentError;
    setNotice({
      tone: pushError ? "error" : "ok",
      text: pushError
        ? `Renewal saved on this device, but the master registry rejected it: ${pushError}`
        : `${client.workshopName} renewed for ${months} month${months === 1 ? "" : "s"} · ${money(amount)} recorded.`,
    });
  }

  async function setStatus(status: LicenceStatus) {
    if (!client) return;
    const expiresAt =
      status === "Trial" || (status === "Active" && daysUntil(client.expiresAt) < 0)
        ? addMonths(new Date().toISOString(), 1)
        : status === "Expired"
          ? new Date().toISOString()
          : client.expiresAt;
    const saved = await updateClient({ ...client, status, expiresAt });
    if (!saved) return;
    const locking = status === "Suspended" || status === "Expired";
    setNotice({
      tone: locking ? "warn" : "ok",
      text:
        status === "Trial"
          ? `${client.workshopName} restarted on a 30-day ${client.softwareName} trial.`
          : status === "Suspended"
            ? `${client.workshopName} suspended. The ${client.softwareName} app will lock on its next licence check.`
            : status === "Expired"
              ? `${client.workshopName} marked expired. The ${client.softwareName} app will lock on its next licence check.`
              : `${client.workshopName} is now active.`,
    });
  }

  async function toggleClientFlag(key: FeatureFlagKey) {
    if (!client) return;
    const featureFlags = { ...client.featureFlags, [key]: !client.featureFlags[key] };
    await updateClient({ ...client, featureFlags });
  }

  async function applyPlanPreset(presetId: string) {
    if (!client) return;
    const saved = await updateClient({ ...client, featureFlags: flagsFromPreset(presetId) });
    if (!saved) return;
    setNotice({ tone: "ok", text: "Module preset applied to this installation." });
  }

  function buildToken() {
    if (!tokenInstallation.trim()) {
      setNotice({ tone: "error", text: "Installation ID is required for an offline token." });
      return;
    }
    const token = generateOfflineToken({
      installationId: tokenInstallation.trim().toUpperCase(),
      holder: tokenHolder.trim() || "RAVBsoft client",
      plan: tokenPlan,
      status: "Active",
      expiresAt: addMonths(
        new Date().toISOString(),
        tokenLifetime ? LIFETIME_TERM_MONTHS : Math.max(1, tokenMonths),
      ),
      issuedAt: new Date().toISOString(),
      featureFlags: tokenFlags,
    });
    setTokenText(token);
    setNotice({
      tone: "ok",
      text: tokenLifetime
        ? "Signed lifetime token generated. The client owns the app with no renewal or expiry."
        : "Signed offline activation token generated. Send it to the client owner.",
    });
  }

  async function issueTawLicenceKey() {
    if (!licenceKeyHolder.trim()) {
      setNotice({ tone: "error", text: "Enter the TAW owner or company name first." });
      return;
    }
    setLicenceKeyBusy(true);
    try {
      if (masterSupabase && portalSession) {
        const { data, error } = await masterSupabase.rpc("portal_issue_license_key", {
          p_product: TAW_LABEL,
          p_holder: licenceKeyHolder.trim(),
          p_plan: licenceKeyPlan,
          p_months: licenceKeyMonths,
        });
        if (error) throw error;
        setLicenceKeyText(String(data));
        setNotice({
          tone: "ok",
          text: `TAW ${licenceKeyPlan} key issued to ${licenceKeyHolder.trim()} and stored in the master licence registry.`,
        });
      } else {
        const bytes = new Uint8Array(6);
        crypto.getRandomValues(bytes);
        const suffix = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"))
          .join("")
          .toUpperCase();
        const expiry = addMonths(new Date().toISOString(), licenceKeyMonths)
          .slice(0, 10)
          .replace(/-/g, "");
        setLicenceKeyText(`TAW-${expiry}-${suffix}`);
        setNotice({
          tone: "warn",
          text: "Offline demo key generated. Configure the master registry to make it verifiable from TAW Settings.",
        });
      }
    } catch (error) {
      setNotice({
        tone: "error",
        text: `Could not issue the TAW key: ${error instanceof Error ? error.message : "the master registry rejected the request."}`,
      });
    } finally {
      setLicenceKeyBusy(false);
    }
  }

  function copyText(value: string, label: string) {
    void navigator.clipboard
      ?.writeText(value)
      .then(() => setNotice({ tone: "ok", text: `${label} copied.` }))
      .catch(() => setNotice({ tone: "warn", text: "Copy failed — select the text manually." }));
  }

  function reminder(clientRecord: PortalClient) {
    if (isLifetimeLicence(clientRecord)) {
      setNotice({
        tone: "warn",
        text: "This client owns a lifetime licence. No renewal reminder is needed.",
      });
      return;
    }
    const link = `https://wa.me/${whatsappNumber(clientRecord.phone)}?text=${encodeURIComponent(
      `Hello ${clientRecord.ownerName}, this is RAVBsoft. The ${clientRecord.softwareName} ${clientRecord.plan} licence for ${clientRecord.workshopName} (${clientRecord.id}) expires on ${shortDate(clientRecord.expiresAt)}. Please renew to keep the licence active.`,
    )}`;
    window.open(link, "_blank", "noopener,noreferrer");
  }

  function downloadBackup() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `RAVBsoft-master-portal-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice({ tone: "ok", text: "Portal backup downloaded." });
  }

  async function pushClient(clientRecord: PortalClient): Promise<string | null> {
    if (!masterSupabase) return null;
    const { error } = await masterSupabase
      .from("developer_client_installations")
      .upsert(clientToRow(clientRecord), { onConflict: "id" });
    return error?.message ?? null;
  }

  async function pushPayment(payment: PortalPayment): Promise<string | null> {
    if (!masterSupabase) return null;
    const { error } = await masterSupabase
      .from("developer_license_payments")
      .upsert(paymentToRow(payment), { onConflict: "id" });
    return error?.message ?? null;
  }

  async function pushAll() {
    if (!masterSupabase) {
      setNotice({
        tone: "warn",
        text: "Set VITE_MASTER_LICENSE_URL and VITE_MASTER_LICENSE_ANON_KEY to publish to the master database.",
      });
      return;
    }
    setSyncing(true);
    try {
      const clientsResult = data.clients.length
        ? await masterSupabase
            .from("developer_client_installations")
            .upsert(data.clients.map(clientToRow), { onConflict: "id" })
        : { error: null };
      if (clientsResult.error) throw clientsResult.error;

      const paymentsResult = data.payments.length
        ? await masterSupabase
            .from("developer_license_payments")
            .upsert(data.payments.map(paymentToRow), { onConflict: "id" })
        : { error: null };
      if (paymentsResult.error) throw paymentsResult.error;

      setNotice({
        tone: "ok",
        text: `Published ${data.clients.length} installation${data.clients.length === 1 ? "" : "s"} and ${data.payments.length} payment${data.payments.length === 1 ? "" : "s"} to the master database.`,
      });
      await loadRemote();
    } catch (error) {
      setNotice({
        tone: "error",
        text: `Publish failed: ${error instanceof Error ? error.message : "the master database rejected the batch."}`,
      });
    } finally {
      setSyncing(false);
    }
  }

  async function changeInstallationId() {
    if (!client) return;
    const previousId = client.id;
    const next = newInstallationId.trim().toUpperCase();
    if (!validInstallationId(next, client.softwareName)) {
      setNotice({
        tone: "error",
        text: `A ${client.softwareName} installation ID must look like ${installationIdHint(client.softwareName)}.`,
      });
      return;
    }
    if (next === previousId) {
      setNotice({ tone: "warn", text: "That is already the registered installation ID." });
      return;
    }
    if (data.clients.some((entry) => entry.id === next)) {
      setNotice({ tone: "error", text: `Installation ID ${next} is already registered.` });
      return;
    }
    if (masterSupabase && portalSession) {
      const { error } = await masterSupabase.rpc("portal_change_installation_id", {
        p_old_id: previousId,
        p_new_id: next,
      });
      if (error) {
        setNotice({ tone: "error", text: `Could not change the installation ID: ${error.message}` });
        return;
      }
    }
    setData((prev) => ({
      ...prev,
      clients: prev.clients.map((entry) =>
        entry.id === previousId ? { ...entry, id: next } : entry,
      ),
      payments: prev.payments.map((payment) =>
        payment.clientId === previousId ? { ...payment, clientId: next } : payment,
      ),
    }));
    setManageId(next);
    setTokenInstallation(next);
    setNotice({
      tone: "ok",
      text: `Installation repointed from ${previousId} to ${next}. Payments and update runs moved with it.`,
    });
  }

  return (
    <div className="developer-portal">
      <header className="developer-topbar">
        <div className="row" style={{ gap: 10 }}>
          <img
            className="developer-logo"
            src="/brand/ravbsoft-mark.jpg"
            alt="RAVBsoft — enterprise management systems"
          />
          <div>
            <div className="developer-brand">RAVBsoft</div>
            <div className="developer-sub">Developer portal · App licensing</div>
          </div>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <span
            className={`badge ${
              portalSession ? "badge-green" : remoteConfigured ? "badge-amber" : "badge-slate"
            }`}
          >
            {portalSession ? <Cloud size={12} /> : <CloudOff size={12} />}
            {portalSession
              ? `Master DB · ${portalSession.user.email ?? "admin"}`
              : remoteConfigured
                ? "Portal sign-in required"
                : "Local demo registry"}
          </span>
          {portalSession && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                void masterSupabase?.auth.signOut();
              }}
              title="Sign out of the master portal"
            >
              <LogOut size={12} />
              Sign out
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={downloadBackup}>
            <Download />
            Backup
          </button>
          <Link
            className="btn btn-secondary btn-sm"
            to="/"
            title={
              cloudConfigured
                ? "Open the workshop app"
                : "Portal builds have no client database, so this opens demo data only"
            }
          >
            <ArrowLeft />
            {cloudConfigured ? "Open app" : "Demo app"}
          </Link>
        </div>
      </header>

      <main className="developer-body">
        {notice && (
          <div
            className={`alert ${
              notice.tone === "ok" ? "alert-ok" : notice.tone === "warn" ? "alert-warn" : "alert-danger"
            }`}
            style={{ marginBottom: 16 }}
          >
            {notice.tone === "ok" ? <BadgeCheck /> : <CircleAlert />}
            <span>{notice.text}</span>
          </div>
        )}
        {remoteError && (
          <div className="alert alert-warn" style={{ marginBottom: 16 }}>
            <CircleAlert />
            <span>
              Showing the local cache — the master registry could not be read: {remoteError}
            </span>
          </div>
        )}

        <div className="developer-hero">
          <div>
            <span className="developer-eyebrow">APP FLEET</span>
            <h1>Every client, every app, one console</h1>
            <p>
              Register Torque ERP, ScanPlan and TAW installations, renew LKR licences, suspend
              or expire access remotely, and manage every client from one console.
            </p>
          </div>
          <div className="developer-hero-side">
            <div className="row wrap" style={{ gap: 8 }}>
              <div className="developer-product-badge">
                <img src="/brand/torque-erp-logo.png" alt="Torque ERP — workshop management solution" />
                <div>
                  <strong>Torque ERP</strong>
                  <span>Workshop management · powered by RAVBsoft</span>
                </div>
              </div>
              <div className="developer-product-badge">
                <div
                  style={{
                    width: 40,
                    height: 40,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 10,
                    background: "var(--brand-soft, #eef4ff)",
                    color: "var(--brand, #2563eb)",
                  }}
                >
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <strong>ScanPlan</strong>
                  <span>Attendance app · powered by RAVBsoft</span>
                </div>
              </div>
              <div className="developer-product-badge">
                <div
                  style={{
                    width: 40,
                    height: 40,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 10,
                    background: "var(--brand-soft, #eef4ff)",
                    color: "var(--brand, #2563eb)",
                  }}
                >
                  <Truck size={22} />
                </div>
                <div>
                  <strong>TAW</strong>
                  <span>Vehicle carrier · powered by RAVBsoft</span>
                </div>
              </div>
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <button
                className="btn btn-secondary"
                onClick={pushAll}
                disabled={syncing}
                title="Publish the local registry to the master Supabase database"
              >
                <RefreshCw className={syncing ? "spin" : undefined} />
                {syncing ? "Publishing…" : "Publish fleet"}
              </button>
              <button className="btn btn-primary" onClick={openRegister}>
                <Plus />
                Register client
              </button>
            </div>
          </div>
        </div>

        <div className="developer-kpis">
          <div className="developer-kpi">
            <div className="developer-kpi-icon"><Users size={17} /></div>
            <div>
              <span>Installations</span>
              <strong>{productClients.length}</strong>
              <em>{activeClients.length} active · {suspended.length} suspended</em>
            </div>
          </div>
          <div className="developer-kpi">
            <div className="developer-kpi-icon amber"><CalendarClock size={17} /></div>
            <div>
              <span>Renewals within 30 days</span>
              <strong>{expiring.length}</strong>
              <em>{expiring.filter((entry) => daysUntil(entry.expiresAt) <= 7).length} inside a week</em>
            </div>
          </div>
          <div className="developer-kpi">
            <div className="developer-kpi-icon green"><Wallet size={17} /></div>
            <div>
              <span>Collected this month</span>
              <strong>{money(collectedThisMonth)}</strong>
              <em>{productPayments.length} payments logged</em>
            </div>
          </div>
          <div className="developer-kpi">
            <div className="developer-kpi-icon blue"><Banknote size={17} /></div>
            <div>
              <span>Annualised subscriptions</span>
              <strong>{money(annualValue)}</strong>
              <em>{lifetimeCount} lifetime · {onlineCount} seen in the last 48 hours</em>
            </div>
          </div>
        </div>

        <div className="developer-tabs">
          {(
            [
              ["fleet", "Fleet", <Wrench key="fleet" size={14} />],
              ["payments", "Payments", <Wallet key="payments" size={14} />],
              ["releases", "Releases", <Layers key="releases" size={14} />],
              ["plans", "Plans & pricing", <Banknote key="plans" size={14} />],
              ["offline", "Offline activation", <KeyRound key="offline" size={14} />],
            ] as const
          ).map(([key, label, icon]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key)}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {tab === "fleet" && (
          <>
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Client installations</h3>
                  <p>Each row is one isolated client server, identified by its installation ID.</p>
                </div>
                <div className="row wrap" style={{ gap: 8 }}>
                  <select
                    className="select"
                    value={softwareFilter}
                    onChange={(event) => setSoftwareFilter(event.target.value)}
                    title="Filter by product"
                  >
                    <option value="all">All products</option>
                    {softwareChoices.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <div className="input-group" style={{ minWidth: 230 }}>
                    <span className="prefix"><Search size={14} /></span>
                    <input
                      className="input"
                      placeholder="Search client, software, ID…"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </div>
                  <select
                    className="select"
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value as "all" | LicenceStatus)
                    }
                  >
                    <option value="all">All statuses</option>
                    <option value="Active">Active</option>
                    <option value="Trial">Trial</option>
                    <option value="Suspended">Suspended</option>
                    <option value="Expired">Expired</option>
                  </select>
                </div>
              </div>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Server</th>
                      <th>Installation</th>
                      <th>Licence</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((entry) => {
                      const days = daysUntil(entry.expiresAt);
                      const lifetime = isLifetimeLicence(entry);
                      return (
                        <tr key={entry.id}>
                          <td>
                            <div className="row wrap" style={{ gap: 6 }}>
                              <div className="cell-main">{entry.workshopName}</div>
                              <span className="badge badge-brand">{entry.softwareName}</span>
                            </div>
                            <div className="cell-sub">{entry.ownerName} · {entry.district || "—"}</div>
                          </td>
                          <td>
                            {entry.serverAddress ? (
                              <div className="row" style={{ gap: 4 }}>
                                <span
                                  className="developer-server"
                                  title={entry.serverAddress}
                                >
                                  {shortServerAddress(entry.serverAddress)}
                                </span>
                                <button
                                  type="button"
                                  className="developer-copy"
                                  onClick={() =>
                                    copyText(entry.serverAddress ?? "", "Server address")
                                  }
                                  title="Copy server address"
                                  aria-label={`Copy server address for ${entry.workshopName}`}
                                >
                                  <Copy size={11} />
                                </button>
                              </div>
                            ) : (
                              <span className="tiny muted">Not set</span>
                            )}
                          </td>
                          <td>
                            <button
                              className="developer-link"
                              onClick={() => copyText(entry.id, "Installation ID")}
                              title="Copy installation ID"
                            >
                              {entry.id}
                              <Copy size={11} />
                            </button>
                          </td>
                          <td>
                            <div className="cell-main">
                              {lifetime
                                ? `${entry.plan} · Lifetime`
                                : `${entry.plan} · ${money(monthlyFeeFor(entry))}/mo`}
                            </div>
                            <div className="row wrap" style={{ gap: 5, marginTop: 2 }}>
                              <span className={`badge ${entry.appVersion === latestVersionFor(entry.softwareName) ? "badge-green" : "badge-amber"}`}>
                                v{entry.appVersion}
                              </span>
                              {entry.customBuild && (
                                <span className="badge badge-purple">Custom</span>
                              )}
                            </div>
                            <div className="row wrap" style={{ gap: 5, marginTop: 2 }}>
                              <span className={`badge ${statusTone(entry.status)}`}>
                                {entry.status}
                              </span>
                              {lifetime ? (
                                <span className="badge badge-green">Owned outright</span>
                              ) : (
                                <span className={`cell-sub ${days <= 30 ? "text-amber" : ""}`}>
                                  {shortDate(entry.expiresAt)}
                                </span>
                              )}
                            </div>
                            <div className={`cell-sub ${!lifetime && days <= 30 ? "text-amber" : ""}`}>
                              {lifetime
                                ? "Lifetime licence — no renewal due"
                                : days < 0
                                  ? `${Math.abs(days)} days overdue`
                                  : `${days} days left`}
                            </div>
                          </td>
                          <td>
                            <div className="row" style={{ gap: 5, justifyContent: "flex-end" }}>
                              <button
                                className="btn btn-soft btn-sm"
                                onClick={() => {
                                  setManageId(entry.id);
                                  setEditing(false);
                                  setTokenInstallation(entry.id);
                                  setTokenHolder(entry.workshopName);
                                  setTokenPlan(entry.plan);
                                  setTokenText("");
                                }}
                              >
                                <Pencil size={12} />
                                Manage
                              </button>
                              {!lifetime && (
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => reminder(entry)}
                                  title="Send a WhatsApp renewal reminder"
                                >
                                  <MessageCircle size={12} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={5}>
                          <div className="tiny muted" style={{ padding: 18, textAlign: "center" }}>
                            No client installations match this search.
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="developer-two-col">
              <div className="card">
                <div className="card-head">
                  <div>
                    <h3>Renewal radar</h3>
                    <p>Licences expiring soon, sorted by urgency.</p>
                  </div>
                </div>
                <div className="card-body">
                  {[...activeClients]
                    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
                    .slice(0, 5)
                    .map((entry) => {
                      const days = daysUntil(entry.expiresAt);
                      return (
                        <div className="developer-radar-row" key={entry.id}>
                          <div>
                            <strong>{entry.workshopName}</strong>
                            <span>{entry.plan} · {entry.id}</span>
                          </div>
                          <div className="row" style={{ gap: 8 }}>
                            <span className={`badge ${days <= 7 ? "badge-red" : days <= 30 ? "badge-amber" : "badge-slate"}`}>
                              {days < 0 ? "Overdue" : `${days}d`}
                            </span>
                            <button
                              className="btn btn-soft btn-sm"
                              onClick={() => reminder(entry)}
                            >
                              <MessageCircle size={12} />
                              Remind
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  {activeClients.length === 0 && (
                    <div className="tiny muted">No active clients yet.</div>
                  )}
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <div>
                    <h3>Server connection</h3>
                    <p>Installations poll the master database outbound only.</p>
                  </div>
                  <span className={`badge ${remoteConfigured ? "badge-green" : "badge-amber"}`}>
                    {remoteConfigured ? <Activity size={12} /> : <CloudOff size={12} />}
                    {remoteConfigured ? "Configured" : "Offline demo"}
                  </span>
                </div>
                <div className="card-body stack" style={{ gap: 10 }}>
                  <div className="developer-code">
                    POST {remoteConfigured ? `${masterUrl}/rest/v1/rpc/poll_workshop_license` : "{VITE_MASTER_LICENSE_URL}/rest/v1/rpc/poll_workshop_license"}
                    <br />
                    POST {remoteConfigured ? `${masterUrl}/rest/v1/rpc/poll_taw_license` : "{VITE_MASTER_LICENSE_URL}/rest/v1/rpc/poll_taw_license"}
                  </div>
                  <div className="tiny muted">
                    Torque ERP and ScanPlan poll by installation ID. TAW polls by product-scoped
                    licence key, so a Torque key can never unlock TAW. Clients keep working for 7
                    days without a successful check, then lock until the next online sync.
                  </div>
                  <div className="developer-checklist">
                    <span><ShieldCheck size={13} /> Live polling for Torque ERP, ScanPlan and TAW</span>
                    <span><ShieldCheck size={13} /> Product-scoped licence keys</span>
                    <span><ShieldCheck size={13} /> Product-scoped release trains</span>
                    <span><ShieldCheck size={13} /> WhatsApp renewal reminders</span>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <div>
                    <h3>TAW licence keys</h3>
                    <p>
                      Issue a product-scoped key for TAW-Carrier. The key is stored on the master
                      project and validated through <code>poll_taw_license</code>.
                    </p>
                  </div>
                  <span className="badge badge-brand">{TAW_LABEL}</span>
                </div>
                <div className="card-body stack" style={{ gap: 10 }}>
                  <div className="grid cols-3" style={{ gap: 10 }}>
                    <label className="field">
                      <span className="label">Holder / company</span>
                      <input
                        className="input"
                        value={licenceKeyHolder}
                        onChange={(event) => setLicenceKeyHolder(event.target.value)}
                        placeholder="Carrier owner name"
                      />
                    </label>
                    <label className="field">
                      <span className="label">Plan</span>
                      <select
                        className="select"
                        value={licenceKeyPlan}
                        onChange={(event) =>
                          setLicenceKeyPlan(event.target.value as LicencePlan)
                        }
                      >
                        {PLAN_ORDER.map((plan) => (
                          <option key={plan} value={plan}>
                            {plan}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span className="label">Months</span>
                      <input
                        className="input"
                        type="number"
                        min={1}
                        max={120}
                        value={licenceKeyMonths}
                        onChange={(event) =>
                          setLicenceKeyMonths(Math.max(1, Number(event.target.value) || 1))
                        }
                      />
                    </label>
                  </div>
                  <button
                    className="btn btn-primary"
                    disabled={licenceKeyBusy || !licenceKeyHolder.trim()}
                    onClick={() => void issueTawLicenceKey()}
                  >
                    {licenceKeyBusy ? <Loader2 className="spin" size={14} /> : <KeyRound size={14} />}
                    Issue TAW key
                  </button>
                  {licenceKeyText && (
                    <div className="stack" style={{ gap: 6 }}>
                      <div className="developer-code">{licenceKeyText}</div>
                      <button
                        className="btn btn-soft btn-sm"
                        onClick={() => copyText(licenceKeyText, "TAW licence key")}
                      >
                        <Copy size={12} /> Copy key
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {tab === "payments" && (
          <div className="card">
            <div className="card-head">
              <div>
                <h3>Licence payments</h3>
                <p>
                  Subscription renewals and lifetime sales for{" "}
                  {softwareFilter === "all" ? "every RAVBsoft product" : softwareFilter}, with
                  method and reference for reconciliation.
                </p>
              </div>
              <span className="badge badge-green">
                <Banknote size={12} />
                {money(productPayments.reduce((sum, payment) => sum + payment.amount, 0))} all time
              </span>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Client</th>
                    <th>Installation</th>
                    <th>Period</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {[...productPayments]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((payment) => (
                      <tr key={payment.id}>
                        <td>{shortDate(payment.date)}</td>
                        <td>
                          <div className="cell-main">{payment.workshopName}</div>
                          {payment.note && <div className="cell-sub">{payment.note}</div>}
                        </td>
                        <td className="tiny">{payment.clientId}</td>
                        <td>
                          {payment.months >= LIFETIME_TERM_MONTHS
                            ? "Lifetime"
                            : `${payment.months} month${payment.months === 1 ? "" : "s"}`}
                        </td>
                        <td>{payment.method}</td>
                        <td className="tiny">{payment.reference ?? "—"}</td>
                        <td className="num">{money(payment.amount)}</td>
                      </tr>
                    ))}
                  {productPayments.length === 0 && (
                    <tr>
                      <td colSpan={7}>
                        <div className="tiny muted" style={{ padding: 18, textAlign: "center" }}>
                          No payments recorded yet.
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "releases" && (
          <>
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Release registry</h3>
                  <p>
                    Every core release is additive and idempotent. Deployments keep each
                    client's database untouched.
                  </p>
                </div>
                <span className="badge badge-green">Latest v{releaseLatestVersion}</span>
              </div>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Version</th>
                      <th>Release</th>
                      <th>Changes</th>
                      <th>Migration policy</th>
                      <th className="num">Clients on build</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleReleases.map((release) => (
                      <tr key={`${release.product}-${release.version}`}>
                        <td>
                          <div className="cell-main">v{release.version}</div>
                          <div className="cell-sub">
                            {release.product} · {shortDate(release.date)}
                          </div>
                        </td>
                        <td className="cell-main">{release.title}</td>
                        <td className="tiny">{release.changes}</td>
                        <td>
                          <span className="badge badge-green">{release.migrations}</span>
                        </td>
                        <td className="num">
                          {
                            productClients.filter(
                              (entry) => entry.appVersion === release.version,
                            ).length
                          }
                          /{productClients.length}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card" style={{ marginTop: 14 }}>
              <div className="card-head">
                <div>
                  <h3>Update coverage</h3>
                  <p>Who is current, who is behind and which installations carry a custom build.</p>
                </div>
              </div>
              <div className="card-body">
                <div className="developer-detail-grid">
                  <div>
                    <span>On latest</span>
                    <strong>
                      {productClients.filter((entry) => entry.appVersion === releaseLatestVersion).length}
                      /{productClients.length}
                    </strong>
                  </div>
                  <div>
                    <span>Custom builds</span>
                    <strong>{productClients.filter((entry) => entry.customBuild).length}</strong>
                  </div>
                  <div>
                    <span>Deploy webhooks</span>
                    <strong>
                      {productClients.filter((entry) => entry.deployWebhookUrl).length}
                    </strong>
                  </div>
                  <div>
                    <span>Branch-per-client</span>
                    <strong>
                      {
                        new Set(
                          productClients
                            .map((entry) => entry.gitBranch)
                            .filter((branch): branch is string => Boolean(branch)),
                        ).size
                      }
                    </strong>
                  </div>
                </div>
                <div className="tiny muted" style={{ marginTop: 10 }}>
                  Golden master: the clean system is tagged separately with zero client data,
                  so a new workshop can be cloned without copying another client's records.
                </div>
              </div>
            </div>
          </>
        )}

        {tab === "plans" && (
          <div className="stack" style={{ gap: 16 }}>
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Licence rate card · {rateCardProduct}</h3>
                  <p>
                    {isScanPlanClient(rateCardProduct)
                      ? "ScanPlan has no fixed rate card yet — type the agreed fee on each client. Yearly is 10 × that fee for 12 months and lifetime is a one-off 60 × fee."
                      : `Rates for ${rateCardProduct} subscriptions and lifetime sales. Yearly billing is 12 months for the price of ${ANNUAL_MONTHS_CHARGED} — two months free. Each client can still carry a typed custom fee.`}{" "}
                    Choose the product to switch rate-card copy.
                  </p>
                </div>
                <div className="row wrap" style={{ gap: 8 }}>
                  <select
                    className="select"
                    value={softwareFilter === "all" ? SOFTWARE_OPTIONS[0] : softwareFilter}
                    onChange={(event) => setSoftwareFilter(event.target.value)}
                    title="Rate card product"
                  >
                    {softwareChoices.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <Wallet size={16} />
                </div>
              </div>
              <div className="card-body">
                <div className="developer-plan-grid">
                  {PLAN_ORDER.map((plan) => {
                    const preset = MODULE_PRESETS.find(
                      (entry) => entry.id === PLAN_PRESETS[plan],
                    );
                    const fixedRate = rateFor(rateCardProduct, plan);
                    return (
                      <div key={plan} className="developer-plan-card">
                        <div className="row-between">
                          <strong>{plan}</strong>
                          {plan === "Growth" && (
                            <span className="badge badge-brand">Most popular</span>
                          )}
                        </div>
                        <div className="developer-plan-price">
                          {fixedRate === undefined ? "Custom fee" : money(fixedRate)}
                          <span>/month</span>
                        </div>
                        <div className="developer-plan-billing">
                          {fixedRate === undefined
                            ? "Set the agreed fee on each client"
                            : "Monthly subscription"}
                        </div>
                        <div className="developer-plan-terms">
                          <div className="developer-plan-term">
                            <span>Yearly</span>
                            <strong>
                              {fixedRate === undefined
                                ? "10 × client fee"
                                : money(fixedRate * ANNUAL_MONTHS_CHARGED)}
                            </strong>
                            <em>12 months</em>
                          </div>
                          <div className="developer-plan-term">
                            <span>Lifetime</span>
                            <strong>
                              {fixedRate === undefined
                                ? "60 × client fee"
                                : money(fixedRate * LIFETIME_MONTHS_CHARGED)}
                            </strong>
                            <em>one-time</em>
                          </div>
                        </div>
                        <div className="developer-plan-owned">
                          <BadgeCheck size={11} /> Lifetime is an outright purchase — no
                          subscription
                        </div>
                        <p className="tiny">{planDescription(rateCardProduct, plan)}</p>
                        <div className="tiny muted">
                          {isScanPlanClient(rateCardProduct)
                            ? "All attendance features included"
                            : `Default preset: ${preset?.name ?? "Full workshop"}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="alert alert-success" style={{ marginTop: 14 }}>
                  <BadgeCheck />
                  <span>
                    <strong>Lifetime is not a subscription.</strong> The client pays the one-time
                    price once and owns the app outright — no monthly charge, yearly renewal or
                    expiry. Monthly and yearly plans remain recurring subscriptions.
                  </span>
                </div>
                <div className="alert alert-info" style={{ marginTop: 10 }}>
                  <CircleAlert />
                  <span>
                    Open a client and edit its monthly fee to override the rate card. Renewals use
                    that typed fee, so discounts and legacy contracts stay accurate.
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "offline" && (
          <div className="developer-two-col">
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Offline activation token</h3>
                  <p>Issue a signed key for a Torque ERP client with no internet access.</p>
                </div>
                <KeyRound size={16} />
              </div>
              <div className="alert alert-info" style={{ marginBottom: 12 }}>
                <CircleAlert />
                <span>
                  TRQ2 tokens unlock Torque ERP only. ScanPlan attendance installations unlock
                  through live portal polling using their `SP-LK-*` ID.
                </span>
              </div>
              <div className="card-body stack" style={{ gap: 12 }}>
                <label className="field">
                  <span className="label">Installation ID</span>
                  <input
                    className="input"
                    value={tokenInstallation}
                    onChange={(event) => setTokenInstallation(event.target.value)}
                    placeholder="WS-LK-XXXXXXXX"
                  />
                </label>
                <label className="field">
                  <span className="label">Client / holder</span>
                  <input
                    className="input"
                    value={tokenHolder}
                    onChange={(event) => setTokenHolder(event.target.value)}
                    placeholder="AutoLanka Service Centre"
                  />
                </label>
                <div className="grid cols-2" style={{ gap: 10 }}>
                  <label className="field">
                    <span className="label">Plan</span>
                    <select
                      className="select"
                      value={tokenPlan}
                      onChange={(event) => setTokenPlan(event.target.value as LicencePlan)}
                    >
                      {PLAN_ORDER.map((plan) => (
                        <option key={plan}>{plan}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="label">{tokenLifetime ? "Term" : "Months"}</span>
                    {tokenLifetime ? (
                      <input className="input" value="Lifetime — no expiry" readOnly />
                    ) : (
                      <input
                        className="input"
                        type="number"
                        min={1}
                        max={36}
                        value={tokenMonths}
                        onChange={(event) => setTokenMonths(Number(event.target.value))}
                      />
                    )}
                  </label>
                </div>
                <label className="row" style={{ gap: 7, fontSize: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={tokenLifetime}
                    onChange={(event) => setTokenLifetime(event.target.checked)}
                  />
                  <span>
                    Lifetime purchase — outright ownership, no expiry and no subscription
                  </span>
                </label>
                <div>
                  <div className="label" style={{ marginBottom: 6 }}>Enabled modules</div>
                  <div className="developer-flag-grid">
                    {FEATURE_FLAGS.map((flag) => (
                      <label key={flag.key} className="developer-flag">
                        <input
                          type="checkbox"
                          checked={tokenFlags[flag.key]}
                          onChange={() =>
                            setTokenFlags((prev) => ({
                              ...prev,
                              [flag.key]: !prev[flag.key],
                            }))
                          }
                        />
                        <span>{flag.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="row wrap" style={{ gap: 8 }}>
                  <button className="btn btn-primary" onClick={buildToken}>
                    <KeyRound />
                    Generate signed token
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setTokenFlags(allFlags(true))}
                  >
                    <ToggleRight />
                    Enable all
                  </button>
                </div>
                {tokenText && (
                  <>
                    <textarea
                      className="input developer-token"
                      readOnly
                      value={tokenText}
                      rows={5}
                    />
                    <div className="row wrap" style={{ gap: 8 }}>
                      <button
                        className="btn btn-soft"
                        onClick={() => copyText(tokenText, "Activation token")}
                      >
                        <Copy />
                        Copy token
                      </button>
                      <span className="tiny muted">
                        {tokenLifetime
                          ? "Lifetime token — no expiry"
                          : `Valid until ${shortDate(addMonths(new Date().toISOString(), tokenMonths))}`}{" "}
                        · bound to {tokenInstallation.toUpperCase()}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Verify a token</h3>
                  <p>Check a token before sending it to a client.</p>
                </div>
                <ShieldCheck size={16} />
              </div>
              <div className="card-body stack" style={{ gap: 12 }}>
                <textarea
                  className="input developer-token"
                  rows={5}
                  placeholder="Paste a TRQ2. token…"
                  value={verifyText}
                  onChange={(event) => setVerifyText(event.target.value)}
                />
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    const result = verifyOfflineToken(verifyText);
                    setNotice({
                      tone: result.ok ? "ok" : "error",
                      text: result.message,
                    });
                  }}
                >
                  <ShieldCheck />
                  Verify signature
                </button>
                <div className="developer-checklist">
                  <span><ShieldCheck size={13} /> Signature cannot be edited without detection</span>
                  <span><ShieldCheck size={13} /> Installation ID must match the client</span>
                  <span><ShieldCheck size={13} /> Expiry and module flags travel inside the token</span>
                </div>
                <div className="tiny muted">
                  The client pastes this token in Settings → Licence. No inbound ports or
                  server credentials are needed on site.
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {registerOpen && (
        <div className="developer-modal-backdrop" onClick={() => setRegisterOpen(false)}>
          <div className="developer-modal" onClick={(event) => event.stopPropagation()}>
            <div className="developer-modal-head">
              <div>
                <h3>Register a client</h3>
                <p>A new {editor.softwareName} installation starts on a 30-day trial.</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setRegisterOpen(false)}>
                Close
              </button>
            </div>
            <div className="developer-modal-body">
              <div className="grid cols-2" style={{ gap: 10 }}>
                <label className="field">
                  <span className="label">Client / workshop name *</span>
                  <input
                    className="input"
                    value={editor.workshopName}
                    onChange={(event) =>
                      setEditor((prev) => ({ ...prev, workshopName: event.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  <span className="label">Software name *</span>
                  <select
                    className="select"
                    value={editor.softwareName}
                    onChange={(event) => changeEditorSoftware(event.target.value)}
                  >
                    {softwareChoices.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field" style={{ gridColumn: "1 / -1" }}>
                  <span className="label">Server address</span>
                  <input
                    className="input"
                    value={editor.serverAddress}
                    onChange={(event) =>
                      setEditor((prev) => ({ ...prev, serverAddress: event.target.value }))
                    }
                    placeholder={
                      isScanPlanClient(editor.softwareName)
                        ? "https://company.netlify.app"
                        : "https://erp.client.lk"
                    }
                  />
                </label>
                <label className="field">
                  <span className="label">Owner name *</span>
                  <input
                    className="input"
                    value={editor.ownerName}
                    onChange={(event) =>
                      setEditor((prev) => ({ ...prev, ownerName: event.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  <span className="label">Phone *</span>
                  <input
                    className="input"
                    value={editor.phone}
                    onChange={(event) =>
                      setEditor((prev) => ({ ...prev, phone: event.target.value }))
                    }
                    placeholder="+94 77 123 4567"
                  />
                </label>
                <label className="field">
                  <span className="label">Email</span>
                  <input
                    className="input"
                    value={editor.email}
                    onChange={(event) =>
                      setEditor((prev) => ({ ...prev, email: event.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  <span className="label">District</span>
                  <input
                    className="input"
                    value={editor.district}
                    onChange={(event) =>
                      setEditor((prev) => ({ ...prev, district: event.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  <span className="label">Address</span>
                  <input
                    className="input"
                    value={editor.address}
                    onChange={(event) =>
                      setEditor((prev) => ({ ...prev, address: event.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  <span className="label">Plan</span>
                  <select
                    className="select"
                    value={editor.plan}
                    onChange={(event) => {
                      const plan = event.target.value as LicencePlan;
                      setEditor((prev) => ({
                        ...prev,
                        plan,
                        monthlyFee:
                          rateFor(editor.softwareName, plan) === undefined
                            ? ""
                            : String(rateFor(editor.softwareName, plan)),
                      }));
                    }}
                  >
                    {PLAN_ORDER.map((plan) => (
                      <option key={plan} value={plan}>
                        {plan} ·{" "}
                        {rateFor(editor.softwareName, plan) === undefined
                          ? "custom fee"
                          : `${money(rateFor(editor.softwareName, plan)!)}/month`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="label">Monthly fee (LKR)</span>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step="any"
                    value={editor.monthlyFee}
                    onChange={(event) =>
                      setEditor((prev) => ({ ...prev, monthlyFee: event.target.value }))
                    }
                    placeholder={feePlaceholder(editor.softwareName, editor.plan)}
                  />
                  <span className="hint">
                    {rateFor(editor.softwareName, editor.plan) === undefined
                      ? "ScanPlan uses a client-specific fee. Enter the agreed monthly amount."
                      : `Type the agreed fee. Leave blank to use the ${editor.plan} rate card.`}
                  </span>
                </label>
                <label className="field">
                  <span className="label">Trial / licence months</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={36}
                    value={editor.months}
                    onChange={(event) =>
                      setEditor((prev) => ({ ...prev, months: Number(event.target.value) }))
                    }
                  />
                </label>
                <label className="field" style={{ gridColumn: "1 / -1" }}>
                  <span className="label">Installation ID (optional)</span>
                  <input
                    className="input"
                    value={editor.installationId}
                    onChange={(event) =>
                      setEditor((prev) => ({ ...prev, installationId: event.target.value }))
                    }
                    placeholder={`${installationPrefix(editor.softwareName)}-XXXXXXXX — leave blank to generate`}
                  />
                </label>
                {!isScanPlanClient(editor.softwareName) && (
                  <label className="field" style={{ gridColumn: "1 / -1" }}>
                    <span className="label">Module preset</span>
                    <select
                      className="select"
                      value={editor.preset}
                      onChange={(event) =>
                        setEditor((prev) => ({ ...prev, preset: event.target.value }))
                      }
                    >
                      {MODULE_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.name} — {preset.caption}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <div className="tiny muted" style={{ marginTop: 8 }}>
                {isScanPlanClient(editor.softwareName) ? (
                  <>
                    Paste the `SP-LK-*` ID shown on the ScanPlan setup or lock screen, or leave
                    it blank to generate one. The ID must match before the attendance app can
                    poll its licence.
                  </>
                ) : (
                  <>
                    Paste the ID shown in the client app under Settings → Licence, or leave it
                    blank to generate one. The ID must match before the client can poll its licence.
                  </>
                )}
              </div>
            </div>
            <div className="developer-modal-foot">
              <button className="btn btn-secondary" onClick={() => setRegisterOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={() => void submitRegister()}>
                <Plus />
                Register client
              </button>
            </div>
          </div>
        </div>
      )}

      {client && (
        <div className="developer-modal-backdrop" onClick={() => setManageId(null)}>
          <div
            className="developer-modal developer-modal-wide"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="developer-modal-head">
              <div>
                <h3>{client.workshopName}</h3>
                <p>
                  {client.softwareName} · {client.id} · {client.ownerName} · {client.phone}
                </p>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <span className={`badge ${statusTone(client.status)}`}>{client.status}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setManageId(null)}>
                  Close
                </button>
              </div>
            </div>
            <div className="developer-modal-body">
              {!editing ? (
                <>
                  <div className="developer-detail-grid">
                    <div>
                      <span>Software</span>
                      <strong>{client.softwareName}</strong>
                    </div>
                    <div>
                      <span>Server address</span>
                      <strong style={{ fontSize: 12, wordBreak: "break-all" }}>
                        {client.serverAddress ?? "Not set"}
                      </strong>
                    </div>
                    <div>
                      <span>Plan</span>
                      <strong>
                        {client.plan}
                        {clientIsLifetime ? " · Lifetime" : ""}
                      </strong>
                    </div>
                    <div>
                      <span>Licence term</span>
                      <strong>
                        {clientIsLifetime ? "Lifetime — no expiry" : shortDate(client.expiresAt)}
                      </strong>
                      <em>
                        {clientIsLifetime
                          ? "Owned outright · no subscription"
                          : daysUntil(client.expiresAt) < 0
                            ? `${Math.abs(daysUntil(client.expiresAt))} days overdue`
                            : `${daysUntil(client.expiresAt)} days left`}
                      </em>
                    </div>
                    <div>
                      <span>Last seen</span>
                      <strong>{client.lastSeenAt ? shortDate(client.lastSeenAt) : "Never"}</strong>
                    </div>
                    <div>
                      <span>{isScanPlanClient(client.softwareName) ? "Features" : "Modules"}</span>
                      <strong>
                        {isScanPlanClient(client.softwareName)
                          ? "Full attendance included"
                          : `${moduleCount(client.featureFlags)}/${FEATURE_FLAGS.length}`}
                      </strong>
                    </div>
                  </div>
                  <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
                    <button className="btn btn-secondary btn-sm" onClick={startEdit}>
                      <Pencil size={12} />
                      Edit details
                    </button>
                    {!clientIsLifetime && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => reminder(client)}
                      >
                        <MessageCircle size={12} />
                        WhatsApp reminder
                      </button>
                    )}
                    <button
                      className="btn btn-soft btn-sm"
                      onClick={() => copyText(client.id, "Installation ID")}
                    >
                      <Copy size={12} />
                      Copy installation ID
                    </button>
                    {client.serverAddress && (
                      <button
                        className="btn btn-soft btn-sm"
                        onClick={() => copyText(client.serverAddress ?? "", "Server address")}
                      >
                        <Copy size={12} />
                        Copy server address
                      </button>
                    )}
                    {client.status !== "Trial" && (
                      <button
                        className="btn btn-soft btn-sm"
                        onClick={() => void setStatus("Trial")}
                        title="Restart a 30-day trial"
                      >
                        <RefreshCw size={12} />
                        Trial
                      </button>
                    )}
                    {client.status === "Suspended" || client.status === "Expired" ? (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => void setStatus("Active")}
                      >
                        <PlayCircle size={12} />
                        Activate
                      </button>
                    ) : (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => void setStatus("Suspended")}
                      >
                        <PauseCircle size={12} />
                        Suspend
                      </button>
                    )}
                    {client.status !== "Expired" && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => void setStatus("Expired")}
                        title="Mark the licence expired — the app locks on its next check"
                      >
                        <CircleAlert size={12} />
                        Expire
                      </button>
                    )}
                  </div>

                  <div className="divider" />
                  <h4 className="developer-section-title">Release &amp; custom build</h4>
                  <div className="row wrap" style={{ gap: 8, marginBottom: 10 }}>
                    <span className={`badge ${client.appVersion === latestVersionFor(client.softwareName) ? "badge-green" : "badge-amber"}`}>
                      Installed v{client.appVersion}
                    </span>
                    <span className="badge badge-slate">
                      Latest v{latestVersionFor(client.softwareName)}
                    </span>
                    {client.customBuild ? (
                      <span className="badge badge-purple">Custom build</span>
                    ) : (
                      <span className="badge badge-green">Core build</span>
                    )}
                    <span className="chip">{client.gitBranch || "main"}</span>
                  </div>
                  {client.customisationSummary && (
                    <div className="tiny muted" style={{ marginBottom: 10 }}>
                      <strong>Customisation:</strong> {client.customisationSummary}
                    </div>
                  )}
                  <div className="row wrap" style={{ gap: 8 }}>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => void deployClient(client)}
                    >
                      <Cloud size={12} />
                      {isScanPlanClient(client.softwareName) ? "Queue update" : "Deploy latest"} · v
                      {latestVersionFor(client.softwareName)}
                    </button>
                    {client.deployWebhookUrl ? (
                      <span className="tiny muted">Webhook configured</span>
                    ) : (
                      <span className="tiny muted">
                        {isScanPlanClient(client.softwareName)
                          ? "Add a webhook if you want the update run posted automatically."
                          : "Add a deploy webhook in Edit details for one-click rollout."}
                      </span>
                    )}
                  </div>
                  <div className="tiny muted" style={{ marginTop: 6 }}>
                    {client.lastDeployedAt
                      ? `Last deployed ${shortDate(client.lastDeployedAt)} by ${client.lastDeployedBy ?? "RAVBsoft"}.`
                      : "No deployment recorded yet."}{" "}
                    {isScanPlanClient(client.softwareName)
                      ? "The Netlify site itself is deployed separately; this records the update request."
                      : "Updates apply additive migrations only; client data is never rewritten."}
                  </div>

                  <div className="divider" />
                  <h4 className="developer-section-title">Installation ID</h4>
                  <div className="grid cols-2" style={{ gap: 8, alignItems: "end" }}>
                    <label className="field">
                      <span className="label">Registered ID</span>
                      <input
                        className="input"
                        value={newInstallationId}
                        onChange={(event) => setNewInstallationId(event.target.value)}
                        placeholder={client.id}
                      />
                    </label>
                    <button
                      className="btn btn-secondary"
                      onClick={() => void changeInstallationId()}
                    >
                      <RefreshCw />
                      Repoint ID
                    </button>
                  </div>
                  <div className="tiny muted" style={{ marginTop: 6 }}>
                    Use this when the client app shows a different {installationPrefix(client.softwareName)} ID.
                    Payments and update runs are moved with the installation, then the old row is
                    removed.
                  </div>

                  {isScanPlanClient(client.softwareName) ? (
                    <>
                      <div className="divider" />
                      <h4 className="developer-section-title">ScanPlan features</h4>
                      <div className="tiny muted">
                        QR check-in, GPS geofence, department shifts, NB/OT rules, pending approvals,
                        reports and Excel export are included on every plan. Torque module switches
                        do not apply to this installation.
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="divider" />
                      <h4 className="developer-section-title">Remote module switches</h4>
                      <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => applyPlanPreset("full-workshop")}
                        >
                          <ToggleRight size={12} /> Full workshop
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => applyPlanPreset("insurance-bay")}
                        >
                          <ToggleRight size={12} /> Insurance & body
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => applyPlanPreset("quick-lube")}
                        >
                          <ToggleRight size={12} /> Service bay
                        </button>
                      </div>
                      <div className="developer-flag-grid">
                        {FEATURE_FLAGS.map((flag) => (
                          <label key={flag.key} className="developer-flag">
                            <input
                              type="checkbox"
                              checked={client.featureFlags[flag.key]}
                              onChange={() => toggleClientFlag(flag.key)}
                            />
                            <span>{flag.label}</span>
                          </label>
                        ))}
                      </div>
                      <div className="tiny muted" style={{ marginTop: 6 }}>
                        Changes reach the client on its next licence poll. Until then it keeps the
                        cached flags for up to 7 days.
                      </div>
                    </>
                  )}

                  <div className="divider" />
                  <h4 className="developer-section-title">Licence term &amp; payments</h4>
                  {clientIsLifetime ? (
                    <>
                      <div className="alert alert-success">
                        <BadgeCheck />
                        <span>
                          <strong>Lifetime licence paid in full.</strong>{" "}
                          {client.workshopName} owns {client.softwareName} outright. There is no
                          subscription, no renewal and no expiry.
                        </span>
                      </div>
                      <div className="tiny muted" style={{ marginTop: 8 }}>
                        The one-time sale is already in the payments ledger. Use the status
                        controls above only for support or enforcement.
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid cols-4" style={{ gap: 8, alignItems: "end" }}>
                    <label className="field">
                      <span className="label">Months</span>
                      <input
                        className="input"
                        type="number"
                        min={1}
                        max={36}
                        value={renewMonths}
                        onChange={(event) => setRenewMonths(Number(event.target.value))}
                      />
                      <span className="hint">
                        {money(monthlyFeeFor(client))}/mo · 12 months billed as{" "}
                        {ANNUAL_MONTHS_CHARGED}
                      </span>
                    </label>
                    <label className="field">
                      <span className="label">Method</span>
                      <select
                        className="select"
                        value={renewMethod}
                        onChange={(event) =>
                          setRenewMethod(event.target.value as PaymentMethod)
                        }
                      >
                        <option>Bank Transfer</option>
                        <option>Cash</option>
                        <option>Card</option>
                        <option>Online</option>
                      </select>
                    </label>
                    <label className="field">
                      <span className="label">Reference</span>
                      <input
                        className="input"
                        value={renewReference}
                        onChange={(event) => setRenewReference(event.target.value)}
                        placeholder="Receipt / slip no"
                      />
                    </label>
                    <button className="btn btn-primary" onClick={renewClient}>
                      <Banknote />
                      Renew · {money(monthlyFeeFor(client) * (Math.max(1, renewMonths) === 12 ? ANNUAL_MONTHS_CHARGED : Math.max(1, renewMonths)))}
                    </button>
                  </div>
                  <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
                    <button className="btn btn-secondary" onClick={() => void sellLifetime()}>
                      <BadgeCheck />
                      Sell lifetime outright —{" "}
                      {money(monthlyFeeFor(client) * LIFETIME_MONTHS_CHARGED)}
                    </button>
                    <span className="tiny muted">
                      One payment, no subscription and no future renewals. Uses the current
                      method and reference.
                    </span>
                  </div>
                    </>
                  )}

                  {isScanPlanClient(client.softwareName) ? (
                    <>
                      <div className="divider" />
                      <h4 className="developer-section-title">Licence delivery</h4>
                      <div className="tiny muted">
                        ScanPlan reads this registry through live polling with installation ID{" "}
                        <strong>{client.id}</strong>. Make sure the attendance server has
                        LICENCE_PORTAL_URL and LICENCE_PORTAL_ANON_KEY configured. TRQ2 offline
                        tokens are for Torque ERP and do not unlock ScanPlan.
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="divider" />
                      <h4 className="developer-section-title">Offline activation token</h4>
                      <div className="row wrap" style={{ gap: 8, marginBottom: 8 }}>
                        <button
                          className="btn btn-soft btn-sm"
                          onClick={() => {
                            setTokenInstallation(client.id);
                            setTokenHolder(client.workshopName);
                            setTokenPlan(client.plan);
                            setTokenMonths(renewMonths);
                            setTokenLifetime(clientIsLifetime);
                            setTokenFlags({ ...client.featureFlags });
                            setTokenText("");
                          }}
                        >
                          <KeyRound size={12} />
                          Load into generator
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setTokenInstallation(client.id);
                            setTokenHolder(client.workshopName);
                            setTokenPlan(client.plan);
                            setTokenMonths(renewMonths);
                            setTokenLifetime(clientIsLifetime);
                            setTokenFlags({ ...client.featureFlags });
                            const token = generateOfflineToken({
                              installationId: client.id,
                              holder: client.workshopName,
                              plan: client.plan,
                              status: "Active",
                              expiresAt: clientIsLifetime
                                ? addMonths(new Date().toISOString(), LIFETIME_TERM_MONTHS)
                                : addMonths(
                                    daysUntil(client.expiresAt) > 0
                                      ? client.expiresAt
                                      : new Date().toISOString(),
                                    Math.max(1, renewMonths),
                                  ),
                              issuedAt: new Date().toISOString(),
                              featureFlags: client.featureFlags,
                            });
                            setTokenText(token);
                          }}
                        >
                          <KeyRound size={12} />
                          Issue {clientIsLifetime ? "lifetime" : `${renewMonths}-month`} token
                        </button>
                      </div>
                      {tokenText ? (
                        <>
                          <textarea
                            className="input developer-token"
                            readOnly
                            rows={4}
                            value={tokenText}
                          />
                          <button
                            className="btn btn-soft btn-sm"
                            style={{ marginTop: 8 }}
                            onClick={() => copyText(tokenText, "Activation token")}
                          >
                            <Copy size={12} />
                            Copy token
                          </button>
                        </>
                      ) : (
                        <div className="tiny muted">
                          Tokens are signed and bound to {client.id}. The owner pastes one in Settings
                          → Licence while offline.
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="grid cols-2" style={{ gap: 10 }}>
                    <label className="field">
                      <span className="label">Client / workshop name *</span>
                      <input
                        className="input"
                        value={editor.workshopName}
                        onChange={(event) =>
                          setEditor((prev) => ({ ...prev, workshopName: event.target.value }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span className="label">Software name *</span>
                      <select
                        className="select"
                        value={editor.softwareName}
                        onChange={(event) => changeEditorSoftware(event.target.value)}
                      >
                        {softwareChoices.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field" style={{ gridColumn: "1 / -1" }}>
                      <span className="label">Server address</span>
                      <input
                        className="input"
                        value={editor.serverAddress}
                        onChange={(event) =>
                          setEditor((prev) => ({ ...prev, serverAddress: event.target.value }))
                        }
                        placeholder={
                          isScanPlanClient(editor.softwareName)
                            ? "https://company.netlify.app"
                            : "https://erp.client.lk"
                        }
                      />
                    </label>
                    <label className="field">
                      <span className="label">Owner name *</span>
                      <input
                        className="input"
                        value={editor.ownerName}
                        onChange={(event) =>
                          setEditor((prev) => ({ ...prev, ownerName: event.target.value }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span className="label">Phone *</span>
                      <input
                        className="input"
                        value={editor.phone}
                        onChange={(event) =>
                          setEditor((prev) => ({ ...prev, phone: event.target.value }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span className="label">Email</span>
                      <input
                        className="input"
                        value={editor.email}
                        onChange={(event) =>
                          setEditor((prev) => ({ ...prev, email: event.target.value }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span className="label">District</span>
                      <input
                        className="input"
                        value={editor.district}
                        onChange={(event) =>
                          setEditor((prev) => ({ ...prev, district: event.target.value }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span className="label">Address</span>
                      <input
                        className="input"
                        value={editor.address}
                        onChange={(event) =>
                          setEditor((prev) => ({ ...prev, address: event.target.value }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span className="label">Plan</span>
                      <select
                        className="select"
                        value={editor.plan}
                        onChange={(event) => {
                          const plan = event.target.value as LicencePlan;
                          setEditor((prev) => ({
                            ...prev,
                            plan,
                            monthlyFee:
                          rateFor(editor.softwareName, plan) === undefined
                            ? ""
                            : String(rateFor(editor.softwareName, plan)),
                          }));
                        }}
                      >
                        {PLAN_ORDER.map((plan) => (
                          <option key={plan}>{plan}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span className="label">Monthly fee (LKR)</span>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        step="any"
                        value={editor.monthlyFee}
                        onChange={(event) =>
                          setEditor((prev) => ({ ...prev, monthlyFee: event.target.value }))
                        }
                        placeholder={feePlaceholder(editor.softwareName, editor.plan)}
                      />
                      <span className="hint">
                        {rateFor(editor.softwareName, editor.plan) === undefined
                          ? "ScanPlan uses a client-specific fee. Enter the agreed monthly amount."
                          : "Typed per client. Blank uses the plan rate card."}
                      </span>
                    </label>
                    <label className="field">
                      <span className="label">Notes</span>
                      <input
                        className="input"
                        value={editor.notes}
                        onChange={(event) =>
                          setEditor((prev) => ({ ...prev, notes: event.target.value }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span className="label">Git branch</span>
                      <input
                        className="input"
                        value={editor.gitBranch}
                        placeholder="client/workshop-name"
                        onChange={(event) =>
                          setEditor((prev) => ({ ...prev, gitBranch: event.target.value }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span className="label">Deploy webhook URL</span>
                      <input
                        className="input"
                        value={editor.deployWebhookUrl}
                        placeholder="https://deploy.ravsoft.lk/hooks/..."
                        onChange={(event) =>
                          setEditor((prev) => ({
                            ...prev,
                            deployWebhookUrl: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="field" style={{ gridColumn: "1 / -1" }}>
                      <span className="label">Customisation summary</span>
                      <input
                        className="input"
                        value={editor.customisationSummary}
                        placeholder="Custom invoice layout, extra approval step, branch address…"
                        onChange={(event) =>
                          setEditor((prev) => ({
                            ...prev,
                            customisationSummary: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="field" style={{ gridColumn: "1 / -1" }}>
                      <span className="label">Build type</span>
                      <span className="row" style={{ gap: 8, alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={editor.customBuild}
                          onChange={(event) =>
                            setEditor((prev) => ({
                              ...prev,
                              customBuild: event.target.checked,
                            }))
                          }
                        />
                        <span className="tiny muted">
                          Custom build. Core updates still merge from main; client-only
                          changes live under src/custom.
                        </span>
                      </span>
                    </label>
                  </div>
                  <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
                    <button className="btn btn-secondary" onClick={() => setEditing(false)}>
                      Cancel
                    </button>
                    <button className="btn btn-primary" onClick={saveDetails}>
                      Save details
                    </button>
                  </div>
                </>
              )}

              <div className="divider" />
              <div className="tiny muted">
                Registered {shortDate(client.createdAt)} · {client.district || "District not set"}
                {client.notes ? ` · ${client.notes}` : ""}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
