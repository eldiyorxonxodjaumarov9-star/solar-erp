import { addCollectionDocWithId } from "../firebase/firestoreCrud";
import { COLLECTIONS } from "./schema.js";

/** user_activity_logs bilan birga `attendance` kolleksiyasiga yozuv (schema talabi). */
export async function mirrorAttendanceRecord({
  id,
  userId,
  type,
  imageUrl,
  location,
  date,
  time,
  projectId,
  meta,
}) {
  const docId = String(id || `att_${userId}_${date}_${type}`);
  await addCollectionDocWithId(COLLECTIONS.attendance, docId, {
    userId: String(userId || ""),
    type: String(type || ""),
    imageUrl: String(imageUrl || ""),
    location: location && typeof location === "object" ? location : null,
    date: String(date || ""),
    time: String(time || ""),
    projectId: String(projectId || ""),
    meta: meta && typeof meta === "object" ? meta : {},
    createdAt: new Date().toISOString(),
  });
  return docId;
}
