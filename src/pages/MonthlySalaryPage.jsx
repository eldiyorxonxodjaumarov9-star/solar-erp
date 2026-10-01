import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useSalaryReportData } from "../hooks/useSalaryReportData";
import { useExpenses } from "../hooks/useExpenses";
import AppModalBackdrop from "../components/AppModalBackdrop";
import { createExpenseId, loadPayrollDraft, persistPayrollDraft, preparePayrollExpense } from "../expenses/expenseStorage";
import { tashkentTodayYMD, tashkentMonthPrefix } from "../photos/tashkentTime";
import { applyMonthlyPayments, monthlySalaryReport } from "../workers/monthlySalary";
import { formatCurrency } from "../workers/salaryUtils";

export default function MonthlySalaryPage() {
  const { session } = useAuth();
  const [month, setMonth] = useState(() => tashkentMonthPrefix());
  const { workers, logs, expenses, loading, error } = useSalaryReportData(session);
  const report = useMemo(() => {
    if (loading || error) return { rows: [], error: "" };
    try { return { rows: applyMonthlyPayments(monthlySalaryReport(logs, workers, month, session), expenses, month), error: "" }; }
    catch (failure) { return { rows: [], error: failure.message }; }
  }, [logs, workers, expenses, month, session, loading, error]);
  const rows = report.rows;
  const reportError = error || report.error;
  const totals = rows.reduce((sum, row) => ({ total: sum.total + row.total, advance: sum.advance + row.advance, paid: sum.paid + row.paid, remaining: sum.remaining + row.remaining }), { total: 0, advance: 0, paid: 0, remaining: 0 });
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentNote, setPaymentNote] = useState("");
  const incomplete = rows.some((row) => row.missingDays > 0);
  return (
    <section className="rounded-[1.375rem] border border-slate-200/85 bg-white p-6 shadow-soft-lg sm:p-8">
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Oylik ish haqi</h2>
      <p className="mt-2 text-sm text-slate-600">Davomat va o?sha kundagi stavka asosida. Har ishchi uchun bir kunga bir marta haq hisoblanadi.</p>
      <div className="mt-6 max-w-xs">
        <label htmlFor="salary-month" className="block text-sm font-medium text-slate-700">Oy / yil (Toshkent)</label>
        <input id="salary-month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/25" />
      </div>
      {session?.role === "admin" && <button type="button" onClick={() => setPaymentOpen(true)} className="mt-4 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">To'lov qo'shish</button>}
      {paymentNote && <p role="status" className="mt-3 text-sm text-emerald-700">{paymentNote}</p>}
      {paymentOpen && session?.role === "admin" && <PayrollPaymentModal workers={workers} month={month} session={session} onClose={() => setPaymentOpen(false)} onSaved={() => { setPaymentOpen(false); setPaymentNote("To'lov xarajatlarda saqlandi."); }} />}
      {reportError ? <p role="alert" className="mt-4 text-sm text-red-600">{reportError}</p> : loading ?
        <p role="status" className="mt-4 text-sm text-slate-500">Yuklanmoqda?</p> : !month ?
        <p className="mt-4 text-sm text-slate-500">Oy va yilni tanlang.</p> : (
        <>
          {incomplete && <p role="status" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Hisob to?liq emas: stavkasiz kunlar jami haqga qo?shilmagan.</p>}
          <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-700"><tr>
                <th className="px-4 py-3">Ishchi</th><th className="px-4 py-3">Ishlagan kunlar</th>
                <th className="px-4 py-3">Stavkasiz kunlar</th><th className="px-4 py-3">Hisoblangan jami haq</th>
                <th className="px-4 py-3">Avans</th><th className="px-4 py-3">Jami to'langan</th><th className="px-4 py-3">Qolgan</th>
              </tr></thead>
              <tbody>{rows.map((row) => <tr key={row.worker.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-900">{row.worker.fullName || row.worker.name || row.worker.login}</td>
                <td className="px-4 py-3 tabular-nums">{row.workedDays}</td>
                <td className="px-4 py-3">{row.missingDays}{row.missingDays > 0 && <span className="block text-xs text-amber-700">Hisob to?liq emas</span>}</td>
                <td className="px-4 py-3 tabular-nums">{formatCurrency(row.total)}</td>
                <td className="px-4 py-3 tabular-nums">{formatCurrency(row.advance)}</td>
                <td className="px-4 py-3 tabular-nums">{formatCurrency(row.paid)}</td>
                <td className="px-4 py-3 tabular-nums"><Balance amount={row.remaining} /></td>
              </tr>)}</tbody>
              <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold"><tr>
                <td colSpan={3} className="px-4 py-3">Jami{incomplete ? " (to?liq emas)" : ""}</td>
                <td className="px-4 py-3">{formatCurrency(totals.total)}</td>
                <td className="px-4 py-3">{formatCurrency(totals.advance)}</td>
                <td className="px-4 py-3">{formatCurrency(totals.paid)}</td>
                <td className="px-4 py-3"><Balance amount={totals.remaining} /></td>
              </tr></tfoot>
            </table>
          </div>
          {rows.length === 0 && <p className="mt-4 text-sm text-slate-500">Ishchi profili topilmadi.</p>}
        </>
      )}
    </section>
  );
}

