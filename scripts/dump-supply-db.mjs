import Database from "better-sqlite3";
import fs from "node:fs";

const db = new Database("d:/solar-erp/data/supply/database.db", { readonly: true });
const panels = db.prepare("SELECT id, name, power, price FROM solar_panels").all();
console.log("PANELS");
for (const p of panels) console.log(JSON.stringify(p));

const chast = db
  .prepare(
    "SELECT id, name, power, price, type FROM inverters WHERE lower(type) LIKE ? OR lower(name) LIKE ? LIMIT 30",
  )
  .all("%chast%", "%m900%");
console.log("CHAST/M900", chast.length);
for (const p of chast) console.log(JSON.stringify(p));

const upower22 = db
  .prepare(
    "SELECT id, name, power, price, type FROM inverters WHERE lower(name) LIKE ? LIMIT 20",
  )
  .all("%22%");
console.log("22kW-ish");
for (const p of upower22.slice(0, 15)) console.log(JSON.stringify(p));

db.close();
