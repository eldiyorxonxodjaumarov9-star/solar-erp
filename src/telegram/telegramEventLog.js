import { addCollectionDoc } from "../firebase/firestoreCrud";
import {
  TELEGRAM_EVENTS_COLLECTION,
  telegramDateToDateKey,
} from "../../shared/telegramEventTypes.js";
import { TELEGRAM_EVENT_LOGGED_EVENT } from "../../shared/telegramEventLoggedEvent.js";
import { logTelegramMessageClient } from "./telegramMessageLog.js";
import { buildMessageTextFromEvent } from "../../shared/buildTelegramMessage.js";
import { api } from "../api/http.js";

function emitTelegramEventLogged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(TELEGRAM_EVENT_LOGGED_EVENT));
  }
}

/** Client (APK/desktop) botga yuborgan harakatni Firebase + mahalliy SQL ga yozadi. */
export async function logTelegramEventClient(payload) {
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
    source: "client",
    meta: payload.meta && typeof payload.meta === "object" ? payload.meta : {},
  };

  try {
    await addCollectionDoc(TELEGRAM_EVENTS_COLLECTION, eventDoc);
  } catch (e) {
    console.warn("[telegram_events] yozilmadi:", e?.message || e);
  }

  void logTelegramMessageClient({
    ...payload,
    ...eventDoc,
    messageText: payload.messageText || buildMessageTextFromEvent(payload),
    dateKey,
    sentAt,
  });

  void api
    .post("/api/telegram/log-event", {
      ...payload,
      ...eventDoc,
      messageText: payload.messageText || buildMessageTextFromEvent(payload),
    })
    .catch((e) => console.warn("[telegram_events] SQL sync:", e?.message || e))
    .finally(() => emitTelegramEventLogged());
}
