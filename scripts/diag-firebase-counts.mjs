import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveFirebaseConfigFromEnv } from "../shared/firebasePublicConfig.js";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { collection, getDocs, getFirestore, query } from "firebase/firestore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const cfg = resolveFirebaseConfigFromEnv(process.env);
const app = getApps().length ? getApps()[0] : initializeApp(cfg);
const auth = getAuth(app);
if (!auth.currentUser) await signInAnonymously(auth);
const db = getFirestore(app);

const names = [
  "workers",
  "users",
  "projects",
  "brigades",
  "expenses",
  "stage_photos",
  "assistants",
  "user_activity_logs",
];

for (const name of names) {
  try {
    const snap = await getDocs(query(collection(db, name)));
    console.log(`${name}: ${snap.size}`);
  } catch (e) {
    console.log(`${name}: xato (${e?.code || e?.message})`);
  }
}
