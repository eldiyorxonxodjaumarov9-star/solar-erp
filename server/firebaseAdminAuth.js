/** Server-only. Never import this module from src/ or expose it as an API route. */
import { readFile } from "node:fs/promises";

const APP_NAME = "solar-erp-server-auth";
let authPromise = null;

function authError(code, message) {
  return Object.assign(new Error(message), { code });
}

async function serviceAccountFromEnvironment() {
  const json = String(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON || "").trim();
  const file = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
  if (!json && !file) {
    throw authError("FIREBASE_ADMIN_CREDENTIALS_MISSING",
      "Firebase Admin credentials missing: set server-only FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.");
  }
  let account;
  try { account = JSON.parse(json || await readFile(file, "utf8")); }
  catch { throw authError("FIREBASE_ADMIN_CREDENTIALS_INVALID", "Firebase Admin credentials could not be read or parsed."); }
  if (!account || !account.project_id || !account.client_email || !account.private_key) {
    throw authError("FIREBASE_ADMIN_CREDENTIALS_INVALID", "Firebase Admin service account requires project_id, client_email and private_key.");
  }
  return account;
}

// Lazy initialization: importing/startup does not require credentials or contact Firebase.
export function assertProductionFirebaseEnvironment(env = process.env) {
  if (env.NODE_ENV === 'production' && ['FIREBASE_AUTH_EMULATOR_HOST','FIRESTORE_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST','STORAGE_EMULATOR_HOST'].some(key => env[key])) {
    throw authError('FIREBASE_PRODUCTION_EMULATOR_FORBIDDEN', 'Firebase emulators must not be configured on a production server.');
  }
}
export async function getServerAdminAuth() {
  assertProductionFirebaseEnvironment();
  if (!authPromise) {
    authPromise = (async () => {
      const { getApps, initializeApp, cert } = await import("firebase-admin/app");
      const { getAuth } = await import("firebase-admin/auth");
      const apps = getApps();
      const existing = apps.find((app) => app.name === APP_NAME) || apps.find((app) => app.name === "[DEFAULT]");
      if (existing) {
        if (process.env.FIREBASE_PROJECT_ID && existing.options.projectId !== process.env.FIREBASE_PROJECT_ID) {
          throw authError("FIREBASE_ADMIN_PROJECT_MISMATCH", "Existing Firebase Admin app project does not match the configured server project.");
        }
        return getAuth(existing);
      }
      const account = await serviceAccountFromEnvironment();
      if (process.env.FIREBASE_PROJECT_ID && account.project_id !== process.env.FIREBASE_PROJECT_ID) {
        throw authError("FIREBASE_ADMIN_PROJECT_MISMATCH", "Firebase Admin credential project does not match the configured server project.");
      }
      try { return getAuth(initializeApp({ credential: cert(account), projectId: account.project_id, ...(process.env.FIREBASE_STORAGE_BUCKET ? { storageBucket: process.env.FIREBASE_STORAGE_BUCKET.trim() } : {}) }, APP_NAME)); }
      catch { throw authError("FIREBASE_ADMIN_CREDENTIALS_INVALID", "Firebase Admin service account initialization failed."); }
    })().catch((error) => { authPromise = null; throw error; });
  }
  return authPromise;
}

/**
 * Future server login supplies the verifier; its result MUST come from the
 * server account store after verifying credentials, never req.body/session.
 * resolveAuthenticatedAccount(loginInput) -> { id, role, firebaseUid? } | null.
 * Account id is the workers doc ID for usta, assistants doc ID for asisten.
 * Only usta receives workerId; admin/asisten receive an empty workerId.
 */
export function createServerTokenIssuer(resolveAuthenticatedAccount) {
  if (typeof resolveAuthenticatedAccount !== "function") {
    throw authError("SERVER_ACCOUNT_VERIFIER_REQUIRED", "A server account verifier is required.");
  }
  return async function issueCustomToken(loginInput) {
    const account = await resolveAuthenticatedAccount(loginInput);
    if (!account) throw authError("AUTH_INVALID_CREDENTIALS", "Account authentication failed.");
    const role = account.role;
    const id = typeof account.id === "string" ? account.id.trim() : "";
    if (!["admin", "usta", "asisten"].includes(role) || !id || id.includes("/")) {
      throw authError("AUTH_INVALID_ACCOUNT", "Verified server account role or ID is invalid.");
    }
    const uid = account.firebaseUid === undefined ? `${role}:${id}` : account.firebaseUid;
    if (typeof uid !== "string" || !uid.trim() || uid.length > 128) {
      throw authError("AUTH_INVALID_UID", "Verified account Firebase UID must contain 1-128 characters.");
    }
    const workerId = role === "usta" ? id : "";
    const auth = await getServerAdminAuth();
    const claims = { role, workerId, accountId: id, sessionVersion: account.sessionVersion || 0,
      ...(role === "admin" ? { adminSessionVersion: account.adminSessionVersion || 0 } : {}),
      login: String(account.login || ""), name: String(account.name || ""),
      ...(role === "asisten" ? { assistantId: id } : {}) };
    try { return await auth.createCustomToken(uid, claims); }
    catch { throw authError("FIREBASE_CUSTOM_TOKEN_FAILED", "Firebase custom token signing failed; check server credentials and signing permissions."); }
  };
}

export async function getServerAdminDb() {
  const auth = await getServerAdminAuth();
  const { getFirestore } = await import("firebase-admin/firestore");
  return getFirestore(auth.app);
}
export async function verifyServerIdToken(token) {
  return (await getServerAdminAuth()).verifyIdToken(token, true);
}
