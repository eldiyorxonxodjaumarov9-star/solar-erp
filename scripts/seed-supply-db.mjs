/**
 * data/supply/supply.db yaratish / qayta seed qilish.
 * Runtime hardcode emas — faqat boshlang‘ich DB to‘ldirish.
 *
 * Usage: node scripts/seed-supply-db.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const dbPath =
  process.env.SUPPLY_DB_PATH?.trim() ||
  path.join(ROOT, "data", "supply", "supply.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  name TEXT,
  power_w REAL,
  power_kw REAL,
  voltage TEXT,
  phase INTEGER,
  capacity_ah REAL,
  capacity_kwh REAL,
  chemistry TEXT,
  unit TEXT DEFAULT 'dona',
  price_usd REAL NOT NULL DEFAULT 0,
  price_uzs REAL,
  warranty_years REAL,
  subtype TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  type TEXT DEFAULT 'string',
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS calculation_rules (
  id TEXT PRIMARY KEY,
  rule_key TEXT NOT NULL UNIQUE,
  name TEXT,
  value REAL NOT NULL,
  unit TEXT,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);
`;

const now = new Date().toISOString();

function product(p) {
  return {
    id: p.id,
    category: p.category,
    brand: p.brand ?? null,
    model: p.model ?? null,
    name: p.name ?? `${p.brand || ""} ${p.model || ""}`.trim(),
    power_w: p.power_w ?? null,
    power_kw: p.power_kw ?? null,
    voltage: p.voltage ?? null,
    phase: p.phase ?? null,
    capacity_ah: p.capacity_ah ?? null,
    capacity_kwh: p.capacity_kwh ?? null,
    chemistry: p.chemistry ?? null,
    unit: p.unit ?? "dona",
    price_usd: p.price_usd ?? 0,
    price_uzs: p.price_uzs ?? null,
    warranty_years: p.warranty_years ?? null,
    subtype: p.subtype ?? null,
    is_active: p.is_active ?? 1,
    sort_order: p.sort_order ?? 0,
    created_at: now,
    updated_at: now,
  };
}

const PRODUCTS = [
  // Panels
  product({ id: "era-625-ntype", category: "panel", brand: "Era Solar", model: "625W N-Type | 2 tomonlama", power_w: 625, price_usd: 78.75, warranty_years: 25, sort_order: 1 }),
  product({ id: "longi-645-ximo", category: "panel", brand: "LONGi", model: "Hi-MO X10 645W N-Type | 2 tomonlama", power_w: 645, price_usd: 81.27, warranty_years: 25, sort_order: 2 }),
  product({ id: "jinko-615-tiger", category: "panel", brand: "Jinko", model: "Tiger Neo 615W N-Type | 2 tomonlama", power_w: 615, price_usd: 77.49, warranty_years: 25, sort_order: 3 }),
  product({ id: "jinko-620-tiger", category: "panel", brand: "Jinko", model: "Tiger Neo 620W N-Type | 2 tomonlama", power_w: 620, price_usd: 78.12, warranty_years: 25, sort_order: 4 }),
  product({ id: "restar-575-ntype", category: "panel", brand: "Restar", model: "575W N-Type", power_w: 575, price_usd: 72.45, warranty_years: 25, sort_order: 5 }),
  product({ id: "restar-500-ntype", category: "panel", brand: "Restar", model: "500W N-Type", power_w: 500, price_usd: 63.0, warranty_years: 25, sort_order: 6 }),

  // Ongrid
  product({ id: "deye-og-20-380", category: "inverter", brand: "Deye", model: "on-grid 20 kW (380V)", subtype: "ongrid", power_kw: 20, voltage: "380V", phase: 3, price_usd: 966.0, warranty_years: 5, sort_order: 1 }),
  product({ id: "deye-og-30-380", category: "inverter", brand: "Deye", model: "on-grid 30 kW (380V)", subtype: "ongrid", power_kw: 30, voltage: "380V", phase: 3, price_usd: 1280.0, warranty_years: 5, sort_order: 2 }),
  product({ id: "deye-og-20-3p", category: "inverter", brand: "DEYE", model: "on-grid 20 kW 3p", subtype: "ongrid", power_kw: 20, voltage: "380V", phase: 3, price_usd: 966.0, warranty_years: 5, sort_order: 3 }),
  product({ id: "deye-og-30-3p", category: "inverter", brand: "DEYE", model: "on-grid 30 kW 3p", subtype: "ongrid", power_kw: 30, voltage: "380V", phase: 3, price_usd: 1280.0, warranty_years: 5, sort_order: 4 }),
  product({ id: "invt-og-20", category: "inverter", brand: "INVT", model: "on-grid 20 kW (380V)", subtype: "ongrid", power_kw: 20, voltage: "380V", phase: 3, price_usd: 890.0, warranty_years: 5, sort_order: 5 }),
  product({ id: "invt-og-25", category: "inverter", brand: "INVT", model: "on-grid 25 kW (380V)", subtype: "ongrid", power_kw: 25, voltage: "380V", phase: 3, price_usd: 1050.0, warranty_years: 5, sort_order: 6 }),
  product({ id: "invt-og-30", category: "inverter", brand: "INVT", model: "on-grid 30 kW (380V)", subtype: "ongrid", power_kw: 30, voltage: "380V", phase: 3, price_usd: 1180.0, warranty_years: 5, sort_order: 7 }),
  product({ id: "restar-og-20", category: "inverter", brand: "Restar", model: "on-grid 20 kW (380V)", subtype: "ongrid", power_kw: 20, voltage: "380V", phase: 3, price_usd: 820.0, warranty_years: 5, sort_order: 8 }),
  product({ id: "restar-og-25", category: "inverter", brand: "Restar", model: "on-grid 25 kW (380V)", subtype: "ongrid", power_kw: 25, voltage: "380V", phase: 3, price_usd: 980.0, warranty_years: 5, sort_order: 9 }),
  product({ id: "restar-og-30", category: "inverter", brand: "Restar", model: "on-grid 30 kW (380V)", subtype: "ongrid", power_kw: 30, voltage: "380V", phase: 3, price_usd: 1120.0, warranty_years: 5, sort_order: 10 }),
  product({ id: "think-og-25", category: "inverter", brand: "Think Power", model: "on-grid 25 kW (380V)", subtype: "ongrid", power_kw: 25, voltage: "380V", phase: 3, price_usd: 990.0, warranty_years: 5, sort_order: 11 }),

  // Hybrid
  product({ id: "deye-hy-8", category: "inverter", brand: "Deye", model: "hybrid 8 kW", subtype: "hybrid", power_kw: 8, voltage: "220V", phase: 1, price_usd: 980.0, warranty_years: 2, sort_order: 20 }),
  product({ id: "deye-hy-12", category: "inverter", brand: "Deye", model: "hybrid 12 kW", subtype: "hybrid", power_kw: 12, voltage: "380V", phase: 3, price_usd: 1350.0, warranty_years: 2, sort_order: 21 }),
  product({ id: "deye-hy-20", category: "inverter", brand: "Deye", model: "hybrid 20 kW", subtype: "hybrid", power_kw: 20, voltage: "380V", phase: 3, price_usd: 1890.0, warranty_years: 2, sort_order: 22 }),
  product({ id: "deye-hy-30", category: "inverter", brand: "Deye", model: "hybrid 30 kW", subtype: "hybrid", power_kw: 30, voltage: "380V", phase: 3, price_usd: 2480.0, warranty_years: 2, sort_order: 23 }),
  product({ id: "felicity-hy-10", category: "inverter", brand: "Felicity", model: "hybrid 10 kW", subtype: "hybrid", power_kw: 10, voltage: "220V", phase: 1, price_usd: 1100.0, warranty_years: 2, sort_order: 24 }),

  // Offgrid
  product({ id: "must-off-5", category: "inverter", brand: "Must", model: "off-grid 5 kW", subtype: "offgrid", power_kw: 5, voltage: "220V", phase: 1, price_usd: 420.0, warranty_years: 2, sort_order: 30 }),
  product({ id: "must-off-10", category: "inverter", brand: "Must", model: "off-grid 10 kW", subtype: "offgrid", power_kw: 10, voltage: "220V", phase: 1, price_usd: 680.0, warranty_years: 2, sort_order: 31 }),
  product({ id: "must-off-20", category: "inverter", brand: "Must", model: "off-grid 20 kW", subtype: "offgrid", power_kw: 20, voltage: "380V", phase: 3, price_usd: 1250.0, warranty_years: 2, sort_order: 32 }),

  // Chastotnik
  product({ id: "invt-ch-15", category: "inverter", brand: "INVT", model: "chastotnik 15 kW", subtype: "chastotnik", power_kw: 15, voltage: "380V", phase: 3, price_usd: 760.0, warranty_years: 2, sort_order: 40 }),
  product({ id: "invt-ch-22", category: "inverter", brand: "INVT", model: "chastotnik 22 kW", subtype: "chastotnik", power_kw: 22, voltage: "380V", phase: 3, price_usd: 920.0, warranty_years: 2, sort_order: 41 }),
  product({ id: "invt-ch-30", category: "inverter", brand: "INVT", model: "chastotnik 30 kW", subtype: "chastotnik", power_kw: 30, voltage: "380V", phase: 3, price_usd: 1180.0, warranty_years: 2, sort_order: 42 }),

  // Batteries
  product({ id: "felicity-lifepo4-5", category: "battery", brand: "Felicity", model: "LiFePO4 5 kWh", voltage: "48", capacity_ah: 100, capacity_kwh: 5, chemistry: "LiFePO4", price_usd: 980, warranty_years: 5, sort_order: 1 }),
  product({ id: "felicity-lifepo4-10", category: "battery", brand: "Felicity", model: "LiFePO4 10 kWh", voltage: "48", capacity_ah: 200, capacity_kwh: 10, chemistry: "LiFePO4", price_usd: 1750, warranty_years: 5, sort_order: 2 }),
  product({ id: "gel-12-200", category: "battery", brand: "Universal", model: "GEL 12V 200Ah", voltage: "12", capacity_ah: 200, capacity_kwh: 2.4, chemistry: "GEL", price_usd: 210, warranty_years: 1, sort_order: 3 }),
  product({ id: "agm-12-200", category: "battery", brand: "Universal", model: "AGM 12V 200Ah", voltage: "12", capacity_ah: 200, capacity_kwh: 2.4, chemistry: "AGM", price_usd: 190, warranty_years: 1, sort_order: 4 }),

  // Metal
  product({ id: "metal-per-meter", category: "metal", brand: "Sunnur", model: "Metall konstruksiya", name: "Metall konstruksiya", unit: "metr", price_usd: 1.68, warranty_years: 0, sort_order: 1 }),

  // Breakers / surge
  product({ id: "breaker-ac", category: "breaker", brand: "CNC", model: "YCB7-63N 2P C25A (Avto)", name: "CNC YCB7-63N 2P C25A (Avto)", subtype: "ac", unit: "dona", price_usd: 5.88, sort_order: 1 }),
  product({ id: "breaker-dc", category: "breaker", brand: "Upover", model: "PV-32 (1000V DC) (Per)", name: "Upover PV-32 (1000V DC) (Per)", subtype: "dc", unit: "dona", price_usd: 5.88, sort_order: 2 }),
  product({ id: "surge-uzrif", category: "breaker", brand: "Uzrif", model: "Surge Protector", name: "Surge Protector (Uzrif)", subtype: "surge", unit: "dona", price_usd: 10.5, sort_order: 3 }),

  // Cable
  product({ id: "cable-4mm", category: "cable", brand: "Generic", model: "Kabel 4 mm", name: "Kabel 4 mm", subtype: "dc_cable", unit: "metr", price_usd: 0.714, sort_order: 1 }),

  // Accessories
  product({ id: "mc4", category: "accessory", brand: "Generic", model: "MC4 konnektor", name: "MC4 konnektor", subtype: "mc4", unit: "dona", price_usd: 0.35, sort_order: 1 }),
  product({ id: "orta-shayba", category: "accessory", brand: "Generic", model: "Orta shayba", name: "Orta shayba", subtype: "orta_shayba", unit: "dona", price_usd: 0.4, sort_order: 2 }),
  product({ id: "chekka-shayba", category: "accessory", brand: "Generic", model: "Chekka shayba", name: "Chekka shayba", subtype: "chekka_shayba", unit: "dona", price_usd: 0.345294117647, sort_order: 3 }),
];

const SETTINGS = [
  { key: "exchange_rate_usd_uzs", value: "12500", type: "number" },
  { key: "metal_price_per_meter", value: "1.68", type: "number" },
  { key: "panel_default_warranty", value: "25", type: "number" },
  { key: "ongrid_inverter_warranty", value: "5", type: "number" },
  { key: "hybrid_inverter_warranty", value: "2", type: "number" },
  { key: "offgrid_inverter_warranty", value: "2", type: "number" },
  { key: "chastotnik_inverter_warranty", value: "2", type: "number" },
  { key: "agm_battery_warranty", value: "1", type: "number" },
  { key: "gel_battery_warranty", value: "1", type: "number" },
  { key: "lifepo4_warranty", value: "5-8", type: "string" },
  {
    key: "offer_notes",
    value: JSON.stringify([
      "To‘lov oldindan, pul o‘tkazish yo‘li bilan amalga oshiriladi.",
      "Narx shu kundan boshlab 3 kun amal qiladi.",
      "Narx o‘rnatish montaj ishlarini o‘z ichiga olmaydi.",
      "Butun O‘zbekiston bo‘ylab yetkazib berish xizmati bor (to‘lov asosida).",
    ]),
    type: "json",
  },
];

const RULES = [
  { id: "r-metal-m", rule_key: "metal_meter_per_panel", name: "Metall metr / panel", value: 8, unit: "m", description: "34×8=272" },
  { id: "r-mc4", rule_key: "mc4_per_panel", name: "MC4 / panel", value: 2, unit: "dona", description: "" },
  { id: "r-orta", rule_key: "middle_washer_per_panel", name: "O‘rta shayba / panel", value: 1, unit: "dona", description: "" },
  { id: "r-chekka", rule_key: "edge_washer_per_panel", name: "Chekka shayba / panel", value: 1, unit: "dona", description: "" },
  { id: "r-cable", rule_key: "cable_meter_per_kw", name: "Kabel metr / kW", value: 8, unit: "m", description: "160/20=8" },
  { id: "r-string", rule_key: "panels_per_pv_string", name: "Panel / PV string", value: 9, unit: "dona", description: "DC breaker" },
  { id: "r-surge", rule_key: "surge_qty", name: "Surge Protector soni", value: 2, unit: "dona", description: "" },
  { id: "r-ac", rule_key: "ac_breaker_qty", name: "AC breaker soni", value: 1, unit: "dona", description: "" },
];

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

const db = new Database(dbPath);
db.exec(SCHEMA);

const insertProduct = db.prepare(`
  INSERT INTO products (
    id, category, brand, model, name, power_w, power_kw, voltage, phase,
    capacity_ah, capacity_kwh, chemistry, unit, price_usd, price_uzs,
    warranty_years, subtype, is_active, sort_order, created_at, updated_at
  ) VALUES (
    @id, @category, @brand, @model, @name, @power_w, @power_kw, @voltage, @phase,
    @capacity_ah, @capacity_kwh, @chemistry, @unit, @price_usd, @price_uzs,
    @warranty_years, @subtype, @is_active, @sort_order, @created_at, @updated_at
  )
`);

const insertSetting = db.prepare(
  `INSERT INTO settings (key, value, type, updated_at) VALUES (@key, @value, @type, @updated_at)`,
);
const insertRule = db.prepare(`
  INSERT INTO calculation_rules (id, rule_key, name, value, unit, description, is_active)
  VALUES (@id, @rule_key, @name, @value, @unit, @description, 1)
`);

const tx = db.transaction(() => {
  for (const p of PRODUCTS) insertProduct.run(p);
  for (const s of SETTINGS) insertSetting.run({ ...s, updated_at: now });
  for (const r of RULES) insertRule.run(r);
});
tx();

const counts = {
  products: db.prepare(`SELECT COUNT(*) AS c FROM products`).get().c,
  settings: db.prepare(`SELECT COUNT(*) AS c FROM settings`).get().c,
  rules: db.prepare(`SELECT COUNT(*) AS c FROM calculation_rules`).get().c,
};
db.close();

console.log("[seed-supply-db] OK", dbPath);
console.log(counts);
