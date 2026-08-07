/**
 * Telegram hisobot uchun barcha manbalardan xabar/rasm tiklash → Firestore telegram_messages.
 *
 * node scripts/restore-telegram-report.mjs
 * node scripts/restore-telegram-report.mjs --from=2026-06-01 --to=2026-06-30
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
import { TELEGRAM_EVENT_TYPES, TELEGRAM_EVENTS_COLLECTION } from "../shared/telegramEventTypes.js";
import { saveTelegramMessageToFirestore } from "../server/telegramMessageFirestore.js";
import { instantToTashkentYMD } from "../src/photos/tashkentTime.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
dotenv.config({ path: path.join(root, ".env") });

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const FROM = arg("from", "2026-06-01");
const TO = arg("to", "2026-06-30");

function inRange(dateKey, sentAt) {
  const dk =
    String(dateKey || "").slice(0, 10) ||
    instantToTashkentYMD(sentAt) ||
    String(sentAt || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) return false;
  return dk >= FROM && dk <= TO;
}

function timeHm(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

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

async function loadSqlCollection(name) {
  const { initDb, listCollection } = await import("../server/db/store.js");
  await initDb();
  return listCollection(name);
}

function loadRecoveredAttendance() {
  const file = path.join(root, "scripts", "recovered-attendance.json");
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

function loadMasterDailyUploads() {
  const file = path.join(root, "data", "master-daily-uploads.json");
  if (!fs.existsSync(file)) return [];
  const rows = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const [dateKey, bucket] of Object.entries(parsed || {})) {
      if (!inRange(dateKey)) continue;
      for (const [workerKey, row] of Object.entries(bucket || {})) {
        if (!row || typeof row !== "object") continue;
        const flags = [
          ["loggedIn", "Tizimga kirdi", TELEGRAM_MESSAGE_MODULES.KELDI],
          ["arrival", "Keldi rasmi yuklandi", TELEGRAM_MESSAGE_MODULES.KELDI],
          ["departure", "Ketdi rasmi yuklandi", TELEGRAM_MESSAGE_MODULES.KETDI],
          ["stage", "Bosqich rasmi yuklandi", TELEGRAM_MESSAGE_MODULES.RASM],
        ];
        for (const [flag, label, mod] of flags) {
          if (!row[flag]) continue;
          rows.push(
            buildTelegramMessageRecord({
              workerId: workerKey.startsWith("name:") ? "" : workerKey,
              workerName: row.name || workerKey,
              workerLogin: row.login || "",
              messageText: `${label}\nUsta: ${row.name || workerKey}\nSana: ${dateKey}`,
              sentAt: `${dateKey}T12:00:00.000Z`,
              dateKey,
              module: mod,
              status: TELEGRAM_MESSAGE_STATUS.MIGRATED,
              source: "restore_master_daily_uploads",
              legacySource: "master-daily-uploads",
              legacyId: `${dateKey}_${workerKey}_${flag}`,
            }),
          );
        }
      }
    }
  } catch (e) {
    console.warn("[restore] master-daily-uploads:", e?.message || e);
  }
  return rows;
}

function recoveredToMessages(rows) {
  const out = [];
  for (const row of rows) {
    const dateKey = String(row.date || "").slice(0, 10);
    if (!inRange(dateKey)) continue;
    const name = String(row.name || "").trim();
    if (row.arrival) {
      const sentAt = `${dateKey}T${String(row.arrival).replace(":", "")}:00.000Z`.replace(
        /T(\d{2})(\d{2}):/,
        "T$1:$2:",
      );
      out.push(
        buildTelegramMessageRecord({
          workerName: name,
          eventType: TELEGRAM_EVENT_TYPES.KELDI,
          dateKey,
          sentAt: row.arrival.includes(":") ? `${dateKey}T${row.arrival}:00.000Z` : sentAt,
          time: row.arrival,
          messageText: `✅ Ishga keldi\nUsta: ${name}\nVaqt: ${row.arrival}\nSana: ${dateKey}`,
          module: TELEGRAM_MESSAGE_MODULES.KELDI,
          status: TELEGRAM_MESSAGE_STATUS.MIGRATED,
          source: "restore_recovered_attendance",
          legacySource: "recovered-attendance",
          legacyId: `rec_keldi_${name}_${dateKey}`,
        }),
      );
    }
    if (row.departure) {
      out.push(
        buildTelegramMessageRecord({
          workerName: name,
          eventType: TELEGRAM_EVENT_TYPES.KETDI,
          dateKey,
          sentAt: `${dateKey}T${row.departure}:00.000Z`,
          time: row.departure,
          messageText: `🏁 Ishdan ketdi\nUsta: ${name}\nVaqt: ${row.departure}\nSana: ${dateKey}`,
          module: TELEGRAM_MESSAGE_MODULES.KETDI,
          status: TELEGRAM_MESSAGE_STATUS.MIGRATED,
          source: "restore_recovered_attendance",
          legacySource: "recovered-attendance",
          legacyId: `rec_ketdi_${name}_${dateKey}`,
        }),
      );
    }
    if (row.dayOff) {
      out.push(
        buildTelegramMessageRecord({
          workerName: name,
          eventType: TELEGRAM_EVENT_TYPES.DAY_OFF,
          dateKey,
          sentAt: `${dateKey}T12:00:00.000Z`,
          messageText: `🌴 Dam olish kuni\nUsta: ${name}\nSana: ${dateKey}`,
          module: TELEGRAM_MESSAGE_MODULES.DAY_OFF,
          status: TELEGRAM_MESSAGE_STATUS.MIGRATED,
          source: "restore_recovered_attendance",
          legacySource: "recovered-attendance",
          legacyId: `rec_off_${name}_${dateKey}`,
        }),
      );
    }
  }
  return out;
}

function activityLogToMessages(log) {
  const workerId = String(log.ustaId || "").trim();
  const dateKey = String(log.dateKey || "").trim() || instantToTashkentYMD(log.loginTime);
  if (!inRange(dateKey, log.loginTime)) return [];
  const workerName = String(log.ustaName || "").trim();
  const workerLogin = String(log.ustaLogin || log.login || "").trim().toLowerCase();
  const out = [];
  if (log.loginTime) {
    out.push(
      buildTelegramMessageRecord({
        workerId,
        workerName,
        workerLogin,
        eventType: TELEGRAM_EVENT_TYPES.KELDI,
        dateKey,
        sentAt: log.loginTime,
        time: timeHm(log.loginTime),
        messageText: buildMessageTextFromEvent({
          eventType: "keldi",
          workerName,
          date: dateKey,
          time: timeHm(log.loginTime),
        }),
        module: TELEGRAM_MESSAGE_MODULES.KELDI,
        status: TELEGRAM_MESSAGE_STATUS.MIGRATED,
        source: "restore_activity_log",
        legacySource: "user_activity_logs",
        legacyId: `act_keldi_${log.id}`,
      }),
    );
  }
  if (log.logoutTime) {
    out.push(
      buildTelegramMessageRecord({
        workerId,
        workerName,
        workerLogin,
        eventType: TELEGRAM_EVENT_TYPES.KETDI,
        dateKey,
        sentAt: log.logoutTime,
        time: timeHm(log.logoutTime),
        messageText: buildMessageTextFromEvent({
          eventType: "ketdi",
          workerName,
          date: dateKey,
          time: timeHm(log.logoutTime),
          meta: { duration: "" },
        }),
        module: TELEGRAM_MESSAGE_MODULES.KETDI,
        status: TELEGRAM_MESSAGE_STATUS.MIGRATED,
        source: "restore_activity_log",
        legacySource: "user_activity_logs",
        legacyId: `act_ketdi_${log.id}`,
      }),
    );
  }
  return out;
}

function stagePhotoToMessage(photo) {
  const sentAt = String(photo.uploadDate || photo.createdAt || "");
  const dateKey = instantToTashkentYMD(sentAt) || sentAt.slice(0, 10);
  if (!inRange(dateKey, sentAt)) return null;
  const fileUrl =
    String(photo.storageUrl || photo.imageUrl || photo.imageData || "").trim() || "";
  const type = String(photo.type || "stage_photo").toLowerCase();
  let module = TELEGRAM_MESSAGE_MODULES.RASM;
  if (type === "keldi") module = TELEGRAM_MESSAGE_MODULES.KELDI;
  if (type === "ketdi") module = TELEGRAM_MESSAGE_MODULES.KETDI;

  return buildTelegramMessageRecord({
    workerId: String(photo.ustaId || ""),
    workerName: String(photo.ustaName || ""),
    workerLogin: String(photo.ustaLogin || "").toLowerCase(),
    eventType: type,
    dateKey,
    sentAt,
    fileUrl,
    messageText: `📷 Rasm\nUsta: ${photo.ustaName || "—"}\nLoyiha: ${photo.projectName || photo.projectId || "—"}\nTuri: ${type}`,
    module,
    status: TELEGRAM_MESSAGE_STATUS.MIGRATED,
    source: "restore_stage_photo",
    legacySource: "stage_photos",
    legacyId: `photo_${photo.id}`,
    meta: { projectId: photo.projectId, stageId: photo.stageId, type },
  });
}

function eventToMessage(event, legacySource) {
  if (!inRange(event.dateKey, event.sentAt)) return null;
  return buildTelegramMessageRecord({
    workerId: event.workerId,
    workerName: event.workerName,
    workerLogin: event.workerLogin,
    eventType: event.eventType,
    dateKey: event.dateKey,
    sentAt: event.sentAt || event.createdAt,
    time: event.time,
    messageText: buildMessageTextFromEvent(event),
    fileUrl: String(event.meta?.imageUrl || event.meta?.fileUrl || ""),
    fileId: String(event.meta?.fileId || ""),
    meta: event.meta,
    status: TELEGRAM_MESSAGE_STATUS.MIGRATED,
    source: `restore_${legacySource}`,
    legacySource,
    legacyId: event.id,
  });
}

async function upsertRecord(record) {
  const docId = record.legacyId
    ? `restored_${record.legacySource}_${String(record.legacyId).replace(/[^\w.-]/g, "_")}`
    : undefined;
  await saveTelegramMessageToFirestore(record, { docId, merge: true });
}

async function main() {
  const all = [];
  const counts = {};

  const add = (label, list) => {
    const items = (list || []).filter(Boolean);
    counts[label] = items.length;
    all.push(...items);
  };

  console.log(`[restore] Davr: ${FROM} … ${TO}\n`);

  add("sql_telegram_events", (await loadSqlCollection(TELEGRAM_EVENTS_COLLECTION)).map((e) => eventToMessage(e, "sql_telegram_events")));
  add("firestore_telegram_events", (await loadFirestoreCollection(TELEGRAM_EVENTS_COLLECTION)).map((e) => eventToMessage(e, "firestore_telegram_events")));
  add("user_activity_logs", (await loadSqlCollection("user_activity_logs")).flatMap(activityLogToMessages));
  add("stage_photos", (await loadSqlCollection("stage_photos")).map(stagePhotoToMessage));
  add("master_daily_uploads", loadMasterDailyUploads());
  add("recovered_attendance", recoveredToMessages(loadRecoveredAttendance()));

  const unique = new Map();
  for (const rec of all) {
    const key = `${rec.legacySource}|${rec.legacyId}|${rec.dateKey}|${rec.module}|${rec.workerName}`;
    if (!unique.has(key)) unique.set(key, rec);
  }

  console.log("Manbalar:");
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
  console.log(`\nBirlashtirilgan (dublikatsiz): ${unique.size}`);

  let saved = 0;
  for (const rec of unique.values()) {
    await upsertRecord(rec);
    saved += 1;
    if (saved % 25 === 0) console.log(`  … ${saved}/${unique.size}`);
  }

  const summary = {
    from: FROM,
    to: TO,
    sources: counts,
    restored: saved,
    restoredAt: new Date().toISOString(),
  };
  const outPath = path.join(root, "data", "telegram-restore-summary.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), "utf8");

  console.log(`\n✅ ${saved} ta yozuv Firestore telegram_messages ga tiklandi.`);
  console.log(`   Xulosa: ${outPath}`);
}

main().catch((e) => {
  console.error("Restore xato:", e?.message || e);
  process.exit(1);
});
