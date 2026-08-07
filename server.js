import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startBot, stopBot } from "./bot.js";
import { buildMonthlyReportDocuments } from "./src/lib/monthlyReport.js";
import { sendDocumentToTelegram } from "./telegramService.js";
import {
  markMasterArrivalUpload,
  markMasterDepartureUpload,
  markMasterLogin,
  markMasterStageUpload,
} from "./server/masterDailyUploads.js";
import { logTelegramEventServer, upsertTelegramEventServer } from "./server/telegramEventLog.js";
import { logTelegramAttendanceSend } from "./server/telegramAttendanceLog.js";
import { startTelegramInboundPoller, stopTelegramInboundPoller } from "./server/telegramInboundPoller.js";
import { saveWorkLogPhotoToDb } from "./server/workLogPhotoStore.js";
import { createDbRouter, handleSqlLogin } from "./server/routes/dbApi.js";
import { createReportsRouter } from "./server/routes/reportsApi.js";
import {
  buildDailyAttendanceReportForDate,
  generateAndSendDailyAttendanceReport,
} from "./server/reports/dailyAttendanceTelegram.js";
import { initDb, listCollection } from "./server/db/store.js";
import { TELEGRAM_EVENT_TYPES, telegramDateToDateKey } from "./shared/telegramEventTypes.js";
import { formatLocationTelegramBlock } from "./shared/workLocationFormat.js";
import { tashkentTodayYMD } from "./src/photos/tashkentTime.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const __filename = fileURLToPath(import.meta.url);
const distDir = path.join(__dirname, "dist");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;

const workers = [];
const projects = [];
const brigades = [];
const expenses = [];
const workLogs = [];

const config = {
  token: (process.env.TELEGRAM_BOT_TOKEN || "").trim(),
  groupId: (process.env.TELEGRAM_GROUP_ID || "").trim(),
  erpApiUrl: (process.env.ERP_API_URL || "").trim(),
};

