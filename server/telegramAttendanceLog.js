import crypto from "node:crypto";
import { addDocument, addDocumentWithId } from "./db/store.js";
import { upsertFirestoreDocument } from "./firebaseServer.js";
import { telegramDateToDateKey } from "../shared/telegramEventTypes.js";

export const TELEGRAM_ATTENDANCE_LOGS = "telegramAttendanceLogs";

function newId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `tal_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Attendance Telegramga yuborilganda log (APK o‘zgarmaydi — faqat server).
 * @param {Record<string, unknown>} payload
 */
export async function logTelegramAttendanceSend(payload) {
  const sentAt = String(payload.sentAt || new Date().toISOString());
  const date =
    String(payload.date || payload.dateKey || "").trim().slice(0, 10) ||
    telegramDateToDateKey(payload.date, sentAt) ||
    sentAt.slice(0, 10);

  const typeRaw = String(payload.type || payload.mode || "").trim().toLowerCase();
  let type = typeRaw;
  if (type === "arrival" || type === "keldi") type = "check_in";
  if (type === "departure" || type === "ketdi") type = "check_out";
  if (type === "day_off") type = "day_off";

  const docData = {
    userId: String(payload.userId || payload.workerId || "").trim(),
    workerId: String(payload.workerId || payload.userId || "").trim(),
    workerName: String(payload.workerName || "").trim(),
    workerLogin: String(payload.workerLogin || "").trim().toLowerCase(),
    telegramUserId: payload.telegramUserId != null ? Number(payload.telegramUserId) || String(payload.telegramUserId) : "",
    telegramUsername: String(payload.telegramUsername || "")
      .trim()
      .replace(/^@/, ""),
    attendanceId: String(payload.attendanceId || "").trim(),
    type,
    imageUrl: String(payload.imageUrl || "").trim(),
    telegramMessageId:
      payload.telegramMessageId != null ? String(payload.telegramMessageId) : "",
    telegramChatId: String(payload.telegramChatId || "").trim(),
    success: payload.success !== false,
    error: String(payload.error || "").trim(),
    sentAt,
    date,
    dateKey: date,
    source: "server",
  };

  const id =
    String(payload.id || "").trim() ||
    `tal_${docData.userId || docData.workerLogin || "x"}_${date}_${type}_${sentAt.slice(11, 19)}`.replace(
      /[^\w.-]/g,
      "_",
    ) ||
    newId();

  try {
    await addDocumentWithId(TELEGRAM_ATTENDANCE_LOGS, id, docData);
  } catch (e) {
    try {
      await addDocument(TELEGRAM_ATTENDANCE_LOGS, { ...docData, id });
    } catch (e2) {
      console.warn("[telegramAttendanceLogs] SQL:", e2?.message || e2);
    }
  }

  try {
    await upsertFirestoreDocument(TELEGRAM_ATTENDANCE_LOGS, id, docData);
  } catch (e) {
    console.warn("[telegramAttendanceLogs] Firestore:", e?.message || e);
  }

  return { id, ...docData };
}
