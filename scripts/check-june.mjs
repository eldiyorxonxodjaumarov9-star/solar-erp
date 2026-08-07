import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { collection, getDocs, getFirestore, orderBy, query } from "firebase/firestore";
import { resolveFirebaseConfigFromEnv } from "../shared/firebasePublicConfig.js";

setTimeout(() => { console.log("[timeout]"); process.exit(0); }, 60000).unref();
const app = initializeApp(resolveFirebaseConfigFromEnv(process.env));
await signInAnonymously(getAuth(app));
const db = getFirestore(app);

// Ilova kabi orderBy(createdAt)
const q = query(collection(db, "user_activity_logs"), orderBy("createdAt", "desc"));
const snap = await getDocs(q);
const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const june = all.filter((x) => String(x.dateKey || "").startsWith("2026-06"));
console.log(`user_activity_logs (orderBy createdAt) jami: ${all.length}`);
console.log(`Iyun (2026-06) yozuvlar ilovaga ko‘rinadi: ${june.length}`);
const noCreated = june.filter((x) => x.createdAt == null).length;
console.log(`Iyun yozuvlarda createdAt yo‘q: ${noCreated}`);

// yo'riqnoma
const ysnap = await getDocs(collection(db, "usta_yorijnoma"));
const yors = ysnap.docs.map((d) => d.data());
const yNoCreated = yors.filter((y) => y.createdAt == null).length;
const yNoCompleted = yors.filter((y) => !y.completedAt).length;
console.log(`\nusta_yorijnoma jami: ${yors.length}, createdAt yo‘q: ${yNoCreated}, completedAt yo‘q: ${yNoCompleted}`);
process.exit(0);
