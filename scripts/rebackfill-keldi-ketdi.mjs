/**
 * Noto'g'ri backfill keldi/ketdi yozuvlarini o'chiradi va faqat haqiqiy ish
 * keldi/ketdi (loginLocation / logoutTime bor) yozuvlardan qayta yozadi.
 *
 * node scripts/rebackfill-keldi-ketdi.mjs
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TELEGRAM_EVENT_TYPES } from "../shared/telegramEventTypes.js";
import {
  addDocumentWithId,
  deleteDocument,
  initDb,
  listCollection,
} from "../server/db/store.js";
import { instantToTashkentYMD } from "../src/photos/tashkentTime.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

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

function isWorkAttendanceLog(log) {
  if (!log || typeof log !== "object") return false;
  if (log.loginLocation || log.logoutLocation) return true;
  if (log.logoutTime) return true;
  return false;
}

async function main() {
  await initDb();
  const events = await listCollection("telegram_events");
  let removed = 0;
  for (const e of events) {
    if (String(e?.source || "") !== "backfill_activity_log") continue;
    await deleteDocument("telegram_events", e.id);
    removed += 1;
  }
  console.log(`[rebackfill] Eski backfill o'chirildi: ${removed} ta`);

  const logs = await listCollection("user_activity_logs");
  let keldi = 0;
  let ketdi = 0;

  for (const log of logs) {
    if (!isWorkAttendanceLog(log)) continue;
    const workerId = String(log.ustaId || "").trim();
    if (!workerId) continue;
    const dateKey =
      String(log.dateKey || "").trim() || instantToTashkentYMD(log.loginTime);
    const workerName = String(log.ustaName || "").trim();
    const workerLogin = String(log.ustaLogin || log.login || "").trim().toLowerCase();

    if (log.loginTime) {
      const id = `keldi_${log.id}`;
      await addDocumentWithId("telegram_events", id, {
        workerId,
        workerName,
        workerLogin,
        eventType: TELEGRAM_EVENT_TYPES.KELDI,
        dateKey,
        sentAt: log.loginTime,
        time: timeHm(log.loginTime),
        source: "backfill_work_attendance",
      });
      keldi += 1;
    }

    if (log.logoutTime) {
      const id = `ketdi_${log.id}`;
      await addDocumentWithId("telegram_events", id, {
        workerId,
        workerName,
        workerLogin,
        eventType: TELEGRAM_EVENT_TYPES.KETDI,
        dateKey,
        sentAt: log.logoutTime,
        time: timeHm(log.logoutTime),
        source: "backfill_work_attendance",
      });
      ketdi += 1;
    }
  }

  console.log(`[rebackfill] Yangi: ${keldi} keldi, ${ketdi} ketdi`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
