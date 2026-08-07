import { useCallback, useEffect, useState } from "react";
import {
  addCollectionDoc,
  deleteCollectionDoc,
  listCollection,
  subscribeCollection,
  updateCollectionDoc,
} from "../firebase/firestoreCrud";
import { loadProjects, persistProjects } from "../projects/projectStorage";
import { canUseLocalFallback } from "../api/localFallback";

export function useProjects() {
  const [projects, setProjects] = useState(() => loadProjects());

  const refresh = useCallback(async () => {
    try {
      const list = await listCollection("projects");
      const next = Array.isArray(list) ? list : [];
      setProjects(next);
      persistProjects(next);
    } catch (error) {
      console.error("Projects fetch error:", error);
      setProjects(loadProjects());
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const unsubscribe = subscribeCollection(
      "projects",
      (list) => {
        const next = Array.isArray(list) ? list : [];
        setProjects(next);
        persistProjects(next);
      },
      (error) => {
        console.error("Projects live sync error:", error);
      },
    );
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  const addProject = async (data) => {
    try {
      const created = await addCollectionDoc("projects", data);
      setProjects((prev) => {
        const next = [created, ...prev];
        persistProjects(next);
        return next;
      });
      return created;
    } catch (err) {
      console.error("Add project error:", err);
      if (canUseLocalFallback(err)) {
        const created = {
          id:
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          ...data,
          createdAt: new Date().toISOString(),
        };
        setProjects((prev) => {
          const next = [created, ...prev];
          persistProjects(next);
          return next;
        });
        return created;
      }
      throw new Error(err?.message || "Loyiha qo‘shishda xatolik");
    }
  };

  const updateProject = async (id, data) => {
    try {
      const updated = await updateCollectionDoc("projects", id, data);
      setProjects((prev) => {
        const next = prev.map((p) => (p.id === id ? updated : p));
        persistProjects(next);
        return next;
      });
      return updated;
    } catch (err) {
      console.error("Update project error:", err);
      if (canUseLocalFallback(err)) {
        const updated = { id, ...data, updatedAt: new Date().toISOString() };
        setProjects((prev) => {
          const next = prev.map((p) => (p.id === id ? { ...p, ...updated } : p));
          persistProjects(next);
          return next;
        });
        return updated;
      }
      throw new Error(err?.message || "Loyihani yangilashda xatolik");
    }
  };

  const deleteProject = async (id) => {
    if (!id) throw new Error("Loyiha ID topilmadi");
    try {
      await deleteCollectionDoc("projects", id);
      setProjects((prev) => {
        const next = prev.filter((p) => p.id !== id);
        persistProjects(next);
        return next;
      });
      return true;
    } catch (err) {
      console.error("Delete project error:", err);
      if (canUseLocalFallback(err)) {
        setProjects((prev) => {
          const next = prev.filter((p) => p.id !== id);
          persistProjects(next);
          return next;
        });
        return true;
      }
      throw new Error(err?.message || "Loyihani o‘chirishda xatolik");
    }
  };

  const setProjectStatus = async (id, status) => {
    const updated = await updateCollectionDoc("projects", id, {
      status,
      holat: status === "tugallandi" ? "Tugallandi" : "Jarayonda",
    });
    const next = projects.map((p) => (p.id === id ? updated : p));
    setProjects(next);
    persistProjects(next);
    return updated;
  };

  const setAndPersist = (next) => {
    setProjects(next);
    persistProjects(next);
  };

  return {
    projects,
    setAndPersist,
    refresh,
    addProject,
    updateProject,
    deleteProject,
    setProjectStatus,
  };
}