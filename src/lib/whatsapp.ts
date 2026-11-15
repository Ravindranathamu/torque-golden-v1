import type { WorkshopSettings } from "../types";
import { normalizePhone } from "./utils";

/** Demo mode sends every outbound message to the developer's test number. */
export const DEMO_WHATSAPP_NUMBER = "94755756803";

export interface WhatsAppResult {
  ok: boolean;
  message: string;
  recipient?: string;
}

export function autoWhatsAppEnabled(settings: WorkshopSettings): boolean {
  return (
    settings.whatsappMode === "WAHA" &&
    Boolean(settings.whatsappGatewayUrl?.trim()) &&
    settings.whatsappAutoSend !== false
  );
}

export function whatsappRecipient(phone: string, settings: WorkshopSettings): string {
  if (settings.demoMode) return DEMO_WHATSAPP_NUMBER;
  const normalised = normalizePhone(phone);
  return normalised || phone.replace(/\D/g, "");
}

function chatIdFor(phone: string, settings: WorkshopSettings): string | null {
  const recipient = whatsappRecipient(phone, settings);
  if (!recipient) return null;
  return `${recipient}@c.us`;
}

/**
 * Send one message through a self-hosted WAHA gateway.
 *
 * The call is intentionally fire-and-forget friendly: a workshop with the
 * gateway offline keeps working, and the caller never has to await it.
 */
export async function sendWhatsApp(
  phone: string,
  text: string,
  settings: WorkshopSettings,
): Promise<WhatsAppResult> {
  if (settings.whatsappMode !== "WAHA") {
    return { ok: false, message: "WAHA is not enabled for this workshop." };
  }
  const base = (settings.whatsappGatewayUrl ?? "").trim().replace(/\/+$/, "");
  if (!base) {
    return { ok: false, message: "Add the WAHA gateway URL in Settings → Integrations." };
  }
  if (settings.whatsappAutoSend === false) {
    return { ok: false, message: "Automatic WhatsApp sending is switched off." };
  }
  const chatId = chatIdFor(phone, settings);
  if (!chatId) return { ok: false, message: "No WhatsApp number for this message." };
  const session = settings.whatsappSession?.trim() || "default";
  try {
    const response = await fetch(`${base}/api/sendText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(settings.whatsappApiKey?.trim()
          ? { "X-Api-Key": settings.whatsappApiKey.trim() }
          : {}),
      },
      body: JSON.stringify({ session, chatId, text }),
      keepalive: true,
    });
    if (!response.ok) {
      return {
        ok: false,
        message: `WAHA gateway returned ${response.status}.`,
        recipient: chatId,
      };
    }
    return { ok: true, message: "Message queued with WAHA.", recipient: chatId };
  } catch {
    return {
      ok: false,
      message: "WAHA gateway is unreachable. The message was not sent.",
      recipient: chatId,
    };
  }
}

/** Fire-and-forget helper for store actions. */
export function queueWhatsApp(
  phone: string,
  text: string,
  settings: WorkshopSettings,
): void {
  if (!autoWhatsAppEnabled(settings) || !phone.trim()) return;
  void sendWhatsApp(phone, text, settings);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.slice(result.indexOf(",") + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Send a PDF or image through WAHA as a native WhatsApp attachment.
 *
 * WAHA expects the file bytes as base64 in `file.data`. Large PDFs are kept
 * small by the invoice builders (usually well under 1 MB).
 */
export async function sendWhatsAppDocument(
  phone: string,
  blob: Blob,
  filename: string,
  caption: string,
  settings: WorkshopSettings,
): Promise<WhatsAppResult> {
  if (settings.whatsappMode !== "WAHA") {
    return { ok: false, message: "WAHA is not enabled for this workshop." };
  }
  const base = (settings.whatsappGatewayUrl ?? "").trim().replace(/\/+$/, "");
  if (!base) {
    return { ok: false, message: "Add the WAHA gateway URL in Settings → Integrations." };
  }
  if (settings.whatsappAutoSend === false) {
    return { ok: false, message: "Automatic WhatsApp sending is switched off." };
  }
  const chatId = chatIdFor(phone, settings);
  if (!chatId) return { ok: false, message: "No WhatsApp number for this document." };
  const session = settings.whatsappSession?.trim() || "default";
  try {
    const data = await blobToBase64(blob);
    const response = await fetch(`${base}/api/sendFile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(settings.whatsappApiKey?.trim()
          ? { "X-Api-Key": settings.whatsappApiKey.trim() }
          : {}),
      },
      body: JSON.stringify({
        session,
        chatId,
        file: {
          mimetype: blob.type || "application/pdf",
          filename,
          data,
        },
        caption,
      }),
    });
    if (!response.ok) {
      return {
        ok: false,
        message: `WAHA gateway returned ${response.status}.`,
        recipient: chatId,
      };
    }
    return { ok: true, message: "Document queued with WAHA.", recipient: chatId };
  } catch {
    return {
      ok: false,
      message: "WAHA gateway is unreachable. The document was not sent.",
      recipient: chatId,
    };
  }
}