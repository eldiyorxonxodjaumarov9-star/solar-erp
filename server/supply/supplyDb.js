/**
 * supply.db — Taminot katalog (SQLite).
 * Path: SUPPLY_DB_PATH yoki ./data/supply/supply.db
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

const SCHEMA_SQL = `
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

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_subtype ON products(subtype);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
`;

/** @type {import('better-sqlite3').Database | null} */
let dbInstance = null;
let dbPathResolved = "";
let missingLogged = false;

/** @type {{ mtimeMs: number, catalog: object } | null} */
let catalogCache = null;

export function resolveSupplyDbPath() {
  const fromEnv = String(process.env.SUPPLY_DB_PATH || "").trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv)
      ? fromEnv
      : path.resolve(PROJECT_ROOT, fromEnv);
  }
  return path.join(PROJECT_ROOT, "data", "supply", "supply.db");
}

export function getSupplyDbPath() {
  return resolveSupplyDbPath();
}

export function isSupplyDbAvailable() {
  return fs.existsSync(resolveSupplyDbPath());
}

function nowIso() {
  return new Date().toISOString();
}

function ensureSchema(db) {
  db.exec(SCHEMA_SQL);
}

/**
 * @returns {import('better-sqlite3').Database | null}
 */
export function openSupplyDb() {
  const dbPath = resolveSupplyDbPath();
  if (!fs.existsSync(dbPath)) {
    if (!missingLogged) {
      console.warn("[supply-db] supply.db topilmadi:", dbPath);
      missingLogged = true;
    }
    closeSupplyDb();
    return null;
  }

  if (dbInstance && dbPathResolved === dbPath) {
    try {
      // connection still alive?
      dbInstance.prepare("SELECT 1").get();
      return dbInstance;
    } catch {
      closeSupplyDb();
    }
  }

  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new Database(dbPath, { readonly: false, fileMustExist: true });
    db.pragma("journal_mode = WAL");
    ensureSchema(db);
    dbInstance = db;
    dbPathResolved = dbPath;
    missingLogged = false;
    return db;
  } catch (err) {
    console.error("[supply-db] ochish xatosi:", err?.message || err);
    closeSupplyDb();
    return null;
  }
}

export function closeSupplyDb() {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      /* ignore */
    }
  }
  dbInstance = null;
  dbPathResolved = "";
  catalogCache = null;
}

/** Fayl almashtirilganda yoki POST /reload */
export function reloadSupplyDb() {
  closeSupplyDb();
  return openSupplyDb();
}

function fileMtimeMs(dbPath) {
  try {
    return fs.statSync(dbPath).mtimeMs;
  } catch {
    return 0;
  }
}

function parseSettingValue(row) {
  if (!row) return null;
  const t = String(row.type || "string");
  const v = row.value;
  if (t === "number") return Number(v);
  if (t === "boolean") return v === "1" || v === "true" || v === true;
  if (t === "json") {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v;
}

function mapProduct(row) {
  if (!row) return null;
  return {
    id: row.id,
    category: row.category,
    brand: row.brand || "",
    model: row.model || "",
    name: row.name || `${row.brand || ""} ${row.model || ""}`.trim(),
    powerW: row.power_w != null ? Number(row.power_w) : null,
    powerKw: row.power_kw != null ? Number(row.power_kw) : null,
    voltage: row.voltage || "",
    phase: row.phase != null ? Number(row.phase) : null,
    capacityAh: row.capacity_ah != null ? Number(row.capacity_ah) : null,
    capacityKwh: row.capacity_kwh != null ? Number(row.capacity_kwh) : null,
    chemistry: row.chemistry || "",
    unit: row.unit || "dona",
    priceUsd: Number(row.price_usd) || 0,
    priceUzs: row.price_uzs != null ? Number(row.price_uzs) : null,
    warrantyYears: row.warranty_years != null ? Number(row.warranty_years) : null,
    subtype: row.subtype || "",
    type: row.subtype || "", // inverter type alias
    bifacial: row.subtype === "bifacial" || false,
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order) || 0,
  };
}

function listProducts(db, category, { subtype, activeOnly = true } = {}) {
  let sql = `SELECT * FROM products WHERE category = ?`;
  const params = [category];
  if (activeOnly) {
    sql += ` AND is_active = 1`;
  }
  if (subtype) {
    sql += ` AND subtype = ?`;
    params.push(subtype);
  }
  sql += ` ORDER BY sort_order ASC, name ASC`;
  return db.prepare(sql).all(...params).map(mapProduct);
}

