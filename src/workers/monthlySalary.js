import { attendanceDate, calculateAttendanceSalary } from "./attendanceSalary.js";

export function monthlySalaryReport(logs, workers, month, session) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
  const visible = session?.role === "admin" ? workers : session?.role === "usta"
    ? workers.filter((worker) => String(worker.id) === String(session.workerId || "")) : [];
  const ids = new Set(visible.map((worker) => String(worker.id)));
  const selected = logs.filter((log) => ids.has(String(log.ustaId)) && attendanceDate(log).startsWith(`${month}-`));
  const calculated = calculateAttendanceSalary(selected, visible);
  const rows = new Map(visible.map((worker) => [String(worker.id), {
    worker, days: new Set(), missing: new Set(), total: 0,
  }]));
  for (const log of selected) {
    const pay = calculated.rows.get(log);
    if (pay.status === "absent" || !pay.date) continue;
    const row = rows.get(String(log.ustaId));
    row.days.add(pay.date);
    if (pay.status === "missing-rate") row.missing.add(pay.date);
    row.total += pay.amount;
  }
  return [...rows.values()].map((row) => ({
    worker: row.worker, workedDays: row.days.size, missingDays: row.missing.size, total: row.total,
  }));
}

/** Payments belong to payrollMonth; date is only the actual payment date. */
export function applyMonthlyPayments(rows, expenses, month) {
  const payments = new Map(rows.map((row) => [String(row.worker.id), { advance: 0, paid: 0 }]));
  const seen = new Set();
  for (const expense of expenses) {
    const id = String(expense.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const payment = payments.get(String(expense.payrollWorkerId || ""));
    if (!payment || expense.payrollMonth !== month ||
        !["advance", "salary"].includes(expense.payrollPaymentType)) continue;
    const amount = Number(String(expense.amount ?? "").replace(/\s/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("To'lov summasi noto'g'ri. Xarajat qaydini tekshiring.");
    }
    if (expense.payrollPaymentType === "advance") payment.advance += amount;
    payment.paid += amount;
  }
  return rows.map((row) => {
    const payment = payments.get(String(row.worker.id));
    return { ...row, ...payment, remaining: row.total - payment.paid };
  });
}
