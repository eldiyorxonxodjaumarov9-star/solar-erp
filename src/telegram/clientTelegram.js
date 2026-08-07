/**
 * Client-side Telegram yuborish (zaxira yo‘l).
 * Server (VPS) endpoint ishlamasa, brauzer/APK to‘g‘ridan-to‘g‘ri Telegram Bot API ga yuboradi.
 * Token .env dagi VITE_BOT_TOKEN / VITE_GROUP_CHAT_ID dan olinadi.
 */
import {
  buildYorijnomaPdfBlob,
  buildYorijnomaTelegramCaption,
} from "../usta/yorijnomaPdfExport.js";

const TG_TOKEN = String(import.meta.env.VITE_BOT_TOKEN || "").trim();
const TG_CHAT = String(import.meta.env.VITE_GROUP_CHAT_ID || "").trim();

export function isClientTelegramConfigured() {
  return Boolean(TG_TOKEN && TG_CHAT);
}

function ensureConfigured() {
  if (!isClientTelegramConfigured()) {
    throw new Error("Telegram token (VITE_BOT_TOKEN) sozlanmagan");
  }
}

function dataUrlToBlob(dataUrl) {
  const text = String(dataUrl || "");
  const comma = text.indexOf(",");
  if (comma < 0) return null;
  const head = text.slice(0, comma);
  const b64 = text.slice(comma + 1);
  const mime = (head.match(/data:(.*?);base64/) || [])[1] || "image/png";
  try {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  } catch {
    return null;
  }
}

/** Har xil rasm formatini (File, Blob, dataURL, http URL) Blob ga aylantiradi. */
async function toBlob(image) {
  if (!image) return null;
  if (typeof Blob !== "undefined" && image instanceof Blob) return image;
  const text = String(image || "").trim();
  if (text.startsWith("data:")) return dataUrlToBlob(text);
  if (/^https?:\/\//i.test(text)) {
    try {
      const res = await fetch(text);
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  }
  return null;
}

/** Telegramga matn yuborish (to‘g‘ridan-to‘g‘ri). */
export async function sendMessageDirect(text) {
  ensureConfigured();
  const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TG_CHAT, text: String(text || "") }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.description || `HTTP ${res.status}`);
  }
}

/**
 * Telegramga joylashuv xaritasi (sendVenue / sendLocation).
 * @param {{ latitude: number; longitude: number; title?: string; address?: string }} p
 */
export async function sendVenueDirect({ latitude, longitude, title, address }) {
  ensureConfigured();
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const addr = String(address || "").trim();
  const endpoint = addr
    ? `https://api.telegram.org/bot${TG_TOKEN}/sendVenue`
    : `https://api.telegram.org/bot${TG_TOKEN}/sendLocation`;
  const body = addr
    ? {
        chat_id: TG_CHAT,
        latitude: lat,
        longitude: lng,
        title: String(title || "Joylashuv").slice(0, 128),
        address: addr.slice(0, 128),
      }
    : {
        chat_id: TG_CHAT,
        latitude: lat,
        longitude: lng,
      };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.description || `HTTP ${res.status}`);
  }
}

/** Telegram xarita pini (sendLocation) — interaktiv joylashuv. */
export async function sendLocationDirect({ latitude, longitude }) {
  ensureConfigured();
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendLocation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TG_CHAT,
      latitude: lat,
      longitude: lng,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.description || `HTTP ${res.status}`);
  }
}

/**
 * Guruhga Telegram geolokatsiyasi — xarita pini + manzil (sendVenue → sendLocation).
 * @returns {Promise<boolean>}
 */
