import { instantToTashkentYMD, tashkentTodayYMD } from "../src/photos/tashkentTime.js";
import { fetchReminderFirestoreData } from "./firebaseServer.js";
import { getMasterUploadsForDate } from "./masterDailyUploads.js";

function workerDisplayName(w) {
  return String(w?.fullName || w?.name || w?.ustaName || "").trim();
}

function workerDisplayLogin(w) {
  const login = String(w?.login || w?.loginLower || "").trim().toLowerCase();
  if (login) return login;
  return workerDisplayName(w);
}

/** Ustalar ro‘yxati: workers kolleksiyasidagi barcha profillar (admin/test dan tashqari). */
function isUstaWorker(w) {
  const pos = String(w?.position || "").trim().toLowerCase();
  if (!pos) return true;
  if (pos === "developer" || pos === "admin" || pos === "dasturchi") return false;
  return true;
}

/** @param {string} iso */
function isTodayTashkent(iso) {
  const ymd = instantToTashkentYMD(iso);
  return Boolean(ymd) && ymd === tashkentTodayYMD();
}

/**
 * @param {{ loggedIn: boolean, arrival: boolean, departure: boolean, stage: boolean }} status
 * @param {'morning'|'midday'|'evening'} kind
 */
function isPendingForReminder(status, kind) {
  const { loggedIn, arrival, departure, stage } = status;
  if (!loggedIn) return true;
  if (kind === "morning") return !arrival;
  // 13:00 — keldi qilgan, lekin bosqich yuklamaganlar chiqadi; ikkalasi ham bo‘lsa chiqmaydi
  if (kind === "midday") return !arrival || !stage;
  if (kind === "evening") return !arrival || !departure || !stage;
  return false;
}

/**
 * @param {unknown[]} workers
 * @param {unknown[]} stagePhotos
 * @param {unknown[]} activityLogs
 * @param {Record<string, { name?: string, login?: string, loggedIn?: boolean, arrival?: boolean, departure?: boolean, stage?: boolean }>} trackedUploads
 */
export function mergeUploadStatus(workers, stagePhotos, activityLogs, trackedUploads) {
  /** @type {Map<string, { login: string, name: string, loggedIn: boolean, arrival: boolean, departure: boolean, stage: boolean }>} */
  const map = new Map();

  for (const w of workers) {
    if (!w || typeof w !== "object") continue;
    if (!isUstaWorker(w)) continue;
    const id = String(w.id || "").trim();
    const name = workerDisplayName(w);
    const login = workerDisplayLogin(w);
    if (!id || !login) continue;
    map.set(id, {
      login,
      name,
      loggedIn: false,
      arrival: false,
      departure: false,
      stage: false,
    });
  }

  const trackedByLogin = new Map();
  for (const [key, row] of Object.entries(trackedUploads || {})) {
    const loginKey = String(row?.login || "").trim().toLowerCase();
    if (loginKey) trackedByLogin.set(loginKey, row);
    if (String(key).startsWith("name:")) continue;
    const prev = map.get(key) || {
      login: loginKey || String(key).trim(),
      name: String(row?.name || key).trim() || key,
      loggedIn: false,
      arrival: false,
      departure: false,
      stage: false,
    };
    map.set(key, {
      login: prev.login || loginKey || String(key).trim(),
      name: prev.name || String(row?.name || key).trim() || key,
      loggedIn: prev.loggedIn || Boolean(row?.loggedIn),
      arrival: prev.arrival || Boolean(row?.arrival),
      departure: prev.departure || Boolean(row?.departure),
      stage: prev.stage || Boolean(row?.stage),
    });
  }

  for (const [id, prev] of map.entries()) {
    const loginKey = String(prev.login || "").trim().toLowerCase();
    const tracked = trackedByLogin.get(loginKey);
    if (!tracked) continue;
    map.set(id, {
      login: prev.login,
      name: prev.name,
      loggedIn: prev.loggedIn || Boolean(tracked.loggedIn),
      arrival: prev.arrival || Boolean(tracked.arrival),
      departure: prev.departure || Boolean(tracked.departure),
      stage: prev.stage || Boolean(tracked.stage),
    });
  }

  for (const log of activityLogs || []) {
    const id = String(log?.ustaId || "").trim();
    if (!id) continue;
    const dk = String(log?.dateKey || "").trim() || instantToTashkentYMD(log?.loginTime);
    if (dk !== tashkentTodayYMD()) continue;
    const prev = map.get(id);
    if (!prev) continue;
    map.set(id, { ...prev, loggedIn: true });
  }

  for (const ph of stagePhotos || []) {
    const id = String(ph?.ustaId || "").trim();
    if (!id) continue;
    if (!isTodayTashkent(ph?.uploadDate)) continue;
    const hasImage = Boolean(ph?.imageData || ph?.imageUrl);
    if (!hasImage) continue;
    const prev = map.get(id) || {
      login: String(ph?.ustaLogin || ph?.ustaName || id).trim().toLowerCase() || id,
      name: String(ph?.ustaName || id).trim() || id,
      loggedIn: false,
      arrival: false,
      departure: false,
      stage: false,
    };
    map.set(id, {
      ...prev,
      stage: true,
    });
  }

  return map;
}

/**
 * Yuklamagan / kirmagan ustalar loginlari.
 * @param {'morning'|'midday'|'evening'} kind
 * @param {{ workers?: unknown[]; stagePhotos?: unknown[]; activityLogs?: unknown[] } | null} [firestoreData]
 * @returns {Promise<string[]>}
 */
export async function getPendingMasterNames(kind, firestoreData = null) {
  const tracked = getMasterUploadsForDate();
  const { workers, stagePhotos, activityLogs } =
    firestoreData && typeof firestoreData === "object"
      ? {
          workers: Array.isArray(firestoreData.workers) ? firestoreData.workers : [],
          stagePhotos: Array.isArray(firestoreData.stagePhotos)
            ? firestoreData.stagePhotos
            : [],
          activityLogs: Array.isArray(firestoreData.activityLogs)
            ? firestoreData.activityLogs
            : [],
        }
      : await fetchReminderFirestoreData();
  const statusMap = mergeUploadStatus(workers, stagePhotos, activityLogs, tracked);

  const pending = [];
  for (const status of statusMap.values()) {
    if (isPendingForReminder(status, kind)) {
      pending.push(status.login);
    }
  }

  return pending.sort((a, b) => a.localeCompare(b, "uz"));
}
