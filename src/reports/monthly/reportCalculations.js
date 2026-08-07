import { normalizeRegionLabel } from "../../data/regionDistricts.js";
import { MONTH_LABELS_UZ, dateMatchesYearMonth } from "./dateHelpers.js";
import { POWER_RANGES, powerRangeForKw } from "./powerRangeHelpers.js";
import {
  isCompletedStatus,
  isInProgressStatus,
  normalizeSystemType,
} from "./projectNormalizer.js";

/**
 * @typedef {import('./projectNormalizer.js').normalizeProject extends Function ? ReturnType<import('./projectNormalizer.js')['normalizeProject']> : never} NormalizedProject
 */

/**
 * @param {ReturnType<import('./projectNormalizer.js')['normalizeProject']>[]} projects
 * @param {{
 *   year: number;
 *   month: number | 'all';
 *   systemType: string;
 *   status: string;
 *   region: string;
 *   district: string;
 * }} filters
 */
export function filterProjects(projects, filters) {
  const year = Number(filters.year);
  const month = filters.month === "all" ? "all" : Number(filters.month);
  const systemType = String(filters.systemType || "Barchasi");
  const status = String(filters.status || "Barchasi");
  const region = String(filters.region || "Barchasi");
  const district = String(filters.district || "Barchasi");

  return (projects || []).filter((p) => {
    if (!dateMatchesYearMonth(p.reportDate, year, month)) return false;
    if (systemType !== "Barchasi" && p.systemType !== systemType) return false;
    if (status !== "Barchasi" && p.status !== status) return false;
    if (region !== "Barchasi") {
      const pr = normalizeRegionLabel(p.region || "");
      const fr = normalizeRegionLabel(region);
      const prL = String(p.region || "").toLowerCase();
      const frL = region.toLowerCase();
      if (pr !== fr && prL !== frL && !prL.includes(frL) && !frL.includes(prL)) {
        return false;
      }
    }
    if (district !== "Barchasi") {
      const pd = String(p.district || "").toLowerCase();
      const fd = district.toLowerCase();
      if (pd !== fd && !pd.includes(fd) && !fd.includes(pd)) return false;
    }
    return true;
  });
}

/**
 * @param {ReturnType<import('./projectNormalizer.js')['normalizeProject']>[]} projects
 */
export function computeKpis(projects) {
  const list = projects || [];
  const totalProjects = list.length;
  const powers = list.map((p) => Number(p.stationPower) || 0);
  const totalKw = powers.reduce((a, b) => a + b, 0);
  const averageKw = totalProjects ? totalKw / totalProjects : 0;
  const positive = powers.filter((n) => n > 0);
  const maxKw = positive.length ? Math.max(...positive) : 0;
  const minKw = positive.length ? Math.min(...positive) : 0;

  let completed = 0;
  let inProgress = 0;
  let solar = 0;
  let heatPump = 0;
  for (const p of list) {
    if (isCompletedStatus(p.status)) completed += 1;
    if (isInProgressStatus(p.status)) inProgress += 1;
    const st = normalizeSystemType(p.systemType);
    if (st === "Quyosh paneli") solar += 1;
    if (st === "Issiqlik nasosi") heatPump += 1;
  }

  return {
    totalProjects,
    totalKw,
    averageKw,
    maxKw,
    minKw,
    completed,
    inProgress,
    solar,
    heatPump,
  };
}

/**
 * 12 oy bo‘yicha (tanlangan yil + boshqa filterlar; oy filtri o‘chirilgan holda).
 * @param {ReturnType<import('./projectNormalizer.js')['normalizeProject']>[]} yearFiltered
 */
