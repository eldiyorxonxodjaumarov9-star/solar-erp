/** Quvvat diapazonlari (kW) */
export const POWER_RANGES = [
  { id: "1-5", label: "1–5 kW", min: 1, max: 5 },
  { id: "6-10", label: "6–10 kW", min: 6, max: 10 },
  { id: "11-20", label: "11–20 kW", min: 11, max: 20 },
  { id: "21-30", label: "21–30 kW", min: 21, max: 30 },
  { id: "31-50", label: "31–50 kW", min: 31, max: 50 },
  { id: "51-75", label: "51–75 kW", min: 51, max: 75 },
  { id: "76-100", label: "76–100 kW", min: 76, max: 100 },
  { id: "100+", label: "100 kW dan yuqori", min: 100.0001, max: Infinity },
];

/**
 * @param {number} kw
 * @returns {typeof POWER_RANGES[number] | null}
 */
export function powerRangeForKw(kw) {
  const n = Number(kw) || 0;
  if (n <= 0) return null;
  for (const r of POWER_RANGES) {
    if (n >= r.min && n <= r.max) return r;
  }
  return POWER_RANGES[POWER_RANGES.length - 1];
}
