import { TELEGRAM_EVENT_TYPES } from "../../shared/telegramEventTypes.js";
import { buildMessageTextFromEvent } from "../../shared/buildTelegramMessage.js";
import { instantToTashkentYMD } from "../photos/tashkentTime.js";

const EVENT_LABELS = {
  [TELEGRAM_EVENT_TYPES.KELDI]: "Keldi",
  [TELEGRAM_EVENT_TYPES.KETDI]: "Ketdi",
  [TELEGRAM_EVENT_TYPES.RASM]: "Bosqich rasmi",
  [TELEGRAM_EVENT_TYPES.YORIJNOMA]: "Yo‘riqnoma",
  [TELEGRAM_EVENT_TYPES.XARAJAT]: "Xarajat",
  [TELEGRAM_EVENT_TYPES.LOYIHA]: "Loyiha rasmlari",
  [TELEGRAM_EVENT_TYPES.DAY_OFF]: "Dam olish",
};

function eventMonth(e) {
  const dk = String(e?.dateKey || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dk)) return dk.slice(0, 7);
  return instantToTashkentYMD(e?.sentAt)?.slice(0, 7) || "";
}

export function filterTelegramEventsByMonth(events, month) {
  return (events || []).filter((e) => eventMonth(e) === month);
}

function dayDurationSeconds(loginIso, logoutIso) {
  if (!loginIso || !logoutIso) return 0;
  const a = new Date(loginIso).getTime();
  const b = new Date(logoutIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.floor((b - a) / 1000);
}

function matchesWorker(event, workerId, workerLogin, workerName) {
  const wid = String(workerId || "").trim();
  const login = String(workerLogin || "").trim().toLowerCase();
  const wname = String(workerName || "").trim().toLowerCase();
  if (wid && String(event?.workerId || "").trim() === wid) return true;
  if (login && String(event?.workerLogin || "").trim().toLowerCase() === login) return true;
  const eventName = String(event?.workerName || "").trim().toLowerCase();
  if (wname && eventName && eventName === wname) return true;
  return false;
}

/** Tanlangan oy uchun ustaning botga yuborilgan harakatlari. */
export function buildWorkerStatsFromTelegramEvents(events, workerId, workerLogin, workerName) {
  const mine = (events || []).filter((e) =>
    matchesWorker(e, workerId, workerLogin, workerName),
  );
  const byDay = new Map();
  const photoProjects = new Set();
  let photoCount = 0;
  let yorSignedAt = "";
  let loyihaCount = 0;
  let xarajatCount = 0;
  let dayOffCount = 0;
  let stageRasmCount = 0;
  const points = { keldi: 0, ketdi: 0, rasm: 0, loyiha: 0, xarajat: 0, total: 0 };
  const telegramLog = [];

  for (const e of mine) {
    const type = String(e.eventType || "").trim();
    const dk =
      String(e.dateKey || "").slice(0, 10) ||
      instantToTashkentYMD(e.sentAt) ||
      "";
    const messageText =
      String(e.messageText || "").trim() ||
      buildMessageTextFromEvent({
        ...e,
        eventType: type,
        date: dk,
        workerName: e.workerName,
        time: e.time,
      });

    telegramLog.push({
      sentAt: e.sentAt,
      eventType: type,
      dateKey: dk,
      label: EVENT_LABELS[type] || type || "Telegram",
      messageText,
      source: String(e.source || ""),
    });

    if (type === TELEGRAM_EVENT_TYPES.KELDI) {
      points.keldi += 1;
      if (dk) {
        const day = byDay.get(dk) || {
          dateKey: dk,
          loginTime: null,
          logoutTime: null,
          totalWorkTime: 0,
        };
        if (!day.loginTime || new Date(e.sentAt) < new Date(day.loginTime)) {
          day.loginTime = e.sentAt;
        }
        byDay.set(dk, day);
      }
    } else if (type === TELEGRAM_EVENT_TYPES.KETDI) {
      points.ketdi += 1;
      if (dk) {
        const day = byDay.get(dk) || {
          dateKey: dk,
          loginTime: null,
          logoutTime: null,
          totalWorkTime: 0,
        };
        if (!day.logoutTime || new Date(e.sentAt) > new Date(day.logoutTime)) {
          day.logoutTime = e.sentAt;
        }
        byDay.set(dk, day);
      }
    } else if (type === TELEGRAM_EVENT_TYPES.RASM) {
      points.rasm += 1;
      photoCount += 1;
      stageRasmCount += 1;
      const pn = String(e.meta?.projectName || "").trim();
      if (pn) photoProjects.add(pn);
    } else if (type === TELEGRAM_EVENT_TYPES.LOYIHA) {
      points.loyiha += 1;
      loyihaCount += 1;
    } else if (type === TELEGRAM_EVENT_TYPES.XARAJAT) {
      points.xarajat += 1;
      xarajatCount += 1;
    } else if (type === TELEGRAM_EVENT_TYPES.DAY_OFF) {
      dayOffCount += 1;
    } else if (type === TELEGRAM_EVENT_TYPES.YORIJNOMA) {
      if (!yorSignedAt || new Date(e.sentAt) > new Date(yorSignedAt)) {
        yorSignedAt = e.sentAt;
      }
    }
  }

  for (const day of byDay.values()) {
    day.totalWorkTime = dayDurationSeconds(day.loginTime, day.logoutTime);
  }

  points.total = points.keldi + points.ketdi + points.rasm + points.loyiha + points.xarajat;

  const days = [...byDay.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  telegramLog.sort(
    (a, b) => new Date(b.sentAt || 0).getTime() - new Date(a.sentAt || 0).getTime(),
  );

  return {
    useTelegram: mine.length > 0,
    photoCount,
    photoProjects: photoProjects.size,
    arrivalDays: days.filter((d) => d.loginTime).length,
    departureDays: days.filter((d) => d.logoutTime).length,
    incompleteDays: days.filter((d) => d.loginTime && !d.logoutTime).length,
    totalSeconds: days.reduce((s, d) => s + Number(d.totalWorkTime || 0), 0),
    days,
    yorSignedAt,
    points,
    completedProjects: loyihaCount,
    xarajatCount,
    dayOffCount,
    stageRasmCount,
    loyihaTelegramCount: loyihaCount,
    telegramCount: mine.length,
    telegramLog,
  };
}
