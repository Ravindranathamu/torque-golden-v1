/**
 * Torque ERP — WhatsApp Cloud API gateway
 * ---------------------------------------------------------------------------
 * A small, dependency-free Node 20+ service that:
 *   · sends text, template and document (PDF invoice) messages
 *   · receives webhook events and verifies Meta's X-Hub-Signature-256
 *   · exposes /health for uptime checks
 *
 * Run:   node index.mjs
 * Dev:   node --watch index.mjs
 *
 * Required environment variables (see .env.example):
 *   WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, GATEWAY_API_KEY
 * Recommended:
 *   WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET, ALLOWED_ORIGINS
 */

import http from "node:http";
import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Minimal .env loader so `node index.mjs` works without extra dependencies.
const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, ".env");
if (existsSync(envPath)) {
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const PORT = Number(process.env.PORT || 8787);
const GRAPH_VERSION = process.env.GRAPH_VERSION || "v21.0";
const TOKEN = process.env.WHATSAPP_TOKEN || "";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "";
const APP_SECRET = process.env.WHATSAPP_APP_SECRET || "";
const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY || "";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const MAX_BODY_BYTES = 12 * 1024 * 1024; // PDFs + base64 overhead
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_MINUTE || 60);
const rateBuckets = new Map();

const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function cors(res, origin) {
  // curl, cron jobs and server-to-server calls have no Origin header.
  if (!origin) return true;
  const allowed =
    ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin);
  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  return allowed;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function authorised(req) {
  if (!GATEWAY_API_KEY) return false;
  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const key = req.headers["x-api-key"] || bearer;
  return safeEqual(key, GATEWAY_API_KEY);
}

function rateLimited(ip) {
  const now = Date.now();
  if (rateBuckets.size > 5000) {
    for (const [key, value] of rateBuckets) {
      if (now > value.reset) rateBuckets.delete(key);
    }
  }
  const bucket = rateBuckets.get(ip) || { count: 0, reset: now + RATE_WINDOW_MS };
  if (now > bucket.reset) {
    bucket.count = 0;
    bucket.reset = now + RATE_WINDOW_MS;
  }
  bucket.count += 1;
  rateBuckets.set(ip, bucket);
  return bucket.count > RATE_LIMIT;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function normaliseRecipient(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (!/^\d{10,15}$/.test(digits)) {
    throw new Error("Recipient must be an international number (10–15 digits).");
  }
  return digits;
}

async function graph(path, init = {}) {
  const response = await fetch(`${GRAPH_URL}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.error?.message || `WhatsApp API returned ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.details = payload?.error;
    throw error;
  }
  return payload;
}

async function sendText(to, body, previewUrl = true) {
  return graph(`${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: previewUrl, body: String(body).slice(0, 4096) },
    }),
  });
}

async function sendTemplate(to, name, language, components) {
  return graph(`${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name,
        language: { code: language || "en" },
        ...(Array.isArray(components) && components.length
          ? { components }
          : {}),
      },
    }),
  });
}

async function uploadMedia(buffer, mimeType, filename) {
  const form = new FormData();
  form.append(
    "file",
    new Blob([buffer], { type: mimeType }),
    filename || "invoice.pdf",
  );
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  return graph(`${PHONE_NUMBER_ID}/media`, { method: "POST", body: form });
}

