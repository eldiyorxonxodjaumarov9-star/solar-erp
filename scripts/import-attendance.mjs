import fs from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { collection, doc, getDocs, setDoc, getFirestore } from "firebase/firestore";
import { resolveFirebaseConfigFromEnv } from "../shared/firebasePublicConfig.js";

const WRITE = process.argv.includes("--write");

// O‘tkazib yuboriladigan (test/admin) nomlar.
const SKIP = ["test", "test usta", "eldiyorxoja", "xoja"];
// Qo‘lda moslashtirish (variantlar).
const ALIAS = {
  "zafar aka": "zafar",
  dostonboy: "dostonbek",
  muhamadiyor: "muxamadiyor",
};

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\b(aka|usta)\b/g, "")
    .replace(/[^a-zа-яёўқғҳ]/gi, "")
    .trim();
}

const days = JSON.parse(fs.readFileSync("scripts/recovered-attendance.json", "utf8"));

const app = initializeApp(resolveFirebaseConfigFromEnv(process.env));
await signInAnonymously(getAuth(app));
const db = getFirestore(app);

const workersSnap = await getDocs(collection(db, "workers"));
const workers = workersSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
const workerByNorm = new Map();
for (const w of workers) {
  const nm = norm(w.fullName || w.name || w.login);
  if (nm) workerByNorm.set(nm, w);
}

function matchWorker(name) {
  let nn = norm(name);
  if (ALIAS[name.toLowerCase().trim()]) nn = norm(ALIAS[name.toLowerCase().trim()]);
  if (workerByNorm.has(nn)) return workerByNorm.get(nn);
  // prefiks bo‘yicha (zafar aka -> zafar, dostonboy -> doston...)
  for (const [k, w] of workerByNorm) {
    if (nn.startsWith(k) || k.startsWith(nn)) {
      if (Math.min(nn.length, k.length) >= 4) return w;
    }
  }
  return null;
}

const existingSnap = await getDocs(collection(db, "user_activity_logs"));
const existing = new Set();
for (const d of existingSnap.docs) {
  const x = d.data() || {};
  const dk = String(x.dateKey || "").trim();
  if (x.ustaId && dk) existing.add(`${x.ustaId}|${dk}`);
}

const toWrite = [];
const skipped = [];
const mapping = new Map();
for (const d of days) {
  if (SKIP.includes(String(d.name).toLowerCase().trim())) {
    skipped.push(`${d.name} ${d.date} (test/admin)`);
    continue;
  }
  const w = matchWorker(d.name);
  const wid = w ? w.id : `tg-${norm(d.name) || "noma'lum"}`;
  const wname = w ? (w.fullName || w.name || d.name) : d.name;
  mapping.set(d.name, w ? `${wname}` : "(mos worker yo‘q -> eski/o‘chirilgan)");

  if (existing.has(`${wid}|${d.date}`)) {
    skipped.push(`${wname} ${d.date} (allaqachon bor)`);
    continue;
  }

  const loginIso = d.arrival ? new Date(`${d.date}T${d.arrival}:00+05:00`).toISOString() : new Date(`${d.date}T09:00:00+05:00`).toISOString();
  const logoutIso = d.departure ? new Date(`${d.date}T${d.departure}:00+05:00`).toISOString() : null;
  let total = null;
  if (logoutIso) total = Math.max(0, Math.round((new Date(logoutIso) - new Date(loginIso)) / 1000));

  // Ilova orderBy("createdAt") bilan o‘qiydi — bu maydon BO‘LISHI shart,
  // aks holda yozuv hisobotda ko‘rinmaydi.
  const createdAt = new Date(loginIso);
  toWrite.push({
    id: `imp-${d.date}-${wid}`,
    ustaId: wid,
    ustaName: wname,
    brigadeId: "",
    brigadeName: "",
    dateKey: d.date,
    loginTime: loginIso,
    logoutTime: logoutIso,
    totalWorkTime: total,
    deviceInfo: { source: "telegram-import" },
    isOnline: false,
    createdAt,
    updatedAt: createdAt,
  });
}

console.log("ISM MOSLASHTIRISH:");
for (const [k, v] of mapping) console.log(`  "${k}" -> ${v}`);
console.log(`\nYoziladigan yangi yozuvlar: ${toWrite.length}`);
console.log(`O‘tkazib yuborilgan: ${skipped.length}`);
if (skipped.length) console.log("  " + skipped.slice(0, 40).join("\n  "));

if (!WRITE) {
  console.log("\n[DRY-RUN] Hech narsa yozilmadi. Yozish uchun: node scripts/import-attendance.mjs --write");
  process.exit(0);
}

console.log("\nYOZILMOQDA...");
let ok = 0;
let fail = 0;
for (const rec of toWrite) {
  try {
    await setDoc(doc(db, "user_activity_logs", rec.id), rec);
    ok += 1;
  } catch (e) {
    fail += 1;
    console.log(`  !! ${rec.ustaName} ${rec.dateKey}: ${e.code || e.message}`);
  }
}
console.log(`\nTUGADI. Yozildi: ${ok}, xato: ${fail}`);
process.exit(0);
