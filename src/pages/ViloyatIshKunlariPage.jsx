import { useMemo, useState } from "react";
import { SECTION_COPY } from "../navConfig";
import { calendarMonthRangeYmd } from "../lib/monthlyReport";
import { useProjects } from "../hooks/useProjects";
import { useWorkers } from "../hooks/useWorkers";
import { useProjectWorkerDayLogs } from "../hooks/useProjectWorkerDayLogs";
import { regionDistrictFromAddress } from "../projects/regionFromAddress";
import { projectNumberKey } from "../projects/projectStorage";
import { tashkentTodayYMD } from "../photos/tashkentTime";
import { UZBEKISTON_14_VILOYATLAR } from "../data/uzbekistanViloyatlari14";
import { downloadViloyatIshKunlariMonthPdf } from "../activity/viloyatWorkPdfExport";

const INPUT_CLASS =
  "mt-1.5 w-full rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-slate-900/[0.04] transition-all focus:border-brand-400 focus:ring-2 focus:ring-brand-400/25";

function logInCalendarMonth(log, year, month) {
  const d = String(log.date || "").slice(0, 10);
  const { start, end } = calendarMonthRangeYmd(year, month);
  return d >= start && d <= end;
}

function logMatchesReportMonth(log, year, month) {
  const label = `${year}-${String(month).padStart(2, "0")}`;
  const ym = String(log.yearMonth || "").trim();
  if (ym === label) return true;
  return logInCalendarMonth(log, year, month);
}

function canonicalViloyat(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const direct = UZBEKISTON_14_VILOYATLAR.find((x) => x === s);
  if (direct) return direct;
  try {
    const sn = s.normalize("NFC");
    return UZBEKISTON_14_VILOYATLAR.find((x) => x.normalize("NFC") === sn) || null;
  } catch {
    return null;
  }
}

function aggregateDaysBy14Viloyat(logsSubset) {
  const sums = new Map(UZBEKISTON_14_VILOYATLAR.map((v) => [v, 0]));
  let other = 0;
  for (const log of logsSubset) {
    const days = Number(log.workDays) || 0;
    const c = canonicalViloyat(log.viloyat);
    if (c) sums.set(c, (sums.get(c) || 0) + days);
    else other += days;
  }
  const rows14 = UZBEKISTON_14_VILOYATLAR.map((viloyat) => ({
    viloyat,
    days: sums.get(viloyat) || 0,
  }));
  return { rows14, other };
}

function isMonthAggregateDoc(log) {
  return String(log.id || "").includes("__oy__");
}

