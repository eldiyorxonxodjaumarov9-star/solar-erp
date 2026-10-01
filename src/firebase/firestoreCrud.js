import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  onSnapshot,
  or,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { api } from "../api/http";
import { collectionReadFilters } from "./queryAccess.js";
import { ensureFirebaseAuth, getFirebaseDb } from "../firebase.js";

const STAFF_COLLECTIONS = new Set(['workers','assistants']);
async function staffRequest(name, method = 'get', id = '', payload) {
  const user = await ensureFirebaseAuth();
  const headers = { Authorization: `Bearer ${await user.getIdToken()}` };
  const path = `/api/staff/${name}${id ? '/' + encodeURIComponent(id) : ''}`;
  if (method === 'get' || method === 'delete') return api[method](path, { headers });
  return api[method](path, payload, { headers });
}
async function collectionQuery(db, name) {
  const user = await ensureFirebaseAuth();
  const { claims } = await user.getIdTokenResult();
  const filters = collectionReadFilters(name, claims).map(filter => where(...filter));
  return query(collection(db,name), ...(filters.length > 1 ? [or(...filters)] : filters));
}

function stripUndefined(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function normalizeItem(id, data) {
  return { id, ...(data || {}) };
}

function physicalCollections(logicalName) {
  return [logicalName];
}

async function colRef(logicalName) {
  const db = await getFirebaseDb();
  const names = physicalCollections(logicalName);
  return { db, name: names[0], names };
}

async function ready() {
  await ensureFirebaseAuth();
}

export async function listCollection(name) {
  if (STAFF_COLLECTIONS.has(name)) return (await staffRequest(name)).items;
  await ready();
  const { db, names } = await colRef(name);
  const byId = new Map();

  for (const colName of names) {
    const snap = await getDocs(await collectionQuery(db, colName));
    for (const docSnap of snap.docs) {
      if (!byId.has(docSnap.id)) {
        byId.set(docSnap.id, normalizeItem(docSnap.id, docSnap.data()));
      }
    }
  }

  return Array.from(byId.values());
}

export async function getCollectionDoc(name, id) {
  if (STAFF_COLLECTIONS.has(name)) return (await listCollection(name)).find(item => String(item.id) === String(id)) || null;
  await ready();
  const docId = String(id || "").trim();
  if (!docId) return null;
  const { db, names } = await colRef(name);

  for (const colName of names) {
    const snap = await getDoc(doc(db, colName, docId));
    if (snap.exists()) {
      return normalizeItem(snap.id, snap.data());
    }
  }
  return null;
}

export async function countWhere(name, field, value) {
  try {
    if (STAFF_COLLECTIONS.has(name)) return (await listCollection(name)).filter(item => item[field] === value).length;
    await ready();
    const { db, name: colName } = await colRef(name);
    const q = query(
      await collectionQuery(db, colName),
      where(String(field || ""), "==", value),
    );
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch {
    return 0;
  }
}

export function subscribeCollection(name, onNext, onError) {
  if (STAFF_COLLECTIONS.has(name)) {
    let stopped = false;
    let timer;
    const poll = async () => {
      try { const items = await listCollection(name); if (!stopped) onNext(items); }
      catch(error) { if (!stopped && onError) onError(error); }
      finally { if (!stopped) timer = setTimeout(poll, 15000); }
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }
  let stopped = false;
  let unsubs = [];
  const merged = new Map();

  const emit = () => {
    if (!stopped) onNext(Array.from(merged.values()));
  };

  void (async () => {
    try {
      await ready();
      const { db, names } = await colRef(name);

      for (const colName of names) {
        const unsub = onSnapshot(
          await collectionQuery(db, colName),
          (snap) => {
            snap.docChanges().forEach((change) => {
              const key = change.doc.id;
              if (change.type === "removed") {
                if (colName === names[0] || !merged.has(key)) {
                  merged.delete(key);
                }
              } else if (!merged.has(key) || colName === names[0]) {
                merged.set(key, normalizeItem(key, change.doc.data()));
              }
            });
            emit();
          },
          (error) => {
            if (typeof onError === "function") onError(error);
          },
        );
        unsubs.push(unsub);
      }
    } catch (error) {
      if (typeof onError === "function") onError(error);
    }
  })();

  return () => {
    stopped = true;
    unsubs.forEach((u) => {
      if (typeof u === "function") u();
    });
    unsubs = [];
  };
}

export function subscribeDocument(collectionName, docId, onNext, onError) {
  if (STAFF_COLLECTIONS.has(collectionName)) return subscribeCollection(collectionName, list => onNext(list.find(item => String(item.id) === String(docId)) || null), onError);
  let stopped = false;
  let unsubs = [];

  void (async () => {
    try {
      await ready();
      const { db, names } = await colRef(collectionName);
      const id = String(docId || "").trim();
      if (!id) {
        onNext(null);
        return;
      }

      for (const colName of names) {
        const unsub = onSnapshot(
          doc(db, colName, id),
          (snap) => {
            if (!stopped) {
              onNext(snap.exists() ? normalizeItem(snap.id, snap.data()) : null);
            }
          },
          (error) => {
            if (typeof onError === "function") onError(error);
          },
        );
        unsubs.push(unsub);
      }
    } catch (error) {
      if (typeof onError === "function") onError(error);
    }
  })();

  return () => {
    stopped = true;
    unsubs.forEach((u) => {
      if (typeof u === "function") u();
    });
    unsubs = [];
  };
}

export async function addCollectionDoc(name, payload) {
  if (STAFF_COLLECTIONS.has(name)) return (await staffRequest(name, "post", "", payload)).item;
  await ready();
  const { db, name: colName } = await colRef(name);
  const now = new Date().toISOString();
  const data = stripUndefined({
    ...(payload || {}),
    createdAt: payload?.createdAt || now,
    updatedAt: now,
  });
  const ref = await addDoc(collection(db, colName), data);
  return normalizeItem(ref.id, data);
}

/** Idempotent create: retries return the first document without overwriting it. */
export async function createCollectionDocOnce(name, id, payload) {
  await ready();
  const docId = String(id || "").trim();
  if (!docId || docId.includes("/")) throw new Error("Hujjat id noto'g'ri");
  const { db, name: colName } = await colRef(name);
  const ref = doc(db, colName, docId);
  return runTransaction(db, async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists()) return normalizeItem(docId, existing.data());
    const now = new Date().toISOString();
    const data = stripUndefined({ ...payload, createdAt: payload.createdAt || now, updatedAt: now });
    transaction.set(ref, data);
    return normalizeItem(docId, data);
  });
}

export async function addCollectionDocWithId(name, id, payload) {
  await ready();
  const docId = String(id || "").trim();
  if (!docId) throw new Error("Hujjat id kerak");
  const { db, name: colName } = await colRef(name);
  const now = new Date().toISOString();
  const data = stripUndefined({
    ...(payload || {}),
    createdAt: payload?.createdAt || now,
    updatedAt: now,
  });
  const ref = doc(db, colName, docId);
  await setDoc(ref, data, { merge: true });
  return normalizeItem(docId, data);
}

export async function updateCollectionDoc(name, id, payload) {
  if (STAFF_COLLECTIONS.has(name)) return (await staffRequest(name, "put", id, payload)).item;
  await ready();
  const docId = String(id || "").trim();
  if (!docId) throw new Error("Hujjat id kerak");
  const { db, names } = await colRef(name);
  const now = new Date().toISOString();
  const patch = stripUndefined({
    ...(payload || {}),
    updatedAt: now,
  });

  let ref = null;
  let existing = null;
  for (const colName of names) {
    const candidate = doc(db, colName, docId);
    const snap = await getDoc(candidate);
    if (snap.exists()) {
      ref = candidate;
      existing = snap.data();
      break;
    }
  }
  if (!ref) {
    const colName = names[0];
    ref = doc(db, colName, docId);
    await setDoc(
      ref,
      stripUndefined({ ...patch, createdAt: patch.createdAt || now }),
      { merge: true },
    );
  } else {
    await updateDoc(ref, patch);
  }

  const after = await getDoc(ref);
  return normalizeItem(docId, { ...(existing || {}), ...(after.data() || {}), ...patch });
}

export async function deleteCollectionDoc(name, id) {
  if (STAFF_COLLECTIONS.has(name)) return staffRequest(name, "delete", id);
  await ready();
  const docId = String(id || "").trim();
  if (!docId) return;
  const { db, names } = await colRef(name);
  for (const colName of names) {
    try {
      await deleteDoc(doc(db, colName, docId));
    } catch {
      /* boshqa aliasda bo‘lmasa */
    }
  }
}

export async function mergeProjectStageLock(projectId, stageId, _stagePayload) {
  const result = await getCollectionDoc('project_stage_locks',projectId);
  if (!result?.stages?.[stageId]) throw new Error('Server bosqich yuborilishini tasdiqlamadi');
  return result;
}
