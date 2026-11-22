import type { FeatureFlags, LicencePlan, LicenceStatus, WorkshopSettings } from "../types";
import { defaultFeatureFlags } from "./features";
import { getInstallationId, OFFLINE_GRACE_DAYS } from "./licence";

const CACHE_KEY = "torque_licence_sync_cache_v1";
const CLOCK_KEY = "torque_licence_monotonic_v1";

export interface RemoteLicenceResult {
  ok: boolean;
  status?: LicenceStatus;
  plan?: LicencePlan | string;
  expiresAt?: string;
  featureFlags?: FeatureFlags;
  serverTime?: string;
  holder?: string;
  message: string;
  configured: boolean;
  clockRollback?: boolean;
}

export interface LicenceSyncCache {
  installationId: string;
  status: LicenceStatus;
  plan: string;
  expiresAt?: string;
  featureFlags: FeatureFlags;
  holder?: string;
  lastSyncedAt: string;
  serverTime: string;
  clockRollback?: boolean;
}

export function readLicenceCache(): LicenceSyncCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LicenceSyncCache;
    if (!parsed || !parsed.installationId) return null;
    return {
      ...parsed,
      featureFlags: { ...defaultFeatureFlags(), ...(parsed.featureFlags ?? {}) },
    };
  } catch {
    return null;
  }
}

export function writeLicenceCache(cache: LicenceSyncCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* storage unavailable */
  }
}

export interface ClockGuard {
  ok: boolean;
  rollback: boolean;
  lastSeenAt: string;
}

/**
 * Detects a backwards system clock by keeping a monotonic high-water mark.
 * A rollback blocks normal operation until a successful online sync repairs it.
 */
export function checkClockGuard(toleranceMinutes = 10): ClockGuard {
  const now = Date.now();
  let last = 0;
  try {
    last = Number(localStorage.getItem(CLOCK_KEY) ?? 0);
  } catch {
    last = 0;
  }
  const rollback = last > 0 && now < last - toleranceMinutes * 60_000;
  if (!rollback && now > last) {
    try {
      localStorage.setItem(CLOCK_KEY, String(now));
    } catch {
      /* storage unavailable */
    }
  }
  return {
    ok: !rollback,
    rollback,
    lastSeenAt: new Date(Math.max(now, last)).toISOString(),
  };
}

export function markClockRepaired(serverTime?: string): void {
  try {
    const stamp = serverTime ? new Date(serverTime).getTime() : Date.now();
    const previous = Number(localStorage.getItem(CLOCK_KEY) ?? 0);
    localStorage.setItem(CLOCK_KEY, String(Math.max(previous, stamp, Date.now())));
  } catch {
    /* storage unavailable */
  }
}

export function licenceServerConfigured(): boolean {
  return Boolean(import.meta.env.VITE_MASTER_LICENSE_URL?.trim());
}

function normaliseStatus(value: unknown): LicenceStatus {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "active") return "Active";
  if (text === "suspended") return "Suspended";
  if (text === "expired") return "Expired";
  if (text === "trial") return "Trial";
  return "Active";
}

function normaliseFlags(raw: unknown): FeatureFlags {
  const flags = { ...defaultFeatureFlags() };
  if (raw && typeof raw === "object") {
    Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
      if (value === false) flags[key as keyof FeatureFlags] = false;
      if (value === true) flags[key as keyof FeatureFlags] = true;
    });
  }
  return flags;
}

/**
 * Outbound-only poll. The client never opens an inbound port and never writes
 * to the master database. When the portal is not configured the demo remains
 * fully local.
 */
export async function pollRemoteLicence(
  settings: WorkshopSettings,
  timeoutMs = 8000,
): Promise<RemoteLicenceResult> {
  if (!licenceServerConfigured()) {
    return {
      ok: false,
      configured: false,
      message: "Master licence server is not configured. Running from the local cache.",
    };
  }
  const guard = checkClockGuard();
  if (guard.rollback) {
    return {
      ok: false,
      configured: true,
      clockRollback: true,
      message:
        "The system clock moved backwards. Reconnect to the master licence server to verify this installation.",
    };
  }

  const baseUrl = (import.meta.env.VITE_MASTER_LICENSE_URL ?? "").replace(/\/+$/, "");
  const anonKey = import.meta.env.VITE_MASTER_LICENSE_ANON_KEY ?? "";
  const installationId = settings.installationId || getInstallationId();
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/rest/v1/rpc/poll_workshop_license`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ p_installation_id: installationId }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Licence server returned HTTP ${response.status}.`);
    }
    const raw = (await response.json()) as
      | Record<string, unknown>
      | Array<Record<string, unknown>>;
    const row = Array.isArray(raw) ? raw[0] : raw;
    if (!row) throw new Error("Licence server returned no installation record.");
    const result: RemoteLicenceResult = {
      ok: true,
      configured: true,
      status: normaliseStatus(row.status),
      plan: String(row.plan ?? "Growth"),
      expiresAt: row.expires_at ? String(row.expires_at) : undefined,
      featureFlags: normaliseFlags(row.feature_flags),
      serverTime: String(row.server_time ?? new Date().toISOString()),
      holder: row.holder ? String(row.holder) : undefined,
      message: "Licence synced with the master server.",
    };
    writeLicenceCache({
      installationId,
      status: result.status ?? "Active",
      plan: String(result.plan ?? "Growth"),
      expiresAt: result.expiresAt,
      featureFlags: result.featureFlags ?? defaultFeatureFlags(),
      holder: result.holder,
      lastSyncedAt: new Date().toISOString(),
      serverTime: result.serverTime ?? new Date().toISOString(),
      clockRollback: false,
    });
    markClockRepaired(result.serverTime);
    return result;
  } catch (error) {
    const cached = readLicenceCache();
    const fresh =
      cached && cached.installationId === installationId
        ? Math.floor(
            (Date.now() - new Date(cached.lastSyncedAt).getTime()) / 86400000,
          )
        : OFFLINE_GRACE_DAYS + 1;
    return {
      ok: false,
      configured: true,
      message:
        error instanceof Error
          ? `${error.message}${fresh <= OFFLINE_GRACE_DAYS ? ` Offline cache is ${fresh} day(s) old.` : " The offline grace period has ended."}`
          : "Could not reach the licence server.",
    };
  } finally {
    window.clearTimeout(timer);
  }
}
