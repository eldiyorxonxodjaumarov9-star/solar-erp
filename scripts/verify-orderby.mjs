import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { collection, getDocs, getFirestore, orderBy, query } from "firebase/firestore";
import { resolveFirebaseConfigFromEnv } from "../shared/firebasePublicConfig.js";

setTimeout(() => { console.log("[timeout]"); process.exit(0); }, 60000).unref();
const app = initializeApp(resolveFirebaseConfigFromEnv(process.env));
await signInAnonymously(getAuth(app));
const db = getFirestore(app);

const wsnap = await getDocs(collection(db, "workers"));
const workers = new Map(wsnap.docs.map((d) => [d.id, d.data() || {}]));

// Ilovadagi kabi: orderBy createdAt desc
const q = query(collection(db, "user_activity_logs"), orderBy("createdAt", "desc"));
const snap = await getDocs(q);
console.log("orderBy(createdAt) bilan o‘qildi:", snap.size, "(ilova shuni ko‘radi)");

const may = snap.docs.map((d) => d.data()).filter((x) => String(x.dateKey || "").startsWith("2026-05"));
const byUsta = new Map();
for (const l of may) {
  const w = workers.get(String(l.ustaId));
  const name = w ? (w.fullName || w.name || w.login) : `(${l.ustaName || l.ustaId})`;
  if (!byUsta.has(name)) byUsta.set(name, new Set());
  byUsta.get(name).add(String(l.dateKey));
}
console.log("\nMay — usta bo‘yicha noyob kunlar (ilova ko‘rinishi):");
for (const [k, set] of [...byUsta.entries()].sort((a, b) => b[1].size - a[1].size))
  console.log(`  ${k}: ${set.size} kun`);
process.exit(0);
