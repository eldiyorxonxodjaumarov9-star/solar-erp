import { useCallback, useEffect, useState } from "react";
import {
  addCollectionDoc,
  deleteCollectionDoc,
  listCollection,
  subscribeCollection,
  updateCollectionDoc,
} from "../firebase/firestoreCrud";
import { canUseLocalFallback } from "../api/localFallback";
import { api } from "../api/http";
import {
  createWorkerId,
  isGhostWorkerProfile,
  loadWorkers,
  mergeWorkersWithProfileFallback,
  normalizeWorkersList,
  persistWorkers,
  workerDisplayName,
} from "../workers/workerStorage";

async function loadWorkerProfileFallback() {
  const fallbacks = [];
  try {
    fallbacks.push(...loadWorkers());
  } catch {
    /* ignore */
  }
  try {
    const status = await api.get("/status");
    if (status?.sql) {
      const data = await api.get("/api/db/workers");
      const items = Array.isArray(data?.items) ? data.items : [];
      fallbacks.push(...items);
    }
  } catch {
    /* ignore */
  }
  return fallbacks;
}

async function restoreGhostProfilesToFirebase(remoteList, mergedList) {
  const restoredById = new Map(
    mergedList.map((w) => [String(w.id), w]),
  );
  for (const raw of remoteList || []) {
    const id = String(raw?.id || "").trim();
    if (!id || !isGhostWorkerProfile(raw)) continue;
    const restored = restoredById.get(id);
    if (!restored || isGhostWorkerProfile(restored)) continue;
    try {
      await updateCollectionDoc("workers", id, {
        fullName: restored.fullName,
        login: restored.login,
        loginLower: String(restored.login || "").trim().toLowerCase(),
        phone: restored.phone,
        position: restored.position,
        password: restored.password,
        brigadeId: restored.brigadeId,
        brigadeName: restored.brigadeName,
        experienceYears: restored.experienceYears,
        rating: restored.rating,
        salary: Number(restored.salary) || 0,
        dailySalary: Math.round((Number(restored.salary) || 0) / 30),
      });
      console.info(`[workers] Profil tiklandi: ${workerDisplayName(restored)}`);
    } catch (error) {
      console.warn("[workers] Firebase profil tiklash:", error?.message || error);
    }
  }
}

export function useWorkers() {
  const [workers, setWorkers] = useState(() => loadWorkers());

  const applyWorkers = useCallback((list, fallbackList = []) => {
    const remoteList = Array.isArray(list) ? list : [];
    const merged = mergeWorkersWithProfileFallback(
      remoteList,
      fallbackList.length ? fallbackList : loadWorkers(),
    );
    setWorkers(merged);
    persistWorkers(merged);
    void restoreGhostProfilesToFirebase(remoteList, merged);
    return merged;
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
      const [list, fallbackList] = await Promise.all([
        listCollection("workers"),
        loadWorkerProfileFallback(),
      ]);
      applyWorkers(list, fallbackList);
    } catch (error) {
      console.error("Workers API read error:", error);
      setWorkers(loadWorkers());
    }
  }, [applyWorkers]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const fallbackList = await loadWorkerProfileFallback();
        const list = await listCollection("workers");
        if (!cancelled) applyWorkers(list, fallbackList);
      } catch (error) {
        console.error("Workers live sync error:", error);
      }
    })();

    const unsubscribe = subscribeCollection(
      "workers",
      (list) => {
        void loadWorkerProfileFallback()
          .then((fallbackList) => applyWorkers(list, fallbackList))
          .catch(() => applyWorkers(list));
      },
      (error) => {
        console.error("Workers live sync error:", error);
      },
    );
    return () => {
      cancelled = true;
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [applyWorkers]);

  useEffect(() => {
    const syncFromLocal = (event) => {
      // Boshqa tab o‘zgartirganda — faqat storage event.
      if (event?.type === "storage") {
        setWorkers(loadWorkers());
      }
    };
    window.addEventListener("storage", syncFromLocal);
    return () => window.removeEventListener("storage", syncFromLocal);
  }, []);

  const setAndPersist = (next) => {
    replaceWorkers(next);
  };

  const addWorker = async (payload) => {
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