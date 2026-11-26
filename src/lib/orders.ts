import type { FeatureFlagKey, LicencePlan } from "../types";
import { FEATURE_FLAGS } from "./features";
import { masterSupabase } from "./supabase";

export const ORDER_PRODUCTS = [
  {
    name: "Torque ERP",
    short: "Workshop ERP",
    prefix: "WS-LK",
    hasModules: true,
    tagline: "Workshop operations, billing, stock, payroll and accounts.",
    description:
      "Customer QR check-in, job cards, estimates, insurance, stores, cashier billing, payroll and owner reporting.",
  },
  {
    name: "ScanPlan",
    short: "Attendance",
    prefix: "SP-LK",
    hasModules: false,
    tagline: "QR attendance, GPS geofence and department shifts.",
    description:
      "Staff QR check-in, geofenced attendance, shift rules, approvals, reports and Excel export.",
  },
  {
    name: "TAW",
    short: "Vehicle carrier",
    prefix: "TAW-LK",
    hasModules: false,
    tagline: "Owner/driver dispatch, GPS tracking and carrier billing.",
    description:
      "Owner and driver logins, dispatch, map pinning, automatic GPS, partner handover, WAHA and IRD billing.",
  },
] as const;

export type OrderProduct = (typeof ORDER_PRODUCTS)[number]["name"];

export const ORDER_PLAN_ORDER: LicencePlan[] = [
  "Lite",
  "Starter",
  "Growth",
  "Pro",
  "Enterprise",
];

const PLAN_PRICES: Record<LicencePlan, number> = {
  Lite: 1900,
  Starter: 4900,
  Growth: 8900,
  Pro: 16900,
  Enterprise: 29900,
};

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

export function planPriceFor(product: string, plan: LicencePlan): number | undefined {
  if (product.trim().toLowerCase() === "scanplan") return undefined;
  return PLAN_PRICES[plan];
}

export function planDescriptionFor(product: string, plan: LicencePlan): string {
  const key = product.trim().toLowerCase();
  if (key === "scanplan") return SCANPLAN_PLAN_DESCRIPTIONS[plan];
  if (key === "taw") return TAW_PLAN_DESCRIPTIONS[plan];
  return PLAN_DESCRIPTIONS[plan];
}

export function orderProduct(product: string) {
  return (
    ORDER_PRODUCTS.find((entry) => entry.name === product.trim()) ?? ORDER_PRODUCTS[0]
  );
}

export function productHasModules(product: string): boolean {
  return orderProduct(product).hasModules;
}

export function installationPrefix(product: string): string {
  return orderProduct(product).prefix;
}

export function generateInstallationId(product: string): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `${installationPrefix(product)}-${suffix}`;
}

export function validInstallationIdForProduct(
  id: string,
  product: string,
): boolean {
  const prefix = installationPrefix(product);
  return new RegExp(`^${prefix}-[A-Z0-9]{6,16}$`).test(id.trim().toUpperCase());
}

export type ClientOrderStatus =
  | "Submitted"
  | "Reviewing"
  | "Provisioning"
  | "Deployed"
  | "Delivered"
  | "Trial"
  | "Active"
  | "Cancelled";

export const ORDER_STATUSES: ClientOrderStatus[] = [
  "Submitted",
  "Reviewing",
  "Provisioning",
  "Deployed",
  "Delivered",
  "Trial",
  "Active",
  "Cancelled",
];

export function orderStatusTone(status: ClientOrderStatus): string {
  if (status === "Active") return "badge-green";
  if (status === "Trial" || status === "Delivered") return "badge-blue";
  if (status === "Deployed" || status === "Provisioning") return "badge-amber";
  if (status === "Cancelled") return "badge-red";
  return "badge-slate";
}

