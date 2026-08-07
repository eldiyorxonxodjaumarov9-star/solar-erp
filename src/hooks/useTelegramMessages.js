import { useCallback, useEffect, useState } from "react";
import { listCollection, subscribeCollection } from "../firebase/firestoreCrud";
import { TELEGRAM_MESSAGES_COLLECTION } from "../../shared/telegramMessageTypes.js";
import { loadPendingTelegramMessages } from "../telegram/telegramMessageLocal.js";
import { canUseLocalFallback } from "../api/localFallback";

function dedupeById(list) {
  const map = new Map();
  for (const item of list) {
    const id = String(item?.id || "").trim();
    if (id) map.set(id, item);
  }
  return Array.from(map.values());
}

export function useTelegramMessages() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const mergeLists = useCallback((remote) => {
    const pending = loadPendingTelegramMessages().map((p) => ({
      ...p,
      status: p.status || "pending",
      _pending: true,
    }));
    const merged = dedupeById([...pending, ...(Array.isArray(remote) ? remote : [])]);
    merged.sort(
      (a, b) =>
        new Date(b.sentAt || b.createdAt || 0).getTime() -
        new Date(a.sentAt || a.createdAt || 0).getTime(),
    );
    setMessages(merged);
  }, []);

  useEffect(() => {
    let active = true;
    listCollection(TELEGRAM_MESSAGES_COLLECTION)
      .then((list) => {
        if (active) mergeLists(list);
      })
      .catch((e) => {
        if (active && canUseLocalFallback(e)) {
          mergeLists([]);
        } else if (active) {
          setError(e?.message || "Yuklab bo‘lmadi");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mergeLists]);

  useEffect(() => {
    const unsub = subscribeCollection(
      TELEGRAM_MESSAGES_COLLECTION,
      (list) => {
        mergeLists(list);
        setLoading(false);
        setError("");
      },
      (e) => setError(e?.message || "Sinxronlash xatosi"),
    );
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [mergeLists]);

  return { messages, loading, error };
}
