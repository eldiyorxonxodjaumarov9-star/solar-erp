import { initializeApp, getApps } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { resolveFirebaseConfigFromEnv } from "../shared/firebasePublicConfig.js";

let app = null;
let auth = null;
let db = null;
let storage = null;
let authReadyPromise = null;
let authDisabled = false;

function getConfig() {
  return resolveFirebaseConfigFromEnv(import.meta.env);
}

export function isFirebaseAuthDisabled() {
  return authDisabled;
}

function isAuthConfigMissingError(error) {
  return String(error?.message || "")
    .toLowerCase()
    .includes("auth/configuration-not-found");
}

function initFirebaseApp() {
  const config = getConfig();
  if (!config.apiKey || !config.projectId) {
    throw new Error("Firebase sozlanmagan (VITE_FIREBASE_* yo‘q)");
  }
  app = getApps().length ? getApps()[0] : initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  return { auth, db, storage };
}

/** Anonim kirish — Firestore rules `request.auth != null` talab qiladi. */
export function ensureFirebaseAuth() {
  if (authDisabled) return Promise.resolve(null);
  if (auth?.currentUser) return Promise.resolve(auth.currentUser);
  if (authReadyPromise) return authReadyPromise;

  authReadyPromise = (async () => {
    try {
      const { auth: a } = initFirebaseApp();
      if (a.currentUser) return a.currentUser;

      await new Promise((resolve, reject) => {
        let settled = false;
        const done = (fn, value) => {
          if (settled) return;
          settled = true;
          unsub();
          fn(value);
        };
        const unsub = onAuthStateChanged(
          a,
          (user) => {
            if (user) done(resolve, user);
          },
          (err) => done(reject, err),
        );
        signInAnonymously(a)
          .then(() => {
            if (a.currentUser) done(resolve, a.currentUser);
          })
          .catch((err) => done(reject, err));
        setTimeout(() => {
          if (!settled) done(reject, new Error("Firebase auth timeout"));
        }, 15000);
      });

      return a.currentUser;
    } catch (error) {
      authReadyPromise = null;
      if (isAuthConfigMissingError(error)) {
        authDisabled = true;
        console.warn("[firebase] Auth o‘chirilgan:", error?.message || error);
        return null;
      }
      throw error;
    }
  })();

  return authReadyPromise;
}

export async function getFirebaseDb() {
  await ensureFirebaseAuth();
  if (!db) initFirebaseApp();
  return db;
}

export { auth, db, storage };
export default app;