export function orderStatusLabel(status: ClientOrderStatus): string {
  if (status === "Submitted") return "New order";
  if (status === "Reviewing") return "Reviewing";
  if (status === "Provisioning") return "Provisioning";
  if (status === "Deployed") return "Deployed";
  if (status === "Delivered") return "Link sent";
  if (status === "Trial") return "Trial";
  if (status === "Active") return "Active";
  return "Cancelled";
}

export interface ProvisioningChecklist {
  supabase: boolean;
  cloudflare: boolean;
  waha: boolean;
  other: boolean;
  aiAccess: boolean;
  deployed: boolean;
}

export const PROVISIONING_ITEMS: Array<{
  key: keyof ProvisioningChecklist;
  label: string;
  hint: string;
}> = [
  { key: "supabase", label: "Supabase project", hint: "Client database, auth and storage" },
  { key: "cloudflare", label: "Cloudflare account", hint: "DNS and Pages deployment" },
  { key: "waha", label: "WAHA / WhatsApp", hint: "Only where the app needs messaging" },
  { key: "other", label: "Other accounts", hint: "Domain, email, Google Drive, etc." },
  { key: "aiAccess", label: "Deployment access shared", hint: "Access handed to the deployment agent" },
  { key: "deployed", label: "App deployed", hint: "Build published and smoke-tested" },
];

export function defaultProvisioning(): ProvisioningChecklist {
  return {
    supabase: false,
    cloudflare: false,
    waha: false,
    other: false,
    aiAccess: false,
    deployed: false,
  };
}

export function provisioningFrom(raw: unknown): ProvisioningChecklist {
  const base = defaultProvisioning();
  if (!raw || typeof raw !== "object") return base;
  const record = raw as Record<string, unknown>;
  PROVISIONING_ITEMS.forEach(({ key }) => {
    if (typeof record[key] === "boolean") base[key] = record[key] as boolean;
  });
  return base;
}

export interface ClientOrder {
  id: string;
  reference: string;
  product: string;
  clientName: string;
  contactName: string;
  phone: string;
  email?: string;
  district: string;
  address?: string;
  plan: LicencePlan;
  monthlyFee?: number;
  modules: FeatureFlagKey[];
  notes?: string;
  status: ClientOrderStatus;
  provisioning: ProvisioningChecklist;
  serverAddress?: string;
  supabaseUrl?: string;
  cloudflareProject?: string;
  appUrl?: string;
  deployWebhookUrl?: string;
  initialUsername?: string;
  initialPassword?: string;
  ownerPin?: string;
  installationId?: string;
  clientId?: string;
  trialDays: number;
  trialEndsAt?: string;
  submittedAt: string;
  deployedAt?: string;
  deliveredAt?: string;
  activatedAt?: string;
  credentialsClearedAt?: string;
  updatedAt: string;
}

export interface ClientOrderRow {
  id: string;
  reference: string;
  product: string;
  client_name: string;
  contact_name: string;
  phone: string;
  email?: string | null;
  district?: string | null;
  address?: string | null;
  plan?: string | null;
  monthly_fee?: number | null;
  modules?: unknown;
  notes?: string | null;
  status?: string | null;
  provisioning?: unknown;
  server_address?: string | null;
  supabase_url?: string | null;
  cloudflare_project?: string | null;
  app_url?: string | null;
  deploy_webhook_url?: string | null;
  initial_username?: string | null;
  initial_password?: string | null;
  owner_pin?: string | null;
  installation_id?: string | null;
  client_id?: string | null;
  trial_days?: number | null;
  trial_ends_at?: string | null;
  submitted_at?: string | null;
  deployed_at?: string | null;
  delivered_at?: string | null;
  activated_at?: string | null;
  credentials_cleared_at?: string | null;
  updated_at?: string | null;
}

function planFromValue(value: unknown): LicencePlan {
  const raw = typeof value === "string" ? value.trim() : "";
  return ORDER_PLAN_ORDER.includes(raw as LicencePlan)
    ? (raw as LicencePlan)
    : "Growth";
}

