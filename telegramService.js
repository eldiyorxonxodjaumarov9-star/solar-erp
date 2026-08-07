import axios from "axios";

const TASHKENT_TZ = "Asia/Tashkent";

const UPLOAD_ACTION_LINE =
  "Iltimos, dasturga kiring, «Keldi» va «Ketdi» rasmlarini yuklang hamda ilovadagi har bir bo‘limni bajaring.";

function formatPendingMastersBlock(pendingLogins) {
  const logins = Array.isArray(pendingLogins)
    ? pendingLogins.map((n) => String(n || "").trim().toLowerCase()).filter(Boolean)
    : [];
  if (logins.length === 0) return "";
  const lines = logins.map((login) => `• ${login}`);
  return `\n\nHali bajarilmagan (login):\n${lines.join("\n")}`;
}

/**
 * @param {{ intro: string; tail?: string; pendingNames?: string[] }} params
 */
export function composeMasterReminderText({ intro, tail = "", pendingNames = [] }) {
  const parts = [String(intro || "").trim(), "", UPLOAD_ACTION_LINE];
  const pendingBlock = formatPendingMastersBlock(pendingNames);
  if (pendingBlock) parts.push(pendingBlock);
  const tailText = String(tail || "").trim();
  if (tailText) parts.push("", tailText);
  return parts.join("\n").trim();
}

/** Yangi kun xabari (Toshkent 07:00) */
export function getDailyMorningMessageText(pendingNames = []) {
  return composeMasterReminderText({
    intro: "Assalomu alaykum, hurmatli masterlar!",
    tail: "Bugun dasturga kirib, «Keldi» rasmini yuklang va loyiha bo‘limlaridagi ishlarni ketma-ket bajaring.\n\nHammaga omad!",
    pendingNames,
  });
}

/** Toshkent 13:00 — bosqichlar / ishlar hisoboti eslatmasi */
export function getMasterMiddayStagesReportText(pendingNames = []) {
  return composeMasterReminderText({
    intro: "Xurmatli masterlar,",
    tail: "Bugungi qilingan ishlar va bosqichlar bo‘yicha hisobotni tayyorlab, guruhingizda yuboring.",
    pendingNames,
  });
}

/** Toshkent 18:00 — kunlik hisobot (bitta eslatma) */
export function getMasterEveningDailyReportReminderText(pendingNames = []) {
  return composeMasterReminderText({
    intro: "Xurmatli masterlar,",
    tail: "Bugungi qilingan ishlari bo‘yicha hisobotni topshiring.",
    pendingNames,
  });
}

/**
 * Oddiy matn xabari.
 * @param {{ token: string; groupId: string; text: string }} params
 */
export async function sendTextToTelegram(params) {
  const { token, groupId, text } = params;

  const endpoint = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = new URLSearchParams();
  body.append("chat_id", groupId);
  body.append("text", String(text || "").slice(0, 4000));

  const response = await axios.post(endpoint, body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 30000,
    validateStatus: () => true,
  });

  if (response.status !== 200 || !response.data?.ok) {
    const description = response.data?.description || `HTTP ${response.status}`;
    throw new Error(`Telegram sendMessage failed: ${description}`);
  }

  return response.data;
}

export { TASHKENT_TZ };

/**
 * Fayl (CSV/txt) yuborish — oylik hisobot va hokazo.
 * @param {{
 *   token: string;
 *   groupId: string;
 *   buffer: Buffer | Uint8Array | string;
 *   filename: string;
 *   caption?: string;
 *   mimeType?: string;
 * }} params
 */
export async function sendDocumentToTelegram(params) {
  const { token, groupId, buffer, filename, caption, mimeType } = params;

  let bytes;
  if (typeof buffer === "string") {
    bytes = Buffer.from(buffer, "utf8");
  } else if (Buffer.isBuffer(buffer)) {
    bytes = buffer;
  } else if (buffer instanceof Uint8Array) {
    bytes = Buffer.from(buffer);
  } else {
    bytes = Buffer.from(String(buffer || ""), "utf8");
  }

  const endpoint = `https://api.telegram.org/bot${token}/sendDocument`;
  const blob = new Blob([bytes], {
    type: mimeType || "text/plain;charset=utf-8",
  });
  const form = new FormData();
  form.append("chat_id", groupId);
  form.append("document", blob, filename || "report.txt");
  if (caption) form.append("caption", String(caption).slice(0, 1024));

  const response = await fetch(endpoint, {
    method: "POST",
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) {
    const description = data?.description || `HTTP ${response.status}`;
    throw new Error(`Telegram sendDocument failed: ${description}`);
  }
  return data;
}

export async function sendPhotoToTelegram(params) {
  const { token, groupId, imageUrl, caption } = params;

  const endpoint = `https://api.telegram.org/bot${token}/sendPhoto`;
  const body = new URLSearchParams();
  body.append("chat_id", groupId);
  body.append("photo", imageUrl);
  body.append("caption", caption);

  const response = await axios.post(endpoint, body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 60000,
    validateStatus: () => true,
  });

  if (response.status !== 200 || !response.data?.ok) {
    const description = response.data?.description || `HTTP ${response.status}`;
    throw new Error(`Telegram sendPhoto failed: ${description}`);
  }

  return response.data;
}
