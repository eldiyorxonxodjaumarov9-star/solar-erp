import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { collection, doc, getDocs, getFirestore, setDoc } from "firebase/firestore";
import { resolveFirebaseConfigFromEnv } from "../shared/firebasePublicConfig.js";

const WRITE = process.argv.includes("--write");
setTimeout(() => { console.log("[timeout]"); process.exit(0); }, 120000).unref();

const app = initializeApp(resolveFirebaseConfigFromEnv(process.env));
await signInAnonymously(getAuth(app));
const db = getFirestore(app);

// orderBy("createdAt") ishlatadigan barcha kolleksiyalar — bu maydon yo‘q hujjatlar
// ilovada ko‘rinmaydi. Shuning uchun hammasiga createdAt qo‘shamiz.
const COLLECTIONS = [
  "user_activity_logs",
  "usta_yorijnoma",
  "user_actions_logs",
];

for (const name of COLLECTIONS) {
  let snap;
  try {
    snap = await getDocs(collection(db, name));
  } catch (e) {
    console.log(`! ${name}: o‘qib bo‘lmadi (${e.code || e.message})`);
    continue;
  }
  const missing = snap.docs.filter((d) => {
    const x = d.data() || {};
    return x.createdAt === undefined || x.createdAt === null;
  });
  console.log(`\n=== ${name}: jami ${snap.size}, createdAt yo‘q: ${missing.length} ===`);
  if (!WRITE || missing.length === 0) continue;

  let ok = 0;
  let fail = 0;
  for (const d of missing) {
    const x = d.data() || {};
    // Mantiqiy vaqt: loginTime / uploadDate / completedAt / aks holda hozir.
    const base =
      x.loginTime || x.uploadDate || x.completedAt || x.date || x.dateKey || null;
    let when = base ? new Date(base) : new Date();
    if (Number.isNaN(when.getTime())) when = new Date();
    try {
      await setDoc(
        doc(db, name, d.id),
        { createdAt: when, updatedAt: when },
        { merge: true },
      );
      ok += 1;
    } catch (e) {
      fail += 1;
      console.log(`  !! ${d.id}: ${e.code || e.message}`);
    }
  }
  console.log(`  Tuzatildi: ${ok}, xato: ${fail}`);
}

if (!WRITE) {
  console.log("\n[DRY-RUN] Hech narsa yozilmadi. Yozish: node scripts/fix-missing-createdat.mjs --write");
}
process.exit(0);
