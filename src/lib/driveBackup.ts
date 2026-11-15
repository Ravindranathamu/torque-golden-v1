import type { AppState } from "../types";
import { dateOnly } from "./utils";

export interface DriveBackupResult {
  ok: boolean;
  message: string;
  filename?: string;
}

export function driveBackupFilename(state: AppState): string {
  const raw = state.settings.qrSlug || state.settings.companyName || "workshop";
  const slug =
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "workshop";
  return `${slug}-backup-${dateOnly(new Date().toISOString())}.json`;
}

export function buildDriveBackupPayload(state: AppState): string {
  return JSON.stringify(
    {
      app: "torque-erp",
      version: state.version,
      exportedAt: new Date().toISOString(),
      company: state.settings.companyName,
      state,
    },
    null,
    2,
  );
}

/**
 * Uploads a complete JSON snapshot to the configured Google Drive backup
 * endpoint. The endpoint is usually a Google Apps Script web app (see
 * docs/GOOGLE_DRIVE_BACKUP.md) or a Supabase Edge Function with a Drive
 * service account.
 *
 * The body is sent as text/plain so a Google Apps Script web app can accept it
 * without a CORS preflight. The receiver must return JSON:
 *   { "ok": true, "message": "...", "fileId": "..." }
 */
export async function uploadBackupToDrive(
  state: AppState,
): Promise<DriveBackupResult> {
  const settings = state.settings;
  const url = settings.driveBackupUrl?.trim();
  if (!url) {
    return {
      ok: false,
      message:
        "Add the Google Drive backup webhook URL in Settings → Data & backup.",
    };
  }
  if (!settings.driveBackupKey?.trim()) {
    return {
      ok: false,
      message: "Add the Google Drive backup secret key.",
    };
  }

  const filename = driveBackupFilename(state);
  const content = buildDriveBackupPayload(state);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        key: settings.driveBackupKey.trim(),
        folderId: settings.driveBackupFolderId?.trim() || undefined,
        filename,
        content,
      }),
    });
    const text = await response.text();
    type BackupReply = { ok?: boolean; message?: string; fileId?: string };
    let data: BackupReply | null = null;
    try {
      data = text ? (JSON.parse(text) as BackupReply) : null;
    } catch {
      data = null;
    }
    if (!response.ok) {
      return {
        ok: false,
        message:
          data?.message ?? `Backup endpoint returned HTTP ${response.status}.`,
      };
    }
    if (data && data.ok === false) {
      return {
        ok: false,
        message: data.message ?? "The backup endpoint rejected the upload.",
      };
    }
    return {
      ok: true,
      message:
        data?.message ?? `Backup uploaded to Google Drive as ${filename}.`,
      filename,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Could not reach the Google Drive backup endpoint.",
    };
  }
}