function statusFromValue(value: unknown): ClientOrderStatus {
  return ORDER_STATUSES.includes(value as ClientOrderStatus)
    ? (value as ClientOrderStatus)
    : "Submitted";
}

function modulesFromValue(raw: unknown): FeatureFlagKey[] {
  if (!Array.isArray(raw)) return [];
  const valid = new Set(FEATURE_FLAGS.map((flag) => flag.key));
  return raw.filter(
    (value): value is FeatureFlagKey =>
      typeof value === "string" && valid.has(value as FeatureFlagKey),
  );
}

export function orderFromRow(row: ClientOrderRow): ClientOrder {
  return {
    id: row.id,
    reference: row.reference,
    product: row.product,
    clientName: row.client_name,
    contactName: row.contact_name,
    phone: row.phone,
    email: row.email ?? undefined,
    district: row.district ?? "",
    address: row.address ?? undefined,
    plan: planFromValue(row.plan),
    monthlyFee:
      row.monthly_fee == null ? undefined : Number(row.monthly_fee) || 0,
    modules: modulesFromValue(row.modules),
    notes: row.notes ?? undefined,
    status: statusFromValue(row.status),
    provisioning: provisioningFrom(row.provisioning),
    serverAddress: row.server_address ?? undefined,
    supabaseUrl: row.supabase_url ?? undefined,
    cloudflareProject: row.cloudflare_project ?? undefined,
    appUrl: row.app_url ?? undefined,
    deployWebhookUrl: row.deploy_webhook_url ?? undefined,
    initialUsername: row.initial_username ?? undefined,
    initialPassword: row.initial_password ?? undefined,
    ownerPin: row.owner_pin ?? undefined,
    installationId: row.installation_id ?? undefined,
    clientId: row.client_id ?? undefined,
    trialDays: Number(row.trial_days) || 30,
    trialEndsAt: row.trial_ends_at ?? undefined,
    submittedAt: row.submitted_at ?? new Date().toISOString(),
    deployedAt: row.deployed_at ?? undefined,
    deliveredAt: row.delivered_at ?? undefined,
    activatedAt: row.activated_at ?? undefined,
    credentialsClearedAt: row.credentials_cleared_at ?? undefined,
    updatedAt: row.updated_at ?? new Date().toISOString(),
  };
}

export function orderToRow(order: ClientOrder): ClientOrderRow {
  return {
    id: order.id,
    reference: order.reference,
    product: order.product,
    client_name: order.clientName,
    contact_name: order.contactName,
    phone: order.phone,
    email: order.email ?? null,
    district: order.district,
    address: order.address ?? null,
    plan: order.plan,
    monthly_fee: order.monthlyFee ?? null,
    modules: order.modules,
    notes: order.notes ?? null,
    status: order.status,
    provisioning: order.provisioning,
    server_address: order.serverAddress ?? null,
    supabase_url: order.supabaseUrl ?? null,
    cloudflare_project: order.cloudflareProject ?? null,
    app_url: order.appUrl ?? null,
    deploy_webhook_url: order.deployWebhookUrl ?? null,
    initial_username: order.initialUsername ?? null,
    initial_password: order.initialPassword ?? null,
    owner_pin: order.ownerPin ?? null,
    installation_id: order.installationId ?? null,
    client_id: order.clientId ?? null,
    trial_days: order.trialDays,
    trial_ends_at: order.trialEndsAt ?? null,
    submitted_at: order.submittedAt,
    deployed_at: order.deployedAt ?? null,
    delivered_at: order.deliveredAt ?? null,
    activated_at: order.activatedAt ?? null,
    credentials_cleared_at: order.credentialsClearedAt ?? null,
    updated_at: order.updatedAt,
  };
}

const LOCAL_ORDERS_KEY = "ravsoft_client_orders_v1";

