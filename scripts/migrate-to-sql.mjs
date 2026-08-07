/**
 * Firebase va/yoki JSON fayldan SQL bazaga ma'lumot ko'chirish.
 *
 * Firebase: .env da VITE_FIREBASE_* bo'lishi kerak.
 * JSON: scripts/import-data.json — { "workers": [...], "projects": [...], ... }
 *
 * Ishga tushirish: node scripts/migrate-to-sql.mjs
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COLLECTIONS, importCollection, initDb, getDbDriver, getSqlitePath } from "../server/db/store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const LOCAL_STORAGE_MAP = {
  workers: ["users", "solar-erp-workers"],
  brigades: ["brigades", "solar-erp-brigades"],
  projects: ["projects", "solar-erp-projects"],
  expenses: ["expenses"],
  stage_photos: ["ustaPhotos"],
  assistants: ["assistants", "solar-erp-assistants"],
  user_activity_logs: ["userActivityLogs"],
  usta_yorijnoma: ["solar-erp-usta-yorijnoma-v1"],
};

async function fetchFirebaseCollection(db, name) {
  const { collection, getDocs, query } = await import("firebase/firestore");
  const snap = await getDocs(query(collection(db, name)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
}

async function loadFromFirebase() {
  const { resolveFirebaseConfigFromEnv } = await import("../shared/firebasePublicConfig.js");
  const cfg = resolveFirebaseConfigFromEnv(process.env);
  if (!cfg.apiKey || !cfg.projectId) {
    console.log("[migrate] Firebase sozlanmagan — o'tkazib yuborildi");
    return {};
  }

  const { initializeApp, getApps } = await import("firebase/app");
  const { getAuth, signInAnonymously } = await import("firebase/auth");
  const { getFirestore } = await import("firebase/firestore");

  const app = getApps().length ? getApps()[0] : initializeApp(cfg);
  const auth = getAuth(app);
  if (!auth.currentUser) await signInAnonymously(auth);
  const db = getFirestore(app);

  const out = {};
  for (const name of COLLECTIONS) {
    try {
      out[name] = await fetchFirebaseCollection(db, name);
      console.log(`[firebase] ${name}: ${out[name].length} ta`);
    } catch (e) {
      console.warn(`[firebase] ${name} o'qilmadi:`, e?.message || e);
      out[name] = [];
    }
  }

  const users = await fetchFirebaseCollection(db, "users").catch(() => []);
  if (users.length && (!out.workers || !out.workers.length)) {
    out.workers = users;
    console.log(`[firebase] users → workers: ${users.length} ta`);
  }

  return out;
}

function loadFromJsonFile() {
  const file = path.join(__dirname, "import-data.json");
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    console.log(`[json] ${file} yuklandi`);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    console.warn("[json] o'qish xatosi:", e?.message || e);
    return {};
  }
}

function loadFromBrowserExport() {
  const file = path.join(__dirname, "browser-localStorage-export.json");
  if (!fs.existsSync(file)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const out = {};
    for (const [collection, keys] of Object.entries(LOCAL_STORAGE_MAP)) {
      for (const key of keys) {
        const val = raw[key];
        if (!val) continue;
        const parsed = typeof val === "string" ? JSON.parse(val) : val;
        if (Array.isArray(parsed) && parsed.length) {
          out[collection] = parsed;
          break;
        }
        if (collection === "usta_yorijnoma" && parsed && typeof parsed === "object") {
          out[collection] = [parsed];
          break;
        }
      }
    }
    return out;
  } catch (e) {
    console.warn("[browser-export] xato:", e?.message || e);
    return {};
  }
}

function mergeCollections(target, source) {
  for (const name of COLLECTIONS) {
    const items = source[name];
    if (!Array.isArray(items) || !items.length) continue;
    const existing = target[name] || [];
    const byId = new Map(existing.map((d) => [String(d.id), d]));
    for (const doc of items) {
      if (!doc?.id) continue;
      byId.set(String(doc.id), { ...byId.get(String(doc.id)), ...doc });
    }
    target[name] = [...byId.values()];
  }
}

async function main() {
  await initDb();
  console.log(`[db] driver=${getDbDriver()} path=${getSqlitePath()}`);

  const merged = {};
  mergeCollections(merged, loadFromJsonFile());
  mergeCollections(merged, loadFromBrowserExport());
  mergeCollections(merged, await loadFromFirebase());

  let total = 0;
  for (const name of COLLECTIONS) {
    const items = merged[name];
    if (!Array.isArray(items) || !items.length) continue;
    const count = await importCollection(name, items);
    total += count;
    console.log(`[import] ${name}: ${count} ta`);
  }

  console.log(`\nTayyor. Jami ${total} ta hujjat import qilindi.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
