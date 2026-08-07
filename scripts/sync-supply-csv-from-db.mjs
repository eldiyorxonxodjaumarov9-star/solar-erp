/**
 * database.db (Telegram katalog) → CSV sync
 * node scripts/sync-supply-csv-from-db.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "data", "supply");
const dbPath = path.join(dir, "database.db");

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(file, headers, rows) {
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  }
  fs.writeFileSync(file, lines.join("\n") + "\n", "utf8");
}

function powerKw(power) {
  const n = Number(power);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= 100) return Math.round((n / 1000) * 100) / 100;
  return n;
}

const db = new Database(dbPath, { readonly: true, fileMustExist: true });

const panels = db.prepare(`SELECT * FROM solar_panels ORDER BY id`).all().map((r) => {
  const name = String(r.name || "");
  const parts = name.split(/\s+/);
  const brand = parts[0] || "";
  const model = parts.slice(1).join(" ");
  return {
    id: r.id,
    name,
    brand,
    model,
    power_w: r.power,
    price: r.price,
    category: "panel",
    warranty_years: 25,
  };
});

const inverters = db.prepare(`SELECT * FROM inverters ORDER BY id`).all().map((r) => {
  const name = String(r.name || "");
  const type = String(r.type || "ongrid").toLowerCase();
  const kw = powerKw(r.power);
  const brand = name.split(/\s+/)[0] || "";
  return {
    id: r.id,
    name,
    brand,
    model: name.replace(new RegExp(`^${brand}\\s*`, "i"), "").trim(),
    power_kw: kw,
    type,
    voltage: /380|3p|3P/i.test(name) ? "380V" : "220V",
    phase: /380|3p|3P|P3/i.test(name) ? 3 : 1,
    price: r.price,
    category: "inverter",
    warranty_years: type === "ongrid" ? 5 : 2,
  };
});

const batteries = db.prepare(`SELECT * FROM batteries ORDER BY id`).all().map((r) => ({
  id: r.id,
  name: r.name,
  capacity_kwh: r.capacity_kwh == null ? "" : r.capacity_kwh,
  battery_count: r.battery_count == null ? "" : r.battery_count,
  price: r.price,
}));

writeCsv(
  path.join(dir, "panels.csv"),
  ["id", "name", "brand", "model", "power_w", "price", "category", "warranty_years"],
  panels,
);
writeCsv(
  path.join(dir, "inverters.csv"),
  [
    "id",
    "name",
    "brand",
    "model",
    "power_kw",
    "type",
    "voltage",
    "phase",
    "price",
    "category",
    "warranty_years",
  ],
  inverters,
);
writeCsv(
  path.join(dir, "batteries.csv"),
  ["id", "name", "capacity_kwh", "battery_count", "price"],
  batteries,
);

db.close();
console.log(
  `Synced from database.db → panels=${panels.length} inverters=${inverters.length} batteries=${batteries.length}`,
);
