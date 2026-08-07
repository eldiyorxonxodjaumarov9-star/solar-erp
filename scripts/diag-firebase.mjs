import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { collection, getDocs, getFirestore, limit, query } from "firebase/firestore";
import { resolveFirebaseConfigFromEnv } from "../shared/firebasePublicConfig.js";

const cfg = resolveFirebaseConfigFromEnv(process.env);
console.log("Project:", cfg.projectId);

const app = initializeApp(cfg);
const auth = getAuth(app);

try {
  const cred = await signInAnonymously(auth);
  console.log("✅ Anonymous auth OK. uid =", cred.user.uid);
} catch (e) {
  console.log("❌ Anonymous auth FAILED");
  console.log("   code   :", e?.code);
  console.log("   message:", e?.message);
  process.exit(1);
}

const db = getFirestore(app);
for (const name of ["workers", "stage_photos", "user_activity_logs"]) {
  try {
    const snap = await getDocs(query(collection(db, name), limit(1)));
    console.log(`✅ read ${name}: OK (${snap.size} doc o‘qildi)`);
  } catch (e) {
    console.log(`❌ read ${name}: ${e?.code} — ${e?.message}`);
  }
}
process.exit(0);
