import { useEffect, useState } from "react";
import { recordPointChange } from "../services/points.js";
import {
  addCollectionDoc,
  deleteCollectionDoc,
  subscribeCollection,
  updateCollectionDoc,
} from "../firebase/firestoreCrud";

export const COMPLAINTS_COLLECTION = "jalbalar";

export const COMPLAINT_STATUS = {
  NEW: "yangi",
  ACCEPTED: "qabul_qilingan",
  DONE: "bajarildi",
};

export const COMPLAINT_STATUS_LABEL = {
  yangi: "Yangi",
  qabul_qilingan: "Qabul qilingan",
  bajarildi: "Bajarildi",
};

/**
 * Jalbalar (shikoyat/muammo) kolleksiyasini real vaqtda kuzatadi va CRUD beradi.
 * Bildirishnoma uchun ham, admin/usta sahifalari uchun ham ishlatiladi.
 */
export function useComplaints() {
  const [complaints, setComplaints] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = subscribeCollection(
      COMPLAINTS_COLLECTION,
      (list) => setComplaints(Array.isArray(list) ? list : []),
      (e) => setError(e?.message || "Sinxronlash xatosi"),
    );
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  const createComplaint = async (payload) => {
    const ustaId = String(payload.ustaId || "").trim();
    const created = await addCollectionDoc(COMPLAINTS_COLLECTION, {
      ustaId,
      ustaName: String(payload.ustaName || "").trim(),
      ustaLogin: String(payload.ustaLogin || "").trim(),
      title: String(payload.title || "").trim(),
      problem: String(payload.problem || "").trim(),
      reason: String(payload.problem || payload.title || "").trim(),
      location: String(payload.location || "").trim(),
      comment: String(payload.comment || "").trim(),
      note: String(payload.comment || "").trim(),
      projectId: String(payload.projectId || "").trim(),
      userId: ustaId,
      pointDeducted: 1,
      status: COMPLAINT_STATUS.NEW,
      createdBy: "admin",
      acceptedAt: "",
      doneAt: "",
    });
    try {
      await addCollectionDoc("complaints", {
        ...created,
        userId: ustaId,
        reason: String(payload.problem || payload.title || "").trim(),
        pointDeducted: 1,
        note: String(payload.comment || "").trim(),
      });
    } catch {
      /* legacy jalbalar yetarli */
    }
    if (ustaId) {
      void recordPointChange({
        userId: ustaId,
        type: "etiroz",
        point: -1,
        reason: String(payload.title || "jalba"),
        projectId: payload.projectId,
      });
    }
    return created;
  };

  const acceptComplaint = async (id) =>
    updateCollectionDoc(COMPLAINTS_COLLECTION, id, {
      status: COMPLAINT_STATUS.ACCEPTED,
      acceptedAt: new Date().toISOString(),
    });

  const markDone = async (id) =>
    updateCollectionDoc(COMPLAINTS_COLLECTION, id, {
      status: COMPLAINT_STATUS.DONE,
      doneAt: new Date().toISOString(),
    });

  const deleteComplaint = async (id) =>
    deleteCollectionDoc(COMPLAINTS_COLLECTION, id);

  return {
    complaints,
    error,
    createComplaint,
    acceptComplaint,
    markDone,
    deleteComplaint,
  };
}
