import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { collection, getDocs, getFirestore } from "firebase/firestore";
import { resolveFirebaseConfigFromEnv } from "../shared/firebasePublicConfig.js";

const TZ = "Asia/Tashkent";
const ymd = (i) => {
  const d = new Date(i);
  return Number.isNaN(d.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
};
const ym = (i) => ymd(i).slice(0, 7);

// Qotib qolmasligi uchun qattiq chiqish.
setTimeout(() => {
  console.log("\n[timeout] 40s tugadi — to‘xtatildi (kvota muammosi bo‘lishi mumkin).");
  process.exit(0);
}, 40000).unref();

const app = initializeApp(resolveFirebaseConfigFromEnv(process.env));
await signInAnonymously(getAuth(app));
const db = getFirestore(app);

async function read(name) {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
}
function countBy(arr, fn) {
  const m = new Map();
  for (const x of arr) {
    const k = fn(x);
    if (k) m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}

const workers = await read("workers").catch(() => []);
const logs = await read("user_activity_logs").catch((e) => { console.log("logs xato:", e.code); return []; });

console.log(`\nWORKERS: ${workers.length}`);
const ustas = workers.filter((w) => {
  const p = String(w.position || "").toLowerCase();
  return !p || (p !== "developer" && p !== "admin" && p !== "dasturchi");
});
console.log("Ustalar:", ustas.map((w) => w.fullName || w.name || w.login).join(", "));

console.log(`\nKELDI/KETDI (user_activity_logs): jami ${logs.length}`);
console.log("Oy bo‘yicha:");
for (const [k, v] of countBy(logs, (l) => String(l.dateKey || "").slice(0, 7) || ym(l.loginTime)))
  console.log(`  ${k}: ${v} yozuv`);
console.log(`keldi(loginTime) bor: ${logs.filter((l) => l.loginTime).length}`);
console.log(`ketdi(logoutTime) bor: ${logs.filter((l) => l.logoutTime).length}`);
console.log(`ustaId yo‘q: ${logs.filter((l) => !l.ustaId).length}`);
console.log("Usta bo‘yicha:");
for (const [k, v] of countBy(logs, (l) => l.ustaId)) {
  const w = workers.find((x) => String(x.id) === String(k));
  console.log(`  ${w ? (w.fullName || w.name || w.login) : "(noma'lum " + k + ")"}: ${v}`);
}

const yor = await read("usta_yorijnoma").catch((e) => { console.log("yor xato:", e.code); return []; });
console.log(`\nYO‘RIQNOMA: jami ${yor.length}`);
for (const y of yor) console.log(`  ${y.name || y.login || y.workerId}: ${y.completedAt || "?"}`);

const projects = await read("projects").catch((e) => { console.log("projects xato:", e.code); return []; });
console.log(`\nLOYIHALAR: jami ${projects.length}`);
for (const [k, v] of countBy(projects, (p) => String(p.holat || "yo‘q"))) console.log(`  holat="${k}": ${v}`);

console.log("\nTUGADI.");
process.exit(0);