function Balance({ amount }) {
  return amount < 0 ? <span className="text-amber-700">Ortiqcha to'lov: {formatCurrency(Math.abs(amount))}</span> : formatCurrency(amount);
}

const PAYMENT_INPUT = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm disabled:bg-slate-100";

function PayrollPaymentModal({ workers, month, session, onClose, onSaved }) {
  const { addPayrollPayment } = useExpenses();
  const [draft, setDraft] = useState(() => {
    const saved = loadPayrollDraft();
    return saved?.authorLogin === session.login ? saved : {
      authorLogin: session.login,
      id: `payroll-${createExpenseId()}`, amount: "", date: tashkentTodayYMD(),
      payrollWorkerId: "", payrollMonth: month, payrollPaymentType: "advance", submitted: false,
    };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  useEffect(() => { persistPayrollDraft(draft); }, [draft]);
  const change = (field) => (event) => setDraft((previous) => ({ ...previous, [field]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError("");
    try {
      const input = draft.submitted ? draft : preparePayrollExpense(draft, session);
      if (!draft.submitted && !workers.some((worker) => String(worker.id) === input.payrollWorkerId)) {
        throw new Error("Pul oluvchi ishchi topilmadi.");
      }
      const pending = { ...input, authorLogin: session.login, submitted: true };
      // Persist before starting the write, so reloads retain the same operation.
      persistPayrollDraft(pending);
      setDraft(pending);
      await addPayrollPayment(pending, session);
      persistPayrollDraft(null);
      onSaved();
    } catch (failure) { setError(failure?.message || "To'lov saqlanmadi. Qayta urinib ko'ring."); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const locked = busy || draft.submitted;
  return <AppModalBackdrop onClose={busy ? () => {} : onClose} panelMaxWidthClass="max-w-lg">
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
      <h3 className="text-lg font-semibold text-slate-900">To'lov qo'shish</h3>
      <div className="mt-4 space-y-3">
        <label className="block text-sm text-slate-700">Pul oluvchi ishchi
          <select required value={draft.payrollWorkerId} onChange={change("payrollWorkerId")} disabled={locked} className={PAYMENT_INPUT}>
            <option value="">Ishchini tanlang</option>
            {workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.fullName || worker.name || worker.login}</option>)}
          </select>
        </label>
        <label className="block text-sm text-slate-700">Summa (so'm)
          <input required type="number" min="1" step="1" value={draft.amount} onChange={change("amount")} disabled={locked} className={PAYMENT_INPUT} />
        </label>
        <label className="block text-sm text-slate-700">Haqiqiy to'lov sanasi
          <input required type="date" value={draft.date} onChange={change("date")} disabled={locked} className={PAYMENT_INPUT} />
        </label>
        <label className="block text-sm text-slate-700">Ish haqi oyi
          <input required type="month" value={draft.payrollMonth} onChange={change("payrollMonth")} disabled={locked} className={PAYMENT_INPUT} />
        </label>
        <label className="block text-sm text-slate-700">To'lov turi
          <select value={draft.payrollPaymentType} onChange={change("payrollPaymentType")} disabled={locked} className={PAYMENT_INPUT}>
            <option value="advance">Avans</option><option value="salary">Ish haqi</option>
          </select>
        </label>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      {draft.submitted && !busy && <p className="mt-3 text-xs text-slate-500">Qayta yuborishda shu to'lov tekshiriladi va takroriy xarajat yaratilmaydi.</p>}
      <div className="mt-5 flex gap-2">
        <button type="button" disabled={busy} onClick={onClose} className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm">Yopish</button>
        <button type="submit" disabled={busy} className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saqlanmoqda..." : draft.submitted ? "Qayta yuborish" : "Saqlash"}</button>
      </div>
    </form>
  </AppModalBackdrop>;
}
