import { useCallback, useEffect, useState } from "react";
import {
  addCollectionDoc,
  deleteCollectionDoc,
  listCollection,
  subscribeCollection,
  updateCollectionDoc,
} from "../firebase/firestoreCrud";
import { canUseLocalFallback } from "../api/localFallback";
import { prepareWorkerSalaryRate } from "../workers/workerSalaryRate";
import {
  createWorkerId,
  normalizeWorkersList,
  persistWorkers,
} from "../workers/workerStorage";

export function useWorkers() {
  const [workers, setWorkers] = useState([]);

  const applyWorkers = useCallback((list) => {
    const next = normalizeWorkersList(list);
    setWorkers(next); persistWorkers(next); return next;
  }, []);

  const replaceWorkers = useCallback((updater) => {
    setWorkers((prev) => {
      const next = normalizeWorkersList(
        typeof updater === "function" ? updater(prev) : updater,
      );
      persistWorkers(next);
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      applyWorkers(await listCollection('workers'));
    } catch (error) {
      console.error("Workers API read error:", error);
      setWorkers([]);
    }
  }, [applyWorkers]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => subscribeCollection('workers', applyWorkers, () => setWorkers([])), [applyWorkers]);

  const setAndPersist = (next) => {
    replaceWorkers(next);
  };

  const addWorker = async (payload) => {
    payload = prepareWorkerSalaryRate(payload);
    try {
      const created = await addCollectionDoc("workers", payload);
      replaceWorkers((prev) => [created, ...prev]);
      return created;
    } catch (error) {
      if (canUseLocalFallback(error)) {
        const created = {
          id: createWorkerId(),
          ...payload,
          createdAt: new Date().toISOString(),
        };
        replaceWorkers((prev) => [created, ...prev]);
        return created;
      }
      throw new Error(error?.message || "Usta qo‘shishda xatolik");
    }
  };

  const updateWorker = async (id, payload) => {
    payload = prepareWorkerSalaryRate(payload, workers.find((worker) => worker.id === id));
    try {
      const updated = await updateCollectionDoc("workers", id, payload);
      replaceWorkers((prev) =>
        prev.map((w) => (w.id === id ? { ...w, ...updated } : w)),
      );
      return updated;
    } catch (error) {
      if (canUseLocalFallback(error)) {
        const updated = { id, ...payload, updatedAt: new Date().toISOString() };
        replaceWorkers((prev) =>
          prev.map((w) => (w.id === id ? { ...w, ...updated } : w)),
        );
        return updated;
      }
      throw new Error(error?.message || "Ustani yangilashda xatolik");
    }
  };

  const deleteWorker = async (id) => {
    try {
      await deleteCollectionDoc("workers", id);
      replaceWorkers((prev) => prev.filter((w) => w.id !== id));
      return true;
    } catch (error) {
      if (canUseLocalFallback(error)) {
        replaceWorkers((prev) => prev.filter((w) => w.id !== id));
        return true;
      }
      throw new Error(error?.message || "Ustani o‘chirishda xatolik");
    }
  };

  return { workers, setAndPersist, refresh, addWorker, updateWorker, deleteWorker };
}
