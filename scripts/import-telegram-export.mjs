/**
 * Telegram HTML export → SQL telegram_events + Firestore telegram_messages + stage_photos.
 *
 * node scripts/import-telegram-export.mjs
 * node scripts/import-telegram-export.mjs --dir=data/telegram-export/ChatExport_2026-07-03
 * node scripts/import-telegram-export.mjs --from=2026-06-01 --to=2026-06-30
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
import { addDocumentWithId } from "../server/db/store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
dotenv.config({ path: path.join(root, ".env") });

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const EXPORT_DIR = path.resolve(root, arg("dir", "data/telegram-export/ChatExport_2026-07-03"));
const FROM = arg("from", "");
const TO = arg("to", "");
const PUBLIC_BASE = "/api/telegram-export";

function decodeHtml(raw) {
  return String(raw || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function normDate(s) {
  const t = String(s || "").trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = t.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return "";
}

function titleToIso(title) {
  const m = String(title || "").match(
    /(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})/,
  );
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}.000+05:00`;
}

function inRange(dateKey) {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return true;
  if (FROM && dateKey < FROM) return false;
  if (TO && dateKey > TO) return false;
  return true;
}

function parseUsta(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (m) return { workerName: m[1].trim(), workerLogin: m[2].trim().toLowerCase() };
  return { workerName: s, workerLogin: "" };
}

function classify(text) {
  if (/Ishga keldi/i.test(text)) return TELEGRAM_EVENT_TYPES.KELDI;
  if (/Ishdan ketdi/i.test(text)) return TELEGRAM_EVENT_TYPES.KETDI;
  if (/Dam olish/i.test(text)) return TELEGRAM_EVENT_TYPES.DAY_OFF;
  if (/Bosqich rasmi|📸/i.test(text)) return TELEGRAM_EVENT_TYPES.RASM;
  if (/Yo['']?riqnoma/i.test(text)) return TELEGRAM_EVENT_TYPES.YORIJNOMA;
  if (/Yangi xarajat|💰/i.test(text)) return TELEGRAM_EVENT_TYPES.XARAJAT;
  if (/Loyiha rasmlari|🏗/i.test(text)) return TELEGRAM_EVENT_TYPES.LOYIHA;
  return "";
}

function extractMeta(text, eventType) {
  const meta = {};
  const usta = parseUsta((text.match(/Usta:\s*([^\n]+)/) || [])[1]);
  meta.workerName = usta.workerName;
  meta.workerLogin = usta.workerLogin;
  meta.time = (text.match(/Vaqt:\s*([^\n]+)/) || [])[1]?.trim() || "";
  meta.dateKey =
    normDate((text.match(/Sana:\s*([^\n]+)/) || [])[1]) ||
    normDate(meta.time?.split(",")?.[0]) ||
    normDate(meta.time?.split(" ")?.[0]);

  if (eventType === TELEGRAM_EVENT_TYPES.KETDI) {
    meta.duration = (text.match(/Ishlagan:\s*([^\n]+)/) || [])[1]?.trim() || "";
  }
  if (eventType === TELEGRAM_EVENT_TYPES.DAY_OFF) {
    meta.reason = (text.match(/Sabab:\s*([^\n]+)/) || [])[1]?.trim() || "";
  }
  if (eventType === TELEGRAM_EVENT_TYPES.RASM) {
    meta.projectName = (text.match(/Loyiha:\s*([^\n]+)/) || [])[1]?.trim() || "";
    meta.stageName = (text.match(/Bosqich:\s*([^\n]+)/) || [])[1]?.trim() || "";
  }
  if (eventType === TELEGRAM_EVENT_TYPES.XARAJAT) {
    meta.projectName = (text.match(/Loyiha:\s*([^\n]+)/) || [])[1]?.trim() || "";
    meta.type = (text.match(/Turi:\s*([^\n]+)/) || [])[1]?.trim() || "";
    meta.amount = (text.match(/Summa:\s*([^\n]+)/) || [])[1]?.trim() || "";
    meta.note = (text.match(/Izoh:\s*([^\n]+)/) || [])[1]?.trim() || "";
  }
  if (eventType === TELEGRAM_EVENT_TYPES.YORIJNOMA) {
    meta.workerDocId = (text.match(/ID:\s*([^\n]+)/) || [])[1]?.trim() || "";
  }
  return meta;
}

function parseHtmlFile(filePath) {
  const html = fs.readFileSync(filePath, "utf8");
  const items = [];
  const parts = html.split(/<div class="message default[^"]*" id="([^"]+)"/);
  for (let i = 1; i < parts.length; i += 2) {
    const htmlId = parts[i];
    const block = parts[i + 1] || "";
    const titleMatch = block.match(
      /title="(\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}) UTC\+05:00"/,
    );
    const sentAt = titleToIso(titleMatch?.[1]);
    const textMatch = block.match(/<div class="text">\s*([\s\S]*?)<\/div>/);
    const text = decodeHtml(textMatch?.[1]);
    if (!text) continue;

    const eventType = classify(text);
    if (!eventType) continue;

    const meta = extractMeta(text, eventType);
    const dateKey =
      meta.dateKey || (sentAt ? sentAt.slice(0, 10) : "");
    if (!inRange(dateKey)) continue;

    const photos = [
      ...new Set(
        [...block.matchAll(/href="(photos\/[^"]+\.jpg)"/gi)].map((m) => m[1]),
      ),
    ];
    const files = [
      ...new Set(
        [...block.matchAll(/href="(files\/[^"]+)"/gi)].map((m) => m[1]),
      ),
    ];
    const fileUrl = photos[0]
      ? `${PUBLIC_BASE}/${photos[0].replace(/\\/g, "/")}`
      : files[0]
        ? `${PUBLIC_BASE}/${files[0].replace(/\\/g, "/")}`
        : "";

    items.push({
      htmlId,
      sentAt: sentAt || `${dateKey}T12:00:00.000+05:00`,
      dateKey,
      eventType,
      workerName: meta.workerName,
      workerLogin: meta.workerLogin,
      time: meta.time?.match(/\d{1,2}:\d{2}/)?.[0] || meta.time,
      messageText: text,
      fileUrl,
      photos,
      files,
      meta,
    });
  }
  return items;
}

function buildWorkerMap(workers) {
  const byLogin = new Map();
  const byName = new Map();
  for (const w of workers || []) {
    const login = String(w.login || w.loginLower || "").trim().toLowerCase();
    const name = String(w.fullName || w.name || "").trim().toLowerCase();
    if (login) byLogin.set(login, w);
    if (name) byName.set(name, w);
  }
  return { byLogin, byName };
}

function resolveWorker(item, maps) {
  if (item.workerLogin && maps.byLogin.has(item.workerLogin)) {
    return maps.byLogin.get(item.workerLogin);
  }
  const nn = item.workerName.toLowerCase();
  if (maps.byName.has(nn)) return maps.byName.get(nn);
  for (const [name, w] of maps.byName) {
    if (nn.includes(name) || name.includes(nn)) return w;
  }
  return null;
}

function moduleForType(t) {
  if (t === TELEGRAM_EVENT_TYPES.KELDI) return TELEGRAM_MESSAGE_MODULES.KELDI;
  if (t === TELEGRAM_EVENT_TYPES.KETDI) return TELEGRAM_MESSAGE_MODULES.KETDI;
  if (t === TELEGRAM_EVENT_TYPES.DAY_OFF) return TELEGRAM_MESSAGE_MODULES.DAY_OFF;
  if (t === TELEGRAM_EVENT_TYPES.RASM) return TELEGRAM_MESSAGE_MODULES.RASM;
  if (t === TELEGRAM_EVENT_TYPES.YORIJNOMA) return TELEGRAM_MESSAGE_MODULES.YORIJNOMA;
  if (t === TELEGRAM_EVENT_TYPES.XARAJAT) return TELEGRAM_MESSAGE_MODULES.XARAJAT;
  if (t === TELEGRAM_EVENT_TYPES.LOYIHA) return TELEGRAM_MESSAGE_MODULES.LOYIHA;
  return TELEGRAM_MESSAGE_MODULES.UNKNOWN;
}

async function main() {
  if (!fs.existsSync(EXPORT_DIR)) {
    console.error("Export papkasi topilmadi:", EXPORT_DIR);
    process.exit(1);
  }

  const htmlFiles = fs
    .readdirSync(EXPORT_DIR)
    .filter((f) => /^messages\d*\.html$/i.test(f))
    .map((f) => path.join(EXPORT_DIR, f))
    .sort();

  let parsed = [];
  for (const f of htmlFiles) {
    const rows = parseHtmlFile(f);
    console.log(`  ${path.basename(f)}: ${rows.length} ta ERP xabar`);
    parsed.push(...rows);
  }

  const unique = new Map();
  for (const row of parsed) {
    const key = `${row.eventType}|${row.dateKey}|${row.workerName}|${row.time}|${row.messageText.slice(0, 60)}`;
    if (!unique.has(key)) unique.set(key, row);
  }
  parsed = [...unique.values()];

  const { initDb, listCollection } = await import("../server/db/store.js");
  await initDb();
  const workers = await listCollection("workers");
  const maps = buildWorkerMap(workers);

  const counts = {};
  let sqlSaved = 0;
  let fsSaved = 0;
  let photosSaved = 0;
  const attendance = new Map();

  console.log(`\nImport: ${parsed.length} ta yozuv (${EXPORT_DIR})\n`);

  for (const item of parsed) {
    counts[item.eventType] = (counts[item.eventType] || 0) + 1;
    const worker = resolveWorker(item, maps);
    const workerId = String(worker?.id || item.meta?.workerDocId || "").trim();
    const docId = `export_${item.htmlId}`;

    const eventDoc = {
      workerId,
      workerName: item.workerName,
      workerLogin: item.workerLogin,
      eventType: item.eventType,
      dateKey: item.dateKey,
      sentAt: item.sentAt,
      time: item.time,
      source: "telegram_export",
      messageText: item.messageText,
      meta: {
        ...item.meta,
        imageUrl: item.fileUrl || "",
        fileUrl: item.fileUrl || "",
        exportHtmlId: item.htmlId,
      },
    };

    await addDocumentWithId(TELEGRAM_EVENTS_COLLECTION, docId, eventDoc);
    sqlSaved += 1;

    const msgRecord = buildTelegramMessageRecord({
      workerId,
      workerName: item.workerName,
      workerLogin: item.workerLogin,
      eventType: item.eventType,
      dateKey: item.dateKey,
      sentAt: item.sentAt,
      time: item.time,
      messageText: item.messageText,
      fileUrl: item.fileUrl,
      module: moduleForType(item.eventType),
      status: TELEGRAM_MESSAGE_STATUS.MIGRATED,
      source: "telegram_export",
      legacySource: "telegram_export",
      legacyId: item.htmlId,
      meta: eventDoc.meta,
    });

    await saveTelegramMessageToFirestore(msgRecord, {
      docId: `export_${item.htmlId}`,
      merge: true,
    });
    fsSaved += 1;

    if (
      item.fileUrl &&
      item.photos.length &&
      [TELEGRAM_EVENT_TYPES.KELDI, TELEGRAM_EVENT_TYPES.KETDI, TELEGRAM_EVENT_TYPES.RASM].includes(
        item.eventType,
      )
    ) {
      const photoType =
        item.eventType === TELEGRAM_EVENT_TYPES.KELDI
          ? "keldi"
          : item.eventType === TELEGRAM_EVENT_TYPES.KETDI
            ? "ketdi"
            : "stage_photo";
      await addDocumentWithId("stage_photos", `export_photo_${item.htmlId}`, {
        ustaId: workerId,
        ustaName: item.workerName,
        ustaLogin: item.workerLogin,
        type: photoType,
        projectName: item.meta.projectName || "",
        uploadDate: item.sentAt,
        storageUrl: item.fileUrl,
        imageUrl: item.fileUrl,
        source: "telegram_export",
      });
      photosSaved += 1;
    }

    if (
      item.eventType === TELEGRAM_EVENT_TYPES.KELDI ||
      item.eventType === TELEGRAM_EVENT_TYPES.KETDI ||
      item.eventType === TELEGRAM_EVENT_TYPES.DAY_OFF
    ) {
      const akey = `${item.workerName}|${item.dateKey}`;
      const prev = attendance.get(akey) || {
        name: item.workerName,
        date: item.dateKey,
        arrival: null,
        departure: null,
        dayOff: false,
      };
      if (item.eventType === TELEGRAM_EVENT_TYPES.KELDI) {
        if (!prev.arrival || item.time < prev.arrival) prev.arrival = item.time;
      } else if (item.eventType === TELEGRAM_EVENT_TYPES.KETDI) {
        if (!prev.departure || item.time > prev.departure) prev.departure = item.time;
      } else {
        prev.dayOff = true;
      }
      attendance.set(akey, prev);
    }

    if (fsSaved % 50 === 0) console.log(`  … ${fsSaved}/${parsed.length}`);
  }

  const attendanceRows = [...attendance.values()].sort((a, b) =>
    `${a.date}|${a.name}`.localeCompare(`${b.date}|${b.name}`),
  );
  fs.writeFileSync(
    path.join(root, "scripts", "recovered-attendance.json"),
    JSON.stringify(attendanceRows, null, 2),
    "utf8",
  );

  const summary = {
    exportDir: EXPORT_DIR,
    from: FROM || null,
    to: TO || null,
    parsed: parsed.length,
    byType: counts,
    sqlEvents: sqlSaved,
    firestoreMessages: fsSaved,
    stagePhotos: photosSaved,
    attendanceDays: attendanceRows.length,
    importedAt: new Date().toISOString(),
  };
  const outPath = path.join(root, "data", "telegram-import-summary.json");
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), "utf8");

  console.log("\n=== Import natijasi ===");
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
  console.log(`\nSQL telegram_events: ${sqlSaved}`);
  console.log(`Firestore telegram_messages: ${fsSaved}`);
  console.log(`stage_photos (rasm bilan): ${photosSaved}`);
  console.log(`recovered-attendance kunlar: ${attendanceRows.length}`);
  console.log(`\nXulosa: ${outPath}`);
}

main().catch((e) => {
  console.error("Import xato:", e?.message || e);
  process.exit(1);
});
