import { migrateReadStorage } from "../storage/migrateReadStorage";

export const ASSISTANTS_STORAGE_KEY = "assistants";
export const ASSISTANTS_LEGACY_KEY = "solar-erp-assistants";
export const ASSISTANTS_CHANGED_EVENT = "solar-erp-assistants-changed";

/**
 * @typedef {{
 *   id: string;
 *   fullName: string;
 *   phone: string;
 *   login: string;
 *   password: string;
 *   createdAt: string;
 * }} Assistant
 */

/** @returns {Assistant[]} */
export function loadAssistants() {
  try {
    const raw = migrateReadStorage(ASSISTANTS_STORAGE_KEY, ASSISTANTS_LEGACY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((a) => a && typeof a === "object")
      .map((a) => ({
        id:
          typeof a.id === "string" && a.id.trim()
            ? a.id
            : `a-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        fullName: String(a.fullName || a.name || "").trim(),
        phone: String(a.phone || "").trim(),
        login: String(a.login || "").trim(),
        password: String(a.password || "").trim(),
        createdAt:
          typeof a.createdAt === "string" && a.createdAt
            ? a.createdAt
            : new Date().toISOString(),
      }))
      .filter((a) => a.fullName.length > 0);
  } catch {
    return [];
  }
}

/** @param {Assistant[]} list */
export function persistAssistants(list) {
  localStorage.setItem(ASSISTANTS_STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(ASSISTANTS_CHANGED_EVENT));
}

export function createAssistantId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `a-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function isAssistantLoginTaken(login, assistants, excludeId) {
  const key = String(login || "").trim().toLowerCase();
  if (!key) return false;
  return assistants.some(
    (a) =>
      a.id !== excludeId &&
      String(a.login || "").trim().toLowerCase() === key,
  );
}
