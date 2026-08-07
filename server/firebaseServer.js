import {
  collection,
  doc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { resolveFirebaseConfigFromEnv } from "../shared/firebasePublicConfig.js";
import { addDaysToYMD, tashkentTodayYMD } from "../src/photos/tashkentTime.js";

let dbPromise = null;
/** @type {{ workers: unknown[]; stagePhotos: unknown[]; activityLogs: unknown[] } | null} */
let reminderCache = null;
let reminderCacheAt = 0;
const REMINDER_CACHE_MS = 60_000;

function firebaseConfig() {
  return resolveFirebaseConfigFromEnv(process.env);
}

export function isFirebaseServerConfigured() {
  const cfg = firebaseConfig();
  return Boolean(cfg.apiKey && cfg.projectId);
}

async function getServerDb() {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    const cfg = firebaseConfig();
    if (!cfg.apiKey || !cfg.projectId) {
      throw new Error("Firebase server config yo‘q (VITE_FIREBASE_* yoki FIREBASE_*)");
    }
    const app = getApps().length ? getApps()[0] : initializeApp(cfg);
    const auth = getAuth(app);
    if (!auth.currentUser) {
      await signInAnonymously(auth);
    }
    return getFirestore(app);
  })();
  return dbPromise;
}

async function listCollection(name) {
  const db = await getServerDb();
  const snap = await getDocs(query(collection(db, name)));
  return snap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() || {}),
  }));
}

async function listWorkers() {
  const primary = await listCollection("workers");
  if (primary.length > 0) return primary;
  return listCollection("users");
}

/** Faqat oxirgi 2 kunlik bosqich rasmlari (butun kolleksiyani o‘qimaslik uchun). */
async function listRecentStagePhotos() {
  const today = tashkentTodayYMD();
  const sinceYmd = addDaysToYMD(today, -1);
  if (!sinceYmd) return [];
  const sinceIso = `${sinceYmd}T00:00:00.000Z`;
  const db = await getServerDb();
  const snap = await getDocs(
    query(collection(db, "stage_photos"), where("uploadDate", ">=", sinceIso)),
  );
  return snap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() || {}),
  }));
}

export async function fetchReminderFirestoreData({ bypassCache = false } = {}) {
  if (!isFirebaseServerConfigured()) {
    return { workers: [], activityLogs: [], stagePhotos: [] };
  }

  const now = Date.now();
  if (!bypassCache && reminderCache && now - reminderCacheAt < REMINDER_CACHE_MS) {
    return reminderCache;
  }

  let workers = [];
  let stagePhotos = [];

  try {
    workers = await listWorkers();
  } catch (error) {
    console.error("[firebaseServer] workers o‘qish xatosi:", error?.message || error);
  }

  try {
    stagePhotos = await listRecentStagePhotos();
  } catch (error) {
    console.error(
      "[firebaseServer] stage_photos o‘qish xatosi (indeks kerak bo‘lishi mumkin):",
      error?.message || error,
    );
    stagePhotos = [];
  }

  const result = { workers, activityLogs: [], stagePhotos };
  reminderCache = result;
  reminderCacheAt = now;
  return result;
}

/**
 * Kunlik hisobot uchun manbalar (Firestore).
 * @param {string} dateKey YYYY-MM-DD
 */
export async function fetchDailyAttendanceFirestoreData(dateKey) {
  const dk = String(dateKey || tashkentTodayYMD()).trim();
  if (!isFirebaseServerConfigured()) {
    return {
      workers: [],
      activityLogs: [],
      stagePhotos: [],
      telegramEvents: [],
      telegramAttendanceLogs: [],
    };
  }

  const db = await getServerDb();
  let workers = [];
  try {
    workers = await listWorkers();
  } catch (e) {
    console.error("[firebaseServer] workers:", e?.message || e);
  }

  /** @type {unknown[]} */
  let activityLogs = [];
  try {
    const snap = await getDocs(
      query(collection(db, "user_activity_logs"), where("dateKey", "==", dk)),
    );
    activityLogs = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  } catch (e) {
    console.warn(
      "[firebaseServer] user_activity_logs dateKey query:",
      e?.message || e,
    );
    try {
      const all = await listCollection("user_activity_logs");
      activityLogs = all.filter((l) => String(l?.dateKey || "").trim() === dk);
    } catch (e2) {
      console.error("[firebaseServer] activityLogs fallback:", e2?.message || e2);
    }
  }

  /** @type {unknown[]} */
  let stagePhotos = [];
  try {
    const snap = await getDocs(
      query(collection(db, "stage_photos"), where("dateKey", "==", dk)),
    );
    stagePhotos = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  } catch (e) {
    console.warn("[firebaseServer] stage_photos dateKey query:", e?.message || e);
    try {
      stagePhotos = (await listRecentStagePhotos()).filter(
        (p) => String(p?.dateKey || "").trim() === dk,
      );
    } catch {
      stagePhotos = [];
    }
  }

  /** @type {unknown[]} */
  let telegramEvents = [];
  try {
    const snap = await getDocs(
      query(collection(db, "telegram_events"), where("dateKey", "==", dk)),
    );
    telegramEvents = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  } catch (e) {
    console.warn("[firebaseServer] telegram_events:", e?.message || e);
  }

  /** @type {unknown[]} */
  let telegramAttendanceLogs = [];
  try {
    const snap = await getDocs(
      query(collection(db, "telegramAttendanceLogs"), where("date", "==", dk)),
    );
    telegramAttendanceLogs = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() || {}),
    }));
  } catch (e) {
    console.warn("[firebaseServer] telegramAttendanceLogs:", e?.message || e);
  }

  return {
    workers,
    activityLogs,
    stagePhotos,
    telegramEvents,
    telegramAttendanceLogs,
  };
}

/**
 * @param {string} collectionName
 * @param {string} docId
 * @param {Record<string, unknown>} data
 */
export async function upsertFirestoreDocument(collectionName, docId, data) {
  if (!isFirebaseServerConfigured()) return null;
  const db = await getServerDb();
  const id = String(docId || "").trim();
  if (!id) throw new Error("docId kerak");
  const ref = doc(collection(db, collectionName), id);
  await setDoc(ref, { ...data, updatedAt: new Date().toISOString() }, { merge: true });
  return id;
}

export async function getFirestoreDocument(collectionName, docId) {
  if (!isFirebaseServerConfigured()) return null;
  const { getDoc } = await import("firebase/firestore");
  const db = await getServerDb();
  const id = String(docId || "").trim();
  if (!id) return null;
  const snap = await getDoc(doc(collection(db, collectionName), id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() || {}) };
}
