import { instantToTashkentYMD } from "../../src/photos/tashkentTime.js";
import { TELEGRAM_EVENT_TYPES } from "../../shared/telegramEventTypes.js";
import {
  buildWorkerStatsFromTelegramEvents,
  filterTelegramEventsByMonth,
} from "./telegramStats.js";
import { buildWorkerPhotoStats } from "../../src/activity/hisobotPhotoStats.js";
import { listCollection } from "../db/store.js";

function ymOf(instant) {
  const ymd = instantToTashkentYMD(instant);
  return ymd ? ymd.slice(0, 7) : "";
}

function isUstaWorker(w) {
  const pos = String(w?.position || "").trim().toLowerCase();
  if (!pos) return true;
  return pos !== "developer" && pos !== "admin" && pos !== "dasturchi";
}

function projectWorkerIdSet(project) {
  const ids = new Set();
  const direct = String(project?.ustaId || project?.assignedWorkerId || "").trim();
  if (direct) ids.add(direct);
  const extra = Array.isArray(project?.assignedWorkerIds)
    ? project.assignedWorkerIds.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  for (const id of extra) ids.add(id);
  return ids;
}

function isWorkAttendanceLog(log) {
  if (!log || typeof log !== "object") return false;
  if (log.loginLocation || log.logoutLocation) return true;
  if (log.logoutTime) return true;
  if (log.workAttendance === true) return true;
  return false;
}

function daysFromActivityLogs(logs) {
  const byDay = new Map();
  for (const l of logs) {
    if (!isWorkAttendanceLog(l)) continue;
    const dk =
      String(l?.dateKey || "").trim() || instantToTashkentYMD(l?.loginTime);
    if (!dk) continue;
    const prev = byDay.get(dk) || {
      dateKey: dk,
      loginTime: null,
      logoutTime: null,
      totalWorkTime: 0,
    };
    if (l.loginTime && (!prev.loginTime || new Date(l.loginTime) < new Date(prev.loginTime))) {
      prev.loginTime = l.loginTime;
    }
    if (l.logoutTime && (!prev.logoutTime || new Date(l.logoutTime) > new Date(prev.logoutTime))) {
      prev.logoutTime = l.logoutTime;
    }
    const tw = Number(l.totalWorkTime || 0);
    if (tw > 0) prev.totalWorkTime = Math.max(prev.totalWorkTime, tw);
    byDay.set(dk, prev);
  }
  for (const day of byDay.values()) {
    if (day.loginTime && day.logoutTime && !day.totalWorkTime) {
      const a = new Date(day.loginTime).getTime();
      const b = new Date(day.logoutTime).getTime();
      if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
        day.totalWorkTime = Math.floor((b - a) / 1000);
      }
    }
  }
  return [...byDay.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

function mergeDayLists(a, b) {
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
    if (day.loginTime && day.logoutTime) {
      const a = new Date(day.loginTime).getTime();
      const b = new Date(day.logoutTime).getTime();
      if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
        day.totalWorkTime = Math.floor((b - a) / 1000);
      }
    }
  }
  return [...byDay.values()].sort((x, y) => x.dateKey.localeCompare(y.dateKey));
}

function isCompletedHolat(holat) {
  const h = String(holat || "").trim().toLowerCase();
  return h === "tugallangan" || h === "yakunlangan" || h === "completed";
}

function normalizePoints(p) {
  const g = (k) => Math.max(0, Number(p?.[k] || 0) || 0);
  const keldi = g("keldi");
  const ketdi = g("ketdi") + g("vaqt");
  const rasm = g("rasm");
  const loyiha = g("loyiha");
  const xarajat = g("xarajat");
  const etiroz = g("etiroz");
  const earned = keldi + ketdi + rasm + loyiha + xarajat;
  const total = earned - etiroz;
  return { keldi, ketdi, rasm, loyiha, xarajat, etiroz, earned, total };
}

