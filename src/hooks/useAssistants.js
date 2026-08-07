import { useCallback, useEffect, useState } from "react";
import {
  addCollectionDoc,
  deleteCollectionDoc,
  listCollection,
  subscribeCollection,
  updateCollectionDoc,
} from "../firebase/firestoreCrud";
import {
  createAssistantId,
  loadAssistants,
  persistAssistants,
} from "../assistants/assistantStorage";
import { canUseLocalFallback } from "../api/localFallback";

function dedupeById(list) {
  const map = new Map();
  for (const item of list) {
    const id = String(item?.id || "").trim();
    if (id) map.set(id, item);
  }
  return Array.from(map.values());
}

function applyAssistants(list, setAssistants) {
  const next = dedupeById(Array.isArray(list) ? list : []);
  setAssistants(next);
  persistAssistants(next);
}

export function useAssistants() {
  const [assistants, setAssistants] = useState(() => loadAssistants());

  const refresh = useCallback(async () => {
    try {
      const list = await listCollection("assistants");
      applyAssistants(list, setAssistants);
    } catch (error) {
      console.error("Assistants read error:", error);
      setAssistants(loadAssistants());
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeCollection(
      "assistants",
      (list) => {
        applyAssistants(list, setAssistants);
      },
      (error) => {
        console.error("Assistants live sync error:", error);
      },
    );
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  useEffect(() => {
    const syncFromLocal = (event) => {
      if (event?.type === "storage") {
        setAssistants(loadAssistants());
      }
    };
    window.addEventListener("storage", syncFromLocal);
    return () => window.removeEventListener("storage", syncFromLocal);
  }, []);

  const addAssistant = async (payload) => {
    const doc = {
      ...payload,
      loginLower: String(payload.login || "").trim().toLowerCase(),
      createdAt: new Date().toISOString(),
    };
    try {
      const created = await addCollectionDoc("assistants", doc);
      // subscribeCollection ro‘yxatni yangilaydi — qo‘lda qo‘shmaslik (dublikat bo‘lmasin)
      return created;
    } catch (error) {
      if (canUseLocalFallback(error)) {
        const created = {
          id: createAssistantId(),
          ...doc,
          createdAt: new Date().toISOString(),
        };
        setAssistants((prev) => {
          const next = dedupeById([created, ...prev]);
          persistAssistants(next);
          return next;
        });
        return created;
      }
      throw new Error(error?.message || "Asisten qo‘shishda xatolik");
    }
  };

  const updateAssistant = async (id, payload) => {
    const patch = {
      ...payload,
      loginLower: String(payload.login || "").trim().toLowerCase(),
    };
    try {
      const updated = await updateCollectionDoc("assistants", id, patch);
      return updated;
    } catch (error) {
      if (canUseLocalFallback(error)) {
        const updated = { id, ...patch, updatedAt: new Date().toISOString() };
        setAssistants((prev) => {
          const next = prev.map((a) => (a.id === id ? { ...a, ...updated } : a));
          persistAssistants(next);
          return next;
        });
        return updated;
      }
      throw new Error(error?.message || "Asisten yangilashda xatolik");
    }
  };

  const deleteAssistant = async (id) => {
    try {
      await deleteCollectionDoc("assistants", id);
      return true;
    } catch (error) {
      if (canUseLocalFallback(error)) {
        setAssistants((prev) => {
          const next = prev.filter((a) => a.id !== id);
          persistAssistants(next);
          return next;
        });
        return true;
      }
      throw new Error(error?.message || "Asisten o‘chirishda xatolik");
    }
  };

  return { assistants, refresh, addAssistant, updateAssistant, deleteAssistant };
}
