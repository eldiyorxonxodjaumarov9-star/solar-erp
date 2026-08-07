import { TELEGRAM_EVENT_TYPES } from "../../shared/telegramEventTypes.js";
import { TELEGRAM_MESSAGE_MODULES, TELEGRAM_MODULE_LABELS } from "../../shared/telegramMessageTypes.js";
import { buildMessageTextFromEvent } from "../../shared/buildTelegramMessage.js";
import { instantToTashkentYMD } from "../photos/tashkentTime.js";
import { APP_PHOTO_TYPES } from "../photos/appPhotoTypes.js";
import { filterTelegramEventsByMonth } from "./telegramEventsReport.js";

function str(v) {
  return String(v ?? "").trim();
}

function logEntryKey(entry) {
  return [
    str(entry.sentAt).slice(0, 19),
    str(entry.label),
    str(entry.messageText).slice(0, 80),
    str(entry.fileUrl),
    str(entry.fileId),
  ].join("|");
}

export function messageMatchesWorker(msg, workerId, workerLogin, workerName) {
  const wid = str(workerId);
  const login = str(workerLogin).toLowerCase();
  const name = str(workerName).toLowerCase();
  if (wid && str(msg?.workerId) === wid) return true;
  const msgLogin = str(msg?.workerLogin || msg?.username).toLowerCase();
  if (login && msgLogin && msgLogin === login) return true;
  const msgName = str(msg?.workerName || msg?.fullName).toLowerCase();
  if (name && msgName && msgName === name) return true;
  if (name && msgName && (msgName.includes(name) || name.includes(msgName))) return true;
  return false;
}

export function filterTelegramMessagesByMonth(messages, month) {
  return (messages || []).filter((msg) => {
    const dk = str(msg?.dateKey).slice(0, 10);
    const ym =
      (/^\d{4}-\d{2}-\d{2}$/.test(dk) ? dk.slice(0, 7) : "") ||
      instantToTashkentYMD(msg?.sentAt || msg?.createdAt) ||
      "";
    return ym === month;
  });
}

/** Har qanday telegram_messages yozuvi — fayl bilan. */
export function telegramMessageToLogEntry(msg) {
  if (!msg || typeof msg !== "object") return null;
  const module = str(msg.module || msg.eventType).toLowerCase();
  const sentAt = str(msg.sentAt || msg.createdAt) || new Date().toISOString();
  const dateKey =
    str(msg.dateKey).slice(0, 10) || instantToTashkentYMD(sentAt) || sentAt.slice(0, 10);
  const messageText =
    str(msg.messageText) ||
    buildMessageTextFromEvent({
      ...msg,
      eventType: module,
      workerName: msg.workerName || msg.fullName,
      date: dateKey,
    });
  const fileUrl =
    str(msg.fileUrl) ||
    str(msg.imageUrl) ||
    str(msg.storageUrl) ||
    str(msg.meta?.imageUrl) ||
    str(msg.meta?.fileUrl) ||
    "";
  const fileId = str(msg.fileId);

  return {
    sentAt,
    dateKey,
    label: TELEGRAM_MODULE_LABELS[module] || module || "Telegram",
    messageText: messageText || (fileUrl ? "[fayl]" : fileId ? "[Telegram fayl]" : "—"),
    fileUrl,
    fileId,
    fileName: fileUrl && !fileUrl.startsWith("http") && !fileUrl.startsWith("data:") ? fileUrl : "",
    module,
    eventType: str(msg.eventType) || module,
    source: str(msg.source) || "telegram_messages",
    direction: str(msg.direction),
    status: str(msg.status),
    workerName: str(msg.workerName || msg.fullName),
    workerLogin: str(msg.workerLogin || msg.username).toLowerCase(),
  };
}

