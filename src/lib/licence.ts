import type {
  FeatureFlags,
  LicencePlan,
  LicenceStatus,
  WorkshopSettings,
} from "../types";
import { defaultFeatureFlags } from "./features";

export const TRIAL_DAYS = 30;
export const OFFLINE_GRACE_DAYS = 7;
/**
 * A lifetime sale is stored as a far-future expiry so it fits the existing
 * licence schema. Anything beyond 50 years is treated as outright ownership.
 */
export const LIFETIME_DAYS_THRESHOLD = 365 * 50;
export const LICENCE_PREFIX = "TRQ";
export const OFFLINE_TOKEN_PREFIX = "TRQ2";
const LICENCE_SECRET =
  (import.meta.env.VITE_LICENSE_SIGNING_KEY as string | undefined)?.trim() ||
  "TORQUE-ERP-RAVSOFT-2026";

const MACHINE_KEY = "torque_erp_machine_id";
const INSTALLATION_KEY = "torque_erp_installation_id";

export function getMachineId(): string {
  try {
    const existing = localStorage.getItem(MACHINE_KEY);
    if (existing) return existing;
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const id = `M-${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
    localStorage.setItem(MACHINE_KEY, id);
    return id;
  } catch {
    return "M-DEMO00000000";
  }
}

/** Stable cloud/installation identity shared with the master licence portal. */
export function getInstallationId(): string {
  try {
    const existing = localStorage.getItem(INSTALLATION_KEY);
    if (existing) return existing;
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    const suffix = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
    const id = `WS-LK-${suffix}`;
    localStorage.setItem(INSTALLATION_KEY, id);
    return id;
  } catch {
    return "WS-LK-DEMO0001";
  }
}

export function setInstallationId(id: string): void {
  try {
    if (id.trim()) localStorage.setItem(INSTALLATION_KEY, id.trim().toUpperCase());
  } catch {
    /* storage unavailable */
  }
}

function hash36(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const value = (hash >>> 0).toString(36).toUpperCase();
  return value.padStart(7, "0").slice(-7);
}

function signPayload(body: string): string {
  return `${hash36(`${body}|${LICENCE_SECRET}`)}${hash36(`${LICENCE_SECRET}|${body}`).slice(0, 5)}`;
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function generateLicenceKey(machineId: string, expiryDate: string): string {
  const expiry = expiryDate.replace(/-/g, "").slice(0, 8);
  const signature = hash36(`${machineId}|${expiry}|${LICENCE_SECRET}`);
  return `${LICENCE_PREFIX}-${expiry}-${signature}`;
}

export interface LicenceValidation {
  ok: boolean;
  expiresAt?: string;
  message: string;
}

export function validateLicenceKey(key: string, machineId: string): LicenceValidation {
  const clean = key.trim().toUpperCase();
  const match = /^TRQ-(\d{8})-([A-Z0-9]{4,10})$/.exec(clean);
  if (!match) {
    return { ok: false, message: "That key format is not valid. Use TRQ-YYYYMMDD-XXXXXXXX." };
  }
  const [, expiry, signature] = match;
  const expected = hash36(`${machineId}|${expiry}|${LICENCE_SECRET}`);
  if (signature !== expected) {
    return { ok: false, message: "This licence key was not issued for this installation." };
  }
  const year = Number(expiry.slice(0, 4));
  const month = Number(expiry.slice(4, 6));
  const day = Number(expiry.slice(6, 8));
  const expires = new Date(year, month - 1, day, 23, 59, 59);
  if (Number.isNaN(expires.getTime())) {
    return { ok: false, message: "The expiry date in this key is invalid." };
  }
  if (expires.getTime() < Date.now()) {
    return { ok: false, message: `This licence expired on ${expires.toLocaleDateString("en-GB")}.` };
  }
  return {
    ok: true,
    expiresAt: expires.toISOString(),
    message: `Licence accepted. Active until ${expires.toLocaleDateString("en-GB")}.`,
  };
}

export interface OfflineLicencePayload {
  installationId: string;
  holder: string;
  plan: LicencePlan | string;
  status: "Active" | "Trial";
  expiresAt: string;
  issuedAt: string;
  featureFlags: FeatureFlags;
}

export interface OfflineTokenValidation {
  ok: boolean;
  payload?: OfflineLicencePayload;
  message: string;
}

/**
 * Builds a self-contained, tamper-evident activation token. The workshop can
 * paste it while disconnected; it carries the plan, expiry and module flags.
 */
export function generateOfflineToken(payload: OfflineLicencePayload): string {
  const normalised: OfflineLicencePayload = {
    ...payload,
    installationId: payload.installationId.trim().toUpperCase(),
    featureFlags: { ...defaultFeatureFlags(), ...payload.featureFlags },
  };
  const body = toBase64Url(JSON.stringify(normalised));
  return `${OFFLINE_TOKEN_PREFIX}.${body}.${signPayload(body)}`;
}

export function verifyOfflineToken(
  token: string,
  installationId?: string,
): OfflineTokenValidation {
  const clean = token.trim();
  const parts = clean.split(".");
  if (parts.length !== 3 || parts[0].toUpperCase() !== OFFLINE_TOKEN_PREFIX) {
    return { ok: false, message: "That is not a Torque offline activation token." };
  }
  const [, body, signature] = parts;
  if (signature !== signPayload(body)) {
    return { ok: false, message: "The activation token signature is invalid or was edited." };
  }
  let payload: OfflineLicencePayload;
  try {
    payload = JSON.parse(fromBase64Url(body)) as OfflineLicencePayload;
  } catch {
    return { ok: false, message: "The activation token payload could not be read." };
  }
  if (!payload.installationId || !payload.expiresAt) {
    return { ok: false, message: "The activation token is missing installation or expiry data." };
  }
  if (installationId && payload.installationId !== installationId.trim().toUpperCase()) {
    return {
      ok: false,
      message: `This token was issued for ${payload.installationId}, not this installation.`,
    };
  }
  const expiry = new Date(payload.expiresAt);
  if (Number.isNaN(expiry.getTime()) || expiry.getTime() < Date.now()) {
    return { ok: false, message: "This activation token has already expired." };
  }
  return {
    ok: true,
    payload,
    message: `Offline licence accepted · ${payload.plan} · valid until ${expiry.toLocaleDateString("en-GB")}.`,
  };
}

export type LicenceMode = "Demo" | "Active" | "Trial" | "Expired";

export interface LicenceInfo {
  mode: LicenceMode;
  label: string;
  daysLeft: number;
  expiresAt?: string;
  status: LicenceStatus;
  reason?: "suspended" | "offline-expired" | "clock-rollback" | "expired" | "trial-ended";
  lastSyncedAt?: string;
  offlineGraceDaysLeft?: number;
  /** True when the client bought the app outright and no renewal is due. */
  lifetime?: boolean;
}

function daysLeftUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

/** True when an expiry is only a registry placeholder for a lifetime sale. */
export function isLifetimeExpiry(expiresAt?: string): boolean {
  if (!expiresAt) return false;
  return daysLeftUntil(expiresAt) > LIFETIME_DAYS_THRESHOLD;
}

export function licenceInfo(settings: WorkshopSettings): LicenceInfo {
  if (settings.demoMode) {
    return {
      mode: "Demo",
      label: "Demo installation",
      daysLeft: 0,
      status: "Active",
      lastSyncedAt: settings.lastLicenceSyncAt,
    };
  }
  if (settings.licenceClockRollback) {
    return {
      mode: "Expired",
      label: "Clock change detected — connect to the licence server",
      daysLeft: 0,
      status: "Suspended",
      reason: "clock-rollback",
      lastSyncedAt: settings.lastLicenceSyncAt,
    };
  }
  if (settings.licenseStatus === "Suspended") {
    return {
      mode: "Expired",
      label: "Licence suspended by the developer",
      daysLeft: 0,
      status: "Suspended",
      reason: "suspended",
      lastSyncedAt: settings.lastLicenceSyncAt,
    };
  }

  if (isLifetimeExpiry(settings.licenseExpiresAt)) {
    const plan = settings.licensePlan ? ` — ${settings.licensePlan}` : "";
    return {
      mode: "Active",
      label: `Lifetime licence${plan} — owned outright`,
      daysLeft: 0,
      expiresAt: settings.licenseExpiresAt,
      status: "Active",
      lifetime: true,
      lastSyncedAt: settings.lastLicenceSyncAt,
    };
  }

  const syncAgeDays = settings.lastLicenceSyncAt
    ? Math.floor((Date.now() - new Date(settings.lastLicenceSyncAt).getTime()) / 86400000)
    : 0;
  const graceLeft = Math.max(0, OFFLINE_GRACE_DAYS - syncAgeDays);
  if (
    settings.lastLicenceSyncAt &&
    syncAgeDays > OFFLINE_GRACE_DAYS &&
    settings.licenseStatus !== "Trial"
  ) {
    return {
      mode: "Expired",
      label: `Offline for ${syncAgeDays} days — reconnect to verify the licence`,
      daysLeft: 0,
      expiresAt: settings.licenseExpiresAt,
      status: settings.licenseStatus ?? "Expired",
      reason: "offline-expired",
      lastSyncedAt: settings.lastLicenceSyncAt,
      offlineGraceDaysLeft: 0,
    };
  }

  if (settings.licenseExpiresAt) {
    const daysLeft = daysLeftUntil(settings.licenseExpiresAt);
    if (daysLeft >= 0) {
      const plan = settings.licensePlan ? ` · ${settings.licensePlan}` : "";
      return {
        mode: "Active",
        label: `${settings.licenseStatus === "Trial" ? "Trial" : "Licensed"}${plan} · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`,
        daysLeft,
        expiresAt: settings.licenseExpiresAt,
        status: settings.licenseStatus ?? "Active",
        lastSyncedAt: settings.lastLicenceSyncAt,
        offlineGraceDaysLeft: settings.lastLicenceSyncAt ? graceLeft : undefined,
      };
    }
    return {
      mode: "Expired",
      label: "Licence expired",
      daysLeft,
      expiresAt: settings.licenseExpiresAt,
      status: "Expired",
      reason: "expired",
      lastSyncedAt: settings.lastLicenceSyncAt,
    };
  }

  const start = new Date(settings.trialStartedAt || settings.createdAt || new Date().toISOString());
  const daysLeft = TRIAL_DAYS - Math.floor((Date.now() - start.getTime()) / 86400000);
  if (daysLeft <= 0) {
    return {
      mode: "Expired",
      label: "30-day trial ended",
      daysLeft,
      status: "Expired",
      reason: "trial-ended",
    };
  }
  return {
    mode: "Trial",
    label: `Trial · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`,
    daysLeft,
    status: "Trial",
    lastSyncedAt: settings.lastLicenceSyncAt,
    offlineGraceDaysLeft: settings.lastLicenceSyncAt ? graceLeft : undefined,
  };
}
