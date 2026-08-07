import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  collection,
  getCountFromServer,
  getDocs,
  getFirestore,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { resolveFirebaseConfigFromEnv } from "../shared/firebasePublicConfig.js";

setTimeout(() => { console.log("[timeout]"); process.exit(0); }, 90000).unref();

function normPoints(p) {
  const g = (k) => Number(p?.[k] || 0) || 0;
  const keldi = g("keldi");
  const ketdi = g("ketdi");
  const rasm = g("rasm");
  const loyiha = g("loyiha");
  const xarajat = g("xarajat");
  const sum = keldi + ketdi + rasm + loyiha + xarajat;
  const total =
    p?.total != null && Number.isFinite(Number(p.total))
      ? Number(p.total)
      : sum;
  return { keldi, ketdi, rasm, loyiha, xarajat, sum, total, ok: total === sum };
}

const app = initializeApp(resolveFirebaseConfigFromEnv(process.env));
await signInAnonymously(getAuth(app));
const db = getFirestore(app);

console.log("=== BALL TEKSHIRUV (workers.points) ===\n");

const wsnap = await getDocs(collection(db, "workers"));
const workers = wsnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));

let withPoints = 0;
let mismatch = 0;
let grandTotal = 0;

const rows = [];
for (const w of workers) {
  const name = w.fullName || w.name || w.login || w.id;
  const p = normPoints(w.points);
  if (p.total > 0) withPoints += 1;
  if (!p.ok && p.total > 0) mismatch += 1;
  grandTotal += p.total;
  rows.push({ name, login: w.login || "—", ...p });
}

rows.sort((a, b) => b.total - a.total);

console.log(`Ustalar jami: ${workers.length}`);
console.log(`Ball > 0 bo‘lgan ustalar: ${withPoints}`);
console.log(`Jami ball (barcha ustalar): ${grandTotal}`);
console.log(`Total ≠ sum bo‘lgan (xato): ${mismatch}\n`);

console.log("Usta bo‘yicha ball:");
for (const r of rows) {
  if (r.total === 0 && r.sum === 0) continue;
  const flag = r.ok ? "" : " ⚠ total≠sum";
  console.log(
    `  ${r.name} (${r.login}): jami=${r.total} | keldi=${r.keldi} ketdi=${r.ketdi} rasm=${r.rasm} loyiha=${r.loyiha} xarajat=${r.xarajat}${flag}`,
  );
}
if (withPoints === 0) {
  console.log("  (Hozir hammasi 0 — yangi harakat qilinganidan keyin oshadi)");
}

console.log("\n=== HISOBOT TEKSHIRUV (Firebase ma'lumot) ===\n");

const q = query(collection(db, "user_activity_logs"), orderBy("createdAt", "desc"));
const logsSnap = await getDocs(q);
const logs = logsSnap.docs.map((d) => d.data());
console.log(`user_activity_logs (ilova ko‘radi): ${logs.length}`);

const june = logs.filter((l) => String(l.dateKey || "").startsWith("2026-06"));
const byUsta = new Map();
for (const l of june) {
  const uid = String(l.ustaId || "");
  if (!byUsta.has(uid)) byUsta.set(uid, { days: new Set(), keldi: 0, ketdi: 0 });
  const row = byUsta.get(uid);
  const dk = String(l.dateKey || "").slice(0, 10);
  if (dk) row.days.add(dk);
  if (l.loginTime) row.keldi += 1;
  if (l.logoutTime) row.ketdi += 1;
}

const wmap = new Map(workers.map((w) => [w.id, w]));
console.log(`Iyun (2026-06) keldi/ketdi yozuvlar: ${june.length}`);
console.log("Iyun — usta bo‘yicha (hisobotdagi keldi/ketdi kunlar):\n");
for (const [uid, st] of [...byUsta.entries()].sort((a, b) => b[1].days.size - a[1].days.size)) {
  const w = wmap.get(uid);
  const name = w ? w.fullName || w.name || w.login : `(${uid})`;
  console.log(`  ${name}: ${st.days.size} kun (loginTime bor: ${st.keldi}, logout: ${st.ketdi})`);
}

// Rasm soni (count — hisobot bilan solishtirish)
console.log("\nRasm soni (stage_photos, usta bo‘yicha — faqat >0):");
for (const w of workers) {
  try {
    const cs = await getCountFromServer(
      query(collection(db, "stage_photos"), where("ustaId", "==", w.id)),
    );
    const n = cs.data().count;
    if (n > 0) {
      console.log(`  ${w.fullName || w.name || w.login}: ${n} ta rasm`);
    }
  } catch (e) {
    console.log(`  count xato (${w.login || w.id}): ${e.code || e.message}`);
    break;
  }
}

const ysnap = await getDocs(collection(db, "usta_yorijnoma"));
console.log(`\nusta_yorijnoma (imzo) jami: ${ysnap.size}`);

console.log("\n=== XULOSA ===");
console.log("- Ball: workers.points maydonida saqlanadi (har harakat +1).");
console.log("- Hisobot: keldi/ketdi user_activity_logs dan, rasm stage_photos dan.");
console.log("- Hisobot sahifasida «Ball» ustuni hozir YO‘Q (alohida ⭐ badge va Ustalar kartasida).");
process.exit(0);
