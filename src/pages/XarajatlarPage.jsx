import { useEffect, useMemo, useState } from "react";
import AppModalBackdrop from "../components/AppModalBackdrop";
import { SECTION_COPY } from "../navConfig";
import {
  EXPENSE_TYPE_OPTIONS,
  sumExpenseAmounts,
  uniqueProjectCount,
} from "../expenses/expenseStorage";
import { formatSomDisplay, somDigitsOnly } from "../projects/projectStorage";
import {
  endOfMonth,
  endOfWeekSunday,
  endOfYear,
  filterExpensesByDateRange,
  normalizeRange,
  startOfMonth,
  startOfWeekMonday,
  startOfYear,
  toYMD,
  ymdToday,
} from "../expenses/expenseDateRange";
import { downloadExpenseReport } from "../expenses/expenseReportExport";
import { useExpenses } from "../hooks/useExpenses";
import EmployeePayrollSection from "../components/EmployeePayrollSection";

const SELECT_CLASS =
  "mt-1.5 w-full rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-slate-900/[0.04] transition-all focus:border-brand-400 focus:ring-2 focus:ring-brand-400/25 sm:max-w-[220px]";

const DATE_INPUT_CLASS =
  "mt-1.5 w-full min-w-0 rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-slate-900/[0.04] transition-all focus:border-brand-400 focus:ring-2 focus:ring-brand-400/25";

const QUICK_PERIOD_BTN =
  "rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition-all duration-200 hover:bg-slate-50 hover:shadow-md active:scale-[0.98] sm:text-sm";

function formatDateShort(ymd) {
  if (!ymd) return "—";
  try {
    const d = new Date(`${ymd}T12:00:00`);
    if (Number.isNaN(d.getTime())) return ymd;
    return new Intl.DateTimeFormat("uz-UZ", { dateStyle: "medium" }).format(d);
  } catch {
    return ymd;
  }
}

function initialMonthRange() {
  const now = new Date();
  return [toYMD(startOfMonth(now)), toYMD(endOfMonth(now))];
}

