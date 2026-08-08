/**
 * Admin CRUD for data/supply/database.db + accessories/breakers txt.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { resolveSupplyDir } from "./supplyDir.js";
import {
  getInternalCatalog,
  invalidateSupplyCatalogCache,
  reloadSupplyCatalog,
} from "./catalogStore.js";

function dbPath() {
  return path.join(resolveSupplyDir(), "database.db");
}

function openDb() {
  const p = dbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`database.db topilmadi: ${p}`);
  }
  return new Database(p);
}

function parseDbId(id) {
  const s = String(id || "");
  const m = s.match(/^(panel|inv|bat)-(\d+)$/i);
  if (!m) return null;
  const kind = m[1].toLowerCase();
  return {
    kind: kind === "panel" ? "panel" : kind === "inv" ? "inverter" : "battery",
    numericId: Number(m[2]),
  };
}

function categoryToKind(category) {
  const c = String(category || "").toLowerCase();
  if (c === "panel" || c === "panels") return "panel";
  if (c === "inverter" || c === "inverters") return "inverter";
  if (c === "battery" || c === "batteries") return "battery";
  if (c === "accessory" || c === "accessories") return "accessory";
  if (c === "breaker" || c === "breakers") return "breaker";
  if (c === "cable" || c === "cables") return "cable";
  if (c === "metal") return "metal";
  return "";
}

function num(v, fallback = null) {
  if (v === "" || v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function moneyLine(name, unit, priceUsd) {
  const u = unit || "dona";
  const p = Number(priceUsd) || 0;
  const formatted = Number.isInteger(p) ? String(p) : String(p);
  return `${name}: 1 ${u} - ${formatted}$`;
}

function writeTxtExtras(catalog) {
  const dir = resolveSupplyDir();
  const accessories = catalog.accessories || [];
  const metalArr = Array.isArray(catalog.metal)
    ? catalog.metal
    : catalog.metal
      ? [catalog.metal]
      : [];
  const breakers = (catalog.breakers || []).filter((b) => b.category !== "cable");
  const cables = [
    ...(catalog.cables || []),
    ...(catalog.breakers || []).filter((b) => b.category === "cable" || b.subtype === "cable"),
  ];

  const accLines = ["──────── Aksessuarlar ────────"];
  accessories.forEach((a, i) => {
    accLines.push(
      `${i + 1}. ${moneyLine(a.name || a.model, a.unit || "dona", a.priceUsd ?? a.price)}`,
    );
  });
  accLines.push("", "──────── Metal ────────");
  const metal = metalArr[0];
  if (metal) {
    const price = metal.priceUsd ?? metal.price ?? 0;
    const unit = metal.unit || "metr";
    accLines.push(`Metal konstruktsiya: 1 ${unit} - ${price}$`);
  }

  const brLines = ["──────── Breakerlar ────────"];
  [...breakers, ...cables].forEach((b, i) => {
    brLines.push(
      `${i + 1}. ${moneyLine(b.name || b.model, b.unit || "dona", b.priceUsd ?? b.price)}`,
    );
  });

  fs.writeFileSync(path.join(dir, "accessories.txt"), `${accLines.join("\n")}\n`, "utf8");
  fs.writeFileSync(path.join(dir, "breakers.txt"), `${brLines.join("\n")}\n`, "utf8");
}

function afterMutation() {
  invalidateSupplyCatalogCache();
  return reloadSupplyCatalog();
}

export function createSupplyProduct(body) {
  const kind = categoryToKind(body.category);
  if (!kind) throw new Error("Noto‘g‘ri category");

  if (kind === "panel" || kind === "inverter" || kind === "battery") {
    const db = openDb();
    try {
      if (kind === "panel") {
        const name = String(body.name || "").trim();
        if (!name) throw new Error("Nom majburiy");
        const info = db
          .prepare(`INSERT INTO solar_panels (name, power, price) VALUES (?, ?, ?)`)
          .run(name, num(body.powerW ?? body.power, 0), num(body.price ?? body.priceUsd, 0));
        return { ok: true, id: `panel-${info.lastInsertRowid}`, kind };
      }
      if (kind === "inverter") {
        const name = String(body.name || "").trim();
        if (!name) throw new Error("Nom majburiy");
        let power = num(body.powerW ?? body.power, null);
        if (power == null && body.powerKw != null) {
          power = Math.round(Number(body.powerKw) * 1000);
        }
        const type = String(body.type || body.subtype || "ongrid")
          .toLowerCase()
          .replace(/[\s_-]+/g, "");
        const info = db
          .prepare(
            `INSERT INTO inverters (name, power, price, max_pv_input_kw, type) VALUES (?, ?, ?, ?, ?)`,
          )
          .run(
            name,
            power ?? 0,
            num(body.price ?? body.priceUsd, 0),
            num(body.maxPvInputKw ?? body.max_pv_input_kw, null),
            type,
          );
        return { ok: true, id: `inv-${info.lastInsertRowid}`, kind };
      }
      // battery
      const name = String(body.name || "").trim();
      if (!name) throw new Error("Nom majburiy");
      const info = db
        .prepare(
          `INSERT INTO batteries (name, battery_count, capacity_kwh, price) VALUES (?, ?, ?, ?)`,
        )
        .run(
          name,
          num(body.batteryCountHint ?? body.battery_count, 1),
          body.capacityKwh != null ? String(body.capacityKwh) : String(body.capacity_kwh || ""),
          num(body.price ?? body.priceUsd, 0),
        );
      return { ok: true, id: `bat-${info.lastInsertRowid}`, kind };
    } finally {
      db.close();
    }
  }

  // TXT-based
  const catalog = getInternalCatalog();
  if (!catalog.ok) throw new Error(catalog.error || "Katalog yuklanmadi");

  const price = num(body.price ?? body.priceUsd, 0);
  const name = String(body.name || body.model || "").trim();
  if (!name) throw new Error("Nom majburiy");
  const unit = String(body.unit || (kind === "metal" || kind === "cable" ? "metr" : "dona"));
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

  if (kind === "metal") {
    catalog.metal = [
      {
        id: "metal-per-meter",
        category: "metal",
        name: name || "Metall konstruksiya",
        model: name,
        unit,
        price,
        priceUsd: price,
      },
    ];
  } else if (kind === "accessory") {
    const id = `acc-${slug || Date.now()}`;
    catalog.accessories = [
      ...(catalog.accessories || []),
      { id, category: "accessory", name, model: name, unit, price, priceUsd: price },
    ];
  } else if (kind === "cable") {
    const id = `cable-${slug || Date.now()}`;
    catalog.cables = [
      ...(catalog.cables || []),
      { id, category: "cable", name, model: name, unit, price, priceUsd: price, subtype: "cable" },
    ];
  } else if (kind === "breaker") {
    const id = `breaker-${slug || Date.now()}`;
    catalog.breakers = [
      ...(catalog.breakers || []),
      { id, category: "breaker", name, model: name, unit, price, priceUsd: price },
    ];
  }

  writeTxtExtras(catalog);
  return { ok: true, id: kind === "metal" ? "metal-per-meter" : undefined, kind };
}

export function updateSupplyProduct(id, body) {
  const parsed = parseDbId(id);
  if (parsed) {
    const db = openDb();
    try {
      if (parsed.kind === "panel") {
        const row = db.prepare(`SELECT * FROM solar_panels WHERE id = ?`).get(parsed.numericId);
        if (!row) throw new Error("Panel topilmadi");
        db.prepare(`UPDATE solar_panels SET name = ?, power = ?, price = ? WHERE id = ?`).run(
          String(body.name ?? row.name).trim(),
          num(body.powerW ?? body.power, row.power),
          num(body.price ?? body.priceUsd, row.price),
          parsed.numericId,
        );
        return { ok: true, id, kind: "panel" };
      }
      if (parsed.kind === "inverter") {
        const row = db.prepare(`SELECT * FROM inverters WHERE id = ?`).get(parsed.numericId);
        if (!row) throw new Error("Inverter topilmadi");
        let power = num(body.powerW ?? body.power, null);
        if (power == null && body.powerKw != null) {
          power = Math.round(Number(body.powerKw) * 1000);
        }
        if (power == null) power = row.power;
        const type = String(body.type ?? body.subtype ?? row.type ?? "ongrid")
          .toLowerCase()
          .replace(/[\s_-]+/g, "");
        db.prepare(
          `UPDATE inverters SET name = ?, power = ?, price = ?, max_pv_input_kw = ?, type = ? WHERE id = ?`,
        ).run(
          String(body.name ?? row.name).trim(),
          power,
          num(body.price ?? body.priceUsd, row.price),
          num(body.maxPvInputKw ?? body.max_pv_input_kw, row.max_pv_input_kw),
          type,
          parsed.numericId,
        );
        return { ok: true, id, kind: "inverter" };
      }
      const row = db.prepare(`SELECT * FROM batteries WHERE id = ?`).get(parsed.numericId);
      if (!row) throw new Error("Akkumulyator topilmadi");
      db.prepare(
        `UPDATE batteries SET name = ?, battery_count = ?, capacity_kwh = ?, price = ? WHERE id = ?`,
      ).run(
        String(body.name ?? row.name).trim(),
        num(body.batteryCountHint ?? body.battery_count, row.battery_count),
        body.capacityKwh != null || body.capacity_kwh != null
          ? String(body.capacityKwh ?? body.capacity_kwh)
          : row.capacity_kwh,
        num(body.price ?? body.priceUsd, row.price),
        parsed.numericId,
      );
      return { ok: true, id, kind: "battery" };
    } finally {
      db.close();
    }
  }

  // TXT items by id
  const catalog = getInternalCatalog();
  if (!catalog.ok) throw new Error(catalog.error || "Katalog yuklanmadi");
  const sid = String(id);
  const price = body.price != null || body.priceUsd != null ? num(body.price ?? body.priceUsd, 0) : null;
  const patch = (item) => {
    if (!item || item.id !== sid) return item;
    return {
      ...item,
      name: body.name != null ? String(body.name).trim() : item.name,
      model: body.name != null ? String(body.name).trim() : item.model,
      unit: body.unit != null ? String(body.unit) : item.unit,
      price: price != null ? price : item.price,
      priceUsd: price != null ? price : item.priceUsd,
    };
  };

  catalog.accessories = (catalog.accessories || []).map(patch);
  catalog.breakers = (catalog.breakers || []).map(patch);
  catalog.cables = (catalog.cables || []).map(patch);
  if (Array.isArray(catalog.metal)) catalog.metal = catalog.metal.map(patch);
  else if (catalog.metal?.id === sid) catalog.metal = patch(catalog.metal);

  writeTxtExtras(catalog);
  return { ok: true, id, kind: "txt" };
}

export function deleteSupplyProduct(id) {
  const parsed = parseDbId(id);
  if (parsed) {
    const db = openDb();
    try {
      if (parsed.kind === "panel") {
        const r = db.prepare(`DELETE FROM solar_panels WHERE id = ?`).run(parsed.numericId);
        if (!r.changes) throw new Error("Panel topilmadi");
      } else if (parsed.kind === "inverter") {
        const r = db.prepare(`DELETE FROM inverters WHERE id = ?`).run(parsed.numericId);
        if (!r.changes) throw new Error("Inverter topilmadi");
      } else {
        const r = db.prepare(`DELETE FROM batteries WHERE id = ?`).run(parsed.numericId);
        if (!r.changes) throw new Error("Akkumulyator topilmadi");
      }
      return { ok: true, id, kind: parsed.kind };
    } finally {
      db.close();
    }
  }

  const catalog = getInternalCatalog();
  if (!catalog.ok) throw new Error(catalog.error || "Katalog yuklanmadi");
  const sid = String(id);
  const before =
    (catalog.accessories?.length || 0) +
    (catalog.breakers?.length || 0) +
    (catalog.cables?.length || 0) +
    (Array.isArray(catalog.metal) ? catalog.metal.length : catalog.metal ? 1 : 0);

  catalog.accessories = (catalog.accessories || []).filter((x) => x.id !== sid);
  catalog.breakers = (catalog.breakers || []).filter((x) => x.id !== sid);
  catalog.cables = (catalog.cables || []).filter((x) => x.id !== sid);
  if (Array.isArray(catalog.metal)) {
    catalog.metal = catalog.metal.filter((x) => x.id !== sid);
  } else if (catalog.metal?.id === sid) {
    catalog.metal = [];
  }

  const after =
    (catalog.accessories?.length || 0) +
    (catalog.breakers?.length || 0) +
    (catalog.cables?.length || 0) +
    (Array.isArray(catalog.metal) ? catalog.metal.length : catalog.metal ? 1 : 0);
  if (after === before) throw new Error("Mahsulot topilmadi");

  writeTxtExtras(catalog);
  return { ok: true, id, kind: "txt" };
}

export { afterMutation, categoryToKind };
