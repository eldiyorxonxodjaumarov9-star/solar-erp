import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInWithCustomToken, signOut, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { resolveFirebaseConfigFromEnv } from "../shared/firebasePublicConfig.js";

let app = null;
let auth = null;
let db = null;
let storage = null;
const authDisabled = false;

function getConfig() {
  // Explicit public keys: passing the entire Vite env object can bundle unrelated VITE_* secrets.
  return resolveFirebaseConfigFromEnv({
    VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
    VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
  });
}

export function isFirebaseAuthDisabled() {
  return authDisabled;
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
  // Explicit local development only; release builds cannot opt into emulators.
  if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_EMULATORS === 'true' && ['localhost','127.0.0.1'].includes(globalThis.location?.hostname)) {
    connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
    connectFirestoreEmulator(db,'127.0.0.1',8080);
    connectStorageEmulator(storage,'127.0.0.1',9199);
  }
  return { auth, db, storage };
}

/** App permissions use a Firebase ID token verified by the server. No anonymous fallback. */
export function getClientAuth() {
  if (!auth) initFirebaseApp();
  return auth;
}
export async function signInServerToken(token) {
  const a = getClientAuth();
  return signInWithCustomToken(a, token);
}
export async function signOutFirebase() {
  return signOut(getClientAuth());
}
export async function ensureFirebaseAuth() {
  const a = getClientAuth();
  await a.authStateReady();
  if (!a.currentUser || a.currentUser.isAnonymous) throw new Error("Authenticated login required");
  return a.currentUser;
}

export async function getFirebaseDb() {
  await ensureFirebaseAuth();
  if (!db) initFirebaseApp();
  return db;
}

export { auth, db, storage };
export default app;
