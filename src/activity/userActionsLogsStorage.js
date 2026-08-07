import { instantToTashkentYMD, TASHKENT_TZ } from "../photos/tashkentTime";

export const USER_ACTIONS_LOGS_KEY = "userActionsLogs";

export const USER_ACTIONS_LOGS_EVENT = "solar-erp-user-actions-logs-changed";

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `ua-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Toshkent vaqtida HH:mm:ss */
function tashkentTimeOfDay(instant) {
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return "";
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TASHKENT_TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return fmt.format(d).replace(",", "");
}

/** @returns {object[]} */
export function loadUserActionsLogs() {
  try {
    const raw = localStorage.getItem(USER_ACTIONS_LOGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x) =>
          x &&
          typeof x.id === "string" &&
          typeof x.ustaId === "string" &&
          typeof x.ustaName === "string" &&
          (x.actionType === "expense" || x.actionType === "photo") &&
          typeof x.date === "string" &&
          typeof x.time === "string" &&
          typeof x.projectName === "string" &&
          typeof x.timestamp === "string",
      )
      .map((x) => ({ ...x }));
  } catch {
    return [];
  }
}

/** @param {object[]} list */
export function persistUserActionsLogs(list) {
  localStorage.setItem(USER_ACTIONS_LOGS_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(USER_ACTIONS_LOGS_EVENT));
}

/**
 * @param {{
 *   ustaId: string;
 *   ustaName: string;
 *   actionType: 'expense' | 'photo';
 *   projectName: string;
 * }} p
 */
export function appendUserActionLog(p) {
  const now = new Date();
  const timestamp = now.toISOString();
  const date = instantToTashkentYMD(now);
  const time = tashkentTimeOfDay(now);
  const logs = loadUserActionsLogs();
  logs.push({
    id: createId(),
    ustaId: p.ustaId,
    ustaName: p.ustaName,
    actionType: p.actionType,
    date,
    time,
    projectName: p.projectName || "",
    timestamp,
  });
  persistUserActionsLogs(logs);
}
