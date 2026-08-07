/** @param {Date} d */
export function toYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ymdToday() {
  return toYMD(new Date());
}

/** Monday-start week (ISO-style week starting Monday). */
export function startOfWeekMonday(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

export function endOfWeekSunday(d) {
  const s = startOfWeekMonday(d);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  return e;
}

export function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function startOfYear(d) {
  return new Date(d.getFullYear(), 0, 1);
}

export function endOfYear(d) {
  return new Date(d.getFullYear(), 11, 31);
}

/** @returns {[string, string]} normalized start, end (inclusive) */
export function normalizeRange(startYmd, endYmd) {
  const a = String(startYmd || "").trim();
  const b = String(endYmd || "").trim();
  if (!a || !b) return [a, b];
  return a <= b ? [a, b] : [b, a];
}

/**
 * @param {{ date: string }[]} expenses
 * @param {string} startYmd
 * @param {string} endYmd
 */
export function filterExpensesByDateRange(expenses, startYmd, endYmd) {
  const [from, to] = normalizeRange(startYmd, endYmd);
  if (!from || !to) return [];
  return expenses.filter((e) => e.date >= from && e.date <= to);
}
