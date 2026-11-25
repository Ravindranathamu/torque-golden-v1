import { cloudConfigured, portalConfigured } from "./supabase";

export interface PublicDemoAccess {
  startedAt?: string;
  expiresAt?: string;
  serverTime?: string;
  allowed: boolean;
}

/**
 * The portal deployment also serves the public dashboard demo. Client
 * deployments have their own Supabase project, so they never use this gate.
 */
export function publicDemoAccessEnabled(): boolean {
  return portalConfigured && !cloudConfigured;
}

export async function pollPublicDemoAccess(timeoutMs = 8000): Promise<PublicDemoAccess> {
  const baseUrl = (import.meta.env.VITE_MASTER_LICENSE_URL ?? "").replace(/\/+$/, "");
  const anonKey = import.meta.env.VITE_MASTER_LICENSE_ANON_KEY ?? "";
  if (!baseUrl || !anonKey) {
    throw new Error("Demo access server is not configured.");
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/rest/v1/rpc/poll_demo_access`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({}),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Demo access server returned HTTP ${response.status}.`);
    }
    const raw = (await response.json()) as
      | Record<string, unknown>
      | Array<Record<string, unknown>>;
    const row = Array.isArray(raw) ? raw[0] : raw;
    if (!row) throw new Error("Demo access server returned no record.");

    return {
      startedAt: row.started_at ? String(row.started_at) : undefined,
      expiresAt: row.expires_at ? String(row.expires_at) : undefined,
      serverTime: row.server_time ? String(row.server_time) : undefined,
      allowed: Boolean(row.allowed),
    };
  } finally {
    window.clearTimeout(timer);
  }
}
