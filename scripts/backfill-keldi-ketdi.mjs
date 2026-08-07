/**
 * user_activity_logs dan telegram_events (keldi/ketdi) ga ko'chirish.
 * node scripts/backfill-keldi-ketdi.mjs
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TELEGRAM_EVENT_TYPES } from "../shared/telegramEventTypes.js";
import { initDb, listCollection, addDocumentWithId } from "../server/db/store.js";
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

async function main() {
  await initDb();
  const logs = await listCollection("user_activity_logs");
  const existing = await listCollection("telegram_events");
  const existingIds = new Set(existing.map((e) => String(e.id)));

  let keldi = 0;
  let ketdi = 0;

  for (const log of logs) {
    const workerId = String(log.ustaId || "").trim();
    if (!workerId) continue;
    const dateKey =
      String(log.dateKey || "").trim() || instantToTashkentYMD(log.loginTime);
    const workerName = String(log.ustaName || "").trim();
    const workerLogin = String(log.ustaLogin || log.login || "").trim().toLowerCase();

    if (log.loginTime) {
      const id = `keldi_${log.id}`;
      if (!existingIds.has(id)) {
        await addDocumentWithId("telegram_events", id, {
          workerId,
          workerName,
          workerLogin,
          eventType: TELEGRAM_EVENT_TYPES.KELDI,
          dateKey,
          sentAt: log.loginTime,
          time: timeHm(log.loginTime),
          source: "backfill_activity_log",
        });
        existingIds.add(id);
        keldi += 1;
      }
    }

    if (log.logoutTime) {
      const id = `ketdi_${log.id}`;
      if (!existingIds.has(id)) {
        await addDocumentWithId("telegram_events", id, {
          workerId,
          workerName,
          workerLogin,
          eventType: TELEGRAM_EVENT_TYPES.KETDI,
          dateKey,
          sentAt: log.logoutTime,
          time: timeHm(log.logoutTime),
          source: "backfill_activity_log",
        });
        existingIds.add(id);
        ketdi += 1;
      }
    }
  }

  console.log(`Tayyor: ${keldi} keldi, ${ketdi} ketdi yozildi (telegram_events).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
