import { useCallback, useEffect, useState } from "react";
import { api } from "../api/http";
import {
  addCollectionDoc,
  deleteCollectionDoc,
  listCollection,
  subscribeCollection,
  updateCollectionDoc,
} from "../firebase/firestoreCrud";
import {
  EXPENSES_CHANGED_EVENT,
  loadExpenses,
  persistExpenses,
} from "../expenses/expenseStorage";
import { canUseLocalFallback } from "../api/localFallback";

function mergeCloudWithLocal(cloudList, localList) {
  const cloud = Array.isArray(cloudList) ? cloudList : [];
  const local = Array.isArray(localList) ? localList : [];
  const byId = new Map();
  for (const item of cloud) {
    if (item?.id) byId.set(String(item.id), item);
  }
  for (const item of local) {
    if (!item?.id) continue;
    const id = String(item.id);
    if (!byId.has(id)) byId.set(id, item);
  }
  return [...byId.values()].sort(
    (a, b) => String(b?.createdAt || "").localeCompare(String(a?.createdAt || "")),
  );
}

function normalizeExpenseList(list) {
  return (Array.isArray(list) ? list : [])
    .filter((x) => x && typeof x === "object")
    .map((x) => ({
      ...x,
      id: String(x.id || ""),
      amount: String(x.amount || "0"),
      date: String(x.date || ""),
      projectId: String(x.projectId || ""),
      ustaId: String(x.ustaId || ""),
      createdAt: String(x.createdAt || ""),
    }))
    .filter((x) => x.id);
}

export function useExpenses() {
  const [expenses, setExpenses] = useState(() => loadExpenses());

  const refresh = useCallback(async () => {
    let cloudList = [];
    let apiList = [];
    try {
      const list = await listCollection("expenses");
      cloudList = normalizeExpenseList(list);
    } catch (error) {
      console.error("Expenses fetch error:", error);
    }

    try {
      const list = await api.get("/api/expenses");
      apiList = normalizeExpenseList(list);
    } catch (error) {
      console.error("Expenses API fetch error:", error);
    }

    const localList = loadExpenses();
    const next = mergeCloudWithLocal(
      mergeCloudWithLocal(cloudList, apiList),
      localList,
    );
    setExpenses(next);
    persistExpenses(next);

    if (!next.length && localList.length) {
      setExpenses(localList);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const unsubscribe = subscribeCollection(
      "expenses",
      (list) => {
        const next = mergeCloudWithLocal(list, loadExpenses());
        setExpenses(next);
        persistExpenses(next);
      },
      (error) => {
        console.error("Expenses live sync error:", error);
      },
    );
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  useEffect(() => {
    const syncFromLocal = () => setExpenses(loadExpenses());
    const syncFromCloud = () => {
      void refresh();
    };
    window.addEventListener("storage", syncFromLocal);
    window.addEventListener(EXPENSES_CHANGED_EVENT, syncFromLocal);
    window.addEventListener("focus", syncFromCloud);

    const intervalId = window.setInterval(syncFromCloud, 15000);
    return () => {
      window.removeEventListener("storage", syncFromLocal);
      window.removeEventListener(EXPENSES_CHANGED_EVENT, syncFromLocal);
      window.removeEventListener("focus", syncFromCloud);
      window.clearInterval(intervalId);
    };
  }, [refresh]);

  const addExpense = async (data) => {
    try {
      const created = await addCollectionDoc("expenses", data);
      setExpenses((prev) => {
        const next = [created, ...prev];
        persistExpenses(next);
        return next;
      });
      return created;
    } catch (err) {
      console.error("Add expense error:", err);
      if (canUseLocalFallback(err)) {
        let created = null;
        try {
          created = await api.post("/api/expenses", data);
        } catch {
          created = {
            id:
              typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : `e-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            ...data,
            createdAt: new Date().toISOString(),
          };
        }
        setExpenses((prev) => {
          const next = [created, ...prev].filter(Boolean);
          persistExpenses(next);
          return next;
        });
        return created;
      }
      alert(`Xarajat qo‘shishda xatolik: ${err?.message || "Noma'lum xato"}`);
      return undefined;
    }
  };

  const updateExpense = async (id, data) => {
    try {
      const updated = await updateCollectionDoc("expenses", id, data);
      setExpenses((prev) => {
        const next = prev.map((x) =>
          x.id === id ? { ...x, ...updated, id } : x,
        );
        persistExpenses(next);
        return next;
      });
      return { ...updated, id };
    } catch (err) {
      console.error("Update expense error:", err);
      if (canUseLocalFallback(err)) {
        try {
          const server = await api.put(`/api/expenses/${id}`, data);
          const merged = { ...data, ...(server || {}), id };
          setExpenses((prev) => {
            const next = prev.map((x) => (x.id === id ? { ...x, ...merged } : x));
            persistExpenses(next);
            return next;
          });
          return merged;
        } catch {
          const updated = { id, ...data, updatedAt: new Date().toISOString() };
          setExpenses((prev) => {
            const next = prev.map((x) => (x.id === id ? { ...x, ...updated } : x));
            persistExpenses(next);
            return next;
          });
          return updated;
        }
      }
      alert(`Xarajatni yangilashda xatolik: ${err?.message || "Noma'lum xato"}`);
      return undefined;
    }
  };

  const deleteExpense = async (id) => {
    try {
      await deleteCollectionDoc("expenses", id);
      setExpenses((prev) => {
        const next = prev.filter((x) => x.id !== id);
        persistExpenses(next);
        return next;
      });
    } catch (err) {
      console.error("Delete expense error:", err);
      if (canUseLocalFallback(err)) {
        try {
          await api.delete(`/api/expenses/${id}`);
        } catch {
          /* mahalliy yoki boshqa server — baribir ro‘yxatdan olib tashlash */
        }
        setExpenses((prev) => {
          const next = prev.filter((x) => x.id !== id);
          persistExpenses(next);
          return next;
        });
        return;
      }
      alert(`Xarajatni o‘chirishda xatolik: ${err?.message || "Noma'lum xato"}`);
      return;
    }
  };

  return {
    expenses,
    refresh,
    addExpense,
    updateExpense,
    deleteExpense,
  };
}