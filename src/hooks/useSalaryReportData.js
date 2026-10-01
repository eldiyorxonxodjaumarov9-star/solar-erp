import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { ensureFirebaseAuth, getFirebaseDb } from "../firebase.js";
import { subscribeCollection } from "../firebase/firestoreCrud";

/** Firestore report; credential-free profiles come from the protected server adapter. */
export function useSalaryReportData(session) {
  const role = session?.role;
  const workerId = String(session?.workerId || "");
  const key = `${role}|${workerId}`;
  const [data, setData] = useState({});
  useEffect(() => {
    let stopped = false;
    const unsubscribers = [];
    const current = { key, workers: [], logs: [], expenses: [], expensesReady: false, workersReady: false, logsReady: false, error: "" };
    const emit = () => { if (!stopped) setData({ ...current }); };
    const fail = (error) => { current.error = error?.message || "Firestore ma?lumotlari olinmadi."; emit(); };
    emit();
    if (role === "admin") {
      unsubscribers.push(subscribeCollection("workers", (workers) => {
        current.workers = workers; current.workersReady = true; emit();
      }, fail));
      unsubscribers.push(subscribeCollection("user_activity_logs", (logs) => {
        current.logs = logs; current.logsReady = true; emit();
      }, fail));
      unsubscribers.push(subscribeCollection("expenses", (expenses) => {
        current.expenses = expenses; current.expensesReady = true; emit();
      }, fail));
    } else if (role === "usta" && workerId) {
      void (async () => {
        try {
          await ensureFirebaseAuth();
          const db = await getFirebaseDb();
          if (stopped) return;
          unsubscribers.push(subscribeCollection('workers', (workers) => {
            current.workers = workers.filter(worker => String(worker.id) === workerId);
            current.workersReady = true; emit();
          }, fail));
          unsubscribers.push(onSnapshot(query(collection(db, "user_activity_logs"), where("ustaId", "==", workerId)), (snapshot) => {
            current.logs = snapshot.docs.map((item) => ({ ...item.data(), id: item.id }));
            current.logsReady = true; emit();
          }, fail));
          unsubscribers.push(onSnapshot(query(collection(db, "expenses"), where("payrollWorkerId", "==", workerId)), (snapshot) => {
            current.expenses = snapshot.docs.map((item) => ({ ...item.data(), id: item.id }));
            current.expensesReady = true; emit();
          }, fail));
        } catch (error) { fail(error); }
      })();
    } else {
      current.error = "Hisobotni ko?rish uchun ruxsat yoki ishchi profili topilmadi."; emit();
    }
    return () => { stopped = true; unsubscribers.forEach((unsubscribe) => unsubscribe()); };
  }, [role, workerId, key]);
  return data.key === key ? { ...data, loading: !data.workersReady || !data.logsReady || !data.expensesReady } :
    { workers: [], logs: [], expenses: [], loading: true, error: "" };
}