function photoToLogEntry(photo) {
  const sentAt = str(photo?.uploadDate || photo?.createdAt);
  if (!sentAt) return null;
  const type = str(photo?.type).toLowerCase();
  const fileUrl =
    str(photo?.storageUrl) ||
    str(photo?.imageUrl) ||
    str(photo?.imageData) ||
    "";
  let label = "Rasm";
  if (type === APP_PHOTO_TYPES.KELDI) label = "Keldi rasm";
  else if (type === APP_PHOTO_TYPES.KETDI) label = "Ketdi rasm";
  else if (type === APP_PHOTO_TYPES.STAGE || type === "stage_photo") label = "Bosqich rasmi";

  return {
    sentAt,
    dateKey: instantToTashkentYMD(sentAt) || sentAt.slice(0, 10),
    label,
    messageText: `${label}\nLoyiha: ${str(photo?.projectName || photo?.projectId) || "—"}`,
    fileUrl,
    fileId: "",
    fileName: "",
    module: type || "rasm",
    eventType: type || "rasm",
    source: "stage_photo",
    workerName: str(photo?.ustaName),
    workerLogin: str(photo?.ustaLogin).toLowerCase(),
  };
}

function eventToLogEntry(event) {
  if (!event?.eventType) return null;
  const type = str(event.eventType);
  return {
    sentAt: event.sentAt,
    dateKey: str(event.dateKey).slice(0, 10) || instantToTashkentYMD(event.sentAt),
    label: TELEGRAM_MODULE_LABELS[type] || type,
    messageText:
      str(event.messageText) ||
      buildMessageTextFromEvent({
        ...event,
        eventType: type,
        workerName: event.workerName,
        date: event.dateKey,
        time: event.time,
      }),
    fileUrl: str(event.meta?.imageUrl) || str(event.meta?.fileUrl) || "",
    fileId: str(event.meta?.fileId) || "",
    fileName: "",
    module: type,
    eventType: type,
    source: str(event.source) || "telegram_events",
    workerName: str(event.workerName),
    workerLogin: str(event.workerLogin).toLowerCase(),
  };
}

/** Usta uchun oy bo‘yicha BARCHA Telegram xabarlar + fayllar. */
export function buildWorkerFullTelegramLog({
  messages,
  events,
  photos,
  workerId,
  workerLogin,
  workerName,
  month,
}) {
  const byKey = new Map();

  const add = (entry) => {
    if (!entry) return;
    const key = logEntryKey(entry);
    if (!byKey.has(key)) byKey.set(key, entry);
  };

  for (const msg of filterTelegramMessagesByMonth(messages, month)) {
    if (!messageMatchesWorker(msg, workerId, workerLogin, workerName)) continue;
    add(telegramMessageToLogEntry(msg));
  }

  for (const e of filterTelegramEventsByMonth(events, month)) {
    if (!messageMatchesWorker(e, workerId, workerLogin, workerName)) continue;
    add(eventToLogEntry(e));
  }

  for (const p of photos || []) {
    if (ymOfPhoto(p) !== month) continue;
    const wid = str(workerId);
    const login = str(workerLogin).toLowerCase();
    const pid = str(p?.ustaId);
    const plogin = str(p?.ustaLogin).toLowerCase();
    const pname = str(p?.ustaName).toLowerCase();
    const wname = str(workerName).toLowerCase();
    const match =
      (wid && pid === wid) ||
      (login && plogin === login) ||
      (wname && pname && pname === wname);
    if (!match) continue;
    add(photoToLogEntry(p));
  }

  return [...byKey.values()].sort(
    (a, b) => new Date(b.sentAt || 0).getTime() - new Date(a.sentAt || 0).getTime(),
  );
}

function ymOfPhoto(photo) {
  return instantToTashkentYMD(photo?.uploadDate || photo?.createdAt)?.slice(0, 7) || "";
}

/** Oy bo‘yicha barcha bot xabarlari (ustalar filterisiz). */
export function filterMonthTelegramFeed(messages, month) {
  return filterTelegramMessagesByMonth(messages, month)
    .map((msg) => telegramMessageToLogEntry(msg))
    .filter(Boolean)
    .sort((a, b) => new Date(b.sentAt || 0).getTime() - new Date(a.sentAt || 0).getTime());
}

