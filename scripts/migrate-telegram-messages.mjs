/**
 * Eski Telegram ma'lumotlarini Firestore `telegram_messages` ga ko'chirish.
 *
 * Manbalar:
 * - Firestore telegram_events
 * - SQL telegram_events (agar bor bo'lsa)
 * - data/master-daily-uploads.json
 *
 * Ishga tushirish: node scripts/migrate-telegram-messages.mjs
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTelegramMessageRecord, buildMessageTextFromEvent } from "../shared/buildTelegramMessage.js";
import {
  TELEGRAM_MESSAGE_MODULES,
  TELEGRAM_MESSAGE_STATUS,
} from "../shared/telegramMessageTypes.js";
import { TELEGRAM_EVENTS_COLLECTION } from "../shared/telegramEventTypes.js";
import { saveTelegramMessageToFirestore } from "../server/telegramMessageFirestore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function loadFirestoreCollection(name) {
  const { resolveFirebaseConfigFromEnv } = await import("../shared/firebasePublicConfig.js");
  const cfg = resolveFirebaseConfigFromEnv(process.env);
  if (!cfg.apiKey || !cfg.projectId) return [];
  const { initializeApp, getApps } = await import("firebase/app");
  const { getAuth, signInAnonymously } = await import("firebase/auth");
  const { collection, getDocs, getFirestore, query } = await import("firebase/firestore");
  const app = getApps().length ? getApps()[0] : initializeApp(cfg);
  const auth = getAuth(app);
  if (!auth.currentUser) await signInAnonymously(auth);
  const db = getFirestore(app);
  const snap = await getDocs(query(collection(db, name)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
}

async function loadSqlTelegramEvents() {
  try {
    const { initDb, listCollection } = await import("../server/db/store.js");
    await initDb();
    return await listCollection(TELEGRAM_EVENTS_COLLECTION);
  } catch {
    return [];
  }
}

function loadMasterDailyUploads() {
  const file = path.join(__dirname, "..", "data", "master-daily-uploads.json");
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const rows = [];
    for (const [dateKey, bucket] of Object.entries(parsed || {})) {
      if (!bucket || typeof bucket !== "object") continue;
      for (const [workerKey, row] of Object.entries(bucket)) {
        if (!row || typeof row !== "object") continue;
        const flags = [
          ["loggedIn", "Tizimga kirdi"],
          ["arrival", "Keldi rasmi yuklandi"],
          ["departure", "Ketdi rasmi yuklandi"],
          ["stage", "Bosqich rasmi yuklandi"],
        ];
        for (const [flag, label] of flags) {
          if (!row[flag]) continue;
          const sentAt = `${dateKey}T12:00:00.000Z`;
          rows.push(
            buildTelegramMessageRecord({
              workerId: workerKey.startsWith("name:") ? "" : workerKey,
              workerName: row.name || workerKey,
              workerLogin: row.login || "",
              messageText: `${label}\nUsta: ${row.name || workerKey}\nSana: ${dateKey}`,
              sentAt,
              dateKey,
              module: TELEGRAM_MESSAGE_MODULES.MASTER_TRACKING,
              status: TELEGRAM_MESSAGE_STATUS.MIGRATED,
              source: "migration_master_daily_uploads",
              legacySource: "master-daily-uploads",
              legacyId: `${dateKey}_${workerKey}_${flag}`,
            }),
          );
        }
      }
    }
    return rows;
  } catch (e) {
    console.warn("[migrate] master-daily-uploads o'qilmadi:", e?.message || e);
    return [];
  }
}

function eventToMessage(event, legacySource) {
  return buildTelegramMessageRecord({
    workerId: event.workerId,
    workerName: event.workerName,
    workerLogin: event.workerLogin,
    eventType: event.eventType,
    dateKey: event.dateKey,
    sentAt: event.sentAt || event.createdAt,
    time: event.time,
    messageText: buildMessageTextFromEvent(event),
    meta: event.meta,
    status: TELEGRAM_MESSAGE_STATUS.MIGRATED,
    source: `migration_${legacySource}`,
    legacySource,
    legacyId: event.id,
  });
}

async function upsertRecord(record) {
  const docId = record.legacyId
    ? `migrated_${record.legacySource}_${record.legacyId}`
    : undefined;
  await saveTelegramMessageToFirestore(record, { docId, merge: true });
}

async function main() {
  let count = 0;

  console.log("[migrate] Firestore telegram_events…");
  const fsEvents = await loadFirestoreCollection(TELEGRAM_EVENTS_COLLECTION);
  for (const e of fsEvents) {
    await upsertRecord(eventToMessage(e, "telegram_events"));
    count += 1;
  }
  console.log(`  → ${fsEvents.length} ta`);

  console.log("[migrate] SQL telegram_events…");
  const sqlEvents = await loadSqlTelegramEvents();
  for (const e of sqlEvents) {
    await upsertRecord(eventToMessage(e, "sql_telegram_events"));
    count += 1;
  }
  console.log(`  → ${sqlEvents.length} ta`);

  console.log("[migrate] master-daily-uploads.json…");
  const uploads = loadMasterDailyUploads();
  for (const row of uploads) {
    await upsertRecord(row);
    count += 1;
  }
  console.log(`  → ${uploads.length} ta`);

  console.log(`\n✅ Jami ${count} ta yozuv telegram_messages ga ko'chirildi (dublikatlar merge).`);
}

main().catch((e) => {
  console.error("Migrate xato:", e?.message || e);
  process.exit(1);
});
