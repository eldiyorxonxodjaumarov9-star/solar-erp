import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { collection, doc, getDocs, getFirestore, setDoc } from "firebase/firestore";
import { resolveFirebaseConfigFromEnv } from "../shared/firebasePublicConfig.js";

setTimeout(() => { console.log("[timeout]"); process.exit(0); }, 60000).unref();

const app = initializeApp(resolveFirebaseConfigFromEnv(process.env));
await signInAnonymously(getAuth(app));
const db = getFirestore(app);

const snap = await getDocs(collection(db, "workers"));
const zero = { keldi: 0, ketdi: 0, rasm: 0, loyiha: 0, xarajat: 0, total: 0 };

let ok = 0;
for (const d of snap.docs) {
  try {
    await setDoc(doc(db, "workers", d.id), { points: { ...zero } }, { merge: true });
    ok += 1;
  } catch (e) {
    console.log(`  !! ${d.id}: ${e.code || e.message}`);
  }
}
console.log(`Ballar 0 ga tushirildi: ${ok} ta usta`);
process.exit(0);
