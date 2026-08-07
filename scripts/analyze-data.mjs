import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { collection, getDocs, getFirestore } from "firebase/firestore";
import { resolveFirebaseConfigFromEnv } from "../shared/firebasePublicConfig.js";

const TZ = "Asia/Tashkent";
function ymd(instant) {
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
const ym = (i) => ymd(i).slice(0, 7);

const cfg = resolveFirebaseConfigFromEnv(process.env);
const app = initializeApp(cfg);
const auth = getAuth(app);
await signInAnonymously(auth);
const db = getFirestore(app);
console.log("Project:", cfg.projectId, "\n");

async function read(name) {
  try {
    const snap = await getDocs(collection(db, name));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  } catch (e) {
    console.log(`  !! ${name} o‘qib bo‘lmadi: ${e.code || e.message}`);
    return null;
  }
}

function countBy(arr, fn) {
  const m = new Map();
  for (const x of arr) {
    const k = fn(x);
    if (k == null || k === "") continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}
function sortedEntries(map) {
  return [...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}

const collections = [
  "workers",
  "user_activity_logs",
  "stage_photos",
  "usta_yorijnoma",
  "projects",
  "expenses",
  "brigades",
  "work_logs",
  "project_worker_days",
];

const data = {};
for (const c of collections) {
  const rows = await read(c);
  data[c] = rows;
  if (rows) console.log(`#${c}: ${rows.length} ta hujjat`);
}
console.log("\n==================================================\n");

// WORKERS
const workers = data.workers || [];
const ustas = workers.filter((w) => {
  const p = String(w.position || "").toLowerCase();
  return !p || (p !== "developer" && p !== "admin" && p !== "dasturchi");
});
console.log(`WORKERS: jami ${workers.length}, ustalar ${ustas.length}`);
console.log("Ustalar:", ustas.map((w) => `${w.fullName || w.name || "?"}(${w.login || w.id})`).join(", "));
console.log("");

// USER_ACTIVITY_LOGS (keldi/ketdi)
const logs = data.user_activity_logs || [];
console.log(`USER_ACTIVITY_LOGS (keldi/ketdi): jami ${logs.length}`);
const noKey = logs.filter((l) => !l.dateKey && !l.loginTime);
console.log(`  dateKey/loginTime yo‘q: ${noKey.length}`);
console.log("  Oy bo‘yicha:");
for (const [k, v] of sortedEntries(countBy(logs, (l) => String(l.dateKey || "").slice(0, 7) || ym(l.loginTime)))) {
  console.log(`    ${k}: ${v} yozuv`);
}
const arrivals = logs.filter((l) => l.loginTime).length;
const departures = logs.filter((l) => l.logoutTime).length;
console.log(`  loginTime(keldi) bor: ${arrivals}, logoutTime(ketdi) bor: ${departures}`);
console.log("  Usta bo‘yicha (ustaId -> yozuvlar):");
for (const [k, v] of sortedEntries(countBy(logs, (l) => l.ustaId))) {
  const w = workers.find((x) => String(x.id) === String(k));
  console.log(`    ${w ? (w.fullName || w.name || w.login) : k}: ${v}`);
}
// ustaId yo'q yozuvlar
const noUsta = logs.filter((l) => !l.ustaId);
if (noUsta.length) console.log(`  !! ustaId yo‘q yozuvlar: ${noUsta.length}`);
console.log("");

// STAGE_PHOTOS
const photos = data.stage_photos || [];
console.log(`STAGE_PHOTOS (rasmlar): jami ${photos.length}`);
console.log("  Oy bo‘yicha:");
for (const [k, v] of sortedEntries(countBy(photos, (p) => ym(p.uploadDate)))) {
  console.log(`    ${k}: ${v} rasm`);
}
console.log("  Usta bo‘yicha:");
for (const [k, v] of sortedEntries(countBy(photos, (p) => p.ustaId))) {
  const w = workers.find((x) => String(x.id) === String(k));
  console.log(`    ${w ? (w.fullName || w.name || w.login) : k}: ${v}`);
}
const photoNoUpload = photos.filter((p) => !p.uploadDate);
if (photoNoUpload.length) console.log(`  !! uploadDate yo‘q: ${photoNoUpload.length}`);
console.log("");

// YORIJNOMA
const yor = data.usta_yorijnoma || [];
console.log(`USTA_YORIJNOMA (imzolar): jami ${yor.length}`);
for (const y of yor) {
  console.log(`    ${y.name || y.login || y.workerId}: ${y.completedAt || "?"}`);
}
console.log("");

// PROJECTS
const projects = data.projects || [];
console.log(`PROJECTS (loyihalar): jami ${projects.length}`);
for (const [k, v] of sortedEntries(countBy(projects, (p) => String(p.holat || "?")))) {
  console.log(`    holat="${k}": ${v}`);
}
console.log("");

// EXPENSES
const exp = data.expenses || [];
console.log(`EXPENSES (xarajatlar): jami ${exp.length}`);
for (const [k, v] of sortedEntries(countBy(exp, (e) => String(e.date || "").slice(0, 7)))) {
  console.log(`    ${k}: ${v}`);
}

console.log("\n==================================================");
console.log("TEKSHIRUV: Hisobot sahifasi user_activity_logs(keldi/ketdi),");
console.log("stage_photos(rasm), usta_yorijnoma(imzo), projects(loyiha) ni ishlatadi.");
console.log("Yuqoridagi sonlar bilan solishtiring — barchasi mavjud bo‘lsa hammasi chiqadi.");
process.exit(0);
