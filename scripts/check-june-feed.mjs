import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const db = new Database(path.join(root, "data", "solar-erp.db"));

function load(name) {
  return db
    .prepare("SELECT data FROM documents WHERE collection = ?")
    .all(name)
    .map((r) => JSON.parse(r.data));
}

const events = load("telegram_events");
const photos = load("stage_photos");

function eventMonth(e) {
  const dk = String(e?.dateKey || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dk)) return dk.slice(0, 7);
  const sent = String(e?.sentAt || "");
  const m = sent.match(/^(\d{4}-\d{2})/);
  return m ? m[1] : "";
}

const juneEvents = events.filter((e) => eventMonth(e) === "2026-06");
const junePhotos = photos.filter((p) => {
  const u = String(p.uploadDate || p.createdAt || "");
  return u.includes("2026-06");
});

console.log("events", events.length, "june", juneEvents.length);
console.log("photos", photos.length, "june", junePhotos.length);
console.log("sample event", juneEvents[0]);