/** Oy bo‘yicha barcha manbalar: telegram_messages + events + stage_photos. */
export function buildMonthTelegramFeed({ messages, events, photos, month }) {
  const byKey = new Map();
  const add = (entry) => {
    if (!entry) return;
    const key = logEntryKey(entry);
    if (!byKey.has(key)) byKey.set(key, entry);
  };

  for (const msg of filterTelegramMessagesByMonth(messages, month)) {
    add(telegramMessageToLogEntry(msg));
  }
  for (const e of filterTelegramEventsByMonth(events, month)) {
    add(eventToLogEntry(e));
  }
  for (const p of photos || []) {
    if (ymOfPhoto(p) !== month) continue;
    add(photoToLogEntry(p));
  }

  return [...byKey.values()].sort(
    (a, b) => new Date(b.sentAt || 0).getTime() - new Date(a.sentAt || 0).getTime(),
  );
}

function eventKey(e) {
  return [
    str(e.workerId).toLowerCase(),
    str(e.workerLogin).toLowerCase(),
    str(e.eventType).toLowerCase(),
    str(e.dateKey).slice(0, 10),
    str(e.sentAt).slice(0, 19),
    str(e.time),
  ].join("|");
}

/** telegram_messages → telegram_events formatiga. */
export function telegramMessageToEvent(msg) {
  if (!msg || typeof msg !== "object") return null;
  const module = str(msg.module || msg.eventType).toLowerCase();
  let eventType = str(msg.eventType).toLowerCase();

  if (!eventType) {
    if (module === TELEGRAM_MESSAGE_MODULES.KELDI) eventType = TELEGRAM_EVENT_TYPES.KELDI;
    else if (module === TELEGRAM_MESSAGE_MODULES.KETDI) eventType = TELEGRAM_EVENT_TYPES.KETDI;
    else if (module === TELEGRAM_MESSAGE_MODULES.RASM) eventType = TELEGRAM_EVENT_TYPES.RASM;
    else if (module === TELEGRAM_MESSAGE_MODULES.YORIJNOMA) eventType = TELEGRAM_EVENT_TYPES.YORIJNOMA;
    else if (module === TELEGRAM_MESSAGE_MODULES.XARAJAT) eventType = TELEGRAM_EVENT_TYPES.XARAJAT;
    else if (module === TELEGRAM_MESSAGE_MODULES.LOYIHA) eventType = TELEGRAM_EVENT_TYPES.LOYIHA;
    else if (module === TELEGRAM_MESSAGE_MODULES.DAY_OFF) eventType = TELEGRAM_EVENT_TYPES.DAY_OFF;
  }

  const text = str(msg.messageText);
  if (!eventType && text) {
    if (/ishga keldi|keldi rasmi/i.test(text)) eventType = TELEGRAM_EVENT_TYPES.KELDI;
    else if (/ishdan ketdi|ketdi rasmi/i.test(text)) eventType = TELEGRAM_EVENT_TYPES.KETDI;
    else if (/dam olish/i.test(text)) eventType = TELEGRAM_EVENT_TYPES.DAY_OFF;
    else if (/xarajat/i.test(text)) eventType = TELEGRAM_EVENT_TYPES.XARAJAT;
    else if (/yo['’]?riqnoma|imzosi/i.test(text)) eventType = TELEGRAM_EVENT_TYPES.YORIJNOMA;
    else if (/bosqich rasmi|rasm yuklandi|bosqich/i.test(text)) eventType = TELEGRAM_EVENT_TYPES.RASM;
    else if (/loyiha rasmlari|loyiha rasm/i.test(text)) eventType = TELEGRAM_EVENT_TYPES.LOYIHA;
    else if (/tizimga kirdi/i.test(text)) eventType = TELEGRAM_EVENT_TYPES.KELDI;
  }

  if (module === TELEGRAM_MESSAGE_MODULES.MASTER_TRACKING && !eventType && text) {
    if (/keldi/i.test(text)) eventType = TELEGRAM_EVENT_TYPES.KELDI;
    else if (/ketdi/i.test(text)) eventType = TELEGRAM_EVENT_TYPES.KETDI;
    else if (/bosqich/i.test(text)) eventType = TELEGRAM_EVENT_TYPES.RASM;
  }

  if (
    !eventType ||
    eventType === TELEGRAM_MESSAGE_MODULES.INBOUND ||
    eventType === TELEGRAM_MESSAGE_MODULES.BOT_REMINDER ||
    eventType === TELEGRAM_MESSAGE_MODULES.BOT_ERP_POLL ||
    eventType === TELEGRAM_MESSAGE_MODULES.BOT_MONTHLY_REPORT
  ) {
    return null;
  }

  const sentAt = str(msg.sentAt || msg.createdAt) || new Date().toISOString();
  const dateKey =
    str(msg.dateKey).slice(0, 10) || instantToTashkentYMD(sentAt) || sentAt.slice(0, 10);

  return {
    id: str(msg.id),
    workerId: str(msg.workerId),
    workerName: str(msg.workerName || msg.fullName),
    workerLogin: str(msg.workerLogin || msg.username).toLowerCase(),
    eventType,
    dateKey,
    sentAt,
    time: str(msg.time),
    source: str(msg.source) || "telegram_messages",
    messageText: text,
    meta: msg.meta && typeof msg.meta === "object" ? msg.meta : {},
  };
}

/** stage_photos dagi keldi/ketdi rasmlaridan kunlar. */
export function keldiKetdiEventsFromPhotos(photos) {
  const out = [];
  for (const p of photos || []) {
    const type = str(p?.type).toLowerCase();
    if (type !== APP_PHOTO_TYPES.KELDI && type !== APP_PHOTO_TYPES.KETDI) continue;
    const sentAt = str(p.uploadDate) || str(p.createdAt);
    if (!sentAt) continue;
    out.push({
      id: str(p.id),
      workerId: str(p.ustaId),
      workerName: str(p.ustaName),
      workerLogin: str(p.ustaLogin).toLowerCase(),
      eventType: type,
      dateKey: instantToTashkentYMD(sentAt) || sentAt.slice(0, 10),
      sentAt,
      time: "",
      source: "stage_photo",
      meta: { projectId: str(p.projectId) },
    });
  }
  return out;
}

/** Barcha manbalardan yagona telegram_events ro‘yxati. */
export function mergeTelegramEventSources(...lists) {
  const byKey = new Map();
  for (const list of lists) {
    for (const raw of list || []) {
      const e =
        raw?.eventType != null
          ? raw
          : raw?.module != null || raw?.messageText != null
            ? telegramMessageToEvent(raw)
            : null;
      if (!e?.eventType) continue;
      const key = eventKey(e);
      if (!byKey.has(key)) byKey.set(key, e);
    }
  }
  return [...byKey.values()];
}

export function mergeDayLists(a, b) {
  const byDay = new Map();
  for (const d of [...(a || []), ...(b || [])]) {
    if (!d?.dateKey) continue;
    const prev = byDay.get(d.dateKey) || {
      dateKey: d.dateKey,
      loginTime: null,
      logoutTime: null,
      totalWorkTime: 0,
    };
    if (d.loginTime && (!prev.loginTime || new Date(d.loginTime) < new Date(prev.loginTime))) {
      prev.loginTime = d.loginTime;
    }
    if (d.logoutTime && (!prev.logoutTime || new Date(d.logoutTime) > new Date(prev.logoutTime))) {
      prev.logoutTime = d.logoutTime;
    }
    prev.totalWorkTime = Math.max(prev.totalWorkTime, Number(d.totalWorkTime || 0));
    byDay.set(d.dateKey, prev);
  }
  for (const day of byDay.values()) {
    if (day.loginTime && day.logoutTime && !day.totalWorkTime) {
      const aMs = new Date(day.loginTime).getTime();
      const bMs = new Date(day.logoutTime).getTime();
      if (Number.isFinite(aMs) && Number.isFinite(bMs) && bMs > aMs) {
        day.totalWorkTime = Math.floor((bMs - aMs) / 1000);
      }
    }
  }
  return [...byDay.values()].sort((x, y) => x.dateKey.localeCompare(y.dateKey));
}

export function mergeHisobotRows(a, b) {
  const byId = new Map();
  const ingest = (rows) => {
    for (const r of rows || []) {
      const id = str(r.id);
      if (!id) continue;
      const prev = byId.get(id);
      if (!prev) {
        byId.set(id, { ...r, days: [...(r.days || [])], telegramLog: [...(r.telegramLog || [])] });
        continue;
      }
      byId.set(id, {
        ...prev,
        ...r,
        photoCount: Math.max(Number(prev.photoCount || 0), Number(r.photoCount || 0)),
        keldiPhotos: Math.max(Number(prev.keldiPhotos || 0), Number(r.keldiPhotos || 0)),
        ketdiPhotos: Math.max(Number(prev.ketdiPhotos || 0), Number(r.ketdiPhotos || 0)),
        photoProjects: Math.max(Number(prev.photoProjects || 0), Number(r.photoProjects || 0)),
        arrivalDays: Math.max(Number(prev.arrivalDays || 0), Number(r.arrivalDays || 0)),
        departureDays: Math.max(Number(prev.departureDays || 0), Number(r.departureDays || 0)),
        incompleteDays: Math.max(Number(prev.incompleteDays || 0), Number(r.incompleteDays || 0)),
        totalSeconds: Math.max(Number(prev.totalSeconds || 0), Number(r.totalSeconds || 0)),
        joinedProjects: Math.max(Number(prev.joinedProjects || 0), Number(r.joinedProjects || 0)),
        completedProjects: Math.max(
          Number(prev.completedProjects || 0),
          Number(r.completedProjects || 0),
        ),
        days: mergeDayLists(prev.days, r.days),
        fromTelegram: Boolean(prev.fromTelegram || r.fromTelegram),
        yorSignedAt: prev.yorSignedAt || r.yorSignedAt || "",
        xarajatCount: Math.max(Number(prev.xarajatCount || 0), Number(r.xarajatCount || 0)),
        dayOffCount: Math.max(Number(prev.dayOffCount || 0), Number(r.dayOffCount || 0)),
        stageRasmCount: Math.max(Number(prev.stageRasmCount || 0), Number(r.stageRasmCount || 0)),
        loyihaTelegramCount: Math.max(
          Number(prev.loyihaTelegramCount || 0),
          Number(r.loyihaTelegramCount || 0),
        ),
        telegramCount: Math.max(Number(prev.telegramCount || 0), Number(r.telegramCount || 0)),
        telegramLog: [...(prev.telegramLog || []), ...(r.telegramLog || [])]
          .filter(
            (item, idx, arr) =>
              arr.findIndex(
                (x) =>
                  `${x.sentAt}|${x.eventType}|${x.messageText}` ===
                  `${item.sentAt}|${item.eventType}|${item.messageText}`,
              ) === idx,
          )
          .sort(
            (a, b) => new Date(b.sentAt || 0).getTime() - new Date(a.sentAt || 0).getTime(),
          ),
      });
    }
  };
  ingest(a);
  ingest(b);
  return [...byId.values()].sort(
    (x, y) =>
      Number(y.photoCount || 0) +
      Number(y.arrivalDays || 0) -
      (Number(x.photoCount || 0) + Number(x.arrivalDays || 0)) ||
      str(x.name).localeCompare(str(y.name), "uz"),
  );
}

export function summarizeHisobotRows(rows, totalUstas) {
  const list = rows || [];
  return {
    photoUstas: list.filter((r) => r.photoCount > 0).length,
    attendanceUstas: list.filter((r) => r.arrivalDays > 0).length,
    yorUstas: list.filter((r) => r.yorSignedAt).length,
    totalPhotos: list.reduce((s, r) => s + Number(r.photoCount || 0), 0),
    totalArrivalDays: list.reduce((s, r) => s + Number(r.arrivalDays || 0), 0),
    totalIncomplete: list.reduce((s, r) => s + Number(r.incompleteDays || 0), 0),
    completedUstas: list.filter((r) => r.completedProjects > 0).length,
    totalUstas: totalUstas ?? list.length,
    totalTelegramMessages: list.reduce((s, r) => s + Number(r.telegramCount || 0), 0),
    xarajatUstas: list.filter((r) => r.xarajatCount > 0).length,
    totalXarajat: list.reduce((s, r) => s + Number(r.xarajatCount || 0), 0),
  };
}
