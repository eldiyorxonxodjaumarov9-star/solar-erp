import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const db = new Database(path.join(root, "data", "solar-erp.db"));
const MONTH = "2026-06";

function loadDocs(collection) {
  return db
    .prepare("SELECT data FROM documents WHERE collection = ?")
    .all(collection)
    .map((r) => JSON.parse(r.data));
}

function inMonth(item, dateFields) {
  for (const f of dateFields) {
    const v = String(item[f] || "").slice(0, 10);
    if (v.startsWith(MONTH)) return true;
  }
  return false;
}

const tg = loadDocs("telegram_events").filter((e) => inMonth(e, ["dateKey", "sentAt"]));
const photos = loadDocs("stage_photos").filter((p) => inMonth(p, ["uploadDate", "createdAt"]));
const logs = loadDocs("user_activity_logs").filter((l) => inMonth(l, ["dateKey", "loginTime"]));
const workers = loadDocs("workers");

console.log("=== Iyun 2026 (SQL) ===");
console.log("telegram_events:", tg.length, "keldi:", tg.filter((e) => e.eventType === "keldi").length, "ketdi:", tg.filter((e) => e.eventType === "ketdi").length);
console.log("stage_photos:", photos.length, "with image:", photos.filter((p) => p.imageUrl || p.imageData || p.storageUrl).length);
console.log("user_activity_logs:", logs.length);

const mdu = path.join(root, "data", "master-daily-uploads.json");
if (fs.existsSync(mdu)) {
  const parsed = JSON.parse(fs.readFileSync(mdu, "utf8"));
  const june = Object.keys(parsed || {}).filter((d) => d.startsWith(MONTH));
  console.log("master-daily-uploads kunlar:", june.length);
}

const rec = path.join(root, "scripts", "recovered-attendance.json");
if (fs.existsSync(rec)) {
  const arr = JSON.parse(fs.readFileSync(rec, "utf8"));
  const june = arr.filter((d) => String(d.date || "").startsWith(MONTH));
  console.log("recovered-attendance iyun:", june.length);
}

console.log("workers:", workers.length);