export function getSettingsMap(db = openSupplyDb()) {
  if (!db) return {};
  const rows = db.prepare(`SELECT key, value, type FROM settings`).all();
  const out = {};
  for (const row of rows) {
    out[row.key] = parseSettingValue(row);
  }
  return out;
}

export function getRulesMap(db = openSupplyDb()) {
  if (!db) return {};
  const rows = db
    .prepare(
      `SELECT rule_key, value, unit, name, description FROM calculation_rules WHERE is_active = 1`,
    )
    .all();
  const out = {};
  for (const row of rows) {
    out[row.rule_key] = {
      value: Number(row.value),
      unit: row.unit || "",
      name: row.name || "",
      description: row.description || "",
    };
  }
  return out;
}

export function getRuleValue(rules, key, fallback = null) {
  const r = rules?.[key];
  if (r == null) return fallback;
  return typeof r === "object" ? Number(r.value) : Number(r);
}

export function listPanels(db = openSupplyDb()) {
  if (!db) return [];
  return listProducts(db, "panel").map((p) => ({
    ...p,
    bifacial: /2 tomonlama|bifacial/i.test(`${p.model} ${p.name}`),
    type: "N-Type",
  }));
}

export function listInverters(db = openSupplyDb(), { type } = {}) {
  if (!db) return [];
  return listProducts(db, "inverter", { subtype: type || undefined });
}

export function listBatteries(db = openSupplyDb()) {
  if (!db) return [];
  return listProducts(db, "battery");
}

export function listAccessories(db = openSupplyDb()) {
  if (!db) return [];
  return listProducts(db, "accessory");
}

export function listBreakers(db = openSupplyDb()) {
  if (!db) return [];
  return listProducts(db, "breaker");
}

export function listCables(db = openSupplyDb()) {
  if (!db) return [];
  return listProducts(db, "cable");
}

export function listMetal(db = openSupplyDb()) {
  if (!db) return [];
  return listProducts(db, "metal");
}

export function getProductById(id, db = openSupplyDb()) {
  if (!db || !id) return null;
  const row = db.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
  return mapProduct(row);
}

/**
 * Full catalog for Taminot UI + calculation engine.
 */
export function getSupplyCatalog({ force = false } = {}) {
  const dbPath = resolveSupplyDbPath();
  if (!fs.existsSync(dbPath)) {
    if (!missingLogged) {
      console.warn("[supply-db] supply.db topilmadi:", dbPath);
      missingLogged = true;
    }
    catalogCache = null;
    return {
      ok: false,
      error: "Taminot ma’lumotlar bazasi topilmadi",
      path: dbPath,
      panels: [],
      inverters: [],
      batteries: [],
      accessories: [],
      breakers: [],
      cables: [],
      metal: [],
      settings: {},
      rules: {},
    };
  }

  const mtimeMs = fileMtimeMs(dbPath);
  if (!force && catalogCache && catalogCache.mtimeMs === mtimeMs) {
    return catalogCache.catalog;
  }

  const db = openSupplyDb();
  if (!db) {
    return {
      ok: false,
      error: "Taminot ma’lumotlar bazasi topilmadi",
      path: dbPath,
      panels: [],
      inverters: [],
      batteries: [],
      accessories: [],
      breakers: [],
      cables: [],
      metal: [],
      settings: {},
      rules: {},
    };
  }

  const settings = getSettingsMap(db);
  const rules = getRulesMap(db);
  const panels = listPanels(db);
  const inverters = listInverters(db);
  const batteries = listBatteries(db);
  const accessories = listAccessories(db);
  const breakers = listBreakers(db);
  const cables = listCables(db);
  const metal = listMetal(db);

  const inverterTypes = [
    { id: "ongrid", label: "On-grid" },
    { id: "hybrid", label: "Hybrid" },
    { id: "chastotnik", label: "Chastotnik" },
    { id: "offgrid", label: "Off-grid" },
  ];

  const catalog = {
    ok: true,
    path: dbPath,
    mtimeMs,
    panels,
    inverters,
    batteries,
    accessories,
    breakers,
    cables,
    metal,
    settings,
    rules,
    inverterTypes,
    fetchedAt: nowIso(),
  };

  catalogCache = { mtimeMs, catalog };
  return catalog;
}

export function invalidateSupplyCatalogCache() {
  catalogCache = null;
}
