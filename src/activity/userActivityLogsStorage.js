import { addCollectionDocWithId } from "../firebase/firestoreCrud";
import { instantToTashkentYMD } from "../photos/tashkentTime";

export const USER_ACTIVITY_LOGS_KEY = "userActivityLogs";

export const USER_ACTIVITY_LOGS_EVENT = "solar-erp-user-activity-logs-changed";

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `al-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function computeTotalWorkSeconds(loginIso, logoutIso) {
  const a = new Date(loginIso).getTime();
  const b = new Date(logoutIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0;
  return Math.floor((b - a) / 1000);
}

function normalizeLog(x) {
  const logoutTime =
    x.logoutTime === null || x.logoutTime === undefined
      ? null
      : String(x.logoutTime);
  const dateKey =
    typeof x.dateKey === "string" && x.dateKey.trim()
      ? x.dateKey.trim()
      : instantToTashkentYMD(x.loginTime);
  let totalWorkTime =
    x.totalWorkTime === null || x.totalWorkTime === undefined
      ? null
      : Number(x.totalWorkTime);
  if (logoutTime != null) {
    if (totalWorkTime == null || Number.isNaN(totalWorkTime)) {
      totalWorkTime = computeTotalWorkSeconds(x.loginTime, logoutTime);
    }
  } else {
    totalWorkTime = null;
  }
  return {
    ...x,
    dateKey,
    brigadeId: typeof x.brigadeId === "string" ? x.brigadeId : "",
    brigadeName: typeof x.brigadeName === "string" ? x.brigadeName : "",
    logoutTime,
    totalWorkTime,
    isOnline: logoutTime == null,
    deviceInfo: {
      userAgent: String(x.deviceInfo?.userAgent ?? ""),
      platform: String(x.deviceInfo?.platform ?? ""),
      browser: String(x.deviceInfo?.browser ?? ""),
    },
  };
}

/** @returns {object[]} */
export function loadUserActivityLogs() {
  try {
    const raw = localStorage.getItem(USER_ACTIVITY_LOGS_KEY);
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
          typeof x.loginTime === "string" &&
          (x.logoutTime === null || typeof x.logoutTime === "string") &&
          x.deviceInfo &&
          typeof x.deviceInfo === "object",
      )
      .map((x) => normalizeLog(x));
  } catch {
    return [];
  }
}

/** @param {object[]} list */
export function persistUserActivityLogs(list) {
  localStorage.setItem(USER_ACTIVITY_LOGS_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(USER_ACTIVITY_LOGS_EVENT));
}

/**
 * @param {string} ustaId
 * @param {string} ustaName
 * @param {string} brigadeId
 * @param {string} brigadeName
 * @param {{ userAgent: string; platform: string; browser: string }} deviceInfo
 */
export function appendUstaLoginLog(
  ustaId,
  ustaName,
  brigadeId,
  brigadeName,
  deviceInfo,
) {
  let logs = loadUserActivityLogs();
  const nowIso = new Date().toISOString();
  logs = logs.map((l) => {
    if (l.ustaId !== ustaId || l.logoutTime != null) return l;
    const logoutTime = nowIso;
    const totalWorkTime = computeTotalWorkSeconds(l.loginTime, logoutTime);
    return {
      ...l,
      logoutTime,
      isOnline: false,
      totalWorkTime,
    };
  });
  const dateKey = instantToTashkentYMD(nowIso);
  logs.push({
    id: createId(),
    ustaId,
    ustaName,
    brigadeId: brigadeId || "",
    brigadeName: brigadeName || "",
    dateKey,
    loginTime: nowIso,
    logoutTime: null,
    totalWorkTime: null,
    deviceInfo: {
      userAgent: deviceInfo.userAgent,
      platform: deviceInfo.platform,
      browser: deviceInfo.browser,
    },
    isOnline: true,
  });
  persistUserActivityLogs(logs);
}

/** Login yozuvini Firebase ga (server eslatmasi uchun). */
export async function syncUstaLoginLogToFirestore(
  ustaId,
  ustaName,
  brigadeId,
  brigadeName,
  deviceInfo,
) {
  const nowIso = new Date().toISOString();
  const id = createId();
  try {
    await addCollectionDocWithId("user_activity_logs", id, {
      ustaId,
      ustaName,
      brigadeId: brigadeId || "",
      brigadeName: brigadeName || "",
      dateKey: instantToTashkentYMD(nowIso),
      loginTime: nowIso,
      logoutTime: null,
      totalWorkTime: null,
      deviceInfo: {
        userAgent: deviceInfo.userAgent,
        platform: deviceInfo.platform,
        browser: deviceInfo.browser,
      },
      isOnline: true,
    });
  } catch (error) {
    console.warn("Firestore login log sync:", error);
  }
}

/** Shu usta uchun oxirgi ochiq sessiya (logoutTime=null). */
export function closeLatestOpenUstaSession(ustaId) {
  const logs = loadUserActivityLogs();
  let bestIdx = -1;
  let bestLogin = "";
  logs.forEach((l, i) => {
    if (l.ustaId !== ustaId || l.logoutTime != null) return;
    if (bestIdx < 0 || l.loginTime > bestLogin) {
      bestIdx = i;
      bestLogin = l.loginTime;
    }
  });
  if (bestIdx < 0) return;
  const now = new Date().toISOString();
  const totalWorkTime = computeTotalWorkSeconds(logs[bestIdx].loginTime, now);
  logs[bestIdx] = {
    ...logs[bestIdx],
    logoutTime: now,
    isOnline: false,
    totalWorkTime,
  };
  persistUserActivityLogs(logs);
}
