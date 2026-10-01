import { instantToTashkentYMD } from "../photos/tashkentTime.js";

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// dateKey is an explicitly stored/corrected Tashkent calendar date.
export function attendanceDate(log) {
  return validDate(log.dateKey) ? log.dateKey :
    log.loginTime ? instantToTashkentYMD(log.loginTime) : "";
}

export function salaryRateOnDate(worker, date) {
  if (!worker || !validDate(date)) return null;
  const rates = [...(Array.isArray(worker.salaryHistory) ? worker.salaryHistory : []), {
    salary: worker.salary,
    workingDays: worker.workingDays,
    effectiveDate: worker.salaryEffectiveDate,
  }];
  let selected = null;
  for (const rate of rates) {
    if (!validDate(rate?.effectiveDate) || rate.effectiveDate > date) continue;
    const salary = Number(rate.salary);
    const days = Number(rate.workingDays);
    if (!Number.isFinite(salary) || salary < 0 || !Number.isInteger(days) || days <= 0) continue;
    if (!selected || rate.effectiveDate >= selected.effectiveDate) {
      selected = { ...rate, dailySalary: salary / days };
    }
  }
  return selected;
}

// Charge one arrival per worker/calendar day, independent of project or session.
// Results are derived only; editing/deleting attendance immediately recalculates them.
export function calculateAttendanceSalary(logs, workers) {
  const byWorker = new Map(workers.map((worker) => [String(worker.id), worker]));
  const charged = new Set();
  const rows = new Map();
  let total = 0;
  const ordered = [...logs].sort((a, b) =>
    String(a.loginTime || "").localeCompare(String(b.loginTime || "")) ||
    String(a.id || "").localeCompare(String(b.id || "")));
  for (const log of ordered) {
    const workerId = String(log.ustaId || "").trim();
    const date = attendanceDate(log);
    const arrived = !!log.loginTime && Number.isFinite(new Date(log.loginTime).getTime());
    const key = `${workerId}|${date}`;
    const rate = salaryRateOnDate(byWorker.get(workerId), date);
    let amount = 0;
    let status = "absent";
    if (arrived) {
      if (!rate) status = "missing-rate";
      else if (charged.has(key)) status = "duplicate";
      else {
        status = "paid";
        amount = rate.dailySalary;
        charged.add(key);
      }
    }
    rows.set(log, { amount, status, date });
    total += amount;
  }
  return { rows, total };
}
