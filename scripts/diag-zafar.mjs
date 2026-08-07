import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { collection, getDocs, getFirestore } from "firebase/firestore";
import { resolveFirebaseConfigFromEnv } from "../shared/firebasePublicConfig.js";

setTimeout(() => { console.log("[timeout]"); process.exit(0); }, 60000).unref();

const app = initializeApp(resolveFirebaseConfigFromEnv(process.env));
await signInAnonymously(getAuth(app));
const db = getFirestore(app);

const wsnap = await getDocs(collection(db, "workers"));
const workers = wsnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
console.log("=== WORKERS ===");
for (const w of workers) {
  console.log(`  id=${w.id} | name=${w.fullName || w.name || ""} | login=${w.login || ""} | position=${w.position || ""}`);
}

const snap = await getDocs(collection(db, "user_activity_logs"));
const logs = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
const may = logs.filter((l) => {
  const dk = String(l.dateKey || "");
  if (dk.startsWith("2026-05")) return true;
  const lt = l.loginTime ? new Date(l.loginTime) : null;
  return lt && lt.getUTCFullYear() === 2026 && lt.getUTCMonth() === 4;
});

console.log("\n=== MAY logs jami:", may.length, "===");

// ustaId bo‘yicha guruh
const byId = new Map();
for (const l of may) {
  const k = String(l.ustaId || "(yo'q)");
  if (!byId.has(k)) byId.set(k, []);
  byId.get(k).push(l);
}

const wmap = new Map(workers.map((w) => [String(w.id), w]));
console.log("\n=== MAY ustaId bo‘yicha ===");
for (const [uid, arr] of [...byId.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const w = wmap.get(uid);
  const days = new Set(arr.map((x) => String(x.dateKey || "").slice(0, 10)).filter(Boolean));
  const withLogin = arr.filter((x) => x.loginTime).length;
  const sample = arr[0] || {};
  console.log(
    `  ustaId=${uid} | worker=${w ? (w.fullName || w.name || w.login) : "*** WORKERS'da YO'Q ***"} | position=${w?.position || "-"} | yozuv=${arr.length} | noyob kun=${days.size} | loginTime bor=${withLogin} | ustaName=${sample.ustaName || "-"} | source=${sample?.deviceInfo?.source || "-"}`,
  );
}

// Zafar nomli barcha
console.log("\n=== 'zafar' nomli/loginli workerlar ===");
for (const w of workers) {
  const hay = `${w.fullName || ""} ${w.name || ""} ${w.login || ""}`.toLowerCase();
  if (hay.includes("zafar")) console.log(`  id=${w.id} | ${w.fullName || w.name} | login=${w.login} | position=${w.position || "-"}`);
}
process.exit(0);
