import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/http";
import { listCollection, subscribeCollection } from "../firebase/firestoreCrud";
import { useWorkers } from "../hooks/useWorkers";
import { useProjects } from "../hooks/useProjects";
import { useUstaPhotos } from "../hooks/useUstaPhotos";
import { useUserActivityLogs } from "../hooks/useUserActivityLogs";
import { isCompletedHolat } from "../projects/projectStorage";
import { instantToTashkentYMD, tashkentMonthPrefix } from "../photos/tashkentTime";
import { downloadHisobotPdf } from "../activity/hisobotPdfExport";
import { normalizePoints, formatPointsCompact } from "../points/pointsAward";
import { TELEGRAM_EVENTS_COLLECTION } from "../../shared/telegramEventTypes.js";
import { TELEGRAM_EVENT_LOGGED_EVENT } from "../../shared/telegramEventLoggedEvent.js";
import { TELEGRAM_MESSAGES_COLLECTION } from "../../shared/telegramMessageTypes.js";
import {
  buildWorkerStatsFromTelegramEvents,
  filterTelegramEventsByMonth,
} from "../activity/telegramEventsReport";
import { buildWorkerPhotoStats } from "../activity/hisobotPhotoStats";
import {
  TELEGRAM_MODULE_LABELS,
  TELEGRAM_STATUS_LABELS,
} from "../../shared/telegramMessageTypes.js";
import {
  buildWorkerFullTelegramLog,
  buildMonthTelegramFeed,
  keldiKetdiEventsFromPhotos,
  mergeHisobotRows,
  mergeTelegramEventSources,
  summarizeHisobotRows,
} from "../activity/hisobotTelegramSources";
import { useTelegramMessages } from "../hooks/useTelegramMessages";

const UZ_MONTHS = [
  "Yanvar",
  "Fevral",
  "Mart",
  "Aprel",
  "May",
  "Iyun",
  "Iyul",
  "Avgust",
  "Sentabr",
  "Oktabr",
  "Noyabr",
  "Dekabr",
];

function monthLabel(prefix) {
  const [y, m] = String(prefix || "").split("-").map(Number);
  if (!y || !m) return prefix;
  return `${UZ_MONTHS[m - 1] || m} ${y}`;
}

function ymOf(instant) {
  const ymd = instantToTashkentYMD(instant);
  return ymd ? ymd.slice(0, 7) : "";
}

function timeHm(instant) {
  if (!instant) return "—";
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function dateDm(ymd) {
  const [, m, d] = String(ymd || "").split("-");
  if (!m || !d) return ymd || "—";
  return `${d}.${m}`;
}

function durationLabel(seconds) {
  const s = Number(seconds || 0);
  if (!s || s < 0) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h && m) return `${h} soat ${m} daq`;
  if (h) return `${h} soat`;
  return `${m} daq`;
}

/** Admin/dasturchini chiqarib tashlaymiz, faqat ustalar. */
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
  return [...byDay.values()].sort((x, y) => x.dateKey.localeCompare(y.dateKey));
}

function daysFromActivityLogs(logs) {
  const byDay = new Map();
  for (const l of logs || []) {
    const hasWork =
      l?.workAttendance === true ||
      l?.loginLocation ||
      l?.logoutLocation ||
      l?.logoutTime;
    if (!hasWork) continue;
    const dk = String(l?.dateKey || "").trim() || instantToTashkentYMD(l?.loginTime);
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
    prev.totalWorkTime = Math.max(prev.totalWorkTime, Number(l.totalWorkTime || 0));
    byDay.set(dk, prev);
  }
  return [...byDay.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-slate-200/85 bg-white p-4 shadow-soft-md">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

function isImageUrl(url) {
  const u = String(url || "");
  return (
    u.startsWith("data:image") ||
    /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(u) ||
    u.includes("firebasestorage.googleapis.com") ||
    u.includes("/api/telegram-export/photos/")
  );
}

function TelegramFilePreview({ entry }) {
  const url = String(entry?.fileUrl || "").trim();
  const fileId = String(entry?.fileId || "").trim();
  if (url && isImageUrl(url)) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="inline-block">
        <img
          src={url}
          alt=""
          className="mt-1 max-h-24 max-w-[120px] rounded border border-slate-200 object-cover"
        />
      </a>
    );
  }
  if (url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="text-brand-600 underline">
        Faylni ochish
      </a>
    );
  }
  if (fileId) {
    return <span className="text-xs text-slate-500" title={fileId}>Telegram fayl ID</span>;
  }
  return <span className="text-slate-400">—</span>;
}

