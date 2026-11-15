import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const clientUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const clientKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

const masterUrl = (import.meta.env.VITE_MASTER_LICENSE_URL ?? "").trim().replace(/\/+$/, "");
const masterKey = (import.meta.env.VITE_MASTER_LICENSE_ANON_KEY ?? "").trim();

export const cloudConfigured = Boolean(clientUrl && clientKey);
export const portalConfigured = Boolean(masterUrl && masterKey);

/**
 * The client project belongs to one workshop. It is deliberately absent from
 * the portal build.
 */
export const supabase: SupabaseClient | null = cloudConfigured
  ? createClient(clientUrl, clientKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/**
 * The master portal project is shared by every client build only through the
 * outbound `poll_workshop_license` RPC. The portal itself signs in here.
 */
export const masterSupabase: SupabaseClient | null = portalConfigured
  ? createClient(masterUrl, masterKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: "ravsoft_portal_auth_v1",
      },
    })
  : null;

export function requireClientSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not configured.");
  }
  return supabase;
}

export function requireMasterSupabase(): SupabaseClient {
  if (!masterSupabase) {
    throw new Error(
      "VITE_MASTER_LICENSE_URL and VITE_MASTER_LICENSE_ANON_KEY are not configured.",
    );
  }
  return masterSupabase;
}