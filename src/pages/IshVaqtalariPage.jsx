import { useEffect, useMemo, useState } from "react";
import { shortDeviceLabel } from "../activity/deviceInfo";
import { computeTotalWorkSeconds } from "../activity/userActivityLogsStorage";
import { workLogDateKeyMatches } from "../activity/workLogFilters";
import AppModalBackdrop from "../components/AppModalBackdrop";
import WorkLocationDisplay from "../components/WorkLocationDisplay";
import { useUserActivityLogs } from "../hooks/useUserActivityLogs";
import { useUstaPhotos } from "../hooks/useUstaPhotos";
import {
  APP_PHOTO_TYPES,
  buildWorkPhotoLookup,
} from "../photos/appPhotoSave";
import {
  formatTashkentDateMedium,
  formatTashkentDateTime,
  instantToTashkentYMD,
  tashkentSecondsFromMidnight,
  tashkentTodayYMD,
} from "../photos/tashkentTime";
import { SECTION_COPY } from "../navConfig";
import { isAsistenAttendancePersonId } from "../assistants/asistenAttendanceIds";
import DailyAttendanceSummaryPanel from "../components/DailyAttendanceSummaryPanel";

const DATE_INPUT_CLASS =
  "mt-1.5 w-full min-w-0 rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-slate-900/[0.04] transition-all focus:border-brand-400 focus:ring-2 focus:ring-brand-400/25";

const FILTER_BTN =
  "rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition-all duration-200 hover:bg-slate-50 hover:shadow-md active:scale-[0.98] sm:text-sm";

/** Kechikkan: Toshkent bo‘yicha 09:00:00 dan keyin kirish (> 09:00). */
const LATE_THRESHOLD_SEC = 9 * 3600;

/** @param {string} iso */
function isoToDatetimeLocalValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** @param {string} localStr */
function datetimeLocalToIso(localStr) {
  if (!localStr?.trim()) return "";
  const d = new Date(localStr);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function formatWorkedDuration(totalSeconds) {
  if (totalSeconds == null || Number.isNaN(totalSeconds)) return "—";
  const sec = Math.max(0, Math.floor(Number(totalSeconds)));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h <= 0) return `${m} daqiqa`;
  return `${h} soat ${m} daqiqa`;
}