export default function XarajatlarPage() {
  const { expenses = [], updateExpense, deleteExpense } = useExpenses();
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({
    amount: "",
    type: "",
    date: "",
    comment: "",
  });
  const [expenseSaveBusy, setExpenseSaveBusy] = useState(false);
  const [dateStart, setDateStart] = useState(() => initialMonthRange()[0]);
  const [dateEnd, setDateEnd] = useState(() => initialMonthRange()[1]);
  const [filterType, setFilterType] = useState("");
  const [filterUstaId, setFilterUstaId] = useState("");
  const [exportFormat, setExportFormat] = useState("csv");

  const typeOptions = useMemo(() => {
    const s = new Set(expenses.map((e) => e.type).filter(Boolean));
    EXPENSE_TYPE_OPTIONS.forEach((t) => s.add(t));
    return [...s].sort((a, b) => a.localeCompare(b, "uz"));
  }, [expenses]);

  const ustasOptions = useMemo(() => {
    const m = new Map();
    expenses.forEach((e) => {
      if (e.ustaId && !m.has(e.ustaId)) {
        m.set(e.ustaId, e.ustaName || e.ustaId);
      }
    });
    return [...m.entries()].sort((a, b) =>
      String(a[1]).localeCompare(String(b[1]), "uz"),
    );
  }, [expenses]);

  const inDateRange = useMemo(
    () => filterExpensesByDateRange(expenses, dateStart, dateEnd),
    [expenses, dateStart, dateEnd],
  );

  const filtered = useMemo(() => {
    return inDateRange.filter((e) => {
      if (filterType && e.type !== filterType) return false;
      if (filterUstaId && e.ustaId !== filterUstaId) return false;
      return true;
    });
  }, [inDateRange, filterType, filterUstaId]);

  const totalFiltered = sumExpenseAmounts(filtered);
  const countFiltered = filtered.length;
  const projectsFiltered = uniqueProjectCount(filtered);

  const copy = SECTION_COPY.xarajatlar;

  const applyQuickToday = () => {
    const t = ymdToday();
    setDateStart(t);
    setDateEnd(t);
  };

  const applyQuickWeek = () => {
    const n = new Date();
    setDateStart(toYMD(startOfWeekMonday(n)));
    setDateEnd(toYMD(endOfWeekSunday(n)));
  };

  const applyQuickMonth = () => {
    const [s, e] = initialMonthRange();
    setDateStart(s);
    setDateEnd(e);
  };

  const applyQuickYear = () => {
    const n = new Date();
    setDateStart(toYMD(startOfYear(n)));
    setDateEnd(toYMD(endOfYear(n)));
  };

  const handleDownload = () => {
    const [from, to] = normalizeRange(dateStart, dateEnd);
    if (!from || !to) return;
    downloadExpenseReport(filtered, exportFormat, `${from}-to-${to}`);
  };

  useEffect(() => {
    if (!editTarget) return;
    setEditForm({
      amount: somDigitsOnly(String(editTarget.amount || "")),
      type: String(editTarget.type || ""),
      date: String(editTarget.date || ""),
      comment: String(editTarget.comment || ""),
    });
  }, [editTarget]);

  const ACTION_BTN =
    "rounded-lg px-3 py-1.5 text-xs font-semibold transition active:scale-[0.97]";

  const requestDeleteExpense = (ex) => {
    const ok = window.confirm(
      `${formatSomDisplay(ex.amount)} — yozuvni o‘chirishni tasdiqlaysizmi?`,
    );
    if (!ok) return;
    void deleteExpense(ex.id);
  };

  const saveExpenseEdit = async () => {
    if (!editTarget?.id || expenseSaveBusy) return;
    const amount = somDigitsOnly(editForm.amount);
    if (!amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      alert("To‘g‘ri summa kiriting.");
      return;
    }
    setExpenseSaveBusy(true);
    try {
      await updateExpense(editTarget.id, {
        amount,
        type: editForm.type.trim(),
        date: editForm.date.trim(),
        comment: editForm.comment.trim(),
      });
      setEditTarget(null);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Saqlanmadi.");
    } finally {
      setExpenseSaveBusy(false);
    }
  };

  const rangeReady = Boolean(dateStart?.trim() && dateEnd?.trim());

  return (
    <>
      <section className="rounded-[1.375rem] border border-slate-200/85 bg-gradient-to-br from-white via-white to-slate-50/80 p-6 shadow-soft-lg ring-1 ring-slate-900/[0.03] sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              {copy.title}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
              {copy.description}
            </p>
          </div>
        </div>

        <EmployeePayrollSection />

        <div className="mt-10 border-t border-slate-200/80 pt-10">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Loyiha xarajatlari
          </p>
        </div>

        <div className="mt-6 rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03] sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Hisobot va sana oralig‘i
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="min-w-0 lg:col-span-1">
              <label htmlFor="xr-start" className="block text-xs font-medium text-slate-600">
                Boshlanish sanasi
              </label>
              <input
                id="xr-start"
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                className={DATE_INPUT_CLASS}
              />
            </div>
            <div className="min-w-0 lg:col-span-1">
              <label htmlFor="xr-end" className="block text-xs font-medium text-slate-600">
                Tugash sanasi
              </label>
              <input
                id="xr-end"
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                className={DATE_INPUT_CLASS}
              />
            </div>
            <div className="min-w-0 sm:col-span-2 lg:col-span-2">
              <p className="mb-2 block text-xs font-medium text-slate-600">
                Tezkor davr
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={QUICK_PERIOD_BTN} onClick={applyQuickToday}>
                  Bugun
                </button>
                <button type="button" className={QUICK_PERIOD_BTN} onClick={applyQuickWeek}>
                  Hafta
                </button>
                <button type="button" className={QUICK_PERIOD_BTN} onClick={applyQuickMonth}>
                  Oy
                </button>
                <button type="button" className={QUICK_PERIOD_BTN} onClick={applyQuickYear}>
                  Yil
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="min-w-0 sm:max-w-[200px]">
              <label htmlFor="xr-format" className="block text-xs font-medium text-slate-600">
                Format
              </label>
              <select
                id="xr-format"
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="csv">CSV</option>
                <option value="xlsx">Excel</option>
                <option value="pdf">PDF</option>
              </select>
            </div>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!rangeReady}
              className="rounded-xl bg-gradient-to-r from-brand-600 to-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft-md transition-all hover:brightness-105 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 sm:shrink-0"
            >
              Yuklab olish
            </button>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-0 sm:max-w-[220px]">
            <label htmlFor="xf-type" className="block text-xs font-medium text-slate-600">
              Xarajat turi
            </label>
            <select
              id="xf-type"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">Hammasi</option>
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 sm:max-w-[260px]">
            <label htmlFor="xf-usta" className="block text-xs font-medium text-slate-600">
              Usta
            </label>
            <select
              id="xf-usta"
              value={filterUstaId}
              onChange={(e) => setFilterUstaId(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">Hammasi</option>
              {ustasOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03]">
            <p className="text-xs font-medium text-slate-500">Jami xarajat</p>
            <p className="mt-2 text-xl font-bold tracking-tight text-slate-900">
              {formatSomDisplay(String(totalFiltered))}
            </p>
          </div>
          <div className="rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03]">
            <p className="text-xs font-medium text-slate-500">Yozuvlar soni</p>
            <p className="mt-2 text-xl font-bold tracking-tight text-slate-900">
              {countFiltered}
            </p>
          </div>
          <div className="rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03]">
            <p className="text-xs font-medium text-slate-500">Loyihalar soni</p>
            <p className="mt-2 text-xl font-bold tracking-tight text-slate-900">
              {projectsFiltered}
            </p>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="mt-8 rounded-[1rem] border border-dashed border-slate-200/90 bg-slate-50/80 px-4 py-14 text-center shadow-inner">
            <p className="text-base font-medium text-slate-700">
              {expenses.length === 0
                ? "Hozircha xarajat yozuvlari yo‘q"
                : "Tanlangan filtrlarda yozuv yo‘q"}
            </p>
          </div>
        ) : (
          <>
            <ul className="mt-8 flex flex-col gap-3 md:hidden">
              {filtered.map((ex) => (
                <li
                  key={ex.id}
                  className="rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03]"
                >
                  <p className="font-semibold text-slate-900">
                    {formatSomDisplay(ex.amount)}{" "}
                    <span className="text-sm font-normal text-slate-500">
                      · {ex.type || "—"}
                    </span>
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    <span className="text-slate-500">Sana:</span>{" "}
                    {formatDateShort(ex.date)}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    <span className="text-slate-500">Usta:</span> {ex.ustaName || "—"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    <span className="text-slate-500">Brigada:</span>{" "}
                    {ex.brigadeName || "—"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    <span className="text-slate-500">Loyiha:</span>{" "}
                    {ex.projectName || "—"}
                  </p>
                  {ex.comment?.trim() ? (
                    <p className="mt-2 text-sm text-slate-600">
                      <span className="text-slate-500">Izoh:</span> {ex.comment}
                    </p>
                  ) : null}
                  {ex.receiptImageData &&
                  String(ex.receiptImageData).startsWith("data:") ? (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-slate-500">Chek</p>
                      <img
                        alt=""
                        src={String(ex.receiptImageData)}
                        className="mt-1 h-24 w-24 rounded-xl border border-slate-200 object-cover"
                      />
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      className={`${ACTION_BTN} border border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100`}
                      onClick={() => setEditTarget(ex)}
                    >
                      Tahrir
                    </button>
                    <button
                      type="button"
                      className={`${ACTION_BTN} border border-red-200 bg-red-50 text-red-800 hover:bg-red-100`}
                      onClick={() => requestDeleteExpense(ex)}
                    >
                      O‘chirish
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-8 hidden overflow-x-auto rounded-[1.125rem] border border-slate-200/85 bg-white shadow-soft-md ring-1 ring-slate-900/[0.03] md:block">
              <table className="w-full min-w-[1020px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/90">
                    <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">Sana</th>
                    <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">Turi</th>
                    <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">Summa</th>
                    <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">Loyiha</th>
                    <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">Usta</th>
                    <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">Brigada</th>
                    <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                      Chek
                    </th>
                    <th className="px-4 py-3.5 font-semibold text-slate-700">Izoh</th>
                    <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                      Amallar
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((ex) => (
                    <tr key={ex.id} className="border-b border-slate-100 last:border-0">
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">
                        {formatDateShort(ex.date)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">
                        {ex.type || "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 font-medium text-slate-900">
                        {formatSomDisplay(ex.amount)}
                      </td>
                      <td className="max-w-[200px] px-4 py-3.5 text-slate-600">
                        <span className="line-clamp-2" title={ex.projectName}>
                          {ex.projectName || "—"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">
                        {ex.ustaName || "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">
                        {ex.brigadeName || "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5">
                        {ex.receiptImageData &&
                        String(ex.receiptImageData).startsWith("data:") ? (
                          <img
                            alt=""
                            src={String(ex.receiptImageData)}
                            className="h-10 w-10 rounded-lg border border-slate-200 object-cover"
                          />
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="max-w-[180px] px-4 py-3.5 text-slate-500">
                        <span className="line-clamp-2" title={ex.comment}>
                          {ex.comment?.trim() || "—"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className={`${ACTION_BTN} border border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100`}
                            onClick={() => setEditTarget(ex)}
                          >
                            Tahrir
                          </button>
                          <button
                            type="button"
                            className={`${ACTION_BTN} border border-red-200 bg-red-50 text-red-800 hover:bg-red-100`}
                            onClick={() => requestDeleteExpense(ex)}
                          >
                            O‘chirish
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
      {editTarget ? (
        <AppModalBackdrop onClose={() => setEditTarget(null)} panelMaxWidthClass="max-w-md">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Xarajatni tahrirlash</h3>
            <p className="mt-1 text-xs text-slate-500">
              Loyiha / usta / chek o‘zgarmaydi (faqat summa, tur, sana, izoh).
            </p>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-600">Summa (so‘m)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={editForm.amount}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, amount: somDigitsOnly(e.target.value) }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Turi</label>
                <select
                  value={editForm.type}
                  onChange={(e) => setEditForm((f) => ({ ...f, type: e.target.value }))}
                  className={SELECT_CLASS}
                >
                  <option value="">—</option>
                  {EXPENSE_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Sana</label>
                <input
                  type="date"
                  value={editForm.date}
                  onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))}
                  className={DATE_INPUT_CLASS}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Izoh</label>
                <textarea
                  value={editForm.comment}
                  onChange={(e) => setEditForm((f) => ({ ...f, comment: e.target.value }))}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
                />
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-700"
                onClick={() => setEditTarget(null)}
              >
                Bekor
              </button>
              <button
                type="button"
                disabled={expenseSaveBusy}
                className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => void saveExpenseEdit()}
              >
                {expenseSaveBusy ? "Saqlanmoqda…" : "Saqlash"}
              </button>
            </div>
          </div>
        </AppModalBackdrop>
      ) : null}
    </>
  );
}