async function sendDocument(to, { mediaId, link, filename, caption }) {
  const document = {
    filename: filename || "invoice.pdf",
    caption: caption ? String(caption).slice(0, 1024) : undefined,
  };
  if (mediaId) document.id = mediaId;
  else if (link) document.link = link;
  else throw new Error("A document needs either a mediaId or an https link.");

  return graph(`${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "document",
      document,
    }),
  });
}

function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!APP_SECRET) return true; // signature verification disabled in dev
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = crypto
    .createHmac("sha256", APP_SECRET)
    .update(rawBody)
    .digest("hex");
  return safeEqual(signatureHeader.slice(7), expected);
}

function describeWebhook(payload) {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  const events = [];
  for (const entry of entries) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      for (const message of value.messages || []) {
        events.push({
          kind: "message",
          from: message.from,
          id: message.id,
          type: message.type,
          text: message.text?.body,
          mediaId:
            message.document?.id ||
            message.image?.id ||
            message.audio?.id ||
            message.video?.id,
          timestamp: message.timestamp,
          phoneNumberId: value.metadata?.phone_number_id,
        });
      }
      for (const status of value.statuses || []) {
        events.push({
          kind: "status",
          id: status.id,
          status: status.status,
          recipient: status.recipient_id,
          timestamp: status.timestamp,
          phoneNumberId: value.metadata?.phone_number_id,
        });
      }
    }
  }
  return events;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const origin = req.headers.origin;
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";

  if (req.method === "OPTIONS") {
    cors(res, origin);
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === "/health" && req.method === "GET") {
    json(res, 200, {
      ok: true,
      service: "torque-whatsapp-gateway",
      configured: Boolean(TOKEN && PHONE_NUMBER_ID && GATEWAY_API_KEY),
      graphVersion: GRAPH_VERSION,
    });
    return;
  }

  // Meta webhook verification handshake.
  if (url.pathname === "/webhook" && req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && VERIFY_TOKEN && safeEqual(token, VERIFY_TOKEN)) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(challenge || "");
      return;
    }
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  // Incoming messages / delivery statuses.
  if (url.pathname === "/webhook" && req.method === "POST") {
    try {
      const raw = await readBody(req);
      if (!verifyWebhookSignature(raw, req.headers["x-hub-signature-256"])) {
        json(res, 401, { error: "Invalid webhook signature." });
        return;
      }
      let payload = {};
      try {
        payload = JSON.parse(raw.toString("utf8"));
      } catch {
        json(res, 400, { error: "Invalid JSON." });
        return;
      }
      const events = describeWebhook(payload);
      for (const event of events) {
        console.log(JSON.stringify({ at: new Date().toISOString(), event }));
      }
      // Always acknowledge quickly; Meta retries non-2xx responses.
      json(res, 200, { received: true, events: events.length });
    } catch (error) {
      json(res, 400, { error: error.message });
    }
    return;
  }

  if (!url.pathname.startsWith("/api/")) {
    json(res, 404, { error: "Not found." });
    return;
  }

  if (!cors(res, origin)) {
    json(res, 403, { error: "Origin not allowed." });
    return;
  }
  if (!authorised(req)) {
    json(res, 401, { error: "Missing or invalid API key." });
    return;
  }
  if (rateLimited(ip)) {
    json(res, 429, { error: "Too many requests. Try again shortly." });
    return;
  }
  if (!TOKEN || !PHONE_NUMBER_ID) {
    json(res, 503, { error: "WhatsApp credentials are not configured." });
    return;
  }

  try {
    if (url.pathname === "/api/send/text" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const to = normaliseRecipient(body.to);
      if (!body.text) throw new Error("Missing text.");
      const result = await sendText(to, body.text, body.previewUrl !== false);
      json(res, 200, { ok: true, result });
      return;
    }

    if (url.pathname === "/api/send/template" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const to = normaliseRecipient(body.to);
      if (!body.name) throw new Error("Missing template name.");
      const result = await sendTemplate(
        to,
        body.name,
        body.language,
        body.components,
      );
      json(res, 200, { ok: true, result });
      return;
    }

    if (url.pathname === "/api/send/document" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const to = normaliseRecipient(body.to);
      let mediaId = body.mediaId;

      if (!mediaId && body.base64) {
        const match = /^data:([^;]+);base64,(.+)$/s.exec(body.base64);
        const mimeType = body.mimeType || match?.[1] || "application/pdf";
        const encoded = match?.[2] || body.base64;
        const buffer = Buffer.from(encoded, "base64");
        if (buffer.length === 0) throw new Error("Empty document.");
        if (buffer.length > 8 * 1024 * 1024) {
          throw new Error("Document exceeds WhatsApp's 8 MB demo limit. Use a link.");
        }
        const uploaded = await uploadMedia(
          buffer,
          mimeType,
          body.filename || "invoice.pdf",
        );
        mediaId = uploaded.id;
      }

      const result = await sendDocument(to, {
        mediaId,
        link: body.link,
        filename: body.filename,
        caption: body.caption,
      });
      json(res, 200, { ok: true, mediaId: mediaId || null, result });
      return;
    }

    json(res, 404, { error: "Unknown API route." });
  } catch (error) {
    console.error("[whatsapp-gateway]", error);
    json(res, error.status && error.status < 500 ? 400 : 502, {
      error: error.message || "WhatsApp request failed.",
      details: error.details || undefined,
    });
  }
});

server.listen(PORT, () => {
  console.log(`Torque WhatsApp gateway listening on http://localhost:${PORT}`);
  if (!TOKEN || !PHONE_NUMBER_ID) {
    console.warn("WhatsApp credentials missing — /api routes will return 503.");
  }
  if (!GATEWAY_API_KEY) {
    console.warn("GATEWAY_API_KEY missing — all /api routes will return 401.");
  }
  if (!APP_SECRET) {
    console.warn("WHATSAPP_APP_SECRET missing — webhook signatures are not verified.");
  }
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