export default function ViloyatIshKunlariPage() {
  const { projects } = useProjects();
  const { workers } = useWorkers();
  const { logs, upsertDayLog, removeDayLog } = useProjectWorkerDayLogs();

  const today = tashkentTodayYMD();
  const [periodY, setPeriodY] = useState(() => Number(today.slice(0, 4)));
  const [periodM, setPeriodM] = useState(() => Number(today.slice(5, 7)));

  const [projectId, setProjectId] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [amount, setAmount] = useState("1");
  const [formBusy, setFormBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const monthLogs = useMemo(
    () => logs.filter((x) => logMatchesReportMonth(x, periodY, periodM)),
    [logs, periodY, periodM],
  );

  const byViloyat = useMemo(() => {
    const map = new Map();
    for (const log of monthLogs) {
      const v = String(log.viloyat || "").trim() || "Noma'lum";
      if (!map.has(v)) {
        map.set(v, { viloyat: v, projectIds: new Set(), workerIds: new Set(), sumDays: 0 });
      }
      const row = map.get(v);
      if (log.projectId) row.projectIds.add(String(log.projectId));
      if (log.workerId) row.workerIds.add(String(log.workerId));
      row.sumDays += Number(log.workDays) || 0;
    }
    return [...map.values()].sort((a, b) => a.viloyat.localeCompare(b.viloyat, "uz"));
  }, [monthLogs]);

  const byWorkerViloyat = useMemo(() => {
    const map = new Map();
    for (const log of monthLogs) {
      const v = String(log.viloyat || "").trim() || "Noma'lum";
      const w = String(log.workerId || "");
      const key = `${w}|${v}`;
      if (!map.has(key)) {
        map.set(key, {
          workerId: w,
          workerName: String(log.workerName || "").trim() || w,
          viloyat: v,
          sumDays: 0,
        });
      }
      map.get(key).sumDays += Number(log.workDays) || 0;
    }
    return [...map.values()].sort((a, b) =>
      a.workerName.localeCompare(b.workerName, "uz"),
    );
  }, [monthLogs]);

  const byWorkerProject = useMemo(() => {
    const map = new Map();
    for (const log of monthLogs) {
      const p = String(log.projectId || "");
      const w = String(log.workerId || "");
      const key = `${w}|${p}`;
      if (!map.has(key)) {
        map.set(key, {
          workerId: w,
          workerName: String(log.workerName || "").trim() || w,
          projectId: p,
          projectLabel:
            String(log.projectLabel || "").trim() ||
            String(log.projectNumber || "").trim() ||
            p,
          viloyat: String(log.viloyat || "").trim() || "—",
          sumDays: 0,
        });
      }
      map.get(key).sumDays += Number(log.workDays) || 0;
    }
    return [...map.values()].sort((a, b) => {
      const c = a.workerName.localeCompare(b.workerName, "uz");
      if (c !== 0) return c;
      return a.projectLabel.localeCompare(b.projectLabel, "uz");
    });
  }, [monthLogs]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    const p = projects.find((x) => x.id === projectId);
    const w = workers.find((x) => x.id === workerId);
    if (!p || !w) {
      setFormError("Loyiha va ustani tanlang.");
      return;
    }
    const { viloyat, district } = regionDistrictFromAddress(p.address);
    if (!viloyat) {
      setFormError("Loyiha manzilida viloyat topilmadi. Loyihani viloyat/tuman bilan yangilang.");
      return;
    }
    const yearMonth = `${periodY}-${String(periodM).padStart(2, "0")}`;
    const wd = Math.min(31, Math.max(0.25, Number(String(amount).replace(",", ".")) || 1));
    setFormBusy(true);
    try {
      await upsertDayLog({
        projectId: p.id,
        projectNumber: String(p.projectNumber || ""),
        projectLabel: String(p.clientName || "").trim() || projectNumberKey(p.projectNumber),
        workerId: w.id,
        workerName: String(w.fullName || "").trim(),
        yearMonth,
        workDays: wd,
        viloyat,
        district,
        addressSnapshot: String(p.address || "").trim(),
      });
      setAmount("1");
    } catch (err) {
      setFormError(err?.message || "Saqlashda xatolik");
    } finally {
      setFormBusy(false);
    }
  };

  const label = `${periodY}-${String(periodM).padStart(2, "0")}`;
  const { start, end } = calendarMonthRangeYmd(periodY, periodM);

  const handlePdf = async () => {
    setFormError("");
    const p = projects.find((x) => x.id === projectId);
    const w = workers.find((x) => x.id === workerId);
    if (!p || !w) {
      setFormError("PDF uchun loyiha va ustani tanlang.");
      return;
    }
    const subset = logs.filter(
      (l) =>
        String(l.projectId) === String(projectId) &&
        String(l.workerId) === String(workerId) &&
        logMatchesReportMonth(l, periodY, periodM),
    );
    if (subset.length === 0) {
      setFormError("Tanlangan oyda bu loyiha va usta uchun yozuv yo‘q.");
      return;
    }
    setPdfBusy(true);
    try {
      const { rows14, other } = aggregateDaysBy14Viloyat(subset);
      const rowsPdf =
        other > 0
          ? [...rows14, { viloyat: "Boshqa (14 ta ro‘yxatga mos kelmagan)", days: other }]
          : rows14;
      const projectTitle = `#${projectNumberKey(p.projectNumber)} — ${p.clientName || "—"}`;
      const workerName = String(w.fullName || "").trim() || w.id;
      const detailRows = subset
        .filter((l) => !isMonthAggregateDoc(l))
        .map((l) => ({
          date: String(l.date || "").slice(0, 10),
          workDays: Number(l.workDays) || 0,
        }));
      await downloadViloyatIshKunlariMonthPdf({
        projectTitle,
        workerName,
        yearMonth: label,
        periodHuman: `${start} — ${end}`,
        rows14: rowsPdf,
        detailRows,
        filename: `viloyat-ish-kunlari-${label}.pdf`,
      });
    } catch (err) {
      setFormError(err?.message || "PDF yuklashda xatolik");
    } finally {
      setPdfBusy(false);
    }
  };

  const copy = SECTION_COPY["viloyat-ish-kunlari"];

  return (
    <section className="rounded-[1.375rem] border border-slate-200/85 bg-gradient-to-br from-white via-white to-slate-50/80 p-6 shadow-soft-lg ring-1 ring-slate-900/[0.03] sm:p-8">
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        {copy.title}
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
        {copy.description}
      </p>

      <div className="mt-8">
        <div className="rounded-[1.125rem] border border-slate-200/85 bg-white p-5 shadow-soft-md ring-1 ring-slate-900/[0.03]">
          <h3 className="text-base font-semibold text-slate-900">Kiritish va PDF</h3>
          <p className="mt-1 text-xs text-slate-500">
            Loyiha, usta va <strong>oy</strong> tanlanadi (alohida sana tanlanmaydi). Viloyat loyiha
            manzilidan olinadi. Bir loyiha + usta + oy uchun bitta yozuv (qayta saqlansa
            yangilanadi).
          </p>
          <form className="mt-4 space-y-4" onSubmit={(e) => void handleSubmit(e)}>
            <div>
              <label htmlFor="vwd-project" className="block text-sm font-medium text-slate-700">
                Loyiha
              </label>
              <select
                id="vwd-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className={INPUT_CLASS}
                required
              >
                <option value="">Tanlang…</option>
                {projects.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    #{projectNumberKey(pr.projectNumber)} — {pr.clientName || "—"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="vwd-worker" className="block text-sm font-medium text-slate-700">
                Usta
              </label>
              <select
                id="vwd-worker"
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
                className={INPUT_CLASS}
                required
              >
                <option value="">Tanlang…</option>
                {workers.map((wk) => (
                  <option key={wk.id} value={wk.id}>
                    {wk.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[120px] flex-1">
                <label htmlFor="vwd-y" className="block text-sm font-medium text-slate-700">
                  Yil
                </label>
                <input
                  id="vwd-y"
                  type="number"
                  min={2020}
                  max={2100}
                  value={periodY}
                  onChange={(e) => setPeriodY(Number(e.target.value) || periodY)}
                  className={INPUT_CLASS}
                />
              </div>
              <div className="min-w-[120px] flex-1">
                <label htmlFor="vwd-m" className="block text-sm font-medium text-slate-700">
                  Oy
                </label>
                <select
                  id="vwd-m"
                  value={periodM}
                  onChange={(e) => setPeriodM(Number(e.target.value))}
                  className={INPUT_CLASS}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {String(m).padStart(2, "0")}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-800">Davr:</span> {start} — {end}
            </p>
            <div>
              <label htmlFor="vwd-amt" className="block text-sm font-medium text-slate-700">
                Shu oy uchun (1, 0,5 va hokazo)
              </label>
              <input
                id="vwd-amt"
                type="number"
                min={0.25}
                max={31}
                step={0.25}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            {formError ? (
              <p className="text-sm font-medium text-red-600">{formError}</p>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="submit"
                disabled={formBusy}
                className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-soft-md transition hover:bg-slate-800 disabled:opacity-50"
              >
                {formBusy ? "Saqlanmoqda…" : "Saqlash"}
              </button>
              <button
                type="button"
                disabled={pdfBusy}
                onClick={() => void handlePdf()}
                className="flex-1 rounded-xl border border-slate-900/15 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
              >
                {pdfBusy ? "PDF…" : "PDF yuklash"}
              </button>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Mobil ilovada «yuklash» o‘rniga tizim <strong>Ulashish</strong> oynasini ochamiz — shu yerda
              Drive, Telegram yoki «Fayllar»ga saqlang.
            </p>
          </form>
        </div>
      </div>

      <div className="mt-10 space-y-8">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Viloyat bo‘yicha ({label})</h3>
          <div className="mt-3 overflow-x-auto rounded-[1rem] border border-slate-200/85 bg-white shadow-soft-md">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/90">
                  <th className="px-4 py-3 font-semibold text-slate-700">Viloyat</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Loyihalar</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Ustalar (soni)</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Jami ish kunlari</th>
                </tr>
              </thead>
              <tbody>
                {byViloyat.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      Bu oy uchun yozuv yo‘q
                    </td>
                  </tr>
                ) : (
                  byViloyat.map((r) => (
                    <tr key={r.viloyat} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-900">{r.viloyat}</td>
                      <td className="px-4 py-3 text-slate-700">{r.projectIds.size}</td>
                      <td className="px-4 py-3 text-slate-700">{r.workerIds.size}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {r.sumDays.toLocaleString("uz-UZ", { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            Usta — viloyat — jami kunlar ({label})
          </h3>
          <div className="mt-3 overflow-x-auto rounded-[1rem] border border-slate-200/85 bg-white shadow-soft-md">
            <table className="w-full min-w-[560px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/90">
                  <th className="px-4 py-3 font-semibold text-slate-700">Usta</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Viloyat</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Jami kunlar</th>
                </tr>
              </thead>
              <tbody>
                {byWorkerViloyat.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                      Bu oy uchun yozuv yo‘q
                    </td>
                  </tr>
                ) : (
                  byWorkerViloyat.map((r) => (
                    <tr
                      key={`${r.workerId}|${r.viloyat}`}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900">{r.workerName}</td>
                      <td className="px-4 py-3 text-slate-700">{r.viloyat}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {r.sumDays.toLocaleString("uz-UZ", { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            Usta — loyiha — jami kunlar ({label})
          </h3>
          <div className="mt-3 overflow-x-auto rounded-[1rem] border border-slate-200/85 bg-white shadow-soft-md">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/90">
                  <th className="px-4 py-3 font-semibold text-slate-700">Usta</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Viloyat</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Loyiha</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Jami kunlar</th>
                </tr>
              </thead>
              <tbody>
                {byWorkerProject.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      Bu oy uchun yozuv yo‘q
                    </td>
                  </tr>
                ) : (
                  byWorkerProject.map((r) => (
                    <tr
                      key={`${r.workerId}|${r.projectId}`}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900">{r.workerName}</td>
                      <td className="px-4 py-3 text-slate-700">{r.viloyat}</td>
                      <td className="px-4 py-3 text-slate-700">{r.projectLabel}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {r.sumDays.toLocaleString("uz-UZ", { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-slate-900">Kiritilgan yozuvlar (oy bo‘yicha)</h3>
          <div className="mt-3 overflow-x-auto rounded-[1rem] border border-slate-200/85 bg-white shadow-soft-md">
            <table className="w-full min-w-[800px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/90">
                  <th className="px-4 py-3 font-semibold text-slate-700">Oy</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Sana (ixtiyoriy)</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Viloyat</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Loyiha</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Usta</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Kunlar</th>
                  <th className="px-4 py-3 font-semibold text-slate-700" />
                </tr>
              </thead>
              <tbody>
                {monthLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      Yozuv yo‘q
                    </td>
                  </tr>
                ) : (
                  monthLogs.map((log) => (
                    <tr key={log.id} className="border-b border-slate-100 last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {String(log.yearMonth || "").trim() ||
                          String(log.date || "").slice(0, 7) ||
                          "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {isMonthAggregateDoc(log) ? "—" : String(log.date || "").slice(0, 10)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{log.viloyat || "—"}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {log.projectLabel || log.projectNumber || log.projectId}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{log.workerName || log.workerId}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {Number(log.workDays || 0).toLocaleString("uz-UZ", {
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (!window.confirm("Yozuvni o‘chirishni tasdiqlaysizmi?")) return;
                            void removeDayLog(log.id);
                          }}
                          className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                        >
                          O‘chirish
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
