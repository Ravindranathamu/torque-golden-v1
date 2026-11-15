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
import { masterSupabase, portalConfigured } from "../lib/supabase";

const PORTAL_KEY = "ravsoft_master_portal_v1";
const LEGACY_PORTAL_KEY = "torque_master_portal_v1";
const SOFTWARE_OPTIONS = ["Torque ERP"];
const LATEST_APP_VERSION = "1.4.0";
const RELEASES = [
  {
    version: "1.4.0",
    date: "2026-11-10",
    title: "Reservations, demo routing and thermal vouchers",
    changes: "Booking links, appointment review, WAHA gateway settings, demo-mode override, voucher printing.",
    migrations: "Additive only · no data rewrite",
  },
  {
    version: "1.3.1",
    date: "2026-10-22",
    title: "Estimate editing and gate override",
    changes: "Editable estimate lines, PRO override with reason, multiple bills per vehicle.",
    migrations: "Additive only · no data rewrite",
  },
  {
    version: "1.2.3",
    date: "2026-09-18",
    title: "Payroll and attendance",
    changes: "Staff payroll, employer EPF/ETF in P&L, attendance locking.",
    migrations: "Additive only · no data rewrite",
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

const INSTALLATION_ID_PATTERN = /^WS-LK-[A-Z0-9]{6,16}$/;

function planFromValue(value: unknown): LicencePlan {
  return PLAN_ORDER.includes(value as LicencePlan) ? (value as LicencePlan) : "Professional";
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
  return {
    id: row.id,
    workshopName: row.workshop_name ?? "Unnamed client",
    softwareName: row.software_name?.trim() || "Torque ERP",
    serverAddress: row.server_address ?? undefined,
    appVersion: row.app_version?.trim() || "1.0.0",
    latestVersion: row.latest_version ?? LATEST_APP_VERSION,
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
    latest_version: clientRecord.latestVersion ?? LATEST_APP_VERSION,
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
  Starter: 9500,
  Professional: 18500,
  Enterprise: 32500,
};

const PLAN_ORDER: LicencePlan[] = ["Starter", "Professional", "Enterprise"];

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
        plan: "Professional",
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
        note: "Professional plan, six months.",
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
            latestVersion: LATEST_APP_VERSION,
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
      setError("Enter the RAVsoft administrator email and password.");
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
        "This account is not a RAVsoft administrator. Ask the account owner to add app_metadata.role = ravsoft_admin.",
      );
    }
  }

  return (
    <div className="auth-shell">
      <aside className="auth-art">
        <div className="auth-brand">
          <div className="brand-mark" style={{ overflow: "hidden" }}>
            <Layers size={18} />
          </div>
          <div>
            <strong>RAVsoft</strong>
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
            release runs. Only a RAVsoft administrator account can read or change
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
          <div>RAVsoft · application licensing · v1.4</div>
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
  const [tab, setTab] = useState<"fleet" | "payments" | "releases" | "offline">("fleet");
  const [query, setQuery] = useState("");
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
    plan: "Professional" as LicencePlan,
    months: 12,
    preset: "full-workshop",
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
  const [tokenFlags, setTokenFlags] = useState<FeatureFlags>(() => allFlags(true));
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
    void masterSupabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setPortalSession(data.session ?? null);
      setPortalAuthReady(true);
    });
    const { data: listener } = masterSupabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setPortalSession(session ?? null);
      setPortalAuthReady(true);
    });
    return () => {
      mounted = false;
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
    document.title = "RAVsoft — Developer Portal";
    return () => {
      document.title = previous;
    };
  }, []);

  const client = data.clients.find((entry) => entry.id === manageId) ?? null;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.clients
      .filter((entry) => (statusFilter === "all" ? true : entry.status === statusFilter))
      .filter((entry) => {
        if (!needle) return true;
        return `${entry.id} ${entry.workshopName} ${entry.softwareName} ${entry.serverAddress ?? ""} ${entry.ownerName} ${entry.phone} ${entry.district} ${entry.plan}`
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  }, [data.clients, query, statusFilter]);

  const activeClients = data.clients.filter((entry) => entry.status === "Active");
  const expiring = activeClients.filter((entry) => {
    const days = daysUntil(entry.expiresAt);
    return days >= 0 && days <= 30;
  });
  const suspended = data.clients.filter((entry) => entry.status === "Suspended");
  const monthKey = new Date().toISOString().slice(0, 7);
  const collectedThisMonth = data.payments
    .filter((payment) => payment.date.slice(0, 7) === monthKey)
    .reduce((sum, payment) => sum + payment.amount, 0);
  const annualValue = activeClients.reduce(
    (sum, entry) => sum + PLAN_PRICES[entry.plan] * 12,
    0,
  );
  const onlineCount = data.clients.filter(
    (entry) => entry.lastSeenAt && daysUntil(entry.lastSeenAt) >= -2,
  ).length;

  if (portalConfigured && !portalAuthReady) {
    return (
      <div className="auth-shell">
        <main className="auth-panel">
          <div className="auth-card">
            <Loader2 className="spin" />
            <h1 style={{ marginTop: 12 }}>Checking portal session</h1>
            <p className="sub">Verifying the RAVsoft administrator sign-in.</p>
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
    setEditor({
      workshopName: "",
      softwareName: "Torque ERP",
      serverAddress: "",
      ownerName: "",
      phone: "",
      email: "",
      district: "",
      address: "",
      plan: "Professional",
      months: 12,
      preset: "full-workshop",
      notes: "",
      gitBranch: "",
      customBuild: false,
      customisationSummary: "",
      deployWebhookUrl: "",
      installationId: "",
    });
    setRegisterOpen(true);
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
    const requestedId = editor.installationId.trim().toUpperCase();
    if (requestedId && !INSTALLATION_ID_PATTERN.test(requestedId)) {
      setNotice({
        tone: "error",
        text: "Installation ID must look like WS-LK-XXXXXXXX (6–16 letters or digits).",
      });
      return;
    }
    if (requestedId && data.clients.some((entry) => entry.id === requestedId)) {
      setNotice({ tone: "error", text: `Installation ID ${requestedId} is already registered.` });
      return;
    }
    const id =
      requestedId || `WS-LK-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
    const clientRecord: PortalClient = {
      id,
      workshopName: editor.workshopName.trim(),
      softwareName: editor.softwareName.trim(),
      serverAddress: editor.serverAddress.trim() || undefined,
      ownerName: editor.ownerName.trim(),
      phone: editor.phone.trim(),
      email: editor.email.trim() || undefined,
      district: editor.district.trim(),
      address: editor.address.trim() || undefined,
      plan: editor.plan,
      status: "Trial",
      appVersion: LATEST_APP_VERSION,
      latestVersion: LATEST_APP_VERSION,
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
    if (!editor.softwareName.trim()) {
      setNotice({ tone: "error", text: "Software name is required." });
      return;
    }
    const saved = await updateClient({
      ...client,
      workshopName: editor.workshopName.trim(),
      softwareName: editor.softwareName.trim(),
      serverAddress: editor.serverAddress.trim() || undefined,
      ownerName: editor.ownerName.trim(),
      phone: editor.phone.trim(),
      email: editor.email.trim() || undefined,
      district: editor.district.trim(),
      address: editor.address.trim() || undefined,
      notes: editor.notes.trim() || undefined,
      plan: editor.plan,
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
    if (masterSupabase && portalSession) {
      const { data: runId, error: queueError } = await masterSupabase.rpc(
        "portal_request_client_update",
        {
          p_client_id: clientRecord.id,
          p_to_version: LATEST_APP_VERSION,
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
          entry.id === clientRecord.id
            ? { ...entry, latestVersion: LATEST_APP_VERSION }
            : entry,
        ),
      }));

      if (!clientRecord.deployWebhookUrl) {
        setNotice({
          tone: "warn",
          text: `v${LATEST_APP_VERSION} queued for ${clientRecord.workshopName}, but no deploy webhook is configured. Add one to run the update automatically.`,
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
            toVersion: LATEST_APP_VERSION,
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
          ? `${clientRecord.workshopName} deployed to v${LATEST_APP_VERSION}, but the run result could not be saved: ${resultError.message}`
          : `${clientRecord.workshopName} deployed to v${LATEST_APP_VERSION}. ${detail} Client data is preserved by additive migrations.`,
      });
      return;
    }

    const updated: PortalClient = {
      ...clientRecord,
      appVersion: LATEST_APP_VERSION,
      latestVersion: LATEST_APP_VERSION,
      lastDeployedAt: new Date().toISOString(),
      lastDeployedBy: "RAVsoft portal",
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
            toVersion: LATEST_APP_VERSION,
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
      text: `${clientRecord.workshopName} updated to v${LATEST_APP_VERSION}. ${webhookNote} Client data is preserved by additive migrations.`,
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
      months: 12,
      preset: "full-workshop",
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

  async function renewClient() {
    if (!client) return;
    const months = Math.max(1, Math.round(renewMonths));
    const startFrom =
      daysUntil(client.expiresAt) > 0 ? client.expiresAt : new Date().toISOString();
    const expiresAt = addMonths(startFrom, months);
    const amount = PLAN_PRICES[client.plan] * months;
    const payment: PortalPayment = {
      id: uid("pay"),
      clientId: client.id,
      workshopName: client.workshopName,
      date: new Date().toISOString(),
      amount,
      method: renewMethod,
      reference: renewReference.trim() || undefined,
      months,
      note: `Renewed ${months} month${months === 1 ? "" : "s"}`,
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
      status === "Active" && daysUntil(client.expiresAt) < 0
        ? addMonths(new Date().toISOString(), 1)
        : client.expiresAt;
    const saved = await updateClient({ ...client, status, expiresAt });
    if (!saved) return;
    setNotice({
      tone: status === "Suspended" ? "warn" : "ok",
      text:
        status === "Suspended"
          ? `${client.workshopName} suspended. The client will lock on its next licence check.`
          : `${client.workshopName} is now ${status.toLowerCase()}.`,
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
      holder: tokenHolder.trim() || "RAVsoft client",
      plan: tokenPlan,
      status: "Active",
      expiresAt: addMonths(new Date().toISOString(), Math.max(1, tokenMonths)),
      issuedAt: new Date().toISOString(),
      featureFlags: tokenFlags,
    });
    setTokenText(token);
    setNotice({
      tone: "ok",
      text: "Signed offline activation token generated. Send it to the client owner.",
    });
  }

  function copyText(value: string, label: string) {
    void navigator.clipboard
      ?.writeText(value)
      .then(() => setNotice({ tone: "ok", text: `${label} copied.` }))
      .catch(() => setNotice({ tone: "warn", text: "Copy failed — select the text manually." }));
  }

  function reminder(clientRecord: PortalClient) {
    const link = `https://wa.me/${whatsappNumber(clientRecord.phone)}?text=${encodeURIComponent(
      `Hello ${clientRecord.ownerName}, this is RAVsoft. The ${clientRecord.softwareName} ${clientRecord.plan} licence for ${clientRecord.workshopName} (${clientRecord.id}) expires on ${shortDate(clientRecord.expiresAt)}. Please renew to keep modules and cloud sync active.`,
    )}`;
    window.open(link, "_blank", "noopener,noreferrer");
  }

  function downloadBackup() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ravsoft-master-portal-${new Date().toISOString().slice(0, 10)}.json`;
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
    if (!INSTALLATION_ID_PATTERN.test(next)) {
      setNotice({
        tone: "error",
        text: "Installation ID must look like WS-LK-XXXXXXXX (6–16 letters or digits).",
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
      <datalist id="ravsoft-software-options">
        {SOFTWARE_OPTIONS.map((software) => (
          <option key={software} value={software} />
        ))}
      </datalist>
      <header className="developer-topbar">
        <div className="row" style={{ gap: 10 }}>
          <div className="developer-mark">
            <Layers size={18} />
          </div>
          <div>
            <div className="developer-brand">RAVsoft</div>
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
          <Link className="btn btn-secondary btn-sm" to="/">
            <ArrowLeft />
            Open app
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
              Register client installations for any RAVsoft app, renew LKR licences, switch
              modules remotely and issue signed offline activation tokens for disconnected sites.
            </p>
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

        <div className="developer-kpis">
          <div className="developer-kpi">
            <div className="developer-kpi-icon"><Users size={17} /></div>
            <div>
              <span>Installations</span>
              <strong>{data.clients.length}</strong>
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
              <em>{data.payments.length} payments logged</em>
            </div>
          </div>
          <div className="developer-kpi">
            <div className="developer-kpi-icon blue"><Banknote size={17} /></div>
            <div>
              <span>Annualised value</span>
              <strong>{money(annualValue)}</strong>
              <em>{onlineCount} seen in the last 48 hours</em>
            </div>
          </div>
        </div>

        <div className="developer-tabs">
          {(
            [
              ["fleet", "Fleet", <Wrench key="fleet" size={14} />],
              ["payments", "Payments", <Wallet key="payments" size={14} />],
              ["releases", "Releases", <Layers key="releases" size={14} />],
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
                            <div className="cell-main">{entry.plan}</div>
                            <div className="row wrap" style={{ gap: 5, marginTop: 2 }}>
                              <span className={`badge ${entry.appVersion === LATEST_APP_VERSION ? "badge-green" : "badge-amber"}`}>
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
                              <span className={`cell-sub ${days <= 30 ? "text-amber" : ""}`}>
                                {shortDate(entry.expiresAt)}
                              </span>
                            </div>
                            <div className={`cell-sub ${days <= 30 ? "text-amber" : ""}`}>
                              {days < 0 ? `${Math.abs(days)} days overdue` : `${days} days left`}
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
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => reminder(entry)}
                                title="Send a WhatsApp renewal reminder"
                              >
                                <MessageCircle size={12} />
                              </button>
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
                  </div>
                  <div className="tiny muted">
                    Clients keep working for 7 days without a successful check, then lock until
                    the next online sync. Clock rollback also forces a re-check.
                  </div>
                  <div className="developer-checklist">
                    <span><ShieldCheck size={13} /> Signed offline tokens (TRQ2)</span>
                    <span><ShieldCheck size={13} /> Installation-bound licences</span>
                    <span><ShieldCheck size={13} /> Remote module switches</span>
                    <span><ShieldCheck size={13} /> WhatsApp renewal reminders</span>
                  </div>
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
                <p>Every renewal collected in LKR, with method and reference for reconciliation.</p>
              </div>
              <span className="badge badge-green">
                <Banknote size={12} />
                {money(data.payments.reduce((sum, payment) => sum + payment.amount, 0))} lifetime
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
                  {[...data.payments]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((payment) => (
                      <tr key={payment.id}>
                        <td>{shortDate(payment.date)}</td>
                        <td>
                          <div className="cell-main">{payment.workshopName}</div>
                          {payment.note && <div className="cell-sub">{payment.note}</div>}
                        </td>
                        <td className="tiny">{payment.clientId}</td>
                        <td>{payment.months} month{payment.months === 1 ? "" : "s"}</td>
                        <td>{payment.method}</td>
                        <td className="tiny">{payment.reference ?? "—"}</td>
                        <td className="num">{money(payment.amount)}</td>
                      </tr>
                    ))}
                  {data.payments.length === 0 && (
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
                <span className="badge badge-green">Latest v{LATEST_APP_VERSION}</span>
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
                    {RELEASES.map((release) => (
                      <tr key={release.version}>
                        <td>
                          <div className="cell-main">v{release.version}</div>
                          <div className="cell-sub">{shortDate(release.date)}</div>
                        </td>
                        <td className="cell-main">{release.title}</td>
                        <td className="tiny">{release.changes}</td>
                        <td>
                          <span className="badge badge-green">{release.migrations}</span>
                        </td>
                        <td className="num">
                          {
                            data.clients.filter(
                              (entry) => entry.appVersion === release.version,
                            ).length
                          }
                          /{data.clients.length}
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
                      {data.clients.filter((entry) => entry.appVersion === LATEST_APP_VERSION).length}
                      /{data.clients.length}
                    </strong>
                  </div>
                  <div>
                    <span>Custom builds</span>
                    <strong>{data.clients.filter((entry) => entry.customBuild).length}</strong>
                  </div>
                  <div>
                    <span>Deploy webhooks</span>
                    <strong>
                      {data.clients.filter((entry) => entry.deployWebhookUrl).length}
                    </strong>
                  </div>
                  <div>
                    <span>Branch-per-client</span>
                    <strong>
                      {
                        new Set(
                          data.clients
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

        {tab === "offline" && (
          <div className="developer-two-col">
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Offline activation token</h3>
                  <p>Issue a signed key for a client with no internet access.</p>
                </div>
                <KeyRound size={16} />
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
                    <span className="label">Months</span>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      max={36}
                      value={tokenMonths}
                      onChange={(event) => setTokenMonths(Number(event.target.value))}
                    />
                  </label>
                </div>
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
                        Valid until {shortDate(addMonths(new Date().toISOString(), tokenMonths))} · bound to {tokenInstallation.toUpperCase()}
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
                <p>A new client installation starts on trial with the selected modules.</p>
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
                  <input
                    className="input"
                    list="ravsoft-software-options"
                    value={editor.softwareName}
                    onChange={(event) =>
                      setEditor((prev) => ({ ...prev, softwareName: event.target.value }))
                    }
                    placeholder="Torque ERP"
                  />
                </label>
                <label className="field" style={{ gridColumn: "1 / -1" }}>
                  <span className="label">Server address</span>
                  <input
                    className="input"
                    value={editor.serverAddress}
                    onChange={(event) =>
                      setEditor((prev) => ({ ...prev, serverAddress: event.target.value }))
                    }
                    placeholder="https://erp.client.lk"
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
                    onChange={(event) =>
                      setEditor((prev) => ({ ...prev, plan: event.target.value as LicencePlan }))
                    }
                  >
                    {PLAN_ORDER.map((plan) => (
                      <option key={plan} value={plan}>
                        {plan} · {money(PLAN_PRICES[plan])}/month
                      </option>
                    ))}
                  </select>
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
                    placeholder="WS-LK-XXXXXXXX — leave blank to generate"
                  />
                </label>
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
              </div>
              <div className="tiny muted" style={{ marginTop: 8 }}>
                Paste the ID shown in the client app under Settings → Licence, or leave it
                blank to generate one. The ID must match before the client can poll its licence.
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
                      <strong>{client.plan}</strong>
                    </div>
                    <div>
                      <span>Expires</span>
                      <strong>{shortDate(client.expiresAt)}</strong>
                      <em>
                        {daysUntil(client.expiresAt) < 0
                          ? `${Math.abs(daysUntil(client.expiresAt))} days overdue`
                          : `${daysUntil(client.expiresAt)} days left`}
                      </em>
                    </div>
                    <div>
                      <span>Last seen</span>
                      <strong>{client.lastSeenAt ? shortDate(client.lastSeenAt) : "Never"}</strong>
                    </div>
                    <div>
                      <span>Modules</span>
                      <strong>{moduleCount(client.featureFlags)}/{FEATURE_FLAGS.length}</strong>
                    </div>
                  </div>
                  <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
                    <button className="btn btn-secondary btn-sm" onClick={startEdit}>
                      <Pencil size={12} />
                      Edit details
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => reminder(client)}
                    >
                      <MessageCircle size={12} />
                      WhatsApp reminder
                    </button>
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
                    {client.status === "Suspended" ? (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => setStatus("Active")}
                      >
                        <PlayCircle size={12} />
                        Activate
                      </button>
                    ) : (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setStatus("Suspended")}
                      >
                        <PauseCircle size={12} />
                        Suspend
                      </button>
                    )}
                  </div>

                  <div className="divider" />
                  <h4 className="developer-section-title">Release &amp; custom build</h4>
                  <div className="row wrap" style={{ gap: 8, marginBottom: 10 }}>
                    <span className={`badge ${client.appVersion === LATEST_APP_VERSION ? "badge-green" : "badge-amber"}`}>
                      Installed v{client.appVersion}
                    </span>
                    <span className="badge badge-slate">Latest v{LATEST_APP_VERSION}</span>
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
                      Deploy latest · v{LATEST_APP_VERSION}
                    </button>
                    {client.deployWebhookUrl ? (
                      <span className="tiny muted">Webhook configured</span>
                    ) : (
                      <span className="tiny muted">
                        Add a deploy webhook in Edit details for one-click rollout.
                      </span>
                    )}
                  </div>
                  <div className="tiny muted" style={{ marginTop: 6 }}>
                    {client.lastDeployedAt
                      ? `Last deployed ${shortDate(client.lastDeployedAt)} by ${client.lastDeployedBy ?? "RAVsoft"}.`
                      : "No deployment recorded yet."}{" "}
                    Updates apply additive migrations only; client data is never rewritten.
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
                    Use this when the client app shows a different WS-LK ID. Payments and
                    update runs are moved with the installation, then the old row is removed.
                  </div>

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

                  <div className="divider" />
                  <h4 className="developer-section-title">Renew licence &amp; record payment</h4>
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
                      Renew · {money(PLAN_PRICES[client.plan] * Math.max(1, renewMonths))}
                    </button>
                  </div>

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
                        setTokenFlags({ ...client.featureFlags });
                        const token = generateOfflineToken({
                          installationId: client.id,
                          holder: client.workshopName,
                          plan: client.plan,
                          status: "Active",
                          expiresAt: addMonths(
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
                      Issue {renewMonths}-month token
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
                      Tokens are signed and bound to {client.id}. The owner pastes one in Settings →
                      Licence while offline.
                    </div>
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
                      <input
                        className="input"
                        list="ravsoft-software-options"
                        value={editor.softwareName}
                        onChange={(event) =>
                          setEditor((prev) => ({ ...prev, softwareName: event.target.value }))
                        }
                        placeholder="Torque ERP"
                      />
                    </label>
                    <label className="field" style={{ gridColumn: "1 / -1" }}>
                      <span className="label">Server address</span>
                      <input
                        className="input"
                        value={editor.serverAddress}
                        onChange={(event) =>
                          setEditor((prev) => ({ ...prev, serverAddress: event.target.value }))
                        }
                        placeholder="https://erp.client.lk"
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
                        onChange={(event) =>
                          setEditor((prev) => ({
                            ...prev,
                            plan: event.target.value as LicencePlan,
                          }))
                        }
                      >
                        {PLAN_ORDER.map((plan) => (
                          <option key={plan}>{plan}</option>
                        ))}
                      </select>
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
