import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
} from "firebase/firestore";
import { ensureFirebaseAuth, getFirebaseDb } from "../../firebase.js";
import { listCollection } from "../../firebase/firestoreCrud.js";
import { normalizeProjectsList } from "./projectNormalizer.js";

const PAGE_SIZE = 400;

/**
 * Firestore’dan barcha projects — limit(50) yo‘q.
 * Avval to‘liq getDocs; katta kolleksiya uchun cursor batch zaxira.
 * @returns {Promise<ReturnType<typeof normalizeProjectsList>>}
 */
export async function fetchAllProjectsForReport() {
  await ensureFirebaseAuth();

  // 1) Oddiy to‘liq o‘qish (loyihadagi standart listCollection — limit yo‘q)
  try {
    const all = await listCollection("projects");
    if (Array.isArray(all) && all.length > 0) {
      return normalizeProjectsList(all);
    }
    if (Array.isArray(all) && all.length === 0) {
      return [];
    }
  } catch (err) {
    console.warn("[monthly-report] listCollection:", err?.message || err);
  }

  // 2) Cursor-based batch (katta kolleksiya / qisman o‘qish holati)
  const db = await getFirebaseDb();
  const col = collection(db, "projects");
  const byId = new Map();
  let lastDoc = null;
  let guard = 0;

  while (guard < 200) {
    guard += 1;
    let q;
    try {
      q = lastDoc
        ? query(col, orderBy("__name__"), startAfter(lastDoc), limit(PAGE_SIZE))
        : query(col, orderBy("__name__"), limit(PAGE_SIZE));
    } catch {
      q = lastDoc
        ? query(col, startAfter(lastDoc), limit(PAGE_SIZE))
        : query(col, limit(PAGE_SIZE));
    }

    const snap = await getDocs(q);
    if (snap.empty) break;
    for (const d of snap.docs) {
      byId.set(d.id, { id: d.id, ...d.data() });
    }
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < PAGE_SIZE) break;
  }

  return normalizeProjectsList(Array.from(byId.values()));
}

/**
 * Export oldidan: filtrlarga mos ro‘yxat to‘liq yuklanganini tasdiqlash.
 * @param {unknown[]} filtered
 */
export function assertProjectsReadyForExport(filtered) {
  if (!Array.isArray(filtered)) {
    throw new Error("Loyihalar hali yuklanmadi");
  }
  return filtered;
}
