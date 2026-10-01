import { getServerAdminDb } from "./firebaseAdminAuth.js";
import { TELEGRAM_MESSAGES_COLLECTION } from "../shared/telegramMessageTypes.js";

async function getServerFirestore() { return getServerAdminDb(); }

function stripUndefined(obj) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return obj === undefined ? null : obj;
  }
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const nested = stripUndefined(v);
      if (Object.keys(nested).length > 0) out[k] = nested;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * @param {Record<string, unknown>} record
 * @param {{ docId?: string; merge?: boolean }} [opts]
 */
export async function saveTelegramMessageToFirestore(record, opts = {}) {
  const db = await getServerFirestore();
  const data = stripUndefined(record);
  const explicitId = String(opts.docId || data.id || "").trim();

  if (explicitId) {
    const ref = db.collection(TELEGRAM_MESSAGES_COLLECTION).doc(explicitId);
    const exists = await ref.get();
    await ref.set(
      {
        ...data,
        id: explicitId,
        updatedAt: new Date().toISOString(),
        createdAt: data.createdAt || exists.data()?.createdAt || new Date().toISOString(),
      },
      { merge: opts.merge !== false },
    );
    return { id: explicitId, ...data };
  }

  const ref = db.collection(TELEGRAM_MESSAGES_COLLECTION).doc();
  const id = ref.id;
  await ref.set({
    ...data,
    id,
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return { id, ...data };
}
