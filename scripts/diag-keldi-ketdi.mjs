import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const db = new Database(path.join(root, "data", "solar-erp.db"));

for (const month of ["2026-06", "2026-07"]) {
  const rows = db
    .prepare("SELECT data FROM documents WHERE collection = 'telegram_events'")
    .all()
    .map((r) => JSON.parse(r.data))
    .filter((e) => String(e.dateKey || "").startsWith(month));
  const keldi = rows.filter((e) => e.eventType === "keldi").length;
  const ketdi = rows.filter((e) => e.eventType === "ketdi").length;
  console.log(month, "events", rows.length, "keldi", keldi, "ketdi", ketdi);
}
