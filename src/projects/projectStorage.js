import { migrateReadStorage } from "../storage/migrateReadStorage";

export const PROJECTS_STORAGE_KEY = "projects";

export const PROJECTS_LEGACY_KEY = "solar-erp-projects";

export const PROJECTS_CHANGED_EVENT = "solar-erp-projects-changed";

/** Holat qiymatlari (Holat maydoni) */
export const PROJECT_HOLAT_OPTIONS = [
  "Rejalashtirilgan",
  "Jarayonda",
  "Ijroda",
  "Tugallangan",
];

/**
 * @typedef {{
 *   id: string;
 *   projectNumber: string;
 *   clientName: string;
 *   phone: string;
 *   address: string;
 *   holat: string;
 *   brigadeId: string;
 *   brigadeName: string;
 *   ustaId: string;
 *   ustaName: string;
 *   assignedWorkerId: string;
 *   powerKw: string;
 *   paymentSom: string;
 *   systemType: string;
 *   startDate: string;
 *   endDate: string;
 *   izoh: string;
 *   createdAt: string;
 * }} Project
 */

/** Faqat raqamlar (saqlash uchun “xom” qiymat) */
export function somDigitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

/** Bo‘shliqlar bilan ajratilgan ko‘rinish (kirish / ro‘yxat) */
export function formatSomWithSpaces(digitsString) {
  const d = somDigitsOnly(digitsString);
  if (!d) return "";
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Ro‘yxat va dashboard uchun */
export function formatSomDisplay(rawDigits) {
  const d = somDigitsOnly(rawDigits);
  if (!d) return "0 so‘m";
  return `${formatSomWithSpaces(d)} so‘m`;
}

/** Loyiha raqami taqqoslash (#001 va #1 bir xil deb qabul qilinadi) */
export function projectNumberKey(s) {
  const d = somDigitsOnly(s);
  if (!d) return "";
  const n = parseInt(d, 10);
  return Number.isNaN(n) ? d : String(n);
}

/** @returns {Project[]} */
export function loadProjects() {
  try {
    const raw = migrateReadStorage(PROJECTS_STORAGE_KEY, PROJECTS_LEGACY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const normalized = parsed
      .filter((p) => p && typeof p === "object")
      .map((p) => ({
        id: typeof p.id === "string" ? p.id : "",
        projectNumber:
          typeof p.projectNumber === "string" ? p.projectNumber : "",
        clientName: typeof p.clientName === "string" ? p.clientName : "",
        phone: typeof p.phone === "string" ? p.phone : "",
        address: typeof p.address === "string" ? p.address : "",
        holat: typeof p.holat === "string" ? p.holat : "",
        brigadeId: typeof p.brigadeId === "string" ? p.brigadeId : "",
        brigadeName: typeof p.brigadeName === "string" ? p.brigadeName : "",
        ustaId:
          typeof p.ustaId === "string"
            ? p.ustaId
            : typeof p.assignedWorkerId === "string"
              ? p.assignedWorkerId
              : "",
        ustaName: typeof p.ustaName === "string" ? p.ustaName : "",
        assignedWorkerId:
          typeof p.assignedWorkerId === "string" ? p.assignedWorkerId : "",
        powerKw: typeof p.powerKw === "string" ? p.powerKw : "",
        paymentSom:
          typeof p.paymentSom === "string"
            ? p.paymentSom
            : typeof p.paymentUsd === "string"
              ? String(
                  Math.max(
                    0,
                    Math.round(
                      Number(String(p.paymentUsd).replace(/\s/g, "")) || 0,
                    ),
                  ),
                )
              : "0",
        systemType: typeof p.systemType === "string" ? p.systemType : "",
        startDate: typeof p.startDate === "string" ? p.startDate : "",
        endDate: typeof p.endDate === "string" ? p.endDate : "",
        izoh: typeof p.izoh === "string" ? p.izoh : "",
        createdAt: typeof p.createdAt === "string" ? p.createdAt : "",
        assignedWorkerIds: (() => {
          const raw = Array.isArray(p.assignedWorkerIds)
            ? p.assignedWorkerIds.map((x) => String(x).trim()).filter(Boolean)
            : [];
          const seen = new Set();
          const out = [];
          for (const id of raw) {
            if (seen.has(id)) continue;
            seen.add(id);
            out.push(id);
          }
          return out;
        })(),
        ustaNames: Array.isArray(p.ustaNames)
          ? p.ustaNames.map((x) => String(x))
          : [],
        crewChangeLog: Array.isArray(p.crewChangeLog) ? p.crewChangeLog : [],
      }))
      .filter((p) => p.id);

    let maxPn = 0;
    for (const p of normalized) {
      const d = somDigitsOnly(p.projectNumber);
      if (d) {
        const n = parseInt(d, 10);
        if (!Number.isNaN(n)) maxPn = Math.max(maxPn, n);
      }
    }

    return normalized.map((p) => {
      let projectNumber = somDigitsOnly(p.projectNumber);
      if (!projectNumber) {
        maxPn += 1;
        projectNumber = String(maxPn);
      }
      const paymentRaw = somDigitsOnly(p.paymentSom);
      const paymentSom = paymentRaw
        ? String(Math.max(0, Math.round(Number(paymentRaw) || 0)))
        : "0";

      return {
        id: p.id,
        projectNumber,
        clientName: p.clientName,
        phone: p.phone,
        address: p.address,
        holat: p.holat,
        brigadeId: p.brigadeId,
        brigadeName: p.brigadeName || "",
        ustaId: p.ustaId || p.assignedWorkerId || "",
        ustaName: p.ustaName || "",
        assignedWorkerId: p.assignedWorkerId || p.ustaId || "",
        powerKw: p.powerKw,
        paymentSom,
        systemType: p.systemType,
        startDate: p.startDate,
        endDate: p.endDate,
        izoh: p.izoh,
        createdAt: p.createdAt,
        assignedWorkerIds: (() => {
          const raw = Array.isArray(p.assignedWorkerIds)
            ? p.assignedWorkerIds.map((x) => String(x).trim()).filter(Boolean)
            : [];
          const seen = new Set();
          const out = [];
          for (const id of raw) {
            if (seen.has(id)) continue;
            seen.add(id);
            out.push(id);
          }
          return out;
        })(),
        ustaNames: Array.isArray(p.ustaNames)
          ? p.ustaNames.map((x) => String(x))
          : [],
        crewChangeLog: Array.isArray(p.crewChangeLog) ? p.crewChangeLog : [],
      };
    });
  } catch {
    return [];
  }
}

/** @param {Project[]} list */
export function persistProjects(list) {
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(PROJECTS_CHANGED_EVENT));
}

export function createProjectId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** @param {string} holat */
export function isCompletedHolat(holat) {
  const s = String(holat || "")
    .trim()
    .toLowerCase();
  return s === "tugallangan" || s === "tugallandi" || s === "yakunlangan";
}

/** Jarayondagi: tugallanmagan loyihalar */
/** @param {string} holat */
export function isInProgressHolat(holat) {
  return !isCompletedHolat(holat);
}

/** Admin ro‘yxati: yangi/faol loyihalar yuqorida, tugallanganlar pastda. */
export function projectListSortKey(p) {
  const num = Number.parseInt(projectNumberKey(p?.projectNumber ?? ""), 10);
  if (Number.isFinite(num) && num > 0) return num;
  const ymd = String(p?.startDate || p?.endDate || p?.createdAt || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    return new Date(`${ymd}T12:00:00`).getTime();
  }
  return 0;
}

/** @param {Project[]} projects */
export function sortProjectsForList(projects) {
  return [...projects].sort((a, b) => {
    const aDone = isCompletedHolat(a?.holat) ? 1 : 0;
    const bDone = isCompletedHolat(b?.holat) ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return projectListSortKey(b) - projectListSortKey(a);
  });
}

/** @param {Project[]} projects */
export function sumProjectPaymentsSom(projects) {
  return projects.reduce((acc, p) => {
    const n = Math.round(Number(somDigitsOnly(p.paymentSom)) || 0);
    return acc + Math.max(0, n);
  }, 0);
}

/**
 * Loyihalar soni va jami kW — brigadaga biriktirilgan loyihalar bo‘yicha.
 * @param {string} brigadeId
 * @param {Project[]} projects
 */
export function brigadeProjectAggregates(brigadeId, projects) {
  const id = String(brigadeId || "").trim();
  const list = !id ? [] : projects.filter((p) => p.brigadeId === id);
  let totalKw = 0;
  for (const p of list) {
    const n = parseFloat(String(p.powerKw ?? "").replace(",", "."));
    totalKw += Number.isFinite(n) ? n : 0;
  }
  return { projectCount: list.length, totalKw };
}

/** Loyiha shu ustaga biriktirilganmi yoki brigada umumiy ekanligi. */
/** @param {Project} p */
export function projectVisibleToWorker(p, workerId, workerBrigadeId) {
  const wid = String(p.ustaId || p.assignedWorkerId || "").trim();
  const wSid = String(workerId || "").trim();
  const crew = Array.isArray(p.assignedWorkerIds)
    ? p.assignedWorkerIds.map((x) => String(x))
    : [];
  if (crew.includes(wSid)) return true;
  if (wid) return wid === wSid;
  return false;
}

/**
 * @param {string} workerId
 * @param {string} workerBrigadeId
 * @param {Project[]} projects
 */
export function workerProjectAggregates(workerId, workerBrigadeId, projects) {
  const list = projects.filter((p) =>
    projectVisibleToWorker(p, workerId, workerBrigadeId),
  );
  let totalKw = 0;
  for (const p of list) {
    const n = parseFloat(String(p.powerKw ?? "").replace(",", "."));
    totalKw += Number.isFinite(n) ? n : 0;
  }
  return { projectCount: list.length, totalKw };
}
