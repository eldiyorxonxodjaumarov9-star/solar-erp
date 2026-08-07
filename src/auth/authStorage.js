import { migrateReadStorage } from "../storage/migrateReadStorage";

export const AUTH_SESSION_KEY = "currentSession";

export const AUTH_SESSION_LEGACY_KEY = "solar-erp-session";

export const AUTH_SESSION_CHANGED_EVENT = "solar-erp-session-changed";

export const ADMIN_RETURN_SESSION_KEY = "solar-erp-admin-return";

/**
 * @typedef {{
 *   role: 'admin';
 *   login: string;
 *   name: string;
 * } | {
 *   role: 'usta';
 *   login: string;
 *   name: string;
 *   workerId: string;
 * } | {
 *   role: 'asisten';
 *   login: string;
 *   name: string;
 *   assistantId: string;
 *   masterName?: string;
 *   impersonatedByAdmin?: boolean;
 * }} AuthSession
 */

/** @returns {AuthSession | null} */
export function loadSession() {
  try {
    const raw = migrateReadStorage(AUTH_SESSION_KEY, AUTH_SESSION_LEGACY_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s !== "object") return null;

    if (s.role === "admin" && typeof s.login === "string") {
      const name =
        typeof s.name === "string" && s.name.trim()
          ? s.name.trim()
          : "Administrator";
      return { role: "admin", login: s.login, name };
    }

    if (
      s.role === "usta" &&
      typeof s.login === "string" &&
      typeof s.workerId === "string"
    ) {
      const name =
        (typeof s.name === "string" && s.name.trim()) ||
        (typeof s.fullName === "string" && s.fullName.trim()) ||
        "";
      if (!name) return null;
      return {
        role: "usta",
        login: s.login,
        name,
        workerId: s.workerId,
      };
    }

    if (
      s.role === "asisten" &&
      typeof s.login === "string" &&
      typeof s.assistantId === "string"
    ) {
      const name =
        (typeof s.name === "string" && s.name.trim()) ||
        (typeof s.fullName === "string" && s.fullName.trim()) ||
        "";
      if (!name) return null;
      return {
        role: "asisten",
        login: s.login,
        name,
        assistantId: s.assistantId,
        masterName:
          typeof s.masterName === "string" ? s.masterName.trim() : undefined,
        impersonatedByAdmin: Boolean(s.impersonatedByAdmin),
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** @param {AuthSession} session */
export function saveSession(session) {
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  try {
    localStorage.removeItem(AUTH_SESSION_LEGACY_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_CHANGED_EVENT));
}

export function clearSession() {
  try {
    localStorage.removeItem(AUTH_SESSION_KEY);
    localStorage.removeItem(AUTH_SESSION_LEGACY_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_CHANGED_EVENT));
}
