const LS_KEY = "solar-erp-telegram-messages-pending";

/** @returns {Record<string, unknown>[]} */
export function loadPendingTelegramMessages() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePending(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

export function queuePendingTelegramMessage(record) {
  const pending = loadPendingTelegramMessages();
  const id = String(record?.id || `pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const next = [{ ...record, id, _pending: true }, ...pending.filter((x) => x.id !== id)];
  savePending(next);
  return id;
}

export function removePendingTelegramMessage(id) {
  const pending = loadPendingTelegramMessages().filter((x) => x.id !== id);
  savePending(pending);
}
