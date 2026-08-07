import { TELEGRAM_EVENT_TYPES } from "../../shared/telegramEventTypes.js";
import { instantToTashkentYMD } from "../../src/photos/tashkentTime.js";

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

function matchesWorker(event, workerId, workerLogin) {
  const wid = String(workerId || "").trim();
  const login = String(workerLogin || "").trim().toLowerCase();
  if (wid && String(event?.workerId || "").trim() === wid) return true;
  if (login && String(event?.workerLogin || "").trim().toLowerCase() === login) return true;
  return false;
}

export function buildWorkerStatsFromTelegramEvents(events, workerId, workerLogin) {
  const mine = (events || []).filter((e) => matchesWorker(e, workerId, workerLogin));
  const byDay = new Map();
  const photoProjects = new Set();
  let photoCount = 0;
  let yorSignedAt = "";
  let loyihaCount = 0;
  const points = { keldi: 0, ketdi: 0, rasm: 0, loyiha: 0, xarajat: 0, total: 0 };

  for (const e of mine) {
    const type = String(e.eventType || "").trim();
    const dk =
      String(e.dateKey || "").slice(0, 10) ||
      instantToTashkentYMD(e.sentAt) ||
      "";

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
      const pn = String(e.meta?.projectName || "").trim();
      if (pn) photoProjects.add(pn);
    } else if (type === TELEGRAM_EVENT_TYPES.LOYIHA) {
      points.loyiha += 1;
      loyihaCount += 1;
    } else if (type === TELEGRAM_EVENT_TYPES.XARAJAT) {
      points.xarajat += 1;
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
  };
}
