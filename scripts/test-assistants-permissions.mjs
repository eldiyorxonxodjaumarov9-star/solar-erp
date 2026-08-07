/**
 * assistants kolleksiyasiga anonim auth bilan o'qish/yozish/o'chirish testi.
 * Ishga tushirish: node scripts/test-assistants-permissions.mjs
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  query,
} from "firebase/firestore";
import { resolveFirebaseConfigFromEnv } from "../shared/firebasePublicConfig.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const cfg = resolveFirebaseConfigFromEnv(process.env);
const app = getApps().length ? getApps()[0] : initializeApp(cfg);
const auth = getAuth(app);

console.log("1) Anonim auth…");
if (!auth.currentUser) await signInAnonymously(auth);
console.log("   OK — uid:", auth.currentUser?.uid);

const db = getFirestore(app);

console.log("2) assistants o'qish…");
const snap = await getDocs(query(collection(db, "assistants")));
console.log("   OK — hujjatlar:", snap.size);

console.log("3) assistants yozish (test)…");
const testDoc = {
  fullName: "__permission_test__",
  login: `__test_${Date.now()}`,
  loginLower: `__test_${Date.now()}`,
  password: "test",
  phone: "",
  createdAt: new Date().toISOString(),
  _test: true,
};
const ref = await addDoc(collection(db, "assistants"), testDoc);
console.log("   OK — id:", ref.id);

console.log("4) test hujjatni o'chirish…");
await deleteDoc(doc(db, "assistants", ref.id));
console.log("   OK");

console.log("\n✅ assistants kolleksiyasi to'liq ishlayapti (o'qish + yozish + o'chirish).");