export function buildMonthlyBreakdown(yearFiltered) {
  const byMonth = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    label: MONTH_LABELS_UZ[i],
    count: 0,
    totalKw: 0,
    averageKw: 0,
    completed: 0,
    inProgress: 0,
  }));

  for (const p of yearFiltered || []) {
    if (!p.reportDate) continue;
    const m = p.reportDate.getMonth();
    const row = byMonth[m];
    row.count += 1;
    row.totalKw += Number(p.stationPower) || 0;
    if (isCompletedStatus(p.status)) row.completed += 1;
    if (isInProgressStatus(p.status)) row.inProgress += 1;
  }

  for (const row of byMonth) {
    row.averageKw = row.count ? row.totalKw / row.count : 0;
  }
  return byMonth;
}

/**
 * @param {ReturnType<import('./projectNormalizer.js')['normalizeProject']>[]} projects
 */
export function buildPowerRangeBreakdown(projects) {
  const total = (projects || []).length || 1;
  return POWER_RANGES.map((range) => {
    const items = (projects || []).filter((p) => {
      const r = powerRangeForKw(p.stationPower);
      return r && r.id === range.id;
    });
    const totalKw = items.reduce((a, p) => a + (Number(p.stationPower) || 0), 0);
    const bySystem = {};
    for (const p of items) {
      const st = p.systemType || "Boshqa";
      bySystem[st] = (bySystem[st] || 0) + 1;
    }
    return {
      id: range.id,
      label: range.label,
      count: items.length,
      totalKw,
      sharePct: (items.length / total) * 100,
      bySystem,
    };
  });
}

/**
 * @param {ReturnType<import('./projectNormalizer.js')['normalizeProject']>[]} projects
 */
export function buildSystemTypeBreakdown(projects) {
  const map = new Map();
  for (const p of projects || []) {
    const key = p.systemType || "Boshqa";
    if (!map.has(key)) {
      map.set(key, {
        systemType: key,
        count: 0,
        totalKw: 0,
        averageKw: 0,
        completed: 0,
        inProgress: 0,
      });
    }
    const row = map.get(key);
    row.count += 1;
    row.totalKw += Number(p.stationPower) || 0;
    if (isCompletedStatus(p.status)) row.completed += 1;
    if (isInProgressStatus(p.status)) row.inProgress += 1;
  }
  const rows = Array.from(map.values()).map((r) => ({
    ...r,
    averageKw: r.count ? r.totalKw / r.count : 0,
  }));
  rows.sort((a, b) => b.count - a.count || a.systemType.localeCompare(b.systemType));
  return rows;
}

/**
 * @param {ReturnType<import('./projectNormalizer.js')['normalizeProject']>[]} projects
 * @param {string} search
 * @param {'date'|'power'|'name'} sortBy
 * @param {'asc'|'desc'} sortDir
 */
export function sortAndSearchProjects(projects, search, sortBy, sortDir) {
  const q = String(search || "")
    .trim()
    .toLowerCase();
  let list = projects || [];
  if (q) {
    list = list.filter((p) => {
      return (
        String(p.clientName || "")
          .toLowerCase()
          .includes(q) ||
        String(p.phone || "")
          .toLowerCase()
          .includes(q) ||
        String(p.id || "")
          .toLowerCase()
          .includes(q) ||
        String(p.projectNumber || "")
          .toLowerCase()
          .includes(q)
      );
    });
  }

  const dir = sortDir === "asc" ? 1 : -1;
  const sorted = [...list].sort((a, b) => {
    if (sortBy === "power") {
      return ((Number(a.stationPower) || 0) - (Number(b.stationPower) || 0)) * dir;
    }
    if (sortBy === "name") {
      return String(a.clientName || "").localeCompare(String(b.clientName || ""), "uz") * dir;
    }
    const da = a.reportDateYmd || "";
    const db = b.reportDateYmd || "";
    return da.localeCompare(db) * dir;
  });
  return sorted;
}

/** @param {number} n @param {number} [digits] */
export function formatKw(n, digits = 2) {
  const v = Number(n) || 0;
  return `${v.toLocaleString("uz-UZ", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  })} kW`;
}

/** @param {number} n */
export function formatPct(n) {
  return `${(Number(n) || 0).toFixed(1)}%`;
}