app.disable("x-powered-by");
app.use((req, res, next) => {
  // Capacitor Android app uses a non-http origin (e.g. capacitor://localhost),
  // so we allow all origins for API calls.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
const upload = multer({ storage: multer.memoryStorage() });
const UPLOADS_DIR = path.join(__dirname, "data", "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

void initDb().catch((err) => {
  console.error("[db] init xatosi:", err?.message || err);
});

app.use("/api/db", createDbRouter());
app.use("/api/reports", createReportsRouter());
app.use("/api/media", express.static(UPLOADS_DIR));

const TELEGRAM_EXPORT_DIR = path.join(__dirname, "data", "telegram-export", "ChatExport_2026-07-03");
if (fs.existsSync(TELEGRAM_EXPORT_DIR)) {
  app.use("/api/telegram-export", express.static(TELEGRAM_EXPORT_DIR));
}

async function sendTelegramWorkMessage(text) {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = (process.env.TELEGRAM_GROUP_ID || "").trim();
  if (!token || !chatId) {
    throw new Error("Telegram sozlanmagan");
  }
  const endpoint = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = new URLSearchParams();
  body.append("chat_id", chatId);
  body.append("text", text);
  const response = await axios.post(endpoint, body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 30000,
    validateStatus: () => true,
  });
  if (response.status !== 200 || !response.data?.ok) {
    const msg = response.data?.description || `HTTP ${response.status}`;
    throw new Error(msg);
  }
  return {
    messageId: response.data?.result?.message_id,
    chatId,
  };
}

async function sendTelegramWorkPhoto({ caption, fileBuffer, fileName }) {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = (process.env.TELEGRAM_GROUP_ID || "").trim();
  if (!token || !chatId) {
    throw new Error("Telegram sozlanmagan");
  }
  const endpoint = `https://api.telegram.org/bot${token}/sendPhoto`;
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", caption || "");
  form.append("photo", new Blob([fileBuffer]), fileName || "work-log.jpg");
  const response = await fetch(endpoint, {
    method: "POST",
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) {
    const msg = data?.description || `HTTP ${response.status}`;
    throw new Error(msg);
  }
  return {
    messageId: data?.result?.message_id,
    chatId,
  };
}

async function sendTelegramWorkVenue({ latitude, longitude, title, address }) {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = (process.env.TELEGRAM_GROUP_ID || "").trim();
  if (!token || !chatId) {
    throw new Error("Telegram sozlanmagan");
  }
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const addr = String(address || "").trim();
  const endpoint = addr
    ? `https://api.telegram.org/bot${token}/sendVenue`
    : `https://api.telegram.org/bot${token}/sendLocation`;
  const body = addr
    ? {
        chat_id: chatId,
        latitude: lat,
        longitude: lng,
        title: String(title || "Joylashuv").slice(0, 128),
        address: addr.slice(0, 128),
      }
    : {
        chat_id: chatId,
        latitude: lat,
        longitude: lng,
      };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) {
    const msg = data?.description || `HTTP ${response.status}`;
    throw new Error(msg);
  }
}

async function sendTelegramWorkVideo({ caption, fileBuffer, fileName }) {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = (process.env.TELEGRAM_GROUP_ID || "").trim();
  if (!token || !chatId) {
    throw new Error("Telegram sozlanmagan");
  }
  const endpoint = `https://api.telegram.org/bot${token}/sendVideo`;
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", caption || "");
  form.append("video", new Blob([fileBuffer]), fileName || "stage-video.mp4");
  const response = await fetch(endpoint, {
    method: "POST",
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) {
    const msg = data?.description || `HTTP ${response.status}`;
    throw new Error(msg);
  }
}

function dataUrlToBuffer(dataUrl) {
  const text = String(dataUrl || "");
  const m = text.match(/^data:(.+?);base64,(.+)$/);
  if (!m) return null;
  return Buffer.from(m[2], "base64");
}

async function imageToBuffer(imageValue) {
  const text = String(imageValue || "").trim();
  if (!text) return null;
  const dataBuffer = dataUrlToBuffer(text);
  if (dataBuffer) return dataBuffer;
  if (/^https?:\/\//i.test(text)) {
    const response = await fetch(text);
    if (!response.ok) return null;
    const arr = await response.arrayBuffer();
    return Buffer.from(arr);
  }
  return null;
}

app.get("/status", (_req, res) => {
  res.status(200).json({ status: "running", apiVersion: 2, sql: true });
});

function clientIp(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").trim();
  if (fwd) return fwd.split(",")[0].trim();
  const raw = String(req.socket?.remoteAddress || req.ip || "").trim();
  return raw.replace(/^::ffff:/, "");
}

function isPrivateIp(ip) {
  const s = String(ip || "").trim();
  if (!s || s === "::1") return true;
  return /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(s);
}

async function lookupIpGeo(ip) {
  const targets = [];
  if (ip && !isPrivateIp(ip)) {
    targets.push(`https://ipwho.is/${encodeURIComponent(ip)}`);
    targets.push(`https://ipapi.co/${encodeURIComponent(ip)}/json/`);
  }
  targets.push("https://ipwho.is/");
  targets.push("https://ipapi.co/json/");

  let lastErr = null;
  for (const url of targets) {
    try {
      const response = await axios.get(url, { timeout: 8000 });
      const data = response.data;
      let lat;
      let lng;
      let address = "";
      if (url.includes("ipapi.co")) {
        lat = Number(data.latitude);
        lng = Number(data.longitude);
        if (data.error) throw new Error(String(data.reason || "ipapi"));
        address = [data.city, data.region, data.country_name]
          .map((x) => String(x || "").trim())
          .filter(Boolean)
          .join(", ");
      } else {
        if (!data?.success) throw new Error("ipwho");
        lat = Number(data.latitude);
        lng = Number(data.longitude);
        address = [data.city, data.region, data.country]
          .map((x) => String(x || "").trim())
          .filter(Boolean)
          .join(", ");
      }
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("geo");
      return {
        latitude: lat,
        longitude: lng,
        accuracy: 5000,
        source: "ip",
        address,
      };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Joylashuv olinmadi");
}

/** APK: GPS ishlamasa server orqali taxminiy joy (CORS yo‘q). */
app.get("/api/geo/approx", async (req, res) => {
  try {
    const ip = clientIp(req);
    const loc = await lookupIpGeo(ip);
    res.json({ ok: true, ...loc });
  } catch (e) {
    res.status(502).json({
      ok: false,
      error: e instanceof Error ? e.message : "Joylashuv olinmadi",
    });
  }
});

/** GPS koordinatalardan aniq manzil matni (reverse geocode). */
async function reverseGeocodeServer(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&format=json&accept-language=uz,ru,en`;
  const response = await axios.get(url, {
    timeout: 9000,
    headers: { "User-Agent": "SolarERP/1.0 (server)" },
  });
  return String(response.data?.display_name || "").slice(0, 220);
}

app.get("/api/geo/reverse", async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ ok: false, error: "lat va lng kerak" });
    }
    const address = await reverseGeocodeServer(lat, lng);
    res.json({ ok: true, address, latitude: lat, longitude: lng });
  } catch (e) {
    res.status(502).json({
      ok: false,
      error: e instanceof Error ? e.message : "Manzil topilmadi",
    });
  }
});

app.post("/api/master/mark-login", (req, res) => {
  try {
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const workerId = String(payload.workerId || "").trim();
    const login = String(payload.login || "").trim().toLowerCase();
    const name = String(payload.name || payload.workerName || "").trim() || login || "Usta";
    if (!workerId && !login) {
      return res.status(400).json({ ok: false, error: "workerId yoki login kerak" });
    }
    markMasterLogin(workerId, login, name);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("POST /api/master/mark-login failed:", error);
    return res.status(500).json({ ok: false, error: "Server xatosi" });
  }
});

app.post("/api/login", (req, res) => handleSqlLogin(req, res));

/** Client dan kelgan bot yozuvini SQL + Firestore ga saqlash (Hisobot avtomatik yangilanadi). */
app.post("/api/telegram/log-event", async (req, res) => {
  try {
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    if (!String(payload.eventType || "").trim()) {
      return res.status(400).json({ ok: false, error: "eventType kerak" });
    }
    const saved = await upsertTelegramEventServer(payload);
    return res.json({ ok: true, id: saved.id });
  } catch (error) {
    console.error("POST /api/telegram/log-event failed:", error);
    return res.status(500).json({ ok: false, error: error.message || "Xato" });
  }
});

app.post("/api/telegram/work-log", async (req, res) => {
  try {
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const mode = String(payload.mode || "").trim(); // arrival | departure | day_off
    const workerName = String(payload.workerName || "Usta").trim() || "Usta";
    const date = String(payload.date || "").trim();
    const time = String(payload.time || "").trim();
    const duration = String(payload.duration || "").trim();
    const reason = String(payload.reason || "").trim();

    let text = "";
    if (mode === "arrival") {
      text = `✅ Ishga keldi\nUsta: ${workerName}\nVaqt: ${time}\nSana: ${date}`;
    } else if (mode === "departure") {
      text = `🏁 Ishdan ketdi\nUsta: ${workerName}\nVaqt: ${time}\nSana: ${date}\nIshlagan: ${duration || "—"}`;
    } else if (mode === "day_off") {
      text = `🌴 Dam olish kuni\nUsta: ${workerName}\nSana: ${date}\nSabab: ${reason || "—"}`;
    } else {
      return res.status(400).json({ ok: false, error: "Noto'g'ri mode" });
    }

    const tgResult = await sendTelegramWorkMessage(text);
    const workerId = String(payload.workerId || "").trim();
    const workerLogin = String(payload.workerLogin || payload.login || "").trim();
    const eventType =
      mode === "arrival"
        ? TELEGRAM_EVENT_TYPES.KELDI
        : mode === "departure"
          ? TELEGRAM_EVENT_TYPES.KETDI
          : TELEGRAM_EVENT_TYPES.DAY_OFF;
    const dateKey =
      telegramDateToDateKey(date, new Date().toISOString()) ||
      tashkentTodayYMD();
    await logTelegramEventServer({
      workerId,
      workerName,
      workerLogin,
      eventType,
      date,
      time,
      dateKey,
      meta: { duration, reason },
    });
    void logTelegramAttendanceSend({
      workerId,
      userId: workerId,
      workerName,
      workerLogin,
      type: mode,
      date: dateKey,
      success: true,
      telegramMessageId: tgResult?.messageId,
      telegramChatId: tgResult?.chatId || (process.env.TELEGRAM_GROUP_ID || "").trim(),
    });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("POST /api/telegram/work-log failed:", error);
    try {
      const payload = req.body && typeof req.body === "object" ? req.body : {};
      void logTelegramAttendanceSend({
        workerId: String(payload.workerId || "").trim(),
        userId: String(payload.workerId || "").trim(),
        workerName: String(payload.workerName || "").trim(),
        workerLogin: String(payload.workerLogin || "").trim(),
        type: String(payload.mode || "").trim(),
        date:
          telegramDateToDateKey(payload.date, new Date().toISOString()) ||
          tashkentTodayYMD(),
        success: false,
        error: error?.message || "Telegram xatosi",
      });
    } catch {
      /* ignore */
    }
    return res.status(500).json({ ok: false, error: error.message || "Telegram xatosi" });
  }
});

function parseWorkLocationPayload(payload) {
  const raw = String(payload?.locationJson || payload?.location || "").trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      /* JSON xato */
    }
  }
  const lat = Number(payload?.latitude);
  const lng = Number(payload?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return {
      latitude: lat,
      longitude: lng,
      accuracy: Number(payload?.accuracy) || 0,
      source: String(payload?.locationSource || "device"),
      address: String(payload?.address || ""),
    };
  }
  return null;
}

function normalizeWorkLocation(loc) {
  if (!loc || loc.latitude == null || loc.longitude == null) return null;
  const lat = Number(loc.latitude);
  const lng = Number(loc.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    latitude: lat,
    longitude: lng,
    accuracy: Number(loc.accuracy) || 5000,
    source: String(loc.source || "ip"),
    address: String(loc.address || ""),
    capturedAt: String(loc.capturedAt || new Date().toISOString()),
    mapsUrl:
      String(loc.mapsUrl || "").trim() ||
      `https://maps.google.com/?q=${lat},${lng}`,
  };
}

/** Client GPS/locationJson ustuvor; manzil bo‘lmasa reverse geocode; oxirida IP. */
async function resolveWorkLocationForRequest(req, payload) {
  let fromClient = normalizeWorkLocation(parseWorkLocationPayload(payload));
  if (fromClient) {
    if (
      !String(fromClient.address || "").trim() &&
      fromClient.source !== "ip"
    ) {
      try {
        fromClient.address = await reverseGeocodeServer(
          fromClient.latitude,
          fromClient.longitude,
        );
      } catch (e) {
        console.warn("Reverse geocode xato:", e?.message || e);
      }
    }
    return fromClient;
  }
  try {
    const ip = clientIp(req);
    const geo = await lookupIpGeo(ip);
    return normalizeWorkLocation(geo);
  } catch (e) {
    console.warn("Server IP joylashuv olinmadi:", e?.message || e);
    return null;
  }
}

function appendLocationCaption(caption, location) {
  const block = formatLocationTelegramBlock(location);
  return block ? `${caption}\n${block}` : caption;
}

async function sendWorkLocationToTelegram({ workLocation, workerName, mode }) {
  if (!workLocation?.latitude || !workLocation?.longitude) return false;

  const venueTitle =
    mode === "arrival"
      ? `📍 ${workerName} — ishga keldi`
      : `📍 ${workerName} — ishdan ketdi`;
  const venueAddress =
    String(workLocation.address || "").trim() ||
    `${Number(workLocation.latitude).toFixed(5)}, ${Number(workLocation.longitude).toFixed(5)}`;

  try {
    await sendTelegramWorkVenue({
      latitude: workLocation.latitude,
      longitude: workLocation.longitude,
      title: venueTitle,
      address: venueAddress,
    });
    return true;
  } catch (venueErr) {
    console.error("sendVenue xato, sendLocation uriniladi:", venueErr?.message || venueErr);
  }

  try {
    const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
    const chatId = (process.env.TELEGRAM_GROUP_ID || "").trim();
    if (!token || !chatId) return false;
    const res = await fetch(`https://api.telegram.org/bot${token}/sendLocation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        latitude: workLocation.latitude,
        longitude: workLocation.longitude,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok) return true;
  } catch (locErr) {
    console.error("sendLocation ham xato:", locErr?.message || locErr);
  }

  try {
    const block = formatLocationTelegramBlock(workLocation);
    if (block) await sendTelegramWorkMessage(block);
    return Boolean(block);
  } catch {
    return false;
  }
}

app.post("/api/telegram/work-log-photo", upload.single("image"), async (req, res) => {
  try {
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const mode = String(payload.mode || "").trim(); // arrival | departure
    const workerName = String(payload.workerName || "Usta").trim() || "Usta";
    const date = String(payload.date || "").trim();
    const time = String(payload.time || "").trim();
    const duration = String(payload.duration || "").trim();
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ ok: false, error: "Rasm topilmadi" });
    }

    const workLocation = await resolveWorkLocationForRequest(req, payload);

    let caption = "";
    if (mode === "arrival") {
      caption = `✅ Ishga keldi\nUsta: ${workerName}\nVaqt: ${time}\nSana: ${date}`;
    } else if (mode === "departure") {
      caption = `🏁 Ishdan ketdi\nUsta: ${workerName}\nVaqt: ${time}\nSana: ${date}\nIshlagan: ${duration || "—"}`;
    } else {
      return res.status(400).json({ ok: false, error: "Noto'g'ri mode" });
    }

    caption = appendLocationCaption(caption, workLocation);

    const tgPhoto = await sendTelegramWorkPhoto({
      caption,
      fileBuffer: req.file.buffer,
      fileName: req.file.originalname || "work-log.jpg",
    });

    const workerId = String(payload.workerId || "").trim();
    const workerLogin = String(payload.workerLogin || payload.login || "").trim();
    const dateKey =
      telegramDateToDateKey(date, new Date().toISOString()) ||
      tashkentTodayYMD();

    let savedPhoto = null;
    try {
      savedPhoto = await saveWorkLogPhotoToDb({
        workerId,
        workerName,
        mode,
        date,
        fileBuffer: req.file.buffer,
        mimeType: req.file.mimetype || "image/jpeg",
      });
    } catch (photoErr) {
      console.warn("work-log-photo DB saqlash:", photoErr?.message || photoErr);
    }

    const venueSent = await sendWorkLocationToTelegram({
      workLocation,
      workerName,
      mode,
    });

    markMasterLogin(workerId, workerLogin, workerName, date);
    if (mode === "arrival") {
      markMasterArrivalUpload(workerId, workerName, date);
    } else if (mode === "departure") {
      markMasterDepartureUpload(workerId, workerName, date);
    }

    const eventType =
      mode === "arrival" ? TELEGRAM_EVENT_TYPES.KELDI : TELEGRAM_EVENT_TYPES.KETDI;
    const imageUrl = String(savedPhoto?.url || savedPhoto?.imageUrl || "").trim();
    await logTelegramEventServer({
      workerId,
      workerLogin,
      workerName,
      eventType,
      date,
      time,
      dateKey,
      meta: {
        duration,
        location: workLocation,
        photoId: savedPhoto?.id || "",
        photoSaved: Boolean(savedPhoto),
        imageUrl,
      },
    });

    void logTelegramAttendanceSend({
      workerId,
      userId: workerId,
      workerName,
      workerLogin,
      type: mode,
      date: dateKey,
      imageUrl,
      attendanceId: savedPhoto?.id || "",
      telegramMessageId: tgPhoto?.messageId,
      telegramChatId: tgPhoto?.chatId || (process.env.TELEGRAM_GROUP_ID || "").trim(),
      success: true,
    });

    return res.status(200).json({
      ok: true,
      venueSent,
      location: workLocation,
      photoSaved: Boolean(savedPhoto),
    });
  } catch (error) {
    console.error("POST /api/telegram/work-log-photo failed:", error);
    try {
      const payload = req.body && typeof req.body === "object" ? req.body : {};
      void logTelegramAttendanceSend({
        workerId: String(payload.workerId || "").trim(),
        userId: String(payload.workerId || "").trim(),
        workerName: String(payload.workerName || "").trim(),
        workerLogin: String(payload.workerLogin || "").trim(),
        type: String(payload.mode || "").trim(),
        date:
          telegramDateToDateKey(payload.date, new Date().toISOString()) ||
          tashkentTodayYMD(),
        success: false,
        error: error?.message || "Telegram xatosi",
      });
    } catch {
      /* ignore */
    }
    return res.status(500).json({ ok: false, error: error.message || "Telegram xatosi" });
  }
});

app.post("/api/upload/process-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ ok: false, error: "Rasm topilmadi" });
    }
    const mime = String(req.file.mimetype || "").toLowerCase();
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(mime)) {
      return res.status(400).json({ ok: false, error: "Fayl formati noto'g'ri" });
    }
    const imageData = `data:${mime};base64,${req.file.buffer.toString("base64")}`;
    return res.status(200).json({ ok: true, imageData });
  } catch (error) {
    console.error("POST /api/upload/process-image failed:", error);
    return res.status(500).json({ ok: false, error: "Rasmni qayta ishlab bo'lmadi" });
  }
});

app.post("/api/telegram/expense-log", async (req, res) => {
  try {
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const workerName = String(payload.workerName || "Usta").trim() || "Usta";
    const projectName = String(payload.projectName || "Loyiha").trim() || "Loyiha";
    const amount = String(payload.amount || "").trim();
    const type = String(payload.type || "").trim();
    const date = String(payload.date || "").trim();
    const comment = String(payload.comment || "").trim();
    const receiptImageData = String(payload.receiptImageData || "").trim();
    console.log("EXPENSE LOG REQUEST:", workerName, projectName, amount, type, date);

    const text =
      `💰 Yangi xarajat\n` +
      `Usta: ${workerName}\n` +
      `Loyiha: ${projectName}\n` +
      `Turi: ${type || "—"}\n` +
      `Summa: ${amount || "—"} so'm\n` +
      `Sana: ${date || "—"}\n` +
      `Izoh: ${comment || "—"}`;

    const receiptBuffer = dataUrlToBuffer(receiptImageData);
    const workerId = String(payload.workerId || "").trim();
    const workerLogin = String(payload.workerLogin || payload.login || "").trim();
    if (receiptBuffer) {
      await sendTelegramWorkPhoto({
        caption: text,
        fileBuffer: receiptBuffer,
        fileName: "xarajat-chek.jpg",
      });
    } else {
      await sendTelegramWorkMessage(text);
    }

    await logTelegramEventServer({
      workerId,
      workerName,
      workerLogin,
      eventType: TELEGRAM_EVENT_TYPES.XARAJAT,
      date,
      meta: { projectName, amount, type, comment },
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("POST /api/telegram/expense-log failed:", error);
    return res.status(500).json({ ok: false, error: error.message || "Telegram xatosi" });
  }
});

app.post("/api/telegram/stage-photos", async (req, res) => {
  try {
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const workerName = String(payload.workerName || "Usta").trim() || "Usta";
    const workerId = String(payload.workerId || "").trim();
    const workerPhone = String(payload.workerPhone || "").trim();
    const brigadeName = String(payload.brigadeName || "").trim();
    const projectName = String(payload.projectName || "Loyiha").trim() || "Loyiha";
    const stageName = String(payload.stageName || "Bosqich").trim() || "Bosqich";
    const rawPhotos = Array.isArray(payload.photos) ? payload.photos : [];
    if (rawPhotos.length < 3) {
      return res.status(400).json({ ok: false, error: "Kamida 3 ta rasm yuborilishi kerak" });
    }
    const photos = rawPhotos.slice(0, 3);

    console.log("STAGE PHOTOS REQUEST:", workerName, projectName, stageName, photos.length);
    const invRaw = payload.inverter && typeof payload.inverter === "object" ? payload.inverter : {};
    const invEmail = String(invRaw.email || "").trim();
    const invKey = String(invRaw.key || "").trim();
    const invPassword = String(invRaw.password || "").trim();
    const headerParts = [
      "📸 Bosqich rasmi",
      `Brigada: ${brigadeName || "—"}`,
      `Usta: ${workerName}${workerId ? ` (id: ${workerId})` : ""}`,
      `Tel: ${workerPhone || "—"}`,
      `Loyiha: ${projectName}`,
      `Bosqich: ${stageName}`,
    ];
    if (invEmail || invKey || invPassword) {
      headerParts.push(
        "— Invertor (ixtiyoriy) —",
        `Email: ${invEmail || "—"}`,
        `Key: ${invKey || "—"}`,
        `Parol: ${invPassword || "—"}`,
      );
    }
    const headerLines = headerParts.join("\n");

    for (let i = 0; i < photos.length; i += 1) {
      const buffer = await imageToBuffer(photos[i]);
      if (!buffer) {
        return res.status(400).json({ ok: false, error: `Rasm ${i + 1} noto'g'ri formatda` });
      }
      const slotLabel = String(payload.slotLabels?.[i] || "").trim();
      const caption =
        i === 0
          ? `${headerLines}\nRasm: 1/${photos.length}${slotLabel ? ` — ${slotLabel}` : ""}`
          : `${stageName} — Rasm: ${i + 1}/${photos.length}${slotLabel ? ` — ${slotLabel}` : ""}`;
      await sendTelegramWorkPhoto({
        caption,
        fileBuffer: buffer,
        fileName: `stage-${i + 1}.jpg`,
      });
    }

    const videoUrl = String(payload.videoUrl || "").trim();
    if (videoUrl) {
      try {
        const videoRes = await fetch(videoUrl);
        if (!videoRes.ok) throw new Error("Video URL ochilmadi");
        const videoBuf = Buffer.from(await videoRes.arrayBuffer());
        const videoCaption =
          stageName === "Mijozga ishni topshirish"
            ? `🎬 ${stageName}\nMijoz bilan birga tushuntirilgan xolda video`
            : `🎬 ${stageName} — video (ixtiyoriy)`;
        await sendTelegramWorkVideo({
          caption: videoCaption,
          fileBuffer: videoBuf,
          fileName: String(payload.videoFileName || "stage-video.mp4"),
        });
      } catch (videoErr) {
        console.error("Bosqich videosi yuborilmadi:", videoErr?.message || videoErr);
      }
    }

    const workerLogin = String(payload.workerLogin || payload.login || "").trim();
    markMasterLogin(workerId, workerLogin, workerName);
    markMasterStageUpload(workerId, workerName);

    await logTelegramEventServer({
      workerId,
      workerLogin,
      workerName,
      eventType: TELEGRAM_EVENT_TYPES.RASM,
      meta: { projectName, stageName, brigadeName },
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("POST /api/telegram/stage-photos failed:", error);
    return res.status(500).json({ ok: false, error: error.message || "Telegram xatosi" });
  }
});

app.post("/api/telegram/yorijnoma", async (req, res) => {
  try {
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const workerName = String(payload.workerName || payload.name || "Usta").trim() || "Usta";
    const workerLogin = String(payload.workerLogin || payload.login || "").trim();
    const workerId = String(payload.workerId || "").trim();
    const signature = String(payload.signature || payload.signatureDataUrl || "").trim();
    const pdfBase64 = String(payload.pdfBase64 || "").trim();
    const completedAt = String(payload.completedAt || "").trim();

    const nowTashkent = completedAt
      ? new Date(completedAt).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" })
      : new Date().toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" });
    const caption = [
      "✅ Yo'riqnoma tasdiqlandi (PDF)",
      `Usta: ${workerName}${workerLogin ? ` (${workerLogin})` : ""}`,
      workerId ? `ID: ${workerId}` : "",
      "Xavfsizlik qoidalari bilan tanishib chiqildi va imzo qo'yildi.",
      `Vaqt: ${nowTashkent}`,
    ]
      .filter(Boolean)
      .join("\n");

    const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
    const groupId = (process.env.TELEGRAM_GROUP_ID || "").trim();

    if (pdfBase64 && token && groupId) {
      const buffer = Buffer.from(pdfBase64, "base64");
      await sendDocumentToTelegram({
        token,
        groupId,
        buffer,
        filename: `yorijnoma-${workerLogin || workerId || "usta"}.pdf`,
        caption,
        mimeType: "application/pdf",
      });
    } else {
      const buffer = signature ? await imageToBuffer(signature) : null;
      if (buffer) {
        try {
          await sendTelegramWorkPhoto({
            caption,
            fileBuffer: buffer,
            fileName: `yorijnoma-imzo-${workerLogin || workerId || "usta"}.png`,
          });
        } catch (photoError) {
          console.error("Yo'riqnoma imzo rasmi yuborilmadi, matn yuboriladi:", photoError?.message || photoError);
          await sendTelegramWorkMessage(`${caption}\n(Imzo rasmi yuborilmadi)`);
        }
      } else {
        await sendTelegramWorkMessage(caption);
      }
    }

    markMasterLogin(workerId, workerLogin, workerName);

    await logTelegramEventServer({
      workerId,
      workerLogin,
      workerName,
      eventType: TELEGRAM_EVENT_TYPES.YORIJNOMA,
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("POST /api/telegram/yorijnoma failed:", error);
    return res.status(500).json({ ok: false, error: error.message || "Telegram xatosi" });
  }
});

app.post("/api/telegram/project-photos", async (req, res) => {
  try {
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const workerName = String(payload.workerName || "Usta").trim() || "Usta";
    const workerId = String(payload.workerId || "").trim();
    const workerLogin = String(payload.workerLogin || payload.login || "").trim();
    const projectName = String(payload.projectName || "Loyiha").trim() || "Loyiha";
    const photos = Array.isArray(payload.photos) ? payload.photos : [];

    if (photos.length === 0) {
      return res.status(400).json({ ok: false, error: "Yuborish uchun rasm topilmadi" });
    }

    for (let i = 0; i < photos.length; i += 1) {
      const item = photos[i] && typeof photos[i] === "object" ? photos[i] : {};
      const image = String(item.image || "").trim();
      const stageName = String(item.stageName || "Bosqich").trim() || "Bosqich";
      const slotNumber = Number(item.slotNumber || 0);
      const buffer = await imageToBuffer(image);
      if (!buffer) continue;

      const caption =
        i === 0
          ? `✅ Loyiha yakunlandi\nUsta: ${workerName}\nLoyiha: ${projectName}\nRasmlar: ${photos.length} ta`
          : `📸 ${stageName}${slotNumber ? ` | Rasm ${slotNumber}` : ""}`;

      await sendTelegramWorkPhoto({
        caption,
        fileBuffer: buffer,
        fileName: `project-photo-${i + 1}.jpg`,
      });
    }

    await logTelegramEventServer({
      workerId,
      workerLogin,
      workerName,
      eventType: TELEGRAM_EVENT_TYPES.LOYIHA,
      meta: { projectName, photoCount: photos.length },
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("POST /api/telegram/project-photos failed:", error);
    return res.status(500).json({ ok: false, error: error.message || "Telegram xatosi" });
  }
});

app.get("/api/workers", (_req, res) => {
  try {
    res.status(200).json(workers);
  } catch (error) {
    console.error("GET /api/workers failed:", error);
    res.status(500).json([]);
  }
});

app.post("/api/workers", (req, res) => {
  try {
    if (req.body && typeof req.body === "object") {
      workers.push(req.body);
    }
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("POST /api/workers failed:", error);
    res.status(500).json({ success: false });
  }
});

app.get("/api/projects", (_req, res) => {
  try {
    res.status(200).json(projects);
  } catch (error) {
    console.error("GET /api/projects failed:", error);
    res.status(500).json([]);
  }
});

app.post("/api/projects", (req, res) => {
  try {
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const title =
      String(payload.title || payload.clientName || payload.client_name || "")
        .trim();
    if (!title) {
      return res.status(400).json({ success: false, message: "title is required" });
    }
    const item = {
      id: String(Date.now()),
      title,
      description: String(payload.description || "").trim(),
      price: Number(payload.price) || 0,
      clientName: String(payload.clientName || title),
      client_name: String(payload.client_name || title),
      address: String(payload.address || ""),
      location: String(payload.location || ""),
      power: Number(payload.power || 0),
      powerKw: String(payload.powerKw || payload.power || ""),
      status: String(payload.status || "jarayonda"),
      holat: String(payload.holat || "Jarayonda"),
      createdAt: new Date().toISOString(),
    };
    projects.unshift(item);
    res.status(201).json(item);
  } catch (error) {
    console.error("POST /api/projects failed:", error);
    res.status(500).json({ success: false });
  }
});

app.get("/api/brigades", (_req, res) => {
  try {
    res.status(200).json(brigades);
  } catch (error) {
    console.error("GET /api/brigades failed:", error);
    res.status(500).json([]);
  }
});

app.post("/api/brigades", (req, res) => {
  try {
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const name = String(payload.name || "").trim();
    const phone = String(payload.phone || "").trim();
    if (!name) {
      return res.status(400).json({ success: false, message: "Brigada nomi majburiy." });
    }
    const item = {
      id: String(Date.now()),
      name,
      phone,
      createdAt: new Date().toISOString(),
    };
    brigades.unshift(item);
    res.status(201).json(item);
  } catch (error) {
    console.error("POST /api/brigades failed:", error);
    res.status(500).json({ success: false });
  }
});

app.put("/api/brigades/:id", (req, res) => {
  try {
    const idx = brigades.findIndex((b) => b.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ success: false, message: "Brigade not found" });
    }
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    brigades[idx] = {
      ...brigades[idx],
      ...payload,
      name: String(payload.name ?? brigades[idx].name ?? "").trim(),
      phone: String(payload.phone ?? brigades[idx].phone ?? "").trim(),
      updatedAt: new Date().toISOString(),
    };
    res.status(200).json(brigades[idx]);
  } catch (error) {
    console.error("PUT /api/brigades/:id failed:", error);
    res.status(500).json({ success: false });
  }
});

app.delete("/api/brigades/:id", (req, res) => {
  try {
    const idx = brigades.findIndex((b) => b.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ success: false, message: "Brigade not found" });
    }
    brigades.splice(idx, 1);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("DELETE /api/brigades/:id failed:", error);
    res.status(500).json({ success: false });
  }
});

app.get("/api/expenses", (_req, res) => {
  try {
    res.status(200).json(expenses);
  } catch (error) {
    console.error("GET /api/expenses failed:", error);
    res.status(500).json([]);
  }
});

app.post("/api/expenses", (req, res) => {
  try {
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const amountRaw = String(payload.amount ?? "").replace(/\s/g, "");
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: "amount is required" });
    }
    const item = {
      id:
        String(payload.id || "").trim() ||
        (typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now())),
      amount: String(Math.round(amount)),
      type: String(payload.type || ""),
      comment: String(payload.comment || payload.description || ""),
      date: String(payload.date || new Date().toISOString().slice(0, 10)),
      projectId: String(payload.projectId || ""),
      projectName: String(payload.projectName || ""),
      ustaId: String(payload.ustaId || ""),
      ustaName: String(payload.ustaName || ""),
      brigadeId: String(payload.brigadeId || ""),
      brigadeName: String(payload.brigadeName || ""),
      receiptImageData: String(payload.receiptImageData || ""),
      createdAt: new Date().toISOString(),
    };
    expenses.unshift(item);
    res.status(201).json(item);
  } catch (error) {
    console.error("POST /api/expenses failed:", error);
    res.status(500).json({ success: false });
  }
});

app.put("/api/expenses/:id", (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const idx = expenses.findIndex((e) => String(e.id) === id);
    if (!id || idx === -1) {
      return res.status(404).json({ error: "Topilmadi" });
    }
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const cur = expenses[idx];
    const merged = { ...cur };
    if (payload.amount != null) {
      const amountRaw = String(payload.amount).replace(/\s/g, "");
      const amount = Number(amountRaw);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: "Summa noto‘g‘ri" });
      }
      merged.amount = String(Math.round(amount));
    }
    if (payload.type != null) merged.type = String(payload.type);
    if (payload.comment != null) merged.comment = String(payload.comment || "");
    if (payload.date != null) merged.date = String(payload.date || "");
    if (payload.projectId != null) merged.projectId = String(payload.projectId || "");
    if (payload.projectName != null) merged.projectName = String(payload.projectName || "");
    if (payload.ustaId != null) merged.ustaId = String(payload.ustaId || "");
    if (payload.ustaName != null) merged.ustaName = String(payload.ustaName || "");
    if (payload.brigadeId != null) merged.brigadeId = String(payload.brigadeId || "");
    if (payload.brigadeName != null) merged.brigadeName = String(payload.brigadeName || "");
    if (payload.receiptImageData != null) {
      merged.receiptImageData = String(payload.receiptImageData || "");
    }
    merged.id = cur.id;
    expenses[idx] = merged;
    res.status(200).json(merged);
  } catch (error) {
    console.error("PUT /api/expenses/:id failed:", error);
    res.status(500).json({ error: "Server xatosi" });
  }
});

