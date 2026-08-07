import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { ensureFirebaseAuth, getFirebaseDb } from "../firebase.js";

const READ_ALIASES = {
  workers: ["workers", "users"],
};

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
  return READ_ALIASES[logicalName] || [logicalName];
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
  await ready();
  const { db, names } = await colRef(name);
  const byId = new Map();

  for (const colName of names) {
    const snap = await getDocs(query(collection(db, colName)));
    for (const docSnap of snap.docs) {
      if (!byId.has(docSnap.id)) {
        byId.set(docSnap.id, normalizeItem(docSnap.id, docSnap.data()));
      }
    }
  }

  return Array.from(byId.values());
}

export async function getCollectionDoc(name, id) {
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
    await ready();
    const { db, name: colName } = await colRef(name);
    const q = query(
      collection(db, colName),
      where(String(field || ""), "==", value),
    );
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch {
    return 0;
  }
}

export function subscribeCollection(name, onNext, onError) {
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
          query(collection(db, colName)),
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

export async function mergeProjectStageLock(projectId, stageId, stagePayload) {
  await ready();
  const pid = String(projectId || "").trim();
  const sid = String(stageId || "").trim();
  if (!pid || !sid) throw new Error("projectId va stageId kerak");

  const db = await getFirebaseDb();
  const ref = doc(db, "project_stage_locks", pid);
  const snap = await getDoc(ref);
  const prev = snap.exists() ? snap.data() : {};
  const stages = {
    ...(prev.stages && typeof prev.stages === "object" ? prev.stages : {}),
    [sid]: stagePayload,
  };
  const payload = {
    projectId: pid,
    stages,
    updatedAt: new Date().toISOString(),
  };
  await setDoc(ref, payload, { merge: true });
  return normalizeItem(pid, payload);
}
