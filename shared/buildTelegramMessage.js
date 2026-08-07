import { TELEGRAM_EVENT_TYPES } from "./telegramEventTypes.js";
import {
  TELEGRAM_MESSAGE_DIRECTION,
  TELEGRAM_MESSAGE_MODULES,
  TELEGRAM_MESSAGE_STATUS,
} from "./telegramMessageTypes.js";

function str(v) {
  return String(v ?? "").trim();
}

/** ERP eventType → modul. */
export function eventTypeToModule(eventType) {
  const t = str(eventType).toLowerCase();
  if (Object.values(TELEGRAM_MESSAGE_MODULES).includes(t)) return t;
  if (t === TELEGRAM_EVENT_TYPES.KELDI) return TELEGRAM_MESSAGE_MODULES.KELDI;
  if (t === TELEGRAM_EVENT_TYPES.KETDI) return TELEGRAM_MESSAGE_MODULES.KETDI;
  if (t === TELEGRAM_EVENT_TYPES.RASM) return TELEGRAM_MESSAGE_MODULES.RASM;
  if (t === TELEGRAM_EVENT_TYPES.YORIJNOMA) return TELEGRAM_MESSAGE_MODULES.YORIJNOMA;
  if (t === TELEGRAM_EVENT_TYPES.XARAJAT) return TELEGRAM_MESSAGE_MODULES.XARAJAT;
  if (t === TELEGRAM_EVENT_TYPES.LOYIHA) return TELEGRAM_MESSAGE_MODULES.LOYIHA;
  if (t === TELEGRAM_EVENT_TYPES.DAY_OFF) return TELEGRAM_MESSAGE_MODULES.DAY_OFF;
  return TELEGRAM_MESSAGE_MODULES.UNKNOWN;
}

/** telegram_events yoki API payload dan matn. */
export function buildMessageTextFromEvent(payload = {}) {
  const eventType = str(payload.eventType).toLowerCase();
  const name = str(payload.workerName) || "Usta";
  const date = str(payload.date);
  const time = str(payload.time);
  const meta = payload.meta && typeof payload.meta === "object" ? payload.meta : {};

  if (eventType === "keldi" || payload.mode === "arrival") {
    return `✅ Ishga keldi\nUsta: ${name}\nVaqt: ${time}\nSana: ${date}`;
  }
  if (eventType === "ketdi" || payload.mode === "departure") {
    return `🏁 Ishdan ketdi\nUsta: ${name}\nVaqt: ${time}\nSana: ${date}\nIshlagan: ${str(meta.duration) || "—"}`;
  }
  if (eventType === "day_off" || payload.mode === "day_off") {
    return `🌴 Dam olish kuni\nUsta: ${name}\nSana: ${date}\nSabab: ${str(meta.reason) || "—"}`;
  }
  if (eventType === "xarajat") {
    return `💰 Xarajat\nUsta: ${name}\nLoyiha: ${str(meta.projectName)}\nSumma: ${str(meta.amount)}\nTuri: ${str(meta.type)}`;
  }
  if (eventType === "rasm") {
    return `📷 Bosqich rasmi\nUsta: ${name}\nLoyiha: ${str(meta.projectName)}\nBosqich: ${str(meta.stageName)}`;
  }
  if (eventType === "yorijnoma") {
    return `📋 Yo‘riqnoma imzosi\nUsta: ${name}`;
  }
  if (eventType === "loyiha") {
    return `🏗 Loyiha rasmlari\nUsta: ${name}\nLoyiha: ${str(meta.projectName)}\nRasmlar: ${meta.photoCount ?? "—"}`;
  }
  if (str(payload.messageText)) return str(payload.messageText);
  if (str(payload.text)) return str(payload.text);
  return str(payload.caption) || `[${eventType || "xabar"}]`;
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {Record<string, unknown>}
 */
export function buildTelegramMessageRecord(payload = {}) {
  const sentAt = str(payload.sentAt) || new Date().toISOString();
  const dateKey =
    str(payload.dateKey) ||
    (sentAt.length >= 10 ? sentAt.slice(0, 10) : "");
  const module =
    str(payload.module) ||
    eventTypeToModule(payload.eventType || payload.mode);
  const direction =
    str(payload.direction) || TELEGRAM_MESSAGE_DIRECTION.OUTBOUND;
  const status =
    str(payload.status) ||
    (direction === TELEGRAM_MESSAGE_DIRECTION.INBOUND
      ? TELEGRAM_MESSAGE_STATUS.RECEIVED
      : TELEGRAM_MESSAGE_STATUS.SENT);

  return {
    telegramUserId: str(payload.telegramUserId || payload.fromId),
    username: str(payload.username || payload.workerLogin || payload.login).toLowerCase(),
    fullName: str(payload.fullName || payload.workerName || payload.name),
    messageText: buildMessageTextFromEvent(payload),
    fileUrl: str(payload.fileUrl || payload.imageUrl),
    fileId: str(payload.fileId),
    sentAt,
    dateKey,
    module,
    status,
    direction,
    source: str(payload.source) || "app",
    workerId: str(payload.workerId),
    workerLogin: str(payload.workerLogin || payload.login).toLowerCase(),
    workerName: str(payload.workerName || payload.name),
    eventType: str(payload.eventType),
    chatId: str(payload.chatId),
    messageId: str(payload.messageId),
    meta: payload.meta && typeof payload.meta === "object" ? payload.meta : {},
    legacySource: str(payload.legacySource),
    legacyId: str(payload.legacyId),
    createdAt: str(payload.createdAt) || sentAt,
    updatedAt: new Date().toISOString(),
  };
}

/** Telegram Bot API `message` obyektidan. */
export function buildTelegramMessageFromUpdate(message, chatId = "") {
  const from = message?.from || {};
  const text =
    str(message?.text) ||
    str(message?.caption) ||
    (message?.photo?.length ? "[rasm]" : "") ||
    (message?.document ? "[fayl]" : "") ||
    "[xabar]";

  let fileId = "";
  let fileUrl = "";
  if (Array.isArray(message?.photo) && message.photo.length) {
    fileId = str(message.photo[message.photo.length - 1]?.file_id);
  } else if (message?.document?.file_id) {
    fileId = str(message.document.file_id);
    fileUrl = str(message.document.file_name);
  }

  const fullName = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();

  return buildTelegramMessageRecord({
    telegramUserId: String(from.id || ""),
    username: str(from.username),
    fullName: fullName || str(from.username) || "Telegram foydalanuvchi",
    messageText: text,
    fileId,
    fileUrl,
    sentAt: message?.date
      ? new Date(Number(message.date) * 1000).toISOString()
      : new Date().toISOString(),
    module: TELEGRAM_MESSAGE_MODULES.INBOUND,
    direction: TELEGRAM_MESSAGE_DIRECTION.INBOUND,
    status: TELEGRAM_MESSAGE_STATUS.RECEIVED,
    source: "telegram_bot",
    chatId: String(chatId || message?.chat?.id || ""),
    messageId: String(message?.message_id || ""),
    meta: { rawType: message?.photo ? "photo" : message?.document ? "document" : "text" },
  });
}