app.delete("/api/expenses/:id", (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const idx = expenses.findIndex((e) => String(e.id) === id);
    if (!id || idx === -1) {
      return res.status(404).json({ ok: false, error: "Topilmadi" });
    }
    expenses.splice(idx, 1);
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/expenses/:id failed:", error);
    res.status(500).json({ ok: false, error: "Server xatosi" });
  }
});

app.get("/api/work_logs", (_req, res) => {
  try {
    res.status(200).json(workLogs);
  } catch (error) {
    console.error("GET /api/work_logs failed:", error);
    res.status(500).json([]);
  }
});

app.post("/api/work_logs", (req, res) => {
  try {
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const item = {
      id: String(Date.now()),
      ...payload,
      createdAt: new Date().toISOString(),
    };
    workLogs.unshift(item);
    res.status(201).json(item);
  } catch (error) {
    console.error("POST /api/work_logs failed:", error);
    res.status(500).json({ success: false });
  }
});

app.post("/api/telegram/monthly-report", async (req, res) => {
  try {
    const secret = (process.env.TELEGRAM_MONTHLY_REPORT_SECRET || "").trim();
    if (secret) {
      const h = String(req.headers["x-monthly-report-secret"] || "").trim();
      if (h !== secret) {
        return res.status(401).json({ ok: false, error: "Ruxsat yo'q" });
      }
    }
    const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
    const groupId = (process.env.TELEGRAM_GROUP_ID || "").trim();
    if (!token || !groupId) {
      return res.status(503).json({ ok: false, error: "Telegram sozlanmagan" });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const year = Number(body.year);
    const month = Number(body.month);
    if (!Number.isFinite(year) || month < 1 || month > 12) {
      return res.status(400).json({ ok: false, error: "year va month (1–12) kerak" });
    }
    const docs = buildMonthlyReportDocuments({
      year,
      month,
      projects: Array.isArray(body.projects) ? body.projects : projects,
      expenses: Array.isArray(body.expenses) ? body.expenses : expenses,
      workLogs: Array.isArray(body.workLogs) ? body.workLogs : workLogs,
      workers: Array.isArray(body.workers) ? body.workers : workers,
      activityLogs: Array.isArray(body.activityLogs) ? body.activityLogs : [],
    });
    for (const doc of docs) {
      const buf = Buffer.from(doc.body, "utf8");
      await sendDocumentToTelegram({
        token,
        groupId,
        buffer: buf,
        filename: doc.filename,
        caption: doc.caption,
        mimeType: doc.mime,
      });
    }
    return res.status(200).json({ ok: true, files: docs.length });
  } catch (error) {
    console.error("POST /api/telegram/monthly-report failed:", error);
    return res.status(500).json({ ok: false, error: error?.message || "Server xatosi" });
  }
});

/** Kunlik attendance yakuni — Telegram (cron bilan bir generator). */
app.post("/api/telegram/daily-attendance-report", async (req, res) => {
  try {
    const secret = (
      process.env.TELEGRAM_DAILY_ATTENDANCE_SECRET ||
      process.env.TELEGRAM_MONTHLY_REPORT_SECRET ||
      ""
    ).trim();
    if (secret) {
      const h = String(
        req.headers["x-daily-attendance-secret"] ||
          req.headers["x-monthly-report-secret"] ||
          "",
      ).trim();
      if (h !== secret) {
        return res.status(401).json({ ok: false, error: "Ruxsat yo'q" });
      }
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const dateKey = String(body.date || body.dateKey || tashkentTodayYMD()).trim();
    const force = body.force === true || body.force === "1";
    const result = await generateAndSendDailyAttendanceReport({
      dateKey,
      force,
      source: "manual",
    });
    if (!result.ok && !result.skipped) {
      return res.status(502).json(result);
    }
    return res.status(200).json(result);
  } catch (error) {
    console.error("POST /api/telegram/daily-attendance-report failed:", error);
    return res.status(500).json({ ok: false, error: error?.message || "Server xatosi" });
  }
});

app.get("/api/telegram/daily-attendance-report", async (req, res) => {
  try {
    const dateKey = String(req.query.date || req.query.dateKey || tashkentTodayYMD()).trim();
    const report = await buildDailyAttendanceReportForDate(dateKey);
    return res.json({ ok: true, dateKey, report });
  } catch (error) {
    console.error("GET /api/telegram/daily-attendance-report failed:", error);
    return res.status(500).json({ ok: false, error: error?.message || "Server xatosi" });
  }
});

const serveStaticFlag = String(process.env.SERVE_STATIC || "").toLowerCase();
const serveSpa =
  serveStaticFlag === "1" ||
  serveStaticFlag === "true" ||
  serveStaticFlag === "yes" ||
  (process.env.NODE_ENV === "production" && fs.existsSync(distDir));

if (serveSpa && fs.existsSync(distDir)) {
  console.log(`Serving frontend from ${distDir}`);
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return next();
    }
    if (req.path.startsWith("/api")) {
      return next();
    }
    res.sendFile(path.join(distDir, "index.html"), (err) => {
      if (err) next(err);
    });
  });
}

