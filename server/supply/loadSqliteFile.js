import Database from "better-sqlite3";
import { numOrNull } from "./parseCsv.js";

function tableExists(db, name) {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
    .get(name);
  return Boolean(row);
}

function inverterPowerKw(power) {
  const n = Number(power);
  if (!Number.isFinite(n) || n <= 0) return null;
  // DB da ko‘pincha W (5000 = 5 kW)
  if (n >= 100) return Math.round((n / 1000) * 100) / 100;
  return n;
}

function brandFromName(name) {
  const t = String(name || "").trim();
  if (!t) return "";
  return t.split(/\s+/)[0] || "";
}

function voltageFromText(text, explicit = "") {
  if (explicit) return String(explicit);
  const s = String(text || "");
  const m = s.match(/(\d{2,3})\s*v/i);
  if (m) return `${m[1]}V`;
  if (/380/i.test(s)) return "380V";
  if (/220/i.test(s)) return "220V";
  return "";
}

function phaseFromText(text, explicit = null) {
  if (explicit != null && explicit !== "" && Number.isFinite(Number(explicit))) {
    return Number(explicit);
  }
  const s = String(text || "");
  if (/3\s*p|3p|p3|380/i.test(s)) return 3;
  if (/1\s*p|1p|p1|220/i.test(s)) return 1;
  return null;
}

function chemistryFromName(name) {
  const s = String(name || "");
  if (/LiFe|LFP/i.test(s)) return "LiFePO4";
  if (/GEL/i.test(s)) return "GEL";
  if (/AGM/i.test(s)) return "AGM";
  return "";
}

/**
 * database.db / supply.db / *.sqlite dan mahsulotlar (dinamik, limit yo‘q).
 */
export function loadProductsFromSqlite(filePath) {
  const db = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const panels = [];
    const inverters = [];
    const batteries = [];
    const extras = {
      settings: {},
      rules: {},
      metal: [],
      breakers: [],
      cables: [],
      accessories: [],
    };

    if (tableExists(db, "solar_panels")) {
      const rows = db.prepare(`SELECT * FROM solar_panels ORDER BY id`).all();
      rows.forEach((r, i) => {
        const name = String(r.name || "");
        const price = numOrNull(r.price);
        const brand = String(r.brand || brandFromName(name));
        panels.push({
          id: `panel-${r.id ?? i + 1}`,
          category: "panel",
          brand,
          model: String(r.model || name.replace(brand, "").trim()),
          name,
          powerW: numOrNull(r.power ?? r.power_w),
          powerKw: null,
          unit: "dona",
          price,
          priceUsd: price,
          currency: "USD",
          warrantyYears: numOrNull(r.warranty_years),
          subtype: "",
          source: "sqlite",
          sortOrder: Number(r.id) || i + 1,
        });
      });
    }

    if (tableExists(db, "inverters")) {
      const rows = db.prepare(`SELECT * FROM inverters ORDER BY id`).all();
      rows.forEach((r, i) => {
        const name = String(r.name || "");
        const price = numOrNull(r.price);
        const type = String(r.type || r.subtype || "")
          .toLowerCase()
          .trim()
          .replace(/[\s_-]+/g, "");
        const brand = String(r.brand || brandFromName(name));
        inverters.push({
          id: `inv-${r.id ?? i + 1}`,
          category: "inverter",
          brand,
          model: String(r.model || name.replace(brand, "").trim()),
          name,
          powerKw: inverterPowerKw(r.power ?? r.power_kw),
          powerW: numOrNull(r.power),
          maxPvInputKw: numOrNull(r.max_pv_input_kw),
          voltage: voltageFromText(name, r.voltage),
          phase: phaseFromText(name, r.phase),
          type,
          subtype: type,
          unit: "dona",
          price,
          priceUsd: price,
          currency: "USD",
          warrantyYears: numOrNull(r.warranty_years),
          source: "sqlite",
          sortOrder: Number(r.id) || i + 1,
        });
      });
    }

    if (tableExists(db, "batteries")) {
      const rows = db.prepare(`SELECT * FROM batteries ORDER BY id`).all();
      rows.forEach((r, i) => {
        const name = String(r.name || "");
        const price = numOrNull(r.price);
        batteries.push({
          id: `bat-${r.id ?? i + 1}`,
          category: "battery",
          brand: String(r.brand || brandFromName(name)),
          model: name,
          name,
          capacityKwh: numOrNull(r.capacity_kwh),
          capacityAh: numOrNull(r.capacity_ah),
          batteryCountHint: numOrNull(r.battery_count),
          voltage: voltageFromText(name, r.voltage),
          chemistry: String(r.chemistry || chemistryFromName(name)),
          unit: "dona",
          price,
          priceUsd: price,
          currency: "USD",
          warrantyYears: numOrNull(r.warranty_years),
          subtype: "",
          source: "sqlite",
          sortOrder: Number(r.id) || i + 1,
        });
      });
    }

    if (tableExists(db, "products")) {
      const rows = db
        .prepare(
          `SELECT * FROM products WHERE is_active = 1 OR is_active IS NULL ORDER BY sort_order, id`,
        )
        .all();
      for (const r of rows) {
        const item = {
          id: String(r.id),
          category: r.category,
          brand: r.brand || "",
          model: r.model || "",
          name: r.name || `${r.brand || ""} ${r.model || ""}`.trim(),
          powerW: numOrNull(r.power_w),
          powerKw: numOrNull(r.power_kw),
          voltage: r.voltage || "",
          phase: r.phase != null ? Number(r.phase) : null,
          capacityAh: numOrNull(r.capacity_ah),
          capacityKwh: numOrNull(r.capacity_kwh),
          chemistry: r.chemistry || "",
          unit: r.unit || "dona",
          price: numOrNull(r.price_usd),
          priceUsd: numOrNull(r.price_usd),
          priceUzs: numOrNull(r.price_uzs),
          currency: "USD",
          warrantyYears: numOrNull(r.warranty_years),
          subtype: r.subtype || "",
          type: String(r.subtype || r.type || "")
            .toLowerCase()
            .trim()
            .replace(/[\s_-]+/g, ""),
          source: "sqlite-products",
          sortOrder: Number(r.sort_order) || 0,
        };
        if (r.category === "panel") panels.push(item);
        else if (r.category === "inverter") {
          inverters.push({ ...item, type: item.type || item.subtype });
        } else if (r.category === "battery") batteries.push(item);
        else if (r.category === "metal") extras.metal.push(item);
        else if (r.category === "breaker") extras.breakers.push(item);
        else if (r.category === "cable") extras.cables.push(item);
        else if (r.category === "accessory") extras.accessories.push(item);
      }
    }

    if (tableExists(db, "settings")) {
      const rows = db.prepare(`SELECT key, value, type FROM settings`).all();
      for (const row of rows) {
        let v = row.value;
        if (row.type === "number") v = Number(v);
        else if (row.type === "json") {
          try {
            v = JSON.parse(v);
          } catch {
            /* keep */
          }
        }
        extras.settings[row.key] = v;
      }
    }

    if (tableExists(db, "calculation_rules")) {
      const rows = db
        .prepare(
          `SELECT rule_key, value, unit, name, description FROM calculation_rules WHERE is_active = 1 OR is_active IS NULL`,
        )
        .all();
      for (const row of rows) {
        extras.rules[row.rule_key] = {
          value: Number(row.value),
          unit: row.unit || "",
          name: row.name || "",
          description: row.description || "",
        };
      }
    }

    return { panels, inverters, batteries, ...extras };
  } finally {
    db.close();
  }
}
