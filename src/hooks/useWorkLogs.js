import { useCallback, useEffect, useState } from "react";
import {
  addCollectionDoc,
  listCollection,
  updateCollectionDoc,
} from "../firebase/firestoreCrud";

export function useWorkLogs() {
  const [workLogs, setWorkLogs] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const list = await listCollection("work_logs");
      setWorkLogs(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error("Work logs fetch error:", error);
      setWorkLogs([]);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addWorkLog = async (payload) => {
    const created = await addCollectionDoc("work_logs", payload);
    setWorkLogs((prev) => [created, ...prev]);
    return created;
  };

  const updateWorkLog = async (id, payload) => {
    const updated = await updateCollectionDoc("work_logs", id, payload);
    setWorkLogs((prev) => prev.map((x) => (x.id === id ? updated : x)));
    return updated;
  };

  return { workLogs, refresh, addWorkLog, updateWorkLog };
}
