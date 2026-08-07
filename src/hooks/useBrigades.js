import { useCallback, useEffect, useState } from "react";
import {
  addCollectionDoc,
  deleteCollectionDoc,
  listCollection,
  subscribeCollection,
  updateCollectionDoc,
} from "../firebase/firestoreCrud";
import {
  BRIGADES_CHANGED_EVENT,
  createBrigadeId,
  loadBrigades,
  persistBrigades,
} from "../brigades/brigadeStorage";
import { canUseLocalFallback } from "../api/localFallback";

export function useBrigades() {
  const [brigades, setBrigades] = useState(() => loadBrigades());

  const refresh = useCallback(async () => {
    try {
      const list = await listCollection("brigades");
      const next = Array.isArray(list) ? list : [];
      setBrigades(next);
      persistBrigades(next);
    } catch (error) {
      console.error("Brigades API read error:", error);
      setBrigades(loadBrigades());
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const unsubscribe = subscribeCollection(
      "brigades",
      (list) => {
        const next = Array.isArray(list) ? list : [];
        setBrigades(next);
        persistBrigades(next);
      },
      (error) => {
        console.error("Brigades live sync error:", error);
      },
    );
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  useEffect(() => {
    const syncFromLocal = () => setBrigades(loadBrigades());
    window.addEventListener("storage", syncFromLocal);
    window.addEventListener(BRIGADES_CHANGED_EVENT, syncFromLocal);
    return () => {
      window.removeEventListener("storage", syncFromLocal);
      window.removeEventListener(BRIGADES_CHANGED_EVENT, syncFromLocal);
    };
  }, []);

  const setAndPersist = (next) => {
    setBrigades(next);
    persistBrigades(next);
  };

  const addBrigade = async (payload) => {
    try {
      const created = await addCollectionDoc("brigades", payload);
      setBrigades((prev) => {
        const next = [created, ...prev];
        persistBrigades(next);
        return next;
      });
      return created;
    } catch (error) {
      console.error("Add brigade API error:", { payload, error });
      if (canUseLocalFallback(error)) {
        const created = {
          id: createBrigadeId(),
          ...payload,
          createdAt: new Date().toISOString(),
        };
        setBrigades((prev) => {
          const next = [created, ...prev];
          persistBrigades(next);
          return next;
        });
        return created;
      }
      throw new Error(error?.message || "Brigada qo‘shishda xatolik");
    }
  };

  const updateBrigade = async (id, payload) => {
    try {
      const updated = await updateCollectionDoc("brigades", id, payload);
      setBrigades((prev) => {
        const next = prev.map((b) => (b.id === id ? updated : b));
        persistBrigades(next);
        return next;
      });
      return updated;
    } catch (error) {
      if (canUseLocalFallback(error)) {
        const updated = { id, ...payload, updatedAt: new Date().toISOString() };
        setBrigades((prev) => {
          const next = prev.map((b) => (b.id === id ? { ...b, ...updated } : b));
          persistBrigades(next);
          return next;
        });
        return updated;
      }
      throw new Error(error?.message || "Brigadani yangilashda xatolik");
    }
  };

  const deleteBrigade = async (id) => {
    try {
      await deleteCollectionDoc("brigades", id);
      setBrigades((prev) => {
        const next = prev.filter((b) => b.id !== id);
        persistBrigades(next);
        return next;
      });
      return true;
    } catch (error) {
      if (canUseLocalFallback(error)) {
        setBrigades((prev) => {
          const next = prev.filter((b) => b.id !== id);
          persistBrigades(next);
          return next;
        });
        return true;
      }
      throw new Error(error?.message || "Brigadani o‘chirishda xatolik");
    }
  };

  return { brigades, setAndPersist, refresh, addBrigade, updateBrigade, deleteBrigade };
}