export default function HisobotAdminPage() {
  const { workers } = useWorkers();
  const { projects } = useProjects();
  const { photos } = useUstaPhotos();
  const { logs: hookActivityLogs } = useUserActivityLogs();
  const { messages: allTelegramMessages } = useTelegramMessages();

  const [activityLogs, setActivityLogs] = useState([]);
  const [yorijnoma, setYorijnoma] = useState([]);
  const [telegramEvents, setTelegramEvents] = useState([]);
  const [telegramMessages, setTelegramMessages] = useState([]);
  const [sqlTelegramEvents, setSqlTelegramEvents] = useState([]);
  const [sqlPhotos, setSqlPhotos] = useState([]);
  const [serverTelegramFeed, setServerTelegramFeed] = useState([]);
  const [month, setMonth] = useState(() => tashkentMonthPrefix(new Date()));
  const [expandedId, setExpandedId] = useState("");
  const [error, setError] = useState("");
  const [serverReport, setServerReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      listCollection("user_activity_logs").catch(() => []),
      listCollection("usta_yorijnoma").catch(() => []),
      listCollection(TELEGRAM_EVENTS_COLLECTION).catch(() => []),
      listCollection(TELEGRAM_MESSAGES_COLLECTION).catch(() => []),
    ])
      .then(([logs, yors, tg, msgs]) => {
        if (!active) return;
        setActivityLogs(Array.isArray(logs) ? logs : []);
        setYorijnoma(Array.isArray(yors) ? yors : []);
        setTelegramEvents(Array.isArray(tg) ? tg : []);
        setTelegramMessages(Array.isArray(msgs) ? msgs : []);
      })
      .catch((e) => active && console.warn("Hisobot yuklash:", e?.message || e));
    return () => {
      active = false;
    };
  }, []);

  const reloadTelegramSqlData = useCallback(async () => {
    try {
      const [sqlRes, sqlPhotosRes, feedRes] = await Promise.all([
        api.get("/api/db/telegram_events"),
        api.get("/api/db/stage_photos"),
        api.get(`/api/reports/telegram-feed?month=${encodeURIComponent(month)}`),
      ]);
      setSqlTelegramEvents(Array.isArray(sqlRes?.items) ? sqlRes.items : []);
      setSqlPhotos(Array.isArray(sqlPhotosRes?.items) ? sqlPhotosRes.items : []);
      setServerTelegramFeed(Array.isArray(feedRes?.items) ? feedRes.items : []);
    } catch (e) {
      console.warn("Telegram SQL yuklash:", e?.message || e);
    }
  }, [month]);

  useEffect(() => {
    void reloadTelegramSqlData();
    const poll = setInterval(() => void reloadTelegramSqlData(), 45000);
    const onLogged = () => void reloadTelegramSqlData();
    const onVisible = () => {
      if (document.visibilityState === "visible") void reloadTelegramSqlData();
    };
    window.addEventListener(TELEGRAM_EVENT_LOGGED_EVENT, onLogged);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poll);
      window.removeEventListener(TELEGRAM_EVENT_LOGGED_EVENT, onLogged);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reloadTelegramSqlData]);

  useEffect(() => {
    void reloadTelegramSqlData();
  }, [telegramEvents.length, telegramMessages.length, reloadTelegramSqlData]);

  useEffect(() => {
    const un1 = subscribeCollection(
      "user_activity_logs",
      (list) => setActivityLogs(Array.isArray(list) ? list : []),
      (e) => console.warn("user_activity_logs sync:", e?.message || e),
    );
    const un2 = subscribeCollection(
      "usta_yorijnoma",
      (list) => setYorijnoma(Array.isArray(list) ? list : []),
      () => {},
    );
    const un3 = subscribeCollection(
      TELEGRAM_EVENTS_COLLECTION,
      (list) => setTelegramEvents(Array.isArray(list) ? list : []),
      () => {},
    );
    const un4 = subscribeCollection(
      TELEGRAM_MESSAGES_COLLECTION,
      (list) => setTelegramMessages(Array.isArray(list) ? list : []),
      () => {},
    );
    return () => {
      if (typeof un1 === "function") un1();
      if (typeof un2 === "function") un2();
      if (typeof un3 === "function") un3();
      if (typeof un4 === "function") un4();
    };
  }, []);

  const mergedPhotos = useMemo(() => {
    const byId = new Map();
    for (const p of [...photos, ...sqlPhotos]) {
      if (p?.id) byId.set(String(p.id), p);
    }
    return [...byId.values()].sort(
      (a, b) =>
        new Date(b.uploadDate || b.createdAt || 0).getTime() -
        new Date(a.uploadDate || a.createdAt || 0).getTime(),
    );
  }, [photos, sqlPhotos]);

  const allTelegramEvents = useMemo(
    () =>
      mergeTelegramEventSources(
        telegramEvents,
        telegramMessages.length ? telegramMessages : allTelegramMessages,
        sqlTelegramEvents,
        keldiKetdiEventsFromPhotos(mergedPhotos),
      ),
    [telegramEvents, telegramMessages, allTelegramMessages, sqlTelegramEvents, mergedPhotos],
  );

  const mergedTelegramMessages = useMemo(() => {
    const byId = new Map();
    for (const m of [...allTelegramMessages, ...telegramMessages]) {
      if (m?.id) byId.set(String(m.id), m);
    }
    return [...byId.values()];
  }, [allTelegramMessages, telegramMessages]);

  const monthTelegramFeed = useMemo(() => {
    const clientFeed = buildMonthTelegramFeed({
      messages: mergedTelegramMessages,
      events: allTelegramEvents,
      photos: mergedPhotos,
      month,
    });
    if (serverTelegramFeed.length >= clientFeed.length) return serverTelegramFeed;
    return clientFeed.length ? clientFeed : serverTelegramFeed;
  }, [
    mergedTelegramMessages,
    allTelegramEvents,
    mergedPhotos,
    month,
    serverTelegramFeed,
  ]);

  const monthTelegramFileCount = useMemo(
    () => monthTelegramFeed.filter((e) => e.fileUrl || e.fileId).length,
    [monthTelegramFeed],
  );

  useEffect(() => {
    let active = true;
    let attempt = 0;

    const loadReport = () => {
      if (!active) return;
      setReportLoading(true);
      void api
        .get(`/api/reports/monthly-attendance?month=${encodeURIComponent(month)}`)
        .then((data) => {
          if (!active) return;
          setServerReport({
            rows: Array.isArray(data?.rows) ? data.rows : [],
            summary: data?.summary || {},
            monthTelegramCount: Number(data?.monthTelegramCount) || 0,
          });
          setError("");
        })
        .catch((e) => {
          if (!active) return;
          attempt += 1;
          if (attempt < 4) {
            setTimeout(loadReport, 1500);
            return;
          }
          setServerReport(null);
          setError("");
          console.warn("Hisobot server API:", e?.message || e);
        })
        .finally(() => {
          if (active) setReportLoading(false);
        });
    };

    loadReport();
    return () => {
      active = false;
    };
  }, [month]);

  const ustaWorkers = useMemo(
    () => (workers || []).filter(isUstaWorker),
    [workers],
  );

  const mergedActivityLogs = useMemo(() => {
    const byId = new Map();
    for (const l of hookActivityLogs || []) {
      if (l?.id) byId.set(String(l.id), l);
    }
    for (const l of activityLogs || []) {
      const key = l?.id ? String(l.id) : `${l?.ustaId}_${l?.dateKey}_${l?.loginTime}`;
      byId.set(key, l);
    }
    return [...byId.values()];
  }, [activityLogs, hookActivityLogs]);

  const workerPointsMap = useMemo(() => {
    const m = new Map();
    for (const w of workers || []) {
      m.set(String(w.id || ""), normalizePoints(w.points));
    }
    return m;
  }, [workers]);

  // Ma'lumot bor yillar + joriy yil uchun TO‘LIQ 12 oy ro‘yxati.
  const availableMonths = useMemo(() => {
    const years = new Set([Number(tashkentMonthPrefix(new Date()).slice(0, 4))]);
    const collect = (ym) => {
      const y = Number(String(ym || "").slice(0, 4));
      if (y) years.add(y);
    };
    for (const l of mergedActivityLogs) {
      collect(ymOf(l?.loginTime) || String(l?.dateKey || "").slice(0, 7));
    }
    for (const p of mergedPhotos) collect(ymOf(p?.uploadDate));
    for (const y of yorijnoma) collect(ymOf(y?.completedAt));
    for (const e of allTelegramEvents) {
      collect(String(e?.dateKey || "").slice(0, 7) || ymOf(e?.sentAt));
    }

    const list = [];
    for (const y of years) {
      for (let m = 1; m <= 12; m += 1) {
        list.push(`${y}-${String(m).padStart(2, "0")}`);
      }
    }
    return list.sort((a, b) => b.localeCompare(a));
  }, [mergedActivityLogs, mergedPhotos, yorijnoma, allTelegramEvents]);

  // Tanlangan oydagi ma'lumotlar.
  const monthData = useMemo(() => {
    const monthTelegramEvents = filterTelegramEventsByMonth(allTelegramEvents, month);
    const monthPhotos = mergedPhotos.filter((p) => ymOf(p?.uploadDate) === month);
    const monthLogs = mergedActivityLogs.filter((l) => {
      const ym = ymOf(l?.loginTime) || String(l?.dateKey || "").slice(0, 7);
      return ym === month;
    });
    const monthYor = yorijnoma.filter((y) => ymOf(y?.completedAt) === month);

    const yorByWorker = new Map();
    for (const y of monthYor) {
      const key = String(y?.workerId || y?.login || "").trim().toLowerCase();
      if (key) yorByWorker.set(key, y);
    }

    // Barcha workerlar (admin/dasturchi ham) — orfan yozuvlarni aniqlash uchun.
    const allWorkerIds = new Set(
      (workers || []).map((w) => String(w.id || "").trim()).filter(Boolean),
    );

    // Hisobotga kiradigan subyektlar: ustalar + workers ro‘yxatida YO‘Q ustaId'lar
    // (o‘chirilgan/eski profil bo‘lsa ham keldi/ketdi va rasmlari ko‘rinsin).
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
      const name = subj.name;

      const tgStats = buildWorkerStatsFromTelegramEvents(
        monthTelegramEvents,
        wid,
        login,
        name,
      );
      const photoStats = buildWorkerPhotoStats(monthPhotos, wid, month);
      const myLogs = monthLogs.filter((l) => String(l.ustaId || "") === wid);
      const activityDays = daysFromActivityLogs(myLogs);
      const days = mergeDayLists(activityDays, tgStats.days);

      const arrivalDays = days.filter((d) => d.loginTime).length;
      const departureDays = days.filter((d) => d.logoutTime).length;
      const incompleteDays = days.filter((d) => d.loginTime && !d.logoutTime).length;
      const totalSeconds = days.reduce((s, d) => s + Number(d.totalWorkTime || 0), 0);

      const related = projects.filter((p) => projectWorkerIdSet(p).has(wid));
      const completedProjects = related.filter((p) => isCompletedHolat(p.holat)).length;
      const yor = yorByWorker.get(wid) || yorByWorker.get(login) || null;
      const pts = workerPointsMap.get(wid) || normalizePoints(null);

      const fullTelegramLog = buildWorkerFullTelegramLog({
        messages: mergedTelegramMessages,
        events: monthTelegramEvents,
        photos: monthPhotos,
        workerId: wid,
        workerLogin: login,
        workerName: name,
        month,
      });

      return {
        id: wid,
        name,
        login: subj.login,
        orphan: subj.orphan,
        fromTelegram: tgStats.useTelegram || fullTelegramLog.length > 0,
        photoCount: Math.max(photoStats.photoCount, tgStats.photoCount || 0),
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
        points: pts,
        xarajatCount: tgStats.xarajatCount || 0,
        dayOffCount: tgStats.dayOffCount || 0,
        stageRasmCount: tgStats.stageRasmCount || 0,
        loyihaTelegramCount: tgStats.loyihaTelegramCount || 0,
        telegramCount: fullTelegramLog.length,
        telegramLog: fullTelegramLog,
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
  }, [
    mergedPhotos,
    mergedActivityLogs,
    yorijnoma,
    allTelegramEvents,
    mergedTelegramMessages,
    ustaWorkers,
    projects,
    month,
    workerPointsMap,
  ]);

  const { rows, summary, monthTelegramCount } = useMemo(() => {
    const mergedRows = mergeHisobotRows(serverReport?.rows, monthData.rows);
    const mergedSummary = summarizeHisobotRows(mergedRows, ustaWorkers.length);
    const monthPhotoList = mergedPhotos.filter((p) => ymOf(p?.uploadDate) === month);
    const rowsWithPhotos = mergedRows.map((r) => {
      const myPhotos = monthPhotoList.filter((p) => String(p.ustaId || "") === String(r.id));
      if (!myPhotos.length) return r;
      const photoProjects = new Set(
        myPhotos.map((p) => String(p.projectId || "")).filter(Boolean),
      );
      return {
        ...r,
        photoCount: Math.max(r.photoCount || 0, myPhotos.length),
        photoProjects: Math.max(r.photoProjects || 0, photoProjects.size),
      };
    });

    return {
      rows: rowsWithPhotos,
      summary: {
        ...mergedSummary,
        photoUstas: rowsWithPhotos.filter((r) => r.photoCount > 0).length,
        totalPhotos: monthPhotoList.length,
      },
      monthTelegramCount: Math.max(
        serverReport?.monthTelegramCount || 0,
        monthData.monthTelegramCount || 0,
      ),
    };
  }, [serverReport, monthData, mergedPhotos, month, ustaWorkers.length]);

  return (
    <section className="rounded-[1.375rem] border border-slate-200/85 bg-white p-6 shadow-soft-lg ring-1 ring-slate-900/[0.03] sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Hisobot
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
            Oy bo‘yicha ustalar faoliyati — Telegram botga yuborilgan barcha ma’lumotlar (keldi,
            ketdi, rasm, xarajat, yo‘riqnoma, loyiha). «Batafsil» — kunlar va to‘liq Telegram
            xabarlar ro‘yxati.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-600">Oy:</label>
          <select
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setExpandedId("");
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
          >
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() =>
              downloadHisobotPdf({
                monthLabelText: monthLabel(month),
                summary,
                rows,
              })
            }
            disabled={rows.length === 0}
            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            PDF saqlash
          </button>
        </div>
      </div>

      {error && !serverReport ? (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 ring-1 ring-amber-200">
          {error}
        </p>
      ) : null}

      {reportLoading ? (
        <p className="mt-4 text-sm text-slate-500">Hisobot yuklanmoqda…</p>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Rasm tashlagan ustalar" value={summary.photoUstas} hint={`${summary.totalPhotos} ta rasm`} />
        <StatCard label="Keldi/ketdi qilgan" value={summary.attendanceUstas} hint={`${summary.totalArrivalDays} ish kuni`} />
        <StatCard label="Yo‘riqnoma imzolagan" value={summary.yorUstas} hint={`${monthLabel(month)} ichida`} />
        <StatCard label="Loyiha yakunlagan" value={summary.completedUstas} hint="ustalar soni" />
        <StatCard label="Ketmagan kunlar" value={summary.totalIncomplete} hint="keldi bor, ketdi yo‘q" />
        <StatCard
          label="Telegram xabarlar"
          value={monthTelegramFeed.length || summary.totalTelegramMessages || 0}
          hint={`${monthTelegramFileCount} ta rasm/fayl`}
        />
        <StatCard label="Xarajat xabarlari" value={summary.totalXarajat ?? 0} hint={`${summary.xarajatUstas ?? 0} usta`} />
        <StatCard label="Jami ustalar" value={ustaWorkers.length} />
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200/85 bg-white shadow-soft-md">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">Usta</th>
              <th className="px-3 py-3">Login</th>
              <th className="px-3 py-3 text-center">Rasm</th>
              <th className="px-3 py-3 text-center">Keldi kun</th>
              <th className="px-3 py-3 text-center">Ketdi kun</th>
              <th className="px-3 py-3 text-center">Ketmagan</th>
              <th className="px-3 py-3 text-center">Ishlagan vaqt</th>
              <th className="px-3 py-3 text-center">Loyiha</th>
              <th className="px-3 py-3 text-center">Yakunlagan</th>
              <th className="px-3 py-3 text-center">Yo‘riqnoma</th>
              <th className="px-3 py-3 text-center">Xarajat</th>
              <th className="px-3 py-3 text-center">Bosqich</th>
              <th className="px-3 py-3 text-center">Dam olish</th>
              <th className="px-3 py-3 text-center">Telegram</th>
              <th className="px-3 py-3 text-center">Ball</th>
              <th className="px-3 py-3 text-center">Batafsil</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.id}>
                <tr className="border-t border-slate-100 text-slate-700">
                  <td className="px-3 py-3 font-medium text-slate-900">
                    {r.name}
                    {r.orphan ? (
                      <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                        eski/o‘chirilgan
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">{r.login || "—"}</td>
                  <td className="px-3 py-3 text-center">
                    {r.photoCount}
                    {r.keldiPhotos || r.ketdiPhotos ? (
                      <span
                        className="block text-[10px] text-slate-400"
                        title="Keldi / Ketdi rasmlari"
                      >
                        K{r.keldiPhotos || 0} · T{r.ketdiPhotos || 0}
                      </span>
                    ) : null}
                    {r.photoProjects ? (
                      <span className="text-xs text-slate-400"> ({r.photoProjects} loyiha)</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-center">{r.arrivalDays}</td>
                  <td className="px-3 py-3 text-center">{r.departureDays}</td>
                  <td className={`px-3 py-3 text-center ${r.incompleteDays ? "font-semibold text-amber-600" : ""}`}>
                    {r.incompleteDays || "—"}
                  </td>
                  <td className="px-3 py-3 text-center">{durationLabel(r.totalSeconds)}</td>
                  <td className="px-3 py-3 text-center">{r.joinedProjects}</td>
                  <td className="px-3 py-3 text-center">{r.completedProjects}</td>
                  <td className="px-3 py-3 text-center">
                    {r.yorSignedAt ? (
                      <span className="text-emerald-600" title={r.yorSignedAt}>
                        ✓ {dateDm(instantToTashkentYMD(r.yorSignedAt))}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">{r.xarajatCount || "—"}</td>
                  <td className="px-3 py-3 text-center">{r.stageRasmCount || "—"}</td>
                  <td className="px-3 py-3 text-center">{r.dayOffCount || "—"}</td>
                  <td className="px-3 py-3 text-center font-medium text-brand-700">
                    {r.telegramCount || "—"}
                  </td>
                  <td
                    className="px-3 py-3 text-center font-semibold tabular-nums text-amber-700"
                    title={formatPointsCompact(r.points)}
                  >
                    {r.points?.total ?? 0}
                    {r.fromTelegram ? (
                      <span className="ml-0.5 text-[10px] font-normal text-emerald-600">TG</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {r.days.length || r.telegramLog?.length ? (
                      <button
                        type="button"
                        onClick={() => setExpandedId((prev) => (prev === r.id ? "" : r.id))}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50"
                      >
                        {expandedId === r.id
                          ? "Yopish"
                          : `Ko‘rish (${(r.days.length || 0) + (r.telegramLog?.length || 0)})`}
                      </button>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
                {expandedId === r.id && (r.days.length || r.telegramLog?.length) ? (
                  <tr className="bg-slate-50/70">
                    <td colSpan={16} className="px-3 py-3 space-y-4">
                      {r.days.length ? (
                        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                          <p className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Ish kunlari (keldi / ketdi)
                          </p>
                          <table className="min-w-full text-xs">
                            <thead className="bg-slate-100 text-left uppercase tracking-wide text-slate-500">
                              <tr>
                                <th className="px-3 py-2">Sana</th>
                                <th className="px-3 py-2">Keldi (vaqt)</th>
                                <th className="px-3 py-2">Ketdi (vaqt)</th>
                                <th className="px-3 py-2">Davomiyligi</th>
                                <th className="px-3 py-2">Holat</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.days.map((d) => (
                                <tr key={d.dateKey} className="border-t border-slate-100 text-slate-700">
                                  <td className="px-3 py-2 font-medium text-slate-900">{dateDm(d.dateKey)}</td>
                                  <td className="px-3 py-2">{timeHm(d.loginTime)}</td>
                                  <td className="px-3 py-2">{timeHm(d.logoutTime)}</td>
                                  <td className="px-3 py-2">{durationLabel(d.totalWorkTime)}</td>
                                  <td className="px-3 py-2">
                                    {d.loginTime && d.logoutTime ? (
                                      <span className="text-emerald-600">To‘liq</span>
                                    ) : d.loginTime ? (
                                      <span className="text-amber-600">Ketdi yo‘q</span>
                                    ) : (
                                      <span className="text-slate-400">—</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                      {r.telegramLog?.length ? (
                        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                          <p className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Telegram botga yuborilgan xabarlar
                          </p>
                          <table className="min-w-full text-xs">
                            <thead className="bg-slate-100 text-left uppercase tracking-wide text-slate-500">
                              <tr>
                                <th className="px-3 py-2">Sana</th>
                                <th className="px-3 py-2">Vaqt</th>
                                <th className="px-3 py-2">Turi</th>
                                <th className="px-3 py-2">Xabar matni</th>
                                <th className="px-3 py-2">Fayl</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.telegramLog.map((msg, idx) => (
                                <tr
                                  key={`${msg.sentAt}-${msg.eventType}-${idx}`}
                                  className="border-t border-slate-100 text-slate-700"
                                >
                                  <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-900">
                                    {dateDm(msg.dateKey || instantToTashkentYMD(msg.sentAt))}
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap">{timeHm(msg.sentAt)}</td>
                                  <td className="px-3 py-2 whitespace-nowrap">{msg.label || msg.eventType}</td>
                                  <td className="px-3 py-2 whitespace-pre-wrap text-slate-600">
                                    {msg.messageText || "—"}
                                  </td>
                                  <td className="px-3 py-2">
                                    <TelegramFilePreview entry={msg} />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={16} className="px-4 py-6 text-center text-slate-500">
                  Bu oy uchun ma'lumot yo‘q.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-8">
        <h3 className="text-lg font-semibold text-slate-900">
          Telegram bot — {monthLabel(month)} (barcha xabarlar va fayllar)
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Botga yuborilgan va saqlangan barcha yozuvlar. Jami: {monthTelegramFeed.length} ta xabar
          {monthTelegramFileCount ? `, ${monthTelegramFileCount} ta rasm/fayl` : ""}
        </p>
        {monthTelegramFeed.length === 0 ? (
          <p className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
            Bu oy uchun Telegram xabarlari topilmadi.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200/85 bg-white shadow-soft-md">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">Vaqt</th>
                  <th className="px-3 py-3">Ism / login</th>
                  <th className="px-3 py-3">Modul</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Xabar</th>
                  <th className="px-3 py-3">Fayl</th>
                </tr>
              </thead>
              <tbody>
                {monthTelegramFeed.map((row, idx) => (
                    <tr key={`feed-${row.sentAt}-${idx}`} className="border-t border-slate-100 align-top">
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                        {dateDm(row.dateKey)} {timeHm(row.sentAt)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium text-slate-900">
                          {row.workerName || "—"}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {row.workerLogin || row.source || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {TELEGRAM_MODULE_LABELS[row.module] || row.label || "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {TELEGRAM_STATUS_LABELS[row.status] || row.status || "—"}
                      </td>
                      <td className="max-w-md px-3 py-2 whitespace-pre-wrap text-slate-700">
                        {row.messageText || "—"}
                      </td>
                      <td className="px-3 py-2">
                        <TelegramFilePreview entry={row} />
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
