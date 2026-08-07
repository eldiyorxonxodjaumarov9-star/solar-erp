import { useCallback, useEffect, useState } from "react";
import {
  computeTotalWorkSeconds,
  loadUserActivityLogs,
  persistUserActivityLogs,
  USER_ACTIVITY_LOGS_EVENT,
} from "../activity/userActivityLogsStorage";
import {
  deleteCollectionDoc,
  listCollection,
  updateCollectionDoc,
} from "../firebase/firestoreCrud";
import { canUseLocalFallback } from "../api/localFallback";

/** @param {Record<string, unknown>} x */
function normalizeLogShape(x) {
  const logoutTime =
    x.logoutTime === null || x.logoutTime === undefined ? null : String(x.logoutTime);
  return {
    ...x,
    logoutTime,
    isOnline: logoutTime == null,
    totalWorkTime:
      logoutTime == null ? null : Number.isFinite(Number(x.totalWorkTime)) ? Number(x.totalWorkTime) : 0,
    deviceInfo: {
      userAgent: String(x.deviceInfo?.userAgent || ""),
      platform: String(x.deviceInfo?.platform || ""),
      browser: String(x.deviceInfo?.browser || ""),
    },
  };
}

function mergePersistLocal(nextLogs) {
  persistUserActivityLogs(nextLogs);
}

/** @returns {Promise<object[]>} */
async function fetchLogsFromFirebase() {
  const list = await listCollection("user_activity_logs");
  return (Array.isArray(list) ? list : []).map(normalizeLogShape);
}

export function useUserActivityLogs() {
  const [logs, setLogs] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchLogsFromFirebase();
      setLogs(next.sort((a, b) => new Date(b.loginTime || 0) - new Date(a.loginTime || 0)));
      mergePersistLocal(next.map((x) => ({ ...x })));
    } catch (error) {
      console.error("User activity logs fetch error:", error);
      const local = loadUserActivityLogs();
      setLogs(local.sort((a, b) => new Date(b.loginTime || 0) - new Date(a.loginTime || 0)));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const sync = () => setLogs(loadUserActivityLogs());
    window.addEventListener("storage", sync);
    window.addEventListener(USER_ACTIVITY_LOGS_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(USER_ACTIVITY_LOGS_EVENT, sync);
    };
  }, []);

  const deleteLog = useCallback(async (id) => {
    const sid = String(id || "").trim();
    if (!sid) return;
    try {
      await deleteCollectionDoc("user_activity_logs", sid);
      setLogs((prev) => {
        const next = prev.filter((x) => String(x.id) !== sid);
        persistUserActivityLogs(next.map((x) => ({ ...x })));
        return next;
      });
    } catch (error) {
      console.error("activity log delete", error);
      if (!canUseLocalFallback(error)) {
        const msg =
          error instanceof Error ? error.message : "Yozuvni o‘chirib bo‘lmadi.";
        alert(msg);
        throw error instanceof Error ? error : new Error(msg);
      }
      setLogs((prev) => {
        const next = prev.filter((x) => String(x.id) !== sid);
        persistUserActivityLogs(next.map((x) => ({ ...x })));
        return next;
      });
    }
  }, []);

  const updateLog = useCallback(async (id, patch) => {
    const sid = String(id || "").trim();
    if (!sid) return undefined;
    const mergedFromPrev = (prevDoc, p) => {
      const logoutRaw = p.logoutTime !== undefined ? p.logoutTime : prevDoc.logoutTime;
      const logoutTime =
        logoutRaw === "" || logoutRaw === undefined ? null : logoutRaw;
      const loginTime =
        p.loginTime !== undefined ? String(p.loginTime || "") : String(prevDoc.loginTime || "");
      let totalWorkTime =
        p.totalWorkTime !== undefined && p.totalWorkTime !== null
          ? Number(p.totalWorkTime)
          : logoutTime != null
            ? computeTotalWorkSeconds(loginTime, logoutTime)
            : null;
      if (
        logoutTime != null &&
        (totalWorkTime === 0 ||
          Number.isNaN(Number(totalWorkTime))) &&
        p.totalWorkTime === undefined
      ) {
        totalWorkTime =
          prevDoc.totalWorkTime != null ? Number(prevDoc.totalWorkTime) || 0 : 0;
      }
      const nextDoc = normalizeLogShape({
        ...prevDoc,
        ...p,
        logoutTime,
        loginTime,
        totalWorkTime,
      });
      return nextDoc;
    };

    /** @param {Record<string, unknown>} o */
    const forFirestore = (o) =>
      Object.fromEntries(
        Object.entries(o).filter(([, v]) => v !== undefined),
      );

    try {
      await updateCollectionDoc("user_activity_logs", sid, forFirestore(patch));
      setLogs((prev) => {
        const idx = prev.findIndex((x) => String(x.id) === sid);
        if (idx === -1) return prev;
        const prevDoc = prev[idx];
        const merged = mergedFromPrev(prevDoc, patch);
        const next = [...prev];
        next[idx] = merged;
        persistUserActivityLogs(next.map((x) => ({ ...x })));
        return next;
      });
    } catch (error) {
      console.error("activity log update", error);
      if (!canUseLocalFallback(error)) {
        const msg =
          error instanceof Error ? error.message : "Yozuvni tahrirlab bo‘lmadi.";
        alert(msg);
        throw error instanceof Error ? error : new Error(msg);
      }
      setLogs((prev) => {
        const idx = prev.findIndex((x) => String(x.id) === sid);
        if (idx === -1) return prev;
        const merged = mergedFromPrev(prev[idx], patch);
        const next = [...prev];
        next[idx] = merged;
        persistUserActivityLogs(next.map((x) => ({ ...x })));
        return next;
      });
    }
  }, []);

  return { logs, refresh, deleteLog, updateLog };
}