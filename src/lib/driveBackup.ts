import type { AppState, DamagePhoto } from "../types";
import { dateOnly } from "./utils";

export interface DriveBackupResult {
  ok: boolean;
  message: string;
  filename?: string;
}

export interface DriveJobFolderResult {
  ok: boolean;
  message: string;
  /** Google Drive folder ID returned by the Apps Script adapter. */
  folderId?: string;
  folderUrl?: string;
}

export interface DriveSettingsLike {
  driveBackupUrl?: string;
  driveBackupKey?: string;
  driveBackupFolderId?: string;
}

function dataUrlParts(dataUrl: string): { data: string; mimetype: string } {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return { data: dataUrl, mimetype: "image/jpeg" };
  const meta = dataUrl.slice(0, comma);
  const mimetype = /^data:([^;]+)/.exec(meta)?.[1] || "image/jpeg";
  return { data: dataUrl.slice(comma + 1), mimetype };
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
        action: "backup",
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

/**
 * Creates a real Drive folder for an accepted job and uploads its compressed
 * inspection photos. It reuses the daily-backup webhook and shared secret, so
 * no Google Cloud credentials are shipped to the browser.
 */
export async function uploadJobPhotosToDrive(
  jobNumber: number,
  photos: DamagePhoto[],
  settings: DriveSettingsLike,
): Promise<DriveJobFolderResult> {
  const url = settings.driveBackupUrl?.trim();
  const key = settings.driveBackupKey?.trim();
  if (!url) {
    return { ok: false, message: "Add the Google Drive webhook URL first." };
  }
  if (!key) {
    return { ok: false, message: "Add the Google Drive shared secret first." };
  }
  if (photos.length === 0) {
    return { ok: false, message: "No inspection photos to upload." };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        key,
        action: "jobFolder",
        jobNo: String(jobNumber),
        folderId: settings.driveBackupFolderId?.trim() || undefined,
        photos: photos.map((photo) => {
          const parts = dataUrlParts(photo.dataUrl);
          return {
            name: photo.name,
            mimetype: parts.mimetype,
            data: parts.data,
          };
        }),
      }),
    });
    const text = await response.text();
    let data: (DriveJobFolderResult & { message?: string }) | null = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!response.ok) {
      return {
        ok: false,
        message: data?.message ?? `Drive endpoint returned HTTP ${response.status}.`,
      };
    }
    if (data && data.ok === false) {
      return { ok: false, message: data.message ?? "Drive rejected the photo upload." };
    }
    return {
      ok: true,
      message: data?.message ?? `Photos uploaded to Drive for job ${jobNumber}.`,
      folderId: data?.folderId,
      folderUrl: data?.folderUrl,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Could not reach the Google Drive endpoint.",
    };
  }
}
