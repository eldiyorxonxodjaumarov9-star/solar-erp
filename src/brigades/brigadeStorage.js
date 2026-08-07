import { migrateReadStorage } from "../storage/migrateReadStorage";

export const BRIGADES_STORAGE_KEY = "brigades";

export const BRIGADES_LEGACY_KEY = "solar-erp-brigades";

export const BRIGADES_CHANGED_EVENT = "solar-erp-brigades-changed";

/** @typedef {{ id: string; name: string; phone: string; createdAt: string }} Brigade */

/** @returns {Brigade[]} */
export function loadBrigades() {
  try {
    const raw = migrateReadStorage(BRIGADES_STORAGE_KEY, BRIGADES_LEGACY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((b) => b && typeof b === "object")
      .map((b) => ({
        id: typeof b.id === "string" && b.id.trim()
          ? b.id
          : `b-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name: String(b.name || b.brigadeName || "").trim(),
        phone: String(b.phone || "").trim(),
        createdAt:
          typeof b.createdAt === "string" && b.createdAt
            ? b.createdAt
            : new Date().toISOString(),
      }))
      .filter((b) => b.name.length > 0);
  } catch {
    return [];
  }
}

/** @param {Brigade[]} list */
export function persistBrigades(list) {
  localStorage.setItem(BRIGADES_STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(BRIGADES_CHANGED_EVENT));
}

export function createBrigadeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `b-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
