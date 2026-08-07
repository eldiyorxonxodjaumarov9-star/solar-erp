import { useMemo, useState } from "react";
import { SECTION_COPY } from "../navConfig";
import { api } from "../api/http";
import { shortDeviceLabel } from "../activity/deviceInfo";
import {
  formatTashkentDateTime,
  instantToTashkentYMD,
  photoMatchesPeriod,
  tashkentTodayYMD,
} from "../photos/tashkentTime";
import { useUserActionsLogs } from "../hooks/useUserActionsLogs";
import { useUserActivityLogs } from "../hooks/useUserActivityLogs";
import { useWorkers } from "../hooks/useWorkers";
import { useProjects } from "../hooks/useProjects";
import { useExpenses } from "../hooks/useExpenses";
import { useUstaPhotos } from "../hooks/useUstaPhotos";
import { useWorkLogs } from "../hooks/useWorkLogs";
import {
  calendarMonthRangeYmd,
  isCompletedHolat,
  projectOverlapsMonth,
} from "../lib/monthlyReport";
import { workerProjectAggregates } from "../projects/projectStorage";

const DATE_INPUT_CLASS =
  "mt-1.5 w-full min-w-0 rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-slate-900/[0.04] transition-all focus:border-brand-400 focus:ring-2 focus:ring-brand-400/25";

const FILTER_BTN =
  "rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition-all duration-200 hover:bg-slate-50 hover:shadow-md active:scale-[0.98] sm:text-sm";

function maxActionTsForUstaInPeriod(ustaId, actions, mode, pickYmd) {
  let best = null;
  for (const a of actions) {
    if (a.ustaId !== ustaId) continue;
    if (!photoMatchesPeriod(a.date, mode, pickYmd)) continue;
    if (!best || a.timestamp > best) best = a.timestamp;
  }
  return best;
}

function globalLastActionTs(ustaId, actions) {
  let best = null;
  for (const a of actions) {
    if (a.ustaId !== ustaId) continue;
    if (!best || a.timestamp > best) best = a.timestamp;
  }
  return best;
}

function latestLoginLogForUsta(ustaId, logs) {
  let best = null;
  for (const log of logs) {
    if (log.ustaId !== ustaId) continue;
    if (!best || new Date(log.loginTime) > new Date(best.loginTime)) best = log;
  }
  return best;
}

