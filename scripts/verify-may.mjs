import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { collection, getDocs, getFirestore } from "firebase/firestore";
import { resolveFirebaseConfigFromEnv } from "../shared/firebasePublicConfig.js";

setTimeout(() => { console.log("[timeout]"); process.exit(0); }, 40000).unref();

const app = initializeApp(resolveFirebaseConfigFromEnv(process.env));
await signInAnonymously(getAuth(app));
const db = getFirestore(app);

const wsnap = await getDocs(collection(db, "workers"));
const workers = wsnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));

const snap = await getDocs(collection(db, "user_activity_logs"));
const logs = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
console.log("user_activity_logs jami:", logs.length);

const may = logs.filter((l) => String(l.dateKey || "").startsWith("2026-05"));
console.log("May yozuvlar:", may.length);

const imp = logs.filter((l) => l?.deviceInfo?.source === "telegram-import");
console.log("telegram-import belgili:", imp.length);

// Usta bo‘yicha May noyob kunlar
const byUsta = new Map();
for (const l of may) {
  const w = workers.find((x) => String(x.id) === String(l.ustaId));
  const name = w ? (w.fullName || w.name || w.login) : `(${l.ustaName || l.ustaId})`;
  if (!byUsta.has(name)) byUsta.set(name, new Set());
  byUsta.get(name).add(String(l.dateKey || ""));
}
console.log("\nMay — usta bo‘yicha noyob kunlar:");
for (const [k, set] of [...byUsta.entries()].sort((a, b) => b[1].size - a[1].size))
  console.log(`  ${k}: ${set.size} kun`);
process.exit(0);
