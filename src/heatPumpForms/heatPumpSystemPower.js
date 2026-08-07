import { SYSTEM_POWER_OPTIONS } from "./heatPumpFormLayout.js";

/** @returns {Record<string, number>} */
export function emptySystemPowerCounts() {
  return Object.fromEntries(SYSTEM_POWER_OPTIONS.map((opt) => [opt, 0]));
}

/** @param {unknown} source */
export function normalizeSystemPowerCounts(source) {
  const counts = emptySystemPowerCounts();
  const raw = source?.systemPowerCounts;

  if (raw && typeof raw === "object") {
    for (const opt of SYSTEM_POWER_OPTIONS) {
      const n = Number(raw[opt]);
      if (Number.isFinite(n) && n > 0) counts[opt] = Math.floor(n);
    }
    return counts;
  }

  if (Array.isArray(source?.systemPowerList)) {
    for (const item of source.systemPowerList) {
      const opt = String(item || "").trim();
      if (SYSTEM_POWER_OPTIONS.includes(opt)) counts[opt] += 1;
    }
    return counts;
  }

  const legacy = String(source?.systemPower || "").trim();
  if (legacy) {
    for (const part of legacy.split(",")) {
      const opt = part.trim();
      if (SYSTEM_POWER_OPTIONS.includes(opt)) counts[opt] += 1;
    }
  }

  return counts;
}

/** @param {Record<string, number>} counts */
export function expandSystemPowerCounts(counts) {
  const list = [];
  for (const opt of SYSTEM_POWER_OPTIONS) {
    const n = Number(counts?.[opt]) || 0;
    for (let i = 0; i < n; i += 1) list.push(opt);
  }
  return list;
}

/** @param {Record<string, number>} counts */
export function hasSystemPowerSelection(counts) {
  return expandSystemPowerCounts(counts).length > 0;
}

/** @param {Record<string, number>} counts */
export function formatSystemPowerSummary(counts) {
  const list = expandSystemPowerCounts(counts);
  return list.length ? list.join(", ") : "—";
}
