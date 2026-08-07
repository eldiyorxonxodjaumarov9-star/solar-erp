/**
 * Oy bo‘yicha Telegram hisobot (faqat o‘qish, Firestore ga yozmaydi).
 *
 * node scripts/june-telegram-report.mjs
 * node scripts/june-telegram-report.mjs --month=2026-06
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TELEGRAM_EVENTS_COLLECTION } from "../shared/telegramEventTypes.js";
import { instantToTashkentYMD } from "../src/photos/tashkentTime.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const MONTH = arg("month", "2026-06");
const FROM = `${MONTH}-01`;
const TO = `${MONTH}-30`;

function inMonth(dateKey, sentAt) {
  const dk =
    String(dateKey || "").slice(0, 10) ||
    instantToTashkentYMD(sentAt) ||
    String(sentAt || "").slice(0, 10);
  return dk.startsWith(MONTH);
}

async function loadSql(name) {
  const { initDb, listCollection } = await import("../server/db/store.js");
  await initDb();
  return listCollection(name);
}

function countByType(events) {
  const m = {};
  for (const e of events) {
    const t = String(e.eventType || "unknown").toLowerCase();
    m[t] = (m[t] || 0) + 1;
  }
  return m;
}

function hasFile(item) {
  return Boolean(
    item?.fileUrl ||
      item?.imageUrl ||
      item?.storageUrl ||
      item?.imageData ||
      item?.meta?.imageUrl ||
      item?.meta?.fileUrl ||
      item?.fileId,
  );
}

async function main() {
  const tgEvents = (await loadSql(TELEGRAM_EVENTS_COLLECTION)).filter((e) =>
    inMonth(e.dateKey, e.sentAt),
  );
  const photos = (await loadSql("stage_photos")).filter((p) =>
    inMonth(null, p.uploadDate || p.createdAt),
  );
  const logs = (await loadSql("user_activity_logs")).filter((l) =>
    inMonth(l.dateKey, l.loginTime),
  );

  let recovered = [];
  const recPath = path.join(root, "scripts", "recovered-attendance.json");
  if (fs.existsSync(recPath)) {
    recovered = JSON.parse(fs.readFileSync(recPath, "utf8")).filter((r) =>
      String(r.date || "").startsWith(MONTH),
    );
  }

  const photosWithImage = photos.filter(
    (p) => p.imageUrl || p.imageData || p.storageUrl,
  );
  const tgWithFile = tgEvents.filter(hasFile);

  const keldi = tgEvents.filter((e) => e.eventType === "keldi").length;
  const ketdi = tgEvents.filter((e) => e.eventType === "ketdi").length;
  const dayOff = tgEvents.filter((e) => e.eventType === "day_off").length;
  const xarajat = tgEvents.filter((e) => e.eventType === "xarajat").length;
  const rasm = tgEvents.filter((e) => e.eventType === "rasm").length;

  const logKeldi = logs.filter((l) => l.loginTime).length;
  const logKetdi = logs.filter((l) => l.logoutTime).length;

  const totalMessages =
    tgEvents.length +
    photos.length +
    logKeldi +
    logKetdi +
    recovered.length * 2;

  const report = {
    month: MONTH,
    period: `${FROM} … ${TO}`,
    generatedAt: new Date().toISOString(),
    summary: {
      telegram_events: tgEvents.length,
      keldi,
      ketdi,
      day_off: dayOff,
      xarajat,
      rasm_events: rasm,
      events_with_file: tgWithFile.length,
      stage_photos: photos.length,
      stage_photos_with_image: photosWithImage.length,
      activity_logs: logs.length,
      activity_keldi: logKeldi,
      activity_ketdi: logKetdi,
      recovered_attendance_days: recovered.length,
      estimated_total_records: totalMessages,
    },
    by_event_type: countByType(tgEvents),
    workers_in_events: [
      ...new Set(tgEvents.map((e) => e.workerName).filter(Boolean)),
    ].sort(),
  };

  const outPath = path.join(root, "data", `telegram-report-${MONTH}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`\n=== Telegram hisobot: ${MONTH} ===\n`);
  console.log("telegram_events:", tgEvents.length);
  console.log("  keldi:", keldi, "| ketdi:", ketdi, "| dam olish:", dayOff);
  console.log("  xarajat:", xarajat, "| rasm:", rasm);
  console.log("  fayl bilan:", tgWithFile.length);
  console.log("stage_photos:", photos.length, "(rasm bor:", photosWithImage.length + ")");
  console.log("user_activity_logs:", logs.length, "(keldi:", logKeldi, "ketdi:", logKetdi + ")");
  console.log("recovered-attendance kunlar:", recovered.length);
  console.log("\nUstalar (telegram_events):", report.workers_in_events.join(", ") || "—");
  console.log(`\nTo‘liq JSON: ${outPath}\n`);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