export function readLocalOrders(): ClientOrder[] {
  try {
    const raw = localStorage.getItem(LOCAL_ORDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is ClientOrderRow => Boolean(entry && typeof entry === "object"))
      .map(orderFromRow);
  } catch {
    return [];
  }
}

export function writeLocalOrders(orders: ClientOrder[]): void {
  try {
    localStorage.setItem(LOCAL_ORDERS_KEY, JSON.stringify(orders.map(orderToRow)));
  } catch {
    /* storage unavailable */
  }
}

export function updateLocalOrder(updated: ClientOrder): void {
  const orders = readLocalOrders();
  writeLocalOrders(
    orders.some((entry) => entry.id === updated.id)
      ? orders.map((entry) => (entry.id === updated.id ? updated : entry))
      : [updated, ...orders],
  );
}

export interface ClientOrderInput {
  product: string;
  clientName: string;
  contactName: string;
  phone: string;
  email?: string;
  district?: string;
  address?: string;
  plan: LicencePlan;
  modules: FeatureFlagKey[];
  notes?: string;
}

function localReference(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return `ORD-${date}-${Array.from(bytes, (value) => value.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function localOrderId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type SubmitOrderResult =
  | { ok: true; reference: string; local: boolean }
  | { ok: false; message: string };

/**
 * Public order submission. In production this calls the anon RPC on the master
 * portal. In the local demo it stores the order in this browser so the portal
 * can still show the pending-installation queue.
 */
export async function submitClientOrder(
  input: ClientOrderInput,
): Promise<SubmitOrderResult> {
  const payload = {
    product: input.product,
    clientName: input.clientName.trim(),
    contactName: input.contactName.trim(),
    phone: input.phone.trim(),
    email: input.email?.trim() || null,
    district: input.district?.trim() || "",
    address: input.address?.trim() || null,
    plan: input.plan,
    modules: productHasModules(input.product) ? input.modules : [],
    notes: input.notes?.trim() || null,
  };

  if (masterSupabase) {
    const { data, error } = await masterSupabase.rpc("submit_client_order", {
      p_payload: payload,
    });
    if (error) {
      return {
        ok: false,
        message: error.message.includes("submit_client_order")
          ? `${error.message} Apply migration 20261126000100_client_orders.sql to the master portal first.`
          : error.message,
      };
    }
    return { ok: true, reference: String(data), local: false };
  }

  const now = new Date().toISOString();
  const order: ClientOrder = {
    id: localOrderId(),
    reference: localReference(),
    product: input.product,
    clientName: payload.clientName,
    contactName: payload.contactName,
    phone: payload.phone,
    email: payload.email ?? undefined,
    district: payload.district,
    address: payload.address ?? undefined,
    plan: input.plan,
    monthlyFee: planPriceFor(input.product, input.plan),
    modules: payload.modules as FeatureFlagKey[],
    notes: payload.notes ?? undefined,
    status: "Submitted",
    provisioning: defaultProvisioning(),
    trialDays: 30,
    submittedAt: now,
    updatedAt: now,
  };
  writeLocalOrders([order, ...readLocalOrders()]);
  return { ok: true, reference: order.reference, local: true };
}

export function orderModuleLabels(order: ClientOrder): string[] {
  const labels = new Map(FEATURE_FLAGS.map((flag) => [flag.key, flag.label]));
  return order.modules.map((key) => labels.get(key) ?? key);
}

export function orderModulesSummary(order: ClientOrder): string {
  if (!productHasModules(order.product)) return "All product features";
  const labels = orderModuleLabels(order);
  return labels.length ? labels.join(", ") : "No modules selected";
}

export function orderTrialEnd(order: ClientOrder): string | undefined {
  if (order.trialEndsAt) return order.trialEndsAt;
  const start = new Date(order.submittedAt);
  if (Number.isNaN(start.getTime())) return undefined;
  start.setDate(start.getDate() + order.trialDays);
  return start.toISOString();
}

export function handoverMessage(order: ClientOrder): string {
  const lines = [
    `Hello ${order.contactName},`,
    "",
    `Your ${order.product} installation for ${order.clientName} is ready.`,
    order.appUrl ? `App link: ${order.appUrl}` : "",
    order.installationId ? `Installation ID: ${order.installationId}` : "",
    order.initialUsername ? `Login email / username: ${order.initialUsername}` : "",
    order.initialPassword ? `Initial password: ${order.initialPassword}` : "",
    order.ownerPin ? `Owner PIN: ${order.ownerPin}` : "",
    "",
    `Your ${order.trialDays}-day trial starts when you finish the initial setup. Every feature is available during the trial.`,
    "From day 15 the app will remind you to activate. After payment RAVBsoft activates this copy remotely and only the modules on your order stay unlocked.",
    "",
    "RAVBsoft support",
    "ravindranath@hotmail.co.uk · +94 75 575 6803",
  ];
  return lines.filter((line, index) => line !== "" || index === 1).join("\n");
}

export function deploymentBrief(order: ClientOrder): string {
  const provisioning = PROVISIONING_ITEMS.map(
    (item) => `- [${order.provisioning[item.key] ? "x" : " "}] ${item.label} — ${item.hint}`,
  ).join("\n");
  const modules = productHasModules(order.product)
    ? orderModuleLabels(order).map((label) => `- ${label}`).join("\n") || "- None"
    : "- All product features";

  return [
    `# Deployment brief — ${order.reference}`,
    "",
    "## Client",
    `- Product: ${order.product}`,
    `- Client / business: ${order.clientName}`,
    `- Contact: ${order.contactName}`,
    `- Phone: ${order.phone}`,
    order.email ? `- Email: ${order.email}` : "",
    order.district ? `- District: ${order.district}` : "",
    order.address ? `- Address: ${order.address}` : "",
    `- Plan: ${order.plan}`,
    `- Trial: ${order.trialDays} days from the client's initial setup`,
    "",
    "## Selected modules",
    modules,
    "",
    "## Provisioning checklist",
    provisioning,
    "",
    "## Deployment values",
    `- Installation ID: ${order.installationId || "Generate from the portal before deployment"}`,
    `- Server address: ${order.serverAddress || "Set after deployment"}`,
    `- Supabase URL: ${order.supabaseUrl || "Create a dedicated client project"}`,
    `- Cloudflare project: ${order.cloudflareProject || "Create a dedicated Pages project"}`,
    `- App URL: ${order.appUrl || "Attach the client domain"}`,
    `- Deploy webhook: ${order.deployWebhookUrl || "Optional"}`,
    "",
    "## Initial login",
    `- Owner login / email: ${order.initialUsername || "Choose in the portal"}`,
    `- Initial password: ${order.initialPassword || "Choose in the portal"}`,
    order.ownerPin ? `- Owner PIN: ${order.ownerPin}` : "",
    "",
    "## Deployment steps",
    "1. Create an isolated Supabase project for this client and apply migrations 0001–0009 in order.",
    "2. Create the Cloudflare Pages project and DNS record for the client domain.",
    "3. Clone the golden master build; keep client-only code under src/custom.",
    "4. Build with the client's VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_MASTER_LICENSE_URL and VITE_MASTER_LICENSE_ANON_KEY. For TAW also set VITE_TAW_INSTALLATION_ID to the installation ID above; the client never enters a licence in the app.",
    "5. Create the owner Supabase Auth user with the initial login above, then create the workshop with the installation ID.",
    "6. Deploy the frontend, verify /manifest.webmanifest, /sw.js, the public check-in and the login screen.",
    "7. Register or update the client installation in the portal with the same installation ID and selected modules.",
    "8. Send the handover message and mark the order Delivered.",
    "",
    "## Notes",
    order.notes || "No extra notes.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}
