import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  getFirestore,
} from "firebase/firestore";
import { resolveFirebaseConfigFromEnv } from "../shared/firebasePublicConfig.js";
import { TELEGRAM_MESSAGES_COLLECTION } from "../shared/telegramMessageTypes.js";

let dbPromise = null;

async function getServerFirestore() {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    const cfg = resolveFirebaseConfigFromEnv(process.env);
    if (!cfg.apiKey || !cfg.projectId) {
      throw new Error("Firebase config yo‘q");
    }
    const app = getApps().length ? getApps()[0] : initializeApp(cfg);
    const auth = getAuth(app);
    if (!auth.currentUser) await signInAnonymously(auth);
    return getFirestore(app);
  })();
  return dbPromise;
}

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
    const ref = doc(db, TELEGRAM_MESSAGES_COLLECTION, explicitId);
    const exists = await getDoc(ref);
    await setDoc(
      ref,
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

  const ref = doc(collection(db, TELEGRAM_MESSAGES_COLLECTION));
  const id = ref.id;
  await setDoc(ref, {
    ...data,
    id,
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return { id, ...data };
}