export default function TahlilPage() {
  const { logs: activityLogs } = useUserActivityLogs();
  const actions = useUserActionsLogs();
  const { workers } = useWorkers();
  const { projects } = useProjects();
  const { expenses } = useExpenses();
  const { photos } = useUstaPhotos();
  const { workLogs } = useWorkLogs();

  const [periodMode, setPeriodMode] = useState(
    /** @type {'today'|'pick'|'week'|'month'} */ ("today"),
  );
  const [pickDate, setPickDate] = useState(() => tashkentTodayYMD());

  const todayYmd = tashkentTodayYMD();
  const [reportY, setReportY] = useState(() => Number(todayYmd.slice(0, 4)));
  const [reportM, setReportM] = useState(() => Number(todayYmd.slice(5, 7)));
  const [reportBusy, setReportBusy] = useState(false);

  const filteredLogs = useMemo(() => {
    const list = activityLogs.filter((log) =>
      photoMatchesPeriod(
        instantToTashkentYMD(log.loginTime),
        periodMode,
        pickDate,
      ),
    );
    return list.sort(
      (a, b) =>
        new Date(b.loginTime).getTime() - new Date(a.loginTime).getTime(),
    );
  }, [activityLogs, periodMode, pickDate]);

  const ustaAnalytics = useMemo(() => {
    return workers
      .map((w) => {
        const latest = latestLoginLogForUsta(w.id, activityLogs);
        const online = Boolean(latest && latest.logoutTime == null);
        const actionsTodayCount = actions.filter(
          (a) => a.ustaId === w.id && a.date === todayYmd,
        ).length;
        const lastActivityTs = globalLastActionTs(w.id, actions);
        const expenseCount = expenses.filter((e) => e.ustaId === w.id).length;
        const photoCount = photos.filter((p) => p.ustaId === w.id).length;
        const { projectCount: assignedProjects } = workerProjectAggregates(
          w.id,
          w.brigadeId,
          projects,
        );
        return {
          uid: w.id,
          name: w.fullName,
          online,
          lastLoginIso: latest?.loginTime ?? null,
          deviceLabel: latest ? shortDeviceLabel(latest.deviceInfo) : "—",
          actionsToday: actionsTodayCount,
          lastActivityTs,
          expenseCount,
          photoCount,
          assignedProjects,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "uz"));
  }, [
    workers,
    activityLogs,
    actions,
    todayYmd,
    expenses,
    photos,
    projects,
  ]);

  const monthlyStats = useMemo(() => {
    const { start, end } = calendarMonthRangeYmd(reportY, reportM);
    const list = projects.filter((p) => projectOverlapsMonth(p, reportY, reportM));
    const done = list.filter((p) => isCompletedHolat(p.holat));
    const part = list.filter((p) => !isCompletedHolat(p.holat));
    let expenseSum = 0;
    let expenseCount = 0;
    for (const e of expenses) {
      if (!e || typeof e !== "object") continue;
      const d = String(e.date || "").slice(0, 10);
      if (d < start || d > end) continue;
      expenseCount += 1;
      expenseSum += Math.round(Number(String(e.amount || "").replace(/\s/g, "")) || 0);
    }
    let activityRows = 0;
    for (const log of activityLogs) {
      const dk = String(log.dateKey || "").trim().slice(0, 10);
      const fromLogin = String(log.loginTime || "").slice(0, 10);
      const key = /^\d{4}-\d{2}-\d{2}$/.test(dk) ? dk : fromLogin;
      if (key >= start && key <= end) activityRows += 1;
    }
    const label = `${reportY}-${String(reportM).padStart(2, "0")}`;
    const reportFiles = [
      `solar-erp-xarajatlar-${label}.csv`,
      `solar-erp-keldi-ketdi-${label}.csv`,
      `solar-erp-loyihalar-tahlil-${label}.txt`,
    ];
    return {
      start,
      end,
      done,
      part,
      expenseCount,
      expenseSum,
      activityRows,
      reportFiles,
    };
  }, [reportY, reportM, projects, expenses, workLogs, workers, activityLogs]);

  const sendMonthlyToTelegram = async () => {
    const secret = String(import.meta.env.VITE_MONTHLY_REPORT_SECRET || "").trim();
    setReportBusy(true);
    try {
      await api.post(
        "/api/telegram/monthly-report",
        {
          year: reportY,
          month: reportM,
          projects,
          expenses,
          workLogs,
          workers,
          activityLogs,
        },
        secret ? { headers: { "x-monthly-report-secret": secret } } : {},
      );
      alert("Telegram guruhiga 3 ta fayl yuborildi.");
    } catch (e) {
      alert(e?.message || "Yuborishda xatolik");
    } finally {
      setReportBusy(false);
    }
  };

  const copy = SECTION_COPY.tahlil;

  return (
    <section className="rounded-[1.375rem] border border-slate-200/85 bg-gradient-to-br from-white via-white to-slate-50/80 p-6 shadow-soft-lg ring-1 ring-slate-900/[0.03] sm:p-8">
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        {copy.title}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
        {copy.description}
      </p>

      <div className="mt-8 flex flex-col gap-4 rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03] sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Filtr (kirish vaqtiga qarab, Toshkent vaqti)
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
            Sana tanlash
          </button>
        </div>
        {periodMode === "pick" ? (
          <div className="max-w-xs">
            <label htmlFor="tp-pick" className="block text-xs font-medium text-slate-600">
              Sana
            </label>
            <input
              id="tp-pick"
              type="date"
              value={pickDate}
              onChange={(e) => setPickDate(e.target.value)}
              className={DATE_INPUT_CLASS}
            />
          </div>
        ) : null}
      </div>

      <div className="mt-10">
        <h3 className="text-lg font-semibold text-slate-900">
          Usta sessiyalari
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Kirish / chiqish va qurilma (filtr bo‘yicha yozuvlar).
        </p>

        {filteredLogs.length === 0 ? (
          <div className="mt-4 rounded-[1rem] border border-dashed border-slate-200/90 bg-slate-50/80 px-4 py-12 text-center text-sm font-medium text-slate-600">
            Tanlangan davr uchun sessiya yozuvlari yo‘q
          </div>
        ) : (
          <>
            <ul className="mt-6 flex flex-col gap-3 md:hidden">
              {filteredLogs.map((log) => {
                const online = log.logoutTime == null;
                const lastInPeriod = maxActionTsForUstaInPeriod(
                  log.ustaId,
                  actions,
                  periodMode,
                  pickDate,
                );
                return (
                  <li
                    key={log.id}
                    className="rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">
                        {log.ustaName}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          online
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {online ? "Online" : "Offline"}
                      </span>
                    </div>
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
                      Qurilma: {shortDeviceLabel(log.deviceInfo)}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Oxirgi faollik (davr):{" "}
                      {lastInPeriod
                        ? formatTashkentDateTime(lastInPeriod)
                        : "—"}
                    </p>
                  </li>
                );
              })}
            </ul>

            <div className="mt-6 hidden overflow-x-auto rounded-[1.125rem] border border-slate-200/85 bg-white shadow-soft-md ring-1 ring-slate-900/[0.03] md:block">
              <table className="w-full min-w-[920px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/90">
                    <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                      Usta ismi
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
                      Qurilma
                    </th>
                    <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                      Oxirgi faollik
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => {
                    const online = log.logoutTime == null;
                    const lastInPeriod = maxActionTsForUstaInPeriod(
                      log.ustaId,
                      actions,
                      periodMode,
                      pickDate,
                    );
                    return (
                      <tr
                        key={log.id}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="whitespace-nowrap px-4 py-3.5 font-medium text-slate-900">
                          {log.ustaName}
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
                        <td className="max-w-[200px] px-4 py-3.5 text-slate-600">
                          <span className="line-clamp-2" title={log.deviceInfo?.userAgent}>
                            {shortDeviceLabel(log.deviceInfo)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">
                          {lastInPeriod
                            ? formatTashkentDateTime(lastInPeriod)
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="mt-12 border-t border-slate-200/80 pt-10">
        <h3 className="text-lg font-semibold text-slate-900">
          Usta harakatlari
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Barcha ustalar: kirish, qurilma, bugungi harakatlar, oxirgi faollik,
          biriktirilgan loyihalar, xarajat va foto soni (maʼlumotlar
          tizimlangan jadval; KPI keyin qoʻshiladi).
        </p>

        {ustaAnalytics.length === 0 ? (
          <div className="mt-4 rounded-[1rem] border border-dashed border-slate-200/90 bg-slate-50/80 px-4 py-10 text-center text-sm text-slate-600">
            Usta qoʻshilmagan
          </div>
        ) : (
          <>
            <ul className="mt-6 flex flex-col gap-3 md:hidden">
              {ustaAnalytics.map((row) => (
                <li
                  key={row.uid}
                  className="rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">{row.name}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        row.online
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {row.online ? "Online" : "Offline"}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-600">
                    Oxirgi kirish:{" "}
                    {row.lastLoginIso
                      ? formatTashkentDateTime(row.lastLoginIso)
                      : "—"}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Qurilma: <span>{row.deviceLabel}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Bugungi harakatlar:{" "}
                    <span className="font-semibold text-slate-800">
                      {row.actionsToday}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Oxirgi faollik:{" "}
                    {row.lastActivityTs
                      ? formatTashkentDateTime(row.lastActivityTs)
                      : "—"}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Loyihalar:{" "}
                    <span className="font-semibold text-slate-800">
                      {row.assignedProjects}
                    </span>
                    {" · "}Rasmlar:{" "}
                    <span className="font-semibold text-slate-800">
                      {row.photoCount}
                    </span>
                    {" · "}Xarajatlar:{" "}
                    <span className="font-semibold text-slate-800">
                      {row.expenseCount}
                    </span>
                  </p>
                </li>
              ))}
            </ul>

            <div className="mt-6 hidden overflow-x-auto rounded-[1.125rem] border border-slate-200/85 bg-white shadow-soft-md ring-1 ring-slate-900/[0.03] md:block">
              <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/90">
                    <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                      Usta ismi
                    </th>
                    <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                      Status
                    </th>
                    <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                      Oxirgi kirish
                    </th>
                    <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                      Qurilma
                    </th>
                    <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                      Bugungi harakatlar
                    </th>
                    <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                      Oxirgi faollik
                    </th>
                    <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                      Loyihalar
                    </th>
                    <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                      Rasmlar
                    </th>
                    <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                      Xarajatlar
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ustaAnalytics.map((row) => (
                    <tr
                      key={row.uid}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="px-4 py-3.5 font-medium text-slate-900">
                        {row.name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            row.online
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {row.online ? "Online" : "Offline"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">
                        {row.lastLoginIso
                          ? formatTashkentDateTime(row.lastLoginIso)
                          : "—"}
                      </td>
                      <td className="max-w-[180px] px-4 py-3.5 text-slate-600">
                        <span className="line-clamp-2">{row.deviceLabel}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-700">
                        {row.actionsToday}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">
                        {row.lastActivityTs
                          ? formatTashkentDateTime(row.lastActivityTs)
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-700">
                        {row.assignedProjects}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-700">
                        {row.photoCount}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-700">
                        {row.expenseCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="mt-12 border-t border-slate-200/80 pt-10">
        <h3 className="text-lg font-semibold text-slate-900">Oylik tahlil va Telegram hisoboti</h3>
        <p className="mt-1 text-sm text-slate-600">
          Loyihalar boshlanish/tugash sanalari bilan oyga taalluqli deb olinadi. To‘liq yakunlanganlar
          «Tugallangan» holati bo‘yicha; qolganlari yarim / jarayonda. Telegramga uchta fayl ketadi:
          xarajatlar (CSV), keldi–ketdi (CSV), loyihalar va usta–loyiha (TXT).
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="rep-y" className="block text-xs font-medium text-slate-600">
              Yil
            </label>
            <input
              id="rep-y"
              type="number"
              min={2020}
              max={2100}
              value={reportY}
              onChange={(e) => setReportY(Number(e.target.value) || reportY)}
              className={DATE_INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="rep-m" className="block text-xs font-medium text-slate-600">
              Oy
            </label>
            <select
              id="rep-m"
              value={reportM}
              onChange={(e) => setReportM(Number(e.target.value))}
              className={DATE_INPUT_CLASS}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, "0")}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={reportBusy}
            onClick={() => void sendMonthlyToTelegram()}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-soft-md transition hover:bg-slate-800 disabled:opacity-50"
          >
            {reportBusy ? "Yuborilmoqda…" : "Telegramga 3 fayl yuborish"}
          </button>
        </div>
        <div className="mt-4 rounded-[1rem] border border-slate-200/85 bg-white p-4 text-sm text-slate-700 shadow-soft-md ring-1 ring-slate-900/[0.03]">
          <p>
            <span className="font-medium text-slate-900">Davr:</span> {monthlyStats.start} —{" "}
            {monthlyStats.end}
          </p>
          <p className="mt-1">
            <span className="font-medium text-slate-900">To‘liq yakunlangan:</span>{" "}
            {monthlyStats.done.length} ta loyiha
          </p>
          <p className="mt-1">
            <span className="font-medium text-slate-900">Yarim / jarayonda:</span>{" "}
            {monthlyStats.part.length} ta loyiha
          </p>
          <p className="mt-1">
            <span className="font-medium text-slate-900">Oylik xarajat yozuvlari:</span>{" "}
            {monthlyStats.expenseCount} ta (jami {monthlyStats.expenseSum.toLocaleString("uz-UZ")} so‘m)
          </p>
          <p className="mt-1">
            <span className="font-medium text-slate-900">Keldi–ketdi qatorlari (sessiya):</span>{" "}
            {monthlyStats.activityRows}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Fayllar: {monthlyStats.reportFiles.join(", ")}. Serverda{" "}
            <code className="rounded bg-slate-100 px-1">TELEGRAM_MONTHLY_REPORT_SECRET</code>{" "}
            bo‘lsa, frontend{" "}
            <code className="rounded bg-slate-100 px-1">VITE_MONTHLY_REPORT_SECRET</code> bilan bir xil
            qiling.
          </p>
        </div>
      </div>
    </section>
  );
}