export async function sendWorkGeoToGroup({ workerName, mode, location }) {
  if (!isClientTelegramConfigured()) return false;
  if (!location || location.latitude == null || location.longitude == null) return false;

  const name = String(workerName || "Usta").trim() || "Usta";
  const isDeparture = String(mode || "") === "departure";
  const title = isDeparture ? `📍 ${name} — ishdan ketdi` : `📍 ${name} — ishga keldi`;
  const lat = Number(location.latitude);
  const lng = Number(location.longitude);
  const address =
    String(location.address || "").trim() ||
    `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  try {
    await sendVenueDirect({
      latitude: lat,
      longitude: lng,
      title,
      address,
    });
    return true;
  } catch (venueErr) {
    console.warn("Telegram sendVenue xato:", venueErr);
  }

  try {
    await sendLocationDirect({ latitude: lat, longitude: lng });
    await sendMessageDirect(`${title}\n📍 ${address}`);
    return true;
  } catch (locErr) {
    console.warn("Telegram sendLocation xato:", locErr);
    return false;
  }
}

/**
 * Telegramga rasm yuborish (to‘g‘ridan-to‘g‘ri).
 * @param {{ caption?: string; image: File|Blob|string; fileName?: string }} p
 */
export async function sendPhotoDirect({ caption = "", image, fileName }) {
  ensureConfigured();
  const blob = await toBlob(image);
  if (!blob) {
    // Rasm bo‘lmasa hech bo‘lmasa matn ketsin.
    await sendMessageDirect(caption);
    return;
  }
  const form = new FormData();
  form.append("chat_id", TG_CHAT);
  form.append("caption", caption);
  form.append("photo", blob, fileName || "photo.jpg");
  const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendPhoto`, {
    method: "POST",
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    // Rasm rad etilsa, matn yuboramiz.
    if (caption) {
      await sendMessageDirect(`${caption}\n(Rasm yuborilmadi)`);
      return;
    }
    throw new Error(data?.description || `HTTP ${res.status}`);
  }
}

/**
 * Telegramga video yuborish (URL yoki Blob).
 * @param {{ caption?: string; videoUrl?: string; video?: Blob|File; fileName?: string }} p
 */
