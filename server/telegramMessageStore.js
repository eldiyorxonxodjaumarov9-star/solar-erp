import { buildTelegramMessageRecord } from "../shared/buildTelegramMessage.js";
import { TELEGRAM_MESSAGE_STATUS } from "../shared/telegramMessageTypes.js";
import { saveTelegramMessageToFirestore } from "./telegramMessageFirestore.js";

/**
 * Server: Telegram xabarini Firestore `telegram_messages` ga yozadi.
 * @param {Record<string, unknown>} payload
 * @param {{ docId?: string }} [opts]
 */
export async function logTelegramMessageServer(payload, opts = {}) {
  try {
    const record = buildTelegramMessageRecord({
      ...payload,
      source: payload.source || "server",
    });
    const docId =
      opts.docId ||
      (payload.legacyId
        ? `migrated_${payload.legacySource || "legacy"}_${payload.legacyId}`
        : payload.messageId && payload.chatId
          ? `tg_${payload.chatId}_${payload.messageId}`
          : "");

    return await saveTelegramMessageToFirestore(record, {
      docId: docId || undefined,
      merge: true,
    });
  } catch (e) {
    console.warn("[telegram_messages] yozilmadi:", e?.message || e);
    return null;
  }
}

export async function logTelegramMessageFailedServer(payload, error) {
  return logTelegramMessageServer({
    ...payload,
    status: TELEGRAM_MESSAGE_STATUS.FAILED,
    meta: {
      ...(payload.meta && typeof payload.meta === "object" ? payload.meta : {}),
      error: String(error?.message || error || ""),
    },
  });
}
