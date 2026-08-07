import {
  addDaysToYMD,
  tashkentMonthPrefix,
  tashkentTodayYMD,
  tashkentWeekRangeForInstant,
} from "../photos/tashkentTime";

/**
 * @param {string} dateKey YYYY-MM-DD
 * @param {'today'|'yesterday'|'week'|'month'|'pick'} mode
 * @param {string} pickYmd
 */
export function workLogDateKeyMatches(dateKey, mode, pickYmd) {
  const dk = String(dateKey || "").trim();
  if (!dk) return false;
  const today = tashkentTodayYMD();
  if (mode === "today") return dk === today;
  if (mode === "yesterday") return dk === addDaysToYMD(today, -1);
  if (mode === "week") {
    const { start, end } = tashkentWeekRangeForInstant(new Date());
    return Boolean(start && end && dk >= start && dk <= end);
  }
  if (mode === "month") {
    const pref = tashkentMonthPrefix(new Date());
    return Boolean(pref && dk.startsWith(pref));
  }
  if (mode === "pick") {
    const p = String(pickYmd || "").trim();
    return Boolean(p && dk === p);
  }
  return false;
}
