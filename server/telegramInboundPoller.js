import axios from "axios";
import { buildTelegramMessageFromUpdate } from "../shared/buildTelegramMessage.js";
import { logTelegramMessageServer } from "./telegramMessageStore.js";

let pollTimer = null;
let offset = 0;
let running = false;

async function fetchUpdates(token) {
  const url = `https://api.telegram.org/bot${token}/getUpdates`;
  const res = await axios.get(url, {
    params: { offset, timeout: 25, allowed_updates: JSON.stringify(["message"]) },
    timeout: 35000,
    validateStatus: () => true,
  });
  if (res.status !== 200 || !res.data?.ok) {
    throw new Error(res.data?.description || `getUpdates HTTP ${res.status}`);
  }
  return Array.isArray(res.data.result) ? res.data.result : [];
}

async function processUpdate(update) {
  const message = update?.message;
  if (!message) return;
  const chatId = String(message.chat?.id || "");
  const record = buildTelegramMessageFromUpdate(message, chatId);
  await logTelegramMessageServer(
    {
      ...record,
      messageId: String(message.message_id || ""),
      chatId,
    },
    { docId: chatId && message.message_id ? `tg_${chatId}_${message.message_id}` : undefined },
  );
}

/**
 * Guruhdan kelgan xabarlarni getUpdates orqali o‘qib Firestore ga yozadi.
 * @param {{ token?: string }} config
 */
export function startTelegramInboundPoller(config = {}) {
  const enabled =
    String(process.env.TELEGRAM_INBOUND_POLL || "").toLowerCase() === "true";
  if (!enabled) {
    console.log("[telegram-inbound] polling o‘chiq (TELEGRAM_INBOUND_POLL!=true)");
    return;
  }
  const token = String(config.token || process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) {
    console.warn("[telegram-inbound] TELEGRAM_BOT_TOKEN yo‘q — polling o‘chiq");
    return;
  }
  if (pollTimer) return;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const updates = await fetchUpdates(token);
      for (const u of updates) {
        const updateId = Number(u.update_id);
        if (Number.isFinite(updateId)) offset = updateId + 1;
        try {
          await processUpdate(u);
        } catch (e) {
          console.warn("[telegram-inbound] xabar yozilmadi:", e?.message || e);
        }
      }
    } catch (e) {
      console.warn("[telegram-inbound] getUpdates:", e?.message || e);
    } finally {
      running = false;
    }
  };

  void tick();
  pollTimer = setInterval(tick, 3000);
  console.log("[telegram-inbound] Guruhdan kelgan xabarlar kuzatilmoqda (getUpdates)");
}

export function stopTelegramInboundPoller() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}
