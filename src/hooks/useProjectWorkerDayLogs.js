import { useCallback, useEffect, useState } from "react";
import {
  addCollectionDocWithId,
  deleteCollectionDoc,
  listCollection,
  subscribeCollection,
} from "../firebase/firestoreCrud";

/** Eski: bir loyiha + usta + kun — bitta hujjat. */
export function projectWorkerDayDocId(projectId, workerId, dateYmd) {
  const p = String(projectId || "").replace(/\//g, "_");
  const w = String(workerId || "").replace(/\//g, "_");
  const d = String(dateYmd || "").replace(/\//g, "-");
  return `${p}__${w}__${d}`;
}

/** Yangi: bir loyiha + usta + oy (`YYYY-MM`). */
export function projectWorkerMonthLogId(projectId, workerId, yearMonth) {
  const p = String(projectId || "").replace(/\//g, "_");
  const w = String(workerId || "").replace(/\//g, "_");
  const ym = String(yearMonth || "")
    .trim()
    .slice(0, 7)
    .replace(/\//g, "-");
  return `${p}__${w}__oy__${ym}`;
}

export function useProjectWorkerDayLogs() {
  const [logs, setLogs] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const list = await listCollection("project_worker_days");
      setLogs(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error("project_worker_days fetch error:", error);
      setLogs([]);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const unsubscribe = subscribeCollection(
      "project_worker_days",
      (list) => {
        setLogs(Array.isArray(list) ? list : []);
      },
      (error) => {
        console.error("project_worker_days live sync error:", error);
      },
    );
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  const upsertDayLog = async (payload) => {
    const projectId = String(payload.projectId || "").trim();
    const workerId = String(payload.workerId || "").trim();
    const ymRaw = String(payload.yearMonth || "").trim();
    const yearMonth = /^\d{4}-\d{2}$/.test(ymRaw) ? ymRaw : "";

    let id;
    let dateYmd;
    let yearMonthFinal;

    if (yearMonth) {
      yearMonthFinal = yearMonth;
      id = projectWorkerMonthLogId(projectId, workerId, yearMonthFinal);
      dateYmd = `${yearMonthFinal}-01`;
    } else {
      dateYmd = String(payload.date || "").trim().slice(0, 10);
      if (!dateYmd || !projectId || !workerId) {
        throw new Error("Loyiha, usta va oy majburiy");
      }
      yearMonthFinal = dateYmd.slice(0, 7);
      id = projectWorkerDayDocId(projectId, workerId, dateYmd);
    }

    const workDays = Math.min(31, Math.max(0.25, Number(payload.workDays) || 1));
    await addCollectionDocWithId("project_worker_days", id, {
      ...payload,
      date: dateYmd,
      yearMonth: yearMonthFinal,
      projectId,
      workerId,
      workDays,
    });
    await refresh();
    return id;
  };

  const removeDayLog = async (id) => {
    if (!id) return;
    await deleteCollectionDoc("project_worker_days", String(id));
    await refresh();
  };

  return { logs, refresh, upsertDayLog, removeDayLog };
}
