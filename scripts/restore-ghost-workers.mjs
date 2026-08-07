/**
 * Firebase workers kolleksiyasida faqat points qolgan (profil maydonlari yo‘q) yozuvlarni
 * mahalliy SQLite dan tiklaydi.
 *
 * Ishga tushirish: node scripts/restore-ghost-workers.mjs
 * Dry-run: node scripts/restore-ghost-workers.mjs --dry-run
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { doc, getDoc, getFirestore, setDoc } from "firebase/firestore";
import { resolveFirebaseConfigFromEnv } from "../shared/firebasePublicConfig.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
dotenv.config({ path: path.join(root, ".env") });

const dryRun = process.argv.includes("--dry-run");
const dbPath = path.join(root, "data", "solar-erp.db");

function workerDisplayName(w) {
  return String(
    w?.fullName || w?.name || w?.workerName || w?.login || "",
  ).trim();
}

function isGhostProfile(data) {
  if (!data || typeof data !== "object") return true;
  const hasName = Boolean(workerDisplayName(data));
  const hasLogin = Boolean(String(data.login || data.username || "").trim());
  return !hasName && !hasLogin;
}

function loadLocalWorkers() {
  const db = new Database(dbPath, { readonly: true });
  const rows = db
    .prepare("SELECT id, data FROM documents WHERE collection = 'workers'")
    .all();
  const map = new Map();
  for (const row of rows) {
    try {
      map.set(String(row.id), { id: String(row.id), ...JSON.parse(row.data) });
    } catch {
      /* ignore */
    }
  }
  return map;
}

async function main() {
  const localWorkers = loadLocalWorkers();
  console.log(`[restore] Mahalliy SQLite: ${localWorkers.size} ta worker`);

  const cfg = resolveFirebaseConfigFromEnv(process.env);
  const app = getApps().length ? getApps()[0] : initializeApp(cfg);
  const auth = getAuth(app);
  if (!auth.currentUser) await signInAnonymously(auth);
  const db = getFirestore(app);

  let restored = 0;
  let skipped = 0;

  for (const [id, local] of localWorkers) {
    const ref = doc(db, "workers", id);
    const snap = await getDoc(ref);
    const remote = snap.exists() ? snap.data() || {} : null;

    if (remote && !isGhostProfile(remote)) {
      skipped += 1;
      continue;
    }

    const fullName = workerDisplayName(local);
    const login = String(local.login || "").trim();
    if (!fullName && !login) {
      console.log(`[restore] ${id}: mahalliy profilda ism/login yo‘q — o‘tkazildi`);
      continue;
    }

    const payload = {
      fullName: fullName || login,
      login,
      loginLower: login.toLowerCase(),
      phone: String(local.phone || "").trim(),
      position: String(local.position || "Master").trim(),
      password: String(local.password || "").trim(),
      brigadeId: String(local.brigadeId || "").trim(),
      brigadeName: String(local.brigadeName || "").trim(),
      experienceYears: String(local.experienceYears || "").trim(),
      rating: String(local.rating || "").trim(),
      points: remote?.points || local.points || undefined,
      updatedAt: new Date().toISOString(),
    };

    if (!payload.password) {
      console.log(`[restore] ${id} (${fullName}): parol yo‘q — o‘tkazildi`);
      continue;
    }

    console.log(
      `[restore] ${dryRun ? "DRY " : ""}${fullName} (${login}) ← SQLite`,
    );

    if (!dryRun) {
      await setDoc(ref, payload, { merge: true });
    }
    restored += 1;
  }

  console.log(`[restore] Tiklandi: ${restored}, o‘zgartirilmadi: ${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