export async function sendVideoDirect({ caption = "", videoUrl, video, fileName }) {
  ensureConfigured();
  let blob = video instanceof Blob ? video : null;
  if (!blob && videoUrl) {
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error("Video yuklab olinmadi");
    blob = await res.blob();
  }
  if (!blob) {
    if (caption) await sendMessageDirect(caption);
    return;
  }
  const form = new FormData();
  form.append("chat_id", TG_CHAT);
  if (caption) form.append("caption", String(caption).slice(0, 1024));
  form.append("video", blob, fileName || "video.mp4");
  const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendVideo`, {
    method: "POST",
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.description || `HTTP ${res.status}`);
  }
}

/**
 * Loyiha bosqich rasmlarini to‘g‘ridan-to‘g‘ri yuborish (server caption formatига mos).
 * @param {{ workerName?: string; workerId?: string; workerPhone?: string; brigadeName?: string; projectName?: string; stageName?: string; photos: string[]; inverter?: { email?: string; key?: string; password?: string } }} payload
 */
export async function sendStagePhotosDirect(payload) {
  const workerName = String(payload.workerName || "Usta").trim() || "Usta";
  const workerId = String(payload.workerId || "").trim();
  const workerPhone = String(payload.workerPhone || "").trim();
  const brigadeName = String(payload.brigadeName || "").trim();
  const projectName = String(payload.projectName || "Loyiha").trim() || "Loyiha";
  const stageName = String(payload.stageName || "Bosqich").trim() || "Bosqich";
  const photos = (Array.isArray(payload.photos) ? payload.photos : []).slice(0, 3);
  if (photos.length < 3) {
    throw new Error("Kamida 3 ta rasm kerak");
  }
  const inv = payload.inverter || {};
  const headerParts = [
    "📸 Bosqich rasmi",
    `Brigada: ${brigadeName || "—"}`,
    `Usta: ${workerName}${workerId ? ` (id: ${workerId})` : ""}`,
    `Tel: ${workerPhone || "—"}`,
    `Loyiha: ${projectName}`,
    `Bosqich: ${stageName}`,
  ];
  if (inv.email || inv.key || inv.password) {
    headerParts.push(
      "— Invertor (ixtiyoriy) —",
      `Email: ${inv.email || "—"}`,
      `Key: ${inv.key || "—"}`,
      `Parol: ${inv.password || "—"}`,
    );
  }
  const headerLines = headerParts.join("\n");
  for (let i = 0; i < photos.length; i += 1) {
    const slotLabel = String(payload.slotLabels?.[i] || "").trim();
    const caption =
      i === 0
        ? `${headerLines}\nRasm: 1/${photos.length}${slotLabel ? ` — ${slotLabel}` : ""}`
        : `${stageName} — Rasm: ${i + 1}/${photos.length}${slotLabel ? ` — ${slotLabel}` : ""}`;
    await sendPhotoDirect({ caption, image: photos[i], fileName: `stage-${i + 1}.jpg` });
  }

  const videoUrl = String(payload.videoUrl || "").trim();
  if (videoUrl) {
    const videoCaption =
      stageName === "Mijozga ishni topshirish"
        ? `🎬 ${stageName}\nMijoz bilan birga tushuntirilgan xolda video`
        : `🎬 ${stageName} — video (ixtiyoriy)`;
    await sendVideoDirect({
      caption: videoCaption,
      videoUrl,
      fileName: String(payload.videoFileName || "stage-video.mp4"),
    });
  }
}

/**
 * Loyiha yakuni rasmlarini to‘g‘ridan-to‘g‘ri yuborish.
 * @param {{ workerName?: string; projectName?: string; photos: { image: string; stageName?: string; slotNumber?: number }[] }} payload
 */
export async function sendProjectPhotosDirect(payload) {
  const workerName = String(payload.workerName || "Usta").trim() || "Usta";
  const projectName = String(payload.projectName || "Loyiha").trim() || "Loyiha";
  const photos = (Array.isArray(payload.photos) ? payload.photos : []).filter(
    (x) => x && String(x.image || "").trim(),
  );
  if (photos.length === 0) throw new Error("Rasm topilmadi");
  for (let i = 0; i < photos.length; i += 1) {
    const item = photos[i];
    const stageName = String(item.stageName || "Bosqich").trim() || "Bosqich";
    const slotNumber = Number(item.slotNumber || 0);
    const caption =
      i === 0
        ? `✅ Loyiha yakunlandi\nUsta: ${workerName}\nLoyiha: ${projectName}\nRasmlar: ${photos.length} ta`
        : `📸 ${stageName}${slotNumber ? ` | Rasm ${slotNumber}` : ""}`;
    await sendPhotoDirect({ caption, image: item.image, fileName: `project-photo-${i + 1}.jpg` });
  }
}

/**
 * Telegramga hujjat (PDF va hokazo) yuborish.
 * @param {{ caption?: string; document: Blob|File; fileName?: string }} p
 */
export async function sendDocumentDirect({ caption = "", document, fileName }) {
  ensureConfigured();
  if (!document) {
    if (caption) await sendMessageDirect(caption);
    return;
  }
  const form = new FormData();
  form.append("chat_id", TG_CHAT);
  if (caption) form.append("caption", String(caption).slice(0, 1024));
  form.append("document", document, fileName || "document.pdf");
  const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendDocument`, {
    method: "POST",
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.description || `HTTP ${res.status}`);
  }
}

/**
 * @param {{ name?: string; login?: string; workerId?: string; signature?: string; pdfBlob?: Blob; completedAt?: string }} p
 */
export async function sendYorijnomaToTelegramDirect({
  name,
  login,
  workerId,
  signature,
  pdfBlob,
  completedAt,
}) {
  let docBlob = pdfBlob;
  if (!docBlob && signature) {
    docBlob = await buildYorijnomaPdfBlob({
      workerName: name || login || "Usta",
      workerLogin: login || "",
      workerId: workerId || "",
      signatureDataUrl: signature,
      completedAt: completedAt || new Date().toISOString(),
    });
  }

  const caption = buildYorijnomaTelegramCaption({
    workerName: name || login || "Usta",
    workerLogin: login || "",
    workerId: workerId || "",
    completedAt: completedAt || new Date().toISOString(),
  });

  if (docBlob) {
    await sendDocumentDirect({
      caption,
      document: docBlob,
      fileName: `yorijnoma-${login || workerId || "usta"}.pdf`,
    });
    return;
  }

  await sendMessageDirect(caption);
}
