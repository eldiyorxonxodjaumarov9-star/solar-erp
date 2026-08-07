/** Oylar (1–12) — o‘zbekcha nomlar */
export const MONTH_LABELS_UZ = [
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

/** @param {number} month 1–12 */
export function monthLabelUz(month) {
  const m = Math.floor(Number(month) || 0);
  return MONTH_LABELS_UZ[m - 1] || String(month);
}

/** @param {number} month 1–12 */
export function monthSlugUz(month) {
  const map = [
    "yanvar",
    "fevral",
    "mart",
    "aprel",
    "may",
    "iyun",
    "iyul",
    "avgust",
    "sentabr",
    "oktabr",
    "noyabr",
    "dekabr",
  ];
  const m = Math.floor(Number(month) || 0);
  return map[m - 1] || String(month).padStart(2, "0");
}

/**
 * Firestore Timestamp | Date | ISO | millis → Date | null
 * @param {unknown} value
 */
export function toDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "object") {
    if (typeof value.toDate === "function") {
      try {
        const d = value.toDate();
        return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
      } catch {
        return null;
      }
    }
    if (typeof value.seconds === "number") {
      return new Date(value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6));
    }
    if (typeof value._seconds === "number") {
      return new Date(value._seconds * 1000);
    }
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(value).trim();
  if (!s) return null;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** @param {Date | null} d */
export function toYmd(d) {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** @param {Date | null} d */
export function formatDisplayDate(d) {
  const ymd = toYmd(d);
  if (!ymd) return "—";
  const [y, m, day] = ymd.split("-");
  return `${day}.${m}.${y}`;
}

/**
 * Hisobot sanasi: completedAt → endDate → startDate → createdAt
 * @param {Record<string, unknown>} raw
 */
export function pickReportDate(raw) {
  const candidates = [
    raw?.completedAt,
    raw?.endDate,
    raw?.startDate,
    raw?.createdAt,
  ];
  for (const c of candidates) {
    const d = toDate(c);
    if (d) return d;
  }
  return null;
}

/** @param {Date | null} d @param {number} year @param {number | 'all'} month */
export function dateMatchesYearMonth(d, year, month) {
  if (!d) return false;
  if (d.getFullYear() !== Number(year)) return false;
  if (month === "all" || month == null || month === "") return true;
  return d.getMonth() + 1 === Number(month);
}

export function defaultReportYear() {
  return new Date().getFullYear();
}
