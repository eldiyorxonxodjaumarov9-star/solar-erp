const STORAGE_KEY = "solar-erp-usta-yorijnoma-v1";
const CHANGED_EVENT = "solar-erp-usta-yorijnoma-changed";

/** @returns {Record<string, object>} */
function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
}

/** @param {string} workerId */
export function loadUstaYorijnoma(workerId) {
  const id = String(workerId || "").trim();
  if (!id) return null;
  const row = readAll()[id];
  return row && typeof row === "object" ? row : null;
}

/** @param {string} workerId */
export function isUstaYorijnomaCompleted(workerId) {
  const row = loadUstaYorijnoma(workerId);
  return Boolean(row?.completedAt && row?.signatureDataUrl);
}

/**
 * @param {string} workerId
 * @param {Partial<{ videoWatchedAt: string; checklist: Record<string, boolean>; readConfirmedAt: string; signatureDataUrl: string; completedAt: string }>} patch
 */
export function saveUstaYorijnoma(workerId, patch) {
  const id = String(workerId || "").trim();
  if (!id) return null;
  const all = readAll();
  const prev = all[id] && typeof all[id] === "object" ? all[id] : {};
  all[id] = {
    ...prev,
    ...patch,
    workerId: id,
    updatedAt: new Date().toISOString(),
  };
  writeAll(all);
  return all[id];
}

export { CHANGED_EVENT as USTA_YORIJNOMA_CHANGED_EVENT };
