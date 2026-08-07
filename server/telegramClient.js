/**
 * Telegram Bot API — credentials: `backend/config.js` + `.env`.
 * https://core.telegram.org/bots/api
 */

import { readTelegramConfig } from "../backend/config.js";

function getConfig() {
  return readTelegramConfig();
}

export function isTelegramConfigured() {
  return Boolean(getConfig());
}

function formatCaptionTime(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("uz-UZ", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export async function telegramSendMessage(text) {
  const cfg = getConfig();
  if (!cfg) {
    const err = new Error("Telegram sozlanmagan");
    err.status = 503;
    throw err;
  }

  const url = `https://api.telegram.org/bot${cfg.token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: cfg.chatId,
      text: String(text).slice(0, 4000),
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    const err = new Error(data.description || "Telegram sendMessage xatosi");
    err.status = 502;
    throw err;
  }
  return data;
}

/**
 * @param {Buffer} buffer — JPEG/PNG
 * @param {string} filename
 * @param {string} caption
 */
export async function telegramSendPhoto(buffer, filename, caption) {
  const cfg = getConfig();
  if (!cfg) {
    const err = new Error("Telegram sozlanmagan");
    err.status = 503;
    throw err;
  }

  const safeName = filename.replace(/[^a-z0-9._-]/gi, "_") || "photo.jpg";
  const mime = /\.png$/i.test(safeName) ? "image/png" : "image/jpeg";
  const uint8 =
    buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const form = new FormData();
  form.append("chat_id", cfg.chatId);
  form.append("photo", new Blob([uint8], { type: mime }), safeName);
  if (caption) {
    form.append("caption", String(caption).slice(0, 1024));
    form.append("parse_mode", "Markdown");
  }

  const url = `https://api.telegram.org/bot${cfg.token}/sendPhoto`;
  const res = await fetch(url, {
    method: "POST",
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    const err = new Error(data.description || "Telegram sendPhoto xatosi");
    err.status = 502;
    throw err;
  }
  return data;
}

export function durationBetween(arrivalIso, departureIso) {
  if (!arrivalIso || !departureIso) return "—";
  const a = new Date(arrivalIso).getTime();
  const b = new Date(departureIso).getTime();
  const diffMs = b - a;
  if (!Number.isFinite(diffMs) || diffMs <= 0) return "—";
  const totalMin = Math.floor(diffMs / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h} soat ${m} daqiqa`;
}

export { formatCaptionTime };