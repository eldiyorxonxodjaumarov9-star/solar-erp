import { addDocument, addDocumentWithId } from "./db/store.js";
import {
  TELEGRAM_EVENTS_COLLECTION,
  telegramDateToDateKey,
} from "../shared/telegramEventTypes.js";
import { logTelegramMessageServer } from "./telegramMessageStore.js";
import { buildMessageTextFromEvent } from "../shared/buildTelegramMessage.js";

/** Botga muvaffaqiyatli yuborilgan harakatni SQL + Firestore ga yozadi. */
export async function logTelegramEventServer(payload) {
  const sentAt = payload.sentAt || new Date().toISOString();
  const dateKey =
    payload.dateKey ||
    telegramDateToDateKey(payload.date, sentAt) ||
    sentAt.slice(0, 10);

  const eventDoc = {
    workerId: String(payload.workerId || "").trim(),
    workerName: String(payload.workerName || "").trim(),
    workerLogin: String(payload.workerLogin || payload.login || "")
      .trim()
      .toLowerCase(),
    eventType: String(payload.eventType || "").trim(),
    dateKey,
    sentAt,
    time: String(payload.time || "").trim(),
    source: "server",
    meta: payload.meta && typeof payload.meta === "object" ? payload.meta : {},
  };

  try {
    await addDocument(TELEGRAM_EVENTS_COLLECTION, eventDoc);
  } catch (e) {
    console.warn("[telegram_events] yozilmadi:", e?.message || e);
  }

  void logTelegramMessageServer({
    ...payload,
    ...eventDoc,
    messageText: payload.messageText || buildMessageTextFromEvent(payload),
    dateKey,
    sentAt,
  });
}

/** Client yoki import: SQL + Firestore ga idempotent yozuv. */
export async function upsertTelegramEventServer(payload, docId) {
  const sentAt = payload.sentAt || new Date().toISOString();
  const dateKey =
    payload.dateKey ||
    telegramDateToDateKey(payload.date, sentAt) ||
    sentAt.slice(0, 10);

  const eventDoc = {
    workerId: String(payload.workerId || "").trim(),
    workerName: String(payload.workerName || "").trim(),
    workerLogin: String(payload.workerLogin || payload.login || "")
      .trim()
      .toLowerCase(),
    eventType: String(payload.eventType || "").trim(),
    dateKey,
    sentAt,
    time: String(payload.time || "").trim(),
    source: String(payload.source || "server"),
    messageText: String(payload.messageText || "").trim(),
    meta: payload.meta && typeof payload.meta === "object" ? payload.meta : {},
  };

  const id =
    String(docId || payload.eventId || "").trim() ||
    `live_${eventDoc.workerId || eventDoc.workerLogin || "x"}_${eventDoc.dateKey}_${eventDoc.eventType}_${eventDoc.time || sentAt.slice(11, 16)}`.replace(
      /[^\w.-]/g,
      "_",
    );

  await addDocumentWithId(TELEGRAM_EVENTS_COLLECTION, id, eventDoc);

  void logTelegramMessageServer(
    {
      ...payload,
      ...eventDoc,
      messageText: eventDoc.messageText || buildMessageTextFromEvent(payload),
      legacySource: "telegram_live",
      legacyId: id,
    },
    { docId: `live_msg_${id}` },
  );

  return { id, ...eventDoc };
}