function formatTotalHoursMinutes(sumSeconds) {
  const sec = Math.max(0, Math.floor(sumSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h} soat ${m} daqiqa`;
}

function WorkPhotoThumb({ photo, label }) {
  const src = String(photo?.imageData || photo?.imageUrl || "").trim();
  if (!src) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  return (
    <a href={src} target="_blank" rel="noreferrer" className="inline-block" title={label}>
      <img
        src={src}
        alt={label}
        className="h-12 w-12 rounded-lg border border-slate-200 object-cover"
      />
    </a>
  );
}

function isAsistenLog(log) {
  return (
    String(log?.personType || "") === "asisten" ||
    isAsistenAttendancePersonId(log?.ustaId)
  );
}

function logPhotoPersonId(log) {
  return String(log?.ustaId || "").trim();
}

function PersonTypeBadge({ log }) {
  if (isAsistenLog(log)) {
    return (
      <span className="ml-2 inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
        Asisten
      </span>
    );
  }
  return (
    <span className="ml-2 inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
      Usta
    </span>
  );
}

function brigadeOrMasterLabel(log) {
  if (isAsistenLog(log)) {
    const master = String(log.brigadeName || "").trim();
    return master ? `Master: ${master}` : "—";
  }
  return log.brigadeName?.trim() || "—";
}

export default function IshVaqtalariPage() {
  const { logs: activityLogs, deleteLog, updateLog } = useUserActivityLogs();
  const { photos } = useUstaPhotos();
  const workPhotoMap = useMemo(() => buildWorkPhotoLookup(photos), [photos]);
  const [activityEditTarget, setActivityEditTarget] = useState(null);
  const [activityForm, setActivityForm] = useState({
    ustaName: "",
    brigadeName: "",
    dateKey: "",
    loginLocal: "",
    logoutLocal: "",
  });
  const [periodMode, setPeriodMode] = useState(
    /** @type {'today'|'yesterday'|'week'|'month'|'pick'} */ ("today"),
  );
  const [pickDate, setPickDate] = useState(() => tashkentTodayYMD());

  const filtered = useMemo(() => {
    const list = activityLogs.filter((log) => {
      const dk = log.dateKey || instantToTashkentYMD(log.loginTime);
      return workLogDateKeyMatches(dk, periodMode, pickDate);
    });
    return list.sort(
      (a, b) =>
        new Date(b.loginTime).getTime() - new Date(a.loginTime).getTime(),
    );
  }, [activityLogs, periodMode, pickDate]);

  const summary = useMemo(() => {
    const uniquePeople = new Set(filtered.map((l) => logPhotoPersonId(l)).filter(Boolean));
    const onlinePeople = new Set(
      filtered.filter((l) => l.logoutTime == null).map((l) => logPhotoPersonId(l)),
    );
    let sumWork = 0;
    for (const l of filtered) {
      if (l.logoutTime != null && l.totalWorkTime != null) {
        sumWork += Number(l.totalWorkTime) || 0;
      }
    }

    const earliestByPersonDay = new Map();
    for (const log of filtered) {
      const dk = log.dateKey || instantToTashkentYMD(log.loginTime);
      const pid = logPhotoPersonId(log);
      const key = `${pid}|${dk}`;
      const prev = earliestByPersonDay.get(key);
      if (!prev || log.loginTime < prev) {
        earliestByPersonDay.set(key, log.loginTime);
      }
    }
    const latePeople = new Set();
    for (const [key, loginIso] of earliestByPersonDay) {
      if (tashkentSecondsFromMidnight(loginIso) > LATE_THRESHOLD_SEC) {
        latePeople.add(key.split("|")[0]);
      }
    }

    return {
      jamiKirgan: uniquePeople.size,
      online: onlinePeople.size,
      kechikkan: latePeople.size,
      umumiySekund: sumWork,
    };
  }, [filtered]);

  const emptyToday =
    periodMode === "today" && filtered.length === 0;

  const copy = SECTION_COPY["ish-vaqtlari"];

  useEffect(() => {
    if (!activityEditTarget) return;
    const dk =
      activityEditTarget.dateKey ||
      instantToTashkentYMD(activityEditTarget.loginTime);
    setActivityForm({
      ustaName: String(activityEditTarget.ustaName || ""),
      brigadeName: String(activityEditTarget.brigadeName || ""),
      dateKey: dk || "",
      loginLocal: isoToDatetimeLocalValue(String(activityEditTarget.loginTime || "")),
      logoutLocal: activityEditTarget.logoutTime
        ? isoToDatetimeLocalValue(String(activityEditTarget.logoutTime))
        : "",
    });
  }, [activityEditTarget]);

  const ACTION_BTN =
    "rounded-lg px-3 py-1.5 text-xs font-semibold transition active:scale-[0.97]";
  const requestDeleteActivity = (log) => {
    const ok = window.confirm(
      `${log.ustaName || "Yozuv"} — sessiyani o‘chirishni tasdiqlaysizmi?`,
    );
    if (!ok) return;
    void deleteLog(log.id);
  };

  const saveActivityEdit = async () => {
    if (!activityEditTarget?.id) return;
    const loginIso = datetimeLocalToIso(activityForm.loginLocal);
    if (!loginIso) {
      alert("Kirish vaqtini kiriting.");
      return;
    }
    const logoutRaw = activityForm.logoutLocal?.trim()
      ? datetimeLocalToIso(activityForm.logoutLocal)
      : null;
    if (logoutRaw && new Date(logoutRaw) <= new Date(loginIso)) {
      alert("Chiqish vaqti kirishdan keyin bo‘lishi kerak.");
      return;
    }
    const totalWorkTime = logoutRaw
      ? computeTotalWorkSeconds(loginIso, logoutRaw)
      : null;
    try {
      await updateLog(activityEditTarget.id, {
        ustaName: activityForm.ustaName.trim(),
        brigadeName: activityForm.brigadeName.trim(),
        dateKey: activityForm.dateKey.trim() || instantToTashkentYMD(loginIso),
        loginTime: loginIso,
        logoutTime: logoutRaw,
        totalWorkTime,
      });
      setActivityEditTarget(null);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <section className="rounded-[1.375rem] border border-slate-200/85 bg-gradient-to-br from-white via-white to-slate-50/80 p-6 shadow-soft-lg ring-1 ring-slate-900/[0.03] sm:p-8">
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        {copy.title}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
        {copy.description}
      </p>

      <DailyAttendanceSummaryPanel dateKey={tashkentTodayYMD()} />

      <div className="mt-8 flex flex-col gap-4 rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03] sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Filtr (Toshkent sanasi — dateKey)
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`${FILTER_BTN} ${periodMode === "today" ? "border-brand-400 bg-brand-50 text-brand-900" : ""}`}
            onClick={() => setPeriodMode("today")}
          >
            Bugun
          </button>
          <button
            type="button"
            className={`${FILTER_BTN} ${periodMode === "yesterday" ? "border-brand-400 bg-brand-50 text-brand-900" : ""}`}
            onClick={() => setPeriodMode("yesterday")}
          >
            Kecha
          </button>
          <button
            type="button"
            className={`${FILTER_BTN} ${periodMode === "week" ? "border-brand-400 bg-brand-50 text-brand-900" : ""}`}
            onClick={() => setPeriodMode("week")}
          >
            Shu hafta
          </button>
          <button
            type="button"
            className={`${FILTER_BTN} ${periodMode === "month" ? "border-brand-400 bg-brand-50 text-brand-900" : ""}`}
            onClick={() => setPeriodMode("month")}
          >
            Shu oy
          </button>
          <button
            type="button"
            className={`${FILTER_BTN} ${periodMode === "pick" ? "border-brand-400 bg-brand-50 text-brand-900" : ""}`}
            onClick={() => {
              setPeriodMode("pick");
              setPickDate(tashkentTodayYMD());
            }}
          >
            Boshqa sana
          </button>
        </div>
        {periodMode === "pick" ? (
          <div className="max-w-xs">
            <label htmlFor="iv-pick" className="block text-xs font-medium text-slate-600">
              Sana
            </label>
            <input
              id="iv-pick"
              type="date"
              value={pickDate}
              onChange={(e) => setPickDate(e.target.value)}
              className={DATE_INPUT_CLASS}
            />
          </div>
        ) : null}
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03]">
          <p className="text-xs font-medium text-slate-500">Jami kirgan (usta + asisten)</p>
          <p className="mt-2 text-xl font-bold text-slate-900">{summary.jamiKirgan}</p>
        </div>
        <div className="rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03]">
          <p className="text-xs font-medium text-slate-500">Online</p>
          <p className="mt-2 text-xl font-bold text-emerald-700">{summary.online}</p>
        </div>
        <div className="rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03]">
          <p className="text-xs font-medium text-slate-500">Kechikkanlar</p>
          <p className="mt-2 text-xl font-bold text-amber-700">{summary.kechikkan}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            {`> 09:00 (Toshkent)`}
          </p>
        </div>
        <div className="rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03]">
          <p className="text-xs font-medium text-slate-500">Umumiy ishlagan vaqt</p>
          <p className="mt-2 text-lg font-bold leading-snug text-slate-900">
            {formatTotalHoursMinutes(summary.umumiySekund)}
          </p>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-8 rounded-[1rem] border border-dashed border-slate-200/90 bg-slate-50/80 px-4 py-14 text-center shadow-inner">
          <p className="text-base font-medium text-slate-700">
            {emptyToday
              ? "Bugungi sana uchun ish vaqti ma’lumotlari yo‘q"
              : "Tanlangan filtr bo‘yicha yozuv yo‘q"}
          </p>
        </div>
      ) : (
        <>
          <ul className="mt-8 flex flex-col gap-3 md:hidden">
            {filtered.map((log) => {
              const online = log.logoutTime == null;
              const dk = log.dateKey || instantToTashkentYMD(log.loginTime);
              const pid = logPhotoPersonId(log);
              const keldiPhoto = workPhotoMap.get(`${pid}|${dk}|${APP_PHOTO_TYPES.KELDI}`);
              const ketdiPhoto = workPhotoMap.get(`${pid}|${dk}|${APP_PHOTO_TYPES.KETDI}`);
              return (
                <li
                  key={log.id}
                  className="rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03]"
                >
                  <p className="font-semibold text-slate-900">
                    {log.ustaName}
                    <PersonTypeBadge log={log} />
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {isAsistenLog(log) ? "Master" : "Brigada"}: {brigadeOrMasterLabel(log)}
                  </p>
                  <p className="mt-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        online
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {online ? "Online" : "Offline"}
                    </span>
                  </p>
                  <p className="mt-2 text-xs text-slate-600">
                    Kirgan: {formatTashkentDateTime(log.loginTime)}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Chiqqan:{" "}
                    {log.logoutTime
                      ? formatTashkentDateTime(log.logoutTime)
                      : "—"}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Ishlagan vaqt: {formatWorkedDuration(log.totalWorkTime)}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Qurilma: {shortDeviceLabel(log.deviceInfo)}
                  </p>
                  {log.loginLocation ? (
                    <div className="mt-1">
                      <WorkLocationDisplay location={log.loginLocation} label="Kelish joyi" />
                    </div>
                  ) : null}
                  {log.logoutLocation ? (
                    <div className="mt-1">
                      <WorkLocationDisplay location={log.logoutLocation} label="Ketish joyi" />
                    </div>
                  ) : null}
                  <div className="mt-2 flex items-center gap-3">
                    <WorkPhotoThumb photo={keldiPhoto} label="Keldi rasm" />
                    <WorkPhotoThumb photo={ketdiPhoto} label="Ketdi rasm" />
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    Sana: {formatTashkentDateMedium(`${dk}T12:00:00+05:00`)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      className={`${ACTION_BTN} border border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100`}
                      onClick={() => setActivityEditTarget(log)}
                    >
                      Tahrir
                    </button>
                    <button
                      type="button"
                      className={`${ACTION_BTN} border border-red-200 bg-red-50 text-red-800 hover:bg-red-100`}
                      onClick={() => requestDeleteActivity(log)}
                    >
                      O‘chirish
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-8 hidden overflow-x-auto rounded-[1.125rem] border border-slate-200/85 bg-white shadow-soft-md ring-1 ring-slate-900/[0.03] md:block">
            <table className="w-full min-w-[1200px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/90">
                  <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                    Ism
                  </th>
                  <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                    Brigada / Master
                  </th>
                  <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                    Status
                  </th>
                  <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                    Kirgan vaqti
                  </th>
                  <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                    Chiqqan vaqti
                  </th>
                  <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                    Ishlagan vaqt
                  </th>
                  <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                    Qurilma
                  </th>
                  <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                    Joylashuv
                  </th>
                  <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                    Sana
                  </th>
                  <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                    Keldi rasm
                  </th>
                  <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                    Ketdi rasm
                  </th>
                  <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                    Amallar
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => {
                  const online = log.logoutTime == null;
                  const dk = log.dateKey || instantToTashkentYMD(log.loginTime);
                  const pid = logPhotoPersonId(log);
                  const keldiPhoto = workPhotoMap.get(`${pid}|${dk}|${APP_PHOTO_TYPES.KELDI}`);
                  const ketdiPhoto = workPhotoMap.get(`${pid}|${dk}|${APP_PHOTO_TYPES.KETDI}`);
                  return (
                    <tr
                      key={log.id}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="whitespace-nowrap px-4 py-3.5 font-medium text-slate-900">
                        {log.ustaName}
                        <PersonTypeBadge log={log} />
                      </td>
                      <td className="max-w-[160px] px-4 py-3.5 text-slate-600">
                        <span className="line-clamp-2" title={brigadeOrMasterLabel(log)}>
                          {brigadeOrMasterLabel(log)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            online
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {online ? "Online" : "Offline"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">
                        {formatTashkentDateTime(log.loginTime)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">
                        {log.logoutTime
                          ? formatTashkentDateTime(log.logoutTime)
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-700">
                        {formatWorkedDuration(log.totalWorkTime)}
                      </td>
                      <td className="max-w-[180px] px-4 py-3.5 text-slate-600">
                        <span
                          className="line-clamp-2"
                          title={log.deviceInfo?.userAgent}
                        >
                          {shortDeviceLabel(log.deviceInfo)}
                        </span>
                      </td>
                      <td className="max-w-[200px] px-4 py-3.5">
                        {log.loginLocation || log.logoutLocation ? (
                          <div className="space-y-1">
                            {log.loginLocation ? (
                              <WorkLocationDisplay
                                location={log.loginLocation}
                                label="Keldi"
                                compact
                              />
                            ) : null}
                            {log.logoutLocation ? (
                              <WorkLocationDisplay
                                location={log.logoutLocation}
                                label="Ketdi"
                                compact
                              />
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">
                        {formatTashkentDateMedium(`${dk}T12:00:00+05:00`)}
                      </td>
                      <td className="px-4 py-3.5">
                        <WorkPhotoThumb photo={keldiPhoto} label="Keldi rasm" />
                      </td>
                      <td className="px-4 py-3.5">
                        <WorkPhotoThumb photo={ketdiPhoto} label="Ketdi rasm" />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className={`${ACTION_BTN} border border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100`}
                            onClick={() => setActivityEditTarget(log)}
                          >
                            Tahrir
                          </button>
                          <button
                            type="button"
                            className={`${ACTION_BTN} border border-red-200 bg-red-50 text-red-800 hover:bg-red-100`}
                            onClick={() => requestDeleteActivity(log)}
                          >
                            O‘chirish
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {activityEditTarget ? (
        <AppModalBackdrop
          onClose={() => setActivityEditTarget(null)}
          panelMaxWidthClass="max-w-lg"
        >
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Sessiyani tahrirlash</h3>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-600">Usta ismi</label>
                <input
                  type="text"
                  value={activityForm.ustaName}
                  onChange={(e) =>
                    setActivityForm((f) => ({ ...f, ustaName: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Brigada</label>
                <input
                  type="text"
                  value={activityForm.brigadeName}
                  onChange={(e) =>
                    setActivityForm((f) => ({ ...f, brigadeName: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Sana (dateKey)</label>
                <input
                  type="date"
                  value={activityForm.dateKey}
                  onChange={(e) =>
                    setActivityForm((f) => ({ ...f, dateKey: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Kirish (brauzer vaqti)</label>
                <input
                  type="datetime-local"
                  value={activityForm.loginLocal}
                  onChange={(e) =>
                    setActivityForm((f) => ({ ...f, loginLocal: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  Chiqish (bo‘sh → online sessiya)
                </label>
                <input
                  type="datetime-local"
                  value={activityForm.logoutLocal}
                  onChange={(e) =>
                    setActivityForm((f) => ({ ...f, logoutLocal: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
                />
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-700"
                onClick={() => setActivityEditTarget(null)}
              >
                Bekor
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white"
                onClick={() => void saveActivityEdit()}
              >
                Saqlash
              </button>
            </div>
          </div>
        </AppModalBackdrop>
      ) : null}
    </section>
  );
}