app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

app.use((error, _req, res, _next) => {
  if (error?.type === "entity.too.large") {
    return res.status(413).json({ ok: false, error: "Rasm hajmi juda katta" });
  }
  return res.status(500).json({ ok: false, error: "Server xatosi" });
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

let server = null;

export function startServer({ port = PORT, host = "0.0.0.0" } = {}) {
  if (server) return server;
  server = app.listen(Number(port) || PORT, host, () => {
    console.log(`Server running on port ${Number(port) || PORT}`);
    startBot({
      ...config,
      getMonthlyDataset: async () => {
        await initDb();
        const [projectsList, expensesList, workLogsList, workersList, activityLogs] =
          await Promise.all([
            listCollection("projects"),
            listCollection("expenses"),
            listCollection("work_logs"),
            listCollection("workers"),
            listCollection("user_activity_logs"),
          ]);
        return {
          projects: projectsList,
          expenses: expensesList,
          workLogs: workLogsList,
          workers: workersList,
          activityLogs,
        };
      },
    });
    startTelegramInboundPoller({ token: config.token });
  });
  return server;
}

export function stopServer() {
  try {
    stopBot();
    stopTelegramInboundPoller();
    if (!server) return;
    server.close();
    server = null;
  } catch (error) {
    console.error("Stop server failed:", error);
  }
}

function shutdown() {
  try {
    stopServer();
    process.exit(0);
  } catch (error) {
    console.error("Shutdown failed:", error);
    process.exit(1);
  }
}

function shouldAutoStartServer() {
  // PM2 (fork yoki cluster worker) — argv ba’zan boshqacha bo‘ladi, port ochilmasligi mumkin
  const pmId = process.env.pm_id;
  if (pmId !== undefined && String(pmId) !== "") {
    return true;
  }
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return path.resolve(entry) === path.resolve(__filename);
  } catch {
    return false;
  }
}

if (shouldAutoStartServer()) {
  startServer();
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
