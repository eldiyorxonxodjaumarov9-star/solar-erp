import { migrateReadStorage } from "../storage/migrateReadStorage";

export const WORKERS_STORAGE_KEY = "users";

export const WORKERS_LEGACY_KEY = "solar-erp-workers";

export const WORKERS_CHANGED_EVENT = "solar-erp-workers-changed";

/** Ko‘rsatish uchun ism (Firebase/SQL maydon nomlari farq qilishi mumkin). */
export function workerDisplayName(w) {
  if (!w || typeof w !== "object") return "";
  return String(
    w.fullName ||
      w.name ||
      w.workerName ||
      w.ustaName ||
      w.displayName ||
      w.full_name ||
      w.login ||
      w.username ||
      "",
  ).trim();
}

/** Loyihaga biriktirish mumkin bo‘lgan usta (admin/dasturchi emas). */
export function isAssignableProjectWorker(w) {
  const pos = String(w?.position || "").trim().toLowerCase();
  if (!pos) return true;
  return pos !== "developer" && pos !== "admin" && pos !== "dasturchi";
}

/** @param {Record<string, unknown> | null | undefined} raw */
export function normalizeWorkerRecord(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  if (!id) return null;
  const fullName = workerDisplayName(raw);
  const login = String(raw.login || raw.username || "").trim();
  if (!fullName && !login) return null;

  const salary = normalizeSalaryField(raw.salary ?? raw.salarySom);
  const dailySalary = Math.round(salary / 30);

  return {
    ...raw,
    id,
    fullName: fullName || login,
    phone: String(raw.phone || "").trim(),
    position: String(raw.position || "usta").trim(),
    login,
    password: String(raw.password || "").trim(),
    createdAt:
      typeof raw.createdAt === "string" && raw.createdAt
        ? raw.createdAt
        : new Date().toISOString(),
    brigadeId: typeof raw.brigadeId === "string" ? raw.brigadeId : "",
    brigadeName: typeof raw.brigadeName === "string" ? raw.brigadeName : "",
    experienceYears:
      typeof raw.experienceYears === "string"
        ? raw.experienceYears
        : typeof raw.tajriba === "string"
          ? raw.tajriba
          : "",
    rating: typeof raw.rating === "string" ? raw.rating : "",
    salary,
    dailySalary,
    telegramUserId: String(
      raw.telegramUserId || raw.telegramId || raw.tgUserId || "",
    ).trim(),
    telegramUsername: String(raw.telegramUsername || raw.telegramUser || "")
      .trim()
      .replace(/^@/, ""),
    status: normalizeWorkerStatus(raw.status ?? raw.holat),
    points:
      raw.points && typeof raw.points === "object" && !Array.isArray(raw.points)
        ? { ...raw.points }
        : undefined,
  };
}

function normalizeWorkerStatus(value) {
  const s = String(value ?? "active").trim().toLowerCase();
  if (!s || s === "faol" || s === "1" || s === "true") return "active";
  if (s === "inactive" || s === "nofaol" || s === "off" || s === "0") {
    return "inactive";
  }
  return s === "active" ? "active" : s;
}

function normalizeSalaryField(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return 0;
  const n = Number(digits);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

/** @param {unknown[]} list */
export function normalizeWorkersList(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list || []) {
    const w = normalizeWorkerRecord(raw);
    if (!w) continue;
    const key = String(w.id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

/** Loyiha formasi uchun: barcha biriktiriladigan ustalar, ism bo‘yicha. */
export function assignableWorkersForProjects(workers) {
  return normalizeWorkersList(workers)
    .filter(isAssignableProjectWorker)
    .sort((a, b) =>
      workerDisplayName(a).localeCompare(workerDisplayName(b), "uz"),
    );
}

/** Profil maydonlari yo‘q, faqat ball/points qolgan yozuv. */
export function isGhostWorkerProfile(w) {
  if (!w || typeof w !== "object") return true;
  return (
    !workerDisplayName(w) &&
    !String(w.login || w.username || "").trim()
  );
}

/** Firebase + mahalliy/SQL zaxiradan birlashtirish (profil yo‘q yozuvlarni tiklaydi). */
export function mergeWorkersWithProfileFallback(remoteList, fallbackList) {
  const fallbackById = new Map();
  for (const raw of fallbackList || []) {
    const w = normalizeWorkerRecord(raw);
    if (w) fallbackById.set(String(w.id), w);
  }

  const out = [];
  const seen = new Set();

  for (const raw of remoteList || []) {
    const id = String(raw?.id || "").trim();
    if (!id) continue;
    seen.add(id);
    if (!isGhostWorkerProfile(raw)) {
      out.push(raw);
      continue;
    }
    const fb = fallbackById.get(id);
    if (fb) {
      out.push({
        ...fb,
        ...raw,
        fullName: fb.fullName,
        login: fb.login,
        phone: fb.phone || raw.phone,
        position: fb.position || raw.position,
        password: fb.password || raw.password,
        salary:
          typeof raw.salary === "number" && Number.isFinite(raw.salary)
            ? raw.salary
            : fb.salary,
        points: raw.points || fb.points,
      });
    } else {
      out.push(raw);
    }
  }

  for (const [id, fb] of fallbackById) {
    if (!seen.has(id)) out.push(fb);
  }

  return normalizeWorkersList(out);
}

/**
 * @typedef {{
 *   id: string;
 *   fullName: string;
 *   phone: string;
 *   position: string;
 *   login: string;
 *   password: string;
 *   brigadeId: string;
 *   brigadeName: string;
 *   experienceYears: string;
 *   rating: string;
 *   salary: number;
 *   dailySalary: number;
 *   telegramUserId: string;
 *   telegramUsername: string;
 *   status: string;
 *   createdAt: string;
 * }} Worker
 */

/** @returns {Worker[]} */
export function loadWorkers() {
  try {
    const raw = migrateReadStorage(WORKERS_STORAGE_KEY, WORKERS_LEGACY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizeWorkersList(parsed);
  } catch {
    return [];
  }
}

/** @param {Worker[]} list */
export function persistWorkers(list) {
  localStorage.setItem(WORKERS_STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(WORKERS_CHANGED_EVENT));
}

export function createWorkerId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `w-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Login boshqa ustadan boshqacha bo‘lishi kerak (case-insensitive) */
export function isLoginTaken(login, workers, excludeWorkerId) {
  const key = String(login || "").trim().toLowerCase();
  if (!key) return false;
  return workers.some(
    (w) =>
      w.id !== excludeWorkerId &&
      String(w.login || "").trim().toLowerCase() === key,
  );
}

/** @param {string} brigadeId */
/** @param {Worker[]} workers */
export function workersForBrigade(brigadeId, workers) {
  return workers.filter((w) => w.brigadeId === brigadeId);
}
