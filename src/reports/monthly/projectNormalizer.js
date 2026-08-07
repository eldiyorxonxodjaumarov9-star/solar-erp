import { regionDistrictFromAddress } from "../../projects/regionFromAddress.js";
import { pickReportDate, toYmd } from "./dateHelpers.js";

/** Holat filtrlari (UI) */
export const STATUS_FILTER_OPTIONS = [
  "Barchasi",
  "Yangi",
  "Jarayonda",
  "Tugallangan",
  "Tekshiruvda",
  "Muammo bor",
];

/** Standart sistema turlari (filtr) */
export const SYSTEM_TYPE_PRESETS = [
  "Quyosh paneli",
  "Issiqlik nasosi",
  "On-Grid",
  "Off-Grid",
  "Hybrid",
  "Boshqa",
];

/**
 * @param {unknown} value
 * @returns {number} NaN emas — 0 yoki musbat
 */
export function parseStationPower(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 0 ? 0 : value;
  }
  const s = String(value ?? "")
    .trim()
    .replace(",", ".")
    .replace(/\s+/g, "")
    .replace(/kvt|kw|квт/gi, "");
  if (!s) return 0;
  const n = parseFloat(s.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/**
 * @param {unknown} raw
 */
export function normalizeStatus(raw) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!s) return "Yangi";
  if (
    s.includes("muammo") ||
    s.includes("problem") ||
    s.includes("xato")
  ) {
    return "Muammo bor";
  }
  if (
    s.includes("tekshir") ||
    s.includes("review") ||
    s.includes("nazorat")
  ) {
    return "Tekshiruvda";
  }
  if (
    s.includes("tugall") ||
    s.includes("yakun") ||
    s === "done" ||
    s === "completed"
  ) {
    return "Tugallangan";
  }
  if (
    s.includes("jarayon") ||
    s.includes("ijro") ||
    s.includes("progress") ||
    s.includes("active")
  ) {
    return "Jarayonda";
  }
  if (
    s.includes("reja") ||
    s.includes("yangi") ||
    s.includes("new") ||
    s.includes("planned")
  ) {
    return "Yangi";
  }
  return String(raw).trim() || "Yangi";
}

export function isCompletedStatus(status) {
  return normalizeStatus(status) === "Tugallangan";
}

export function isInProgressStatus(status) {
  const n = normalizeStatus(status);
  return n === "Jarayonda" || n === "Tekshiruvda";
}

/**
 * @param {unknown} raw
 */
export function normalizeSystemType(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "Boshqa";
  const lower = s.toLowerCase();
  if (
    lower.includes("issiqlik") ||
    lower.includes("heat") ||
    lower.includes("nasos") ||
    lower.includes("pump")
  ) {
    return "Issiqlik nasosi";
  }
  if (lower.includes("on-grid") || lower.includes("ongrid") || lower === "on grid") {
    return "On-Grid";
  }
  if (lower.includes("off-grid") || lower.includes("offgrid") || lower === "off grid") {
    return "Off-Grid";
  }
  if (lower.includes("hybrid") || lower.includes("gibrid")) {
    return "Hybrid";
  }
  if (
    lower.includes("quyosh") ||
    lower.includes("solar") ||
    lower.includes("panel") ||
    lower.includes("pv")
  ) {
    return "Quyosh paneli";
  }
  return s;
}

/**
 * Eski/yangi projects fieldlarini bir xil shaklga keltiradi.
 * @param {Record<string, unknown>} project
 */
export function normalizeProject(project) {
  const raw = project && typeof project === "object" ? project : {};
  const id = String(raw.id || "").trim();

  const clientName = String(
    raw.clientName || raw.mijoz || raw.customerName || raw.name || "",
  ).trim();

  const phone = String(raw.phone || raw.telefon || raw.tel || "").trim();

  const stationPower = parseStationPower(
    raw.stationPower ?? raw.powerKw ?? raw.power ?? raw.kw ?? raw.quvvat,
  );

  const systemType = normalizeSystemType(
    raw.systemType ?? raw.projectType ?? raw.type ?? raw.sistemaTuri,
  );

  const status = normalizeStatus(raw.status ?? raw.holat ?? raw.state);

  let region = String(raw.region || raw.viloyat || "").trim();
  let district = String(raw.district || raw.tuman || "").trim();
  if (!region || !district) {
    const fromAddr = regionDistrictFromAddress(String(raw.address || ""));
    if (!region) region = fromAddr.viloyat;
    if (!district) district = fromAddr.district;
  }

  const reportDate = pickReportDate(raw);
  const reportDateYmd = toYmd(reportDate);

  const brigadeId = String(raw.brigadeId || "").trim();
  const brigadeName = String(
    raw.brigadeName || raw.brigada || raw.brigade || "",
  ).trim();

  const masterIds = Array.isArray(raw.masterIds)
    ? raw.masterIds.map((x) => String(x).trim()).filter(Boolean)
    : Array.isArray(raw.assignedWorkerIds)
      ? raw.assignedWorkerIds.map((x) => String(x).trim()).filter(Boolean)
      : [];

  return {
    id,
    clientName,
    phone,
    stationPower,
    systemType,
    status,
    region,
    district,
    reportDate,
    reportDateYmd,
    brigadeId,
    brigadeName: brigadeName || "—",
    masterIds,
    startDate: raw.startDate,
    endDate: raw.endDate,
    createdAt: raw.createdAt,
    completedAt: raw.completedAt,
    address: String(raw.address || "").trim(),
    projectNumber: String(raw.projectNumber || raw.number || "").trim(),
    _raw: raw,
  };
}

/** @param {unknown[]} list */
export function normalizeProjectsList(list) {
  return (Array.isArray(list) ? list : [])
    .map(normalizeProject)
    .filter((p) => p.id);
}