/** @param {string} month YYYY-MM */
export async function buildMonthlyAttendanceReport(month) {
  const [workers, activityLogs, telegramEvents, photos, yorijnoma, projects] =
    await Promise.all([
      listCollection("workers"),
      listCollection("user_activity_logs"),
      listCollection("telegram_events"),
      listCollection("stage_photos"),
      listCollection("usta_yorijnoma"),
      listCollection("projects"),
    ]);

  const ustaWorkers = workers.filter(isUstaWorker);
  const monthTelegramAll = filterTelegramEventsByMonth(telegramEvents, month);
  const monthTelegramEvents = monthTelegramAll.filter((e) => {
    const type = String(e?.eventType || "").trim();
    const isAttendance =
      type === TELEGRAM_EVENT_TYPES.KELDI || type === TELEGRAM_EVENT_TYPES.KETDI;
    if (!isAttendance) return true;
    return String(e?.source || "") !== "backfill_activity_log";
  });
  const monthPhotos = photos.filter((p) => ymOf(p?.uploadDate) === month);
  const monthLogs = activityLogs.filter((l) => {
    const ym = ymOf(l?.loginTime) || String(l?.dateKey || "").slice(0, 7);
    return ym === month;
  });
  const monthYor = yorijnoma.filter((y) => ymOf(y?.completedAt) === month);

  const yorByWorker = new Map();
  for (const y of monthYor) {
    const key = String(y?.workerId || y?.login || "").trim().toLowerCase();
    if (key) yorByWorker.set(key, y);
  }

  const allWorkerIds = new Set(
    workers.map((w) => String(w.id || "").trim()).filter(Boolean),
  );

  const subjects = ustaWorkers.map((w) => ({
    id: String(w.id || "").trim(),
    name: String(w.fullName || w.name || "Usta").trim(),
    login: String(w.login || "").trim(),
    orphan: false,
  }));
  const seen = new Set(subjects.map((s) => s.id));
  const addOrphan = (id, name, login) => {
    const wid = String(id || "").trim();
    if (!wid || allWorkerIds.has(wid) || seen.has(wid)) return;
    seen.add(wid);
    subjects.push({
      id: wid,
      name: String(name || "Noma'lum usta").trim() || "Noma'lum usta",
      login: String(login || "").trim(),
      orphan: true,
    });
  };
  for (const l of monthLogs) addOrphan(l.ustaId, l.ustaName, l.ustaLogin);
  for (const p of monthPhotos) addOrphan(p.ustaId, p.ustaName, p.ustaLogin);
  for (const e of monthTelegramEvents) {
    addOrphan(e.workerId, e.workerName, e.workerLogin);
  }

  const rows = subjects.map((subj) => {
    const wid = subj.id;
    const login = subj.login.toLowerCase();

    const tgStats = buildWorkerStatsFromTelegramEvents(
      monthTelegramEvents,
      wid,
      login,
    );
    const attendanceTgEvents = monthTelegramAll.filter((e) => {
      const type = String(e?.eventType || "").trim();
      if (type !== TELEGRAM_EVENT_TYPES.KELDI && type !== TELEGRAM_EVENT_TYPES.KETDI) {
        return false;
      }
      const src = String(e?.source || "");
      return src === "server" || src === "client";
    });
    const tgAttendance = buildWorkerStatsFromTelegramEvents(
      attendanceTgEvents,
      wid,
      login,
    );
    const myLogs = monthLogs.filter((l) => String(l.ustaId || "") === wid);
    const activityDays = daysFromActivityLogs(myLogs);
    const days = mergeDayLists(activityDays, tgAttendance.days);

    const photoStats = buildWorkerPhotoStats(monthPhotos, wid, month);
    const photoCount = Math.max(photoStats.photoCount, tgStats.photoCount || 0);
    const arrivalDays = days.filter((d) => d.loginTime).length;
    const departureDays = days.filter((d) => d.logoutTime).length;
    const incompleteDays = days.filter((d) => d.loginTime && !d.logoutTime).length;
    const totalSeconds = days.reduce((s, d) => s + Number(d.totalWorkTime || 0), 0);

    const related = projects.filter((p) => projectWorkerIdSet(p).has(wid));
    const completedProjects = related.filter((p) => isCompletedHolat(p.holat)).length;
    const yor = yorByWorker.get(wid) || yorByWorker.get(login) || null;

    const w = workers.find((x) => String(x.id) === wid);
    const points = normalizePoints(w?.points || {});

    return {
      id: wid,
      name: subj.name,
      login: subj.login,
      orphan: subj.orphan,
      fromTelegram: tgStats.useTelegram,
      photoCount,
      keldiPhotos: photoStats.keldiPhotos,
      ketdiPhotos: photoStats.ketdiPhotos,
      photoProjects: Math.max(photoStats.photoProjects, tgStats.photoProjects || 0),
      arrivalDays,
      departureDays,
      incompleteDays,
      totalSeconds,
      days,
      joinedProjects: related.length,
      completedProjects: Math.max(completedProjects, tgStats.completedProjects || 0),
      yorSignedAt: yor?.completedAt || tgStats.yorSignedAt || "",
      points,
    };
  });

  rows.sort(
    (a, b) =>
      b.photoCount + b.arrivalDays - (a.photoCount + a.arrivalDays) ||
      a.name.localeCompare(b.name, "uz"),
  );

  const summary = {
    photoUstas: rows.filter((r) => r.photoCount > 0).length,
    attendanceUstas: rows.filter((r) => r.arrivalDays > 0).length,
    yorUstas: rows.filter((r) => r.yorSignedAt).length,
    totalPhotos: monthPhotos.length,
    totalArrivalDays: rows.reduce((s, r) => s + r.arrivalDays, 0),
    totalIncomplete: rows.reduce((s, r) => s + r.incompleteDays, 0),
    completedUstas: rows.filter((r) => r.completedProjects > 0).length,
    totalUstas: ustaWorkers.length,
  };

  return { rows, summary, monthTelegramCount: monthTelegramEvents.length };
}
