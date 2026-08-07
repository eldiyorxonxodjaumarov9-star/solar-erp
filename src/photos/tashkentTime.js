/** Asia/Tashkent — DST yo‘q (UTC+5). */
export const TASHKENT_TZ = "Asia/Tashkent";

/** @param {Date|string|number} instant */
export function instantToTashkentYMD(instant) {
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TASHKENT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** “Bugungi” sana YYYY-MM-DD (Toshkent). */
export function tashkentTodayYMD() {
  return instantToTashkentYMD(new Date());
}

/** @param {Date|string|number} instant */
export function formatTashkentDateTime(instant) {
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("uz-UZ", {
    timeZone: TASHKENT_TZ,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

/** @param {Date|string|number} instant */
export function formatTashkentDateMedium(instant) {
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("uz-UZ", {
    timeZone: TASHKENT_TZ,
    dateStyle: "medium",
  }).format(d);
}

/** Kalendar kuniga kun qo‘shish (YYYY-MM-DD sifatida, Toshkent bilan bog‘liq noon UTC). */
export function addDaysToYMD(ymd, deltaDays) {
  const [y, m, d] = String(ymd).split("-").map(Number);
  if (!y || !m || !d) return "";
  const noonUtcMs = Date.UTC(y, m - 1, d, 7, 0, 0);
  const t = new Date(noonUtcMs + deltaDays * 86400000);
  const yy = t.getUTCFullYear();
  const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(t.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Toshkent sanasi bo‘yicha joriy hafta (dushanba–yakshanba). @returns {{ start: string, end: string }} */
export function tashkentWeekRangeForInstant(instant = new Date()) {
  const today = instantToTashkentYMD(instant);
  if (!today) return { start: "", end: "" };
  const anchor = new Date(`${today}T07:00:00Z`);
  const dow = anchor.getUTCDay();
  const mondayOffset = (dow + 6) % 7;
  const start = addDaysToYMD(today, -mondayOffset);
  const end = addDaysToYMD(start, 6);
  return { start, end };
}

/** @returns {string} YYYY-MM */
export function tashkentMonthPrefix(instant = new Date()) {
  const ymd = instantToTashkentYMD(instant);
  return ymd.slice(0, 7);
}

/**
 * @param {string} photoYmd uploadDate dan olingan Toshkent YMD
 * @param {'today'|'pick'|'week'|'month'} mode
 * @param {string} pickYmd mode pick uchun
 */
/** Toshkent bo‘yicha tunning boshidan berilgan vaqt (sekund). */
export function tashkentSecondsFromMidnight(instant) {
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return 0;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TASHKENT_TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = parseInt(
    parts.find((p) => p.type === "hour")?.value ?? "0",
    10,
  );
  const m = parseInt(
    parts.find((p) => p.type === "minute")?.value ?? "0",
    10,
  );
  const s = parseInt(
    parts.find((p) => p.type === "second")?.value ?? "0",
    10,
  );
  return h * 3600 + m * 60 + s;
}

export function photoMatchesPeriod(photoYmd, mode, pickYmd) {
  if (!photoYmd) return false;
  const today = tashkentTodayYMD();
  if (mode === "today") return photoYmd === today;
  if (mode === "pick") {
    const p = String(pickYmd || "").trim();
    return p && photoYmd === p;
  }
  if (mode === "week") {
    const { start, end } = tashkentWeekRangeForInstant(new Date());
    return start && end && photoYmd >= start && photoYmd <= end;
  }
  if (mode === "month") {
    const pref = tashkentMonthPrefix(new Date());
    return pref && photoYmd.startsWith(pref);
  }
  return false;
}
