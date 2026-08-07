import { addCollectionDoc, addCollectionDocWithId } from "../firebase/firestoreCrud";
import { buildTelegramMessageRecord } from "../../shared/buildTelegramMessage.js";
import { TELEGRAM_MESSAGES_COLLECTION } from "../../shared/telegramMessageTypes.js";
import {
  loadPendingTelegramMessages,
  queuePendingTelegramMessage,
  removePendingTelegramMessage,
} from "./telegramMessageLocal.js";
import { isFirebasePermissionError } from "../api/localFallback.js";

/** Client: Telegram xabarini Firestore ga yozadi (fallback bilan). */
export async function logTelegramMessageClient(payload, opts = {}) {
  const record = buildTelegramMessageRecord({
    ...payload,
    source: payload.source || "client",
  });
  const docId =
    opts.docId ||
    (payload.legacyId
      ? `migrated_${payload.legacySource || "legacy"}_${payload.legacyId}`
      : "");

  try {
    if (docId) {
      await addCollectionDocWithId(TELEGRAM_MESSAGES_COLLECTION, docId, record);
      removePendingTelegramMessage(docId);
      return { id: docId, ...record };
    }
    return await addCollectionDoc(TELEGRAM_MESSAGES_COLLECTION, record);
  } catch (e) {
    const pendingId = docId || queuePendingTelegramMessage(record);
    if (isFirebasePermissionError(e)) {
      console.warn("[telegram_messages] ruxsat yo‘q — mahalliy navbatga qo‘yildi");
    } else {
      console.warn("[telegram_messages] yozilmadi, navbatga qo‘yildi:", e?.message || e);
    }
    return { id: pendingId, ...record, _pending: true };
  }
}

/** Mahalliy navbatdagi xabarlarni Firebase ga yuborish. */
export async function syncPendingTelegramMessages() {
  const pending = loadPendingTelegramMessages();
  if (!pending.length) return { ok: true, synced: 0 };

  let synced = 0;
  for (const row of pending) {
    const id = String(row.id || "").trim();
    if (!id) continue;
    try {
      const { _pending, ...rest } = row;
      await addCollectionDocWithId(TELEGRAM_MESSAGES_COLLECTION, id, rest);
      removePendingTelegramMessage(id);
      synced += 1;
    } catch (e) {
      console.warn("[telegram_messages] sync o‘tkazib yuborildi:", id, e?.message || e);
    }
  }
  return { ok: true, synced };
}
