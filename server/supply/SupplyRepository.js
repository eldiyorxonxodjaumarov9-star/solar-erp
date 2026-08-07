/**
 * SupplyRepository — yagona ma’lumot manbasi: data/supply/
 *
 * database.db mavjud bo‘lsa mahsulotlar FAQAT undan.
 * CSV — faqat DB yo‘q / kategoriya bo‘sh bo‘lsa (fallback).
 * breakers.txt / accessories.txt / settings.json / currency.json — qo‘shimcha.
 * Hardcode katalog YO‘Q. Limit YO‘Q.
 */
import fs from "node:fs";
import path from "node:path";
import { parseCsv, numOrNull } from "./parseCsv.js";
import {
  resolveSupplyDir,
  listSupplySourceFiles,
  supplyDirSignature,
} from "./supplyDir.js";
import { loadProductsFromSqlite } from "./loadSqliteFile.js";

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function parseMoney(raw) {
  const t = String(raw || "").replace(/\u00a0/g, " ").trim();
  const usd = t.match(/([\d]+(?:[.,]\d+)?)\s*\$/);
  if (usd) return { price: Number(usd[1].replace(",", ".")), currency: "USD" };
  const uzs = t.match(/([\d.\s]+)\s*so[‘'’`]?m/i);
  if (uzs) {
    const n = Number(uzs[1].replace(/\s/g, "").replace(/\./g, ""));
    return Number.isFinite(n) ? { priceUzs: n, currency: "UZS" } : null;
  }
  return null;
}

function parseNamedPriceLines(text) {
  const items = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const cleaned = line.replace(/^\d+\.\s*/, "").trim();
    if (
      !cleaned ||
      /^[─\-—]+/.test(cleaned) ||
      (/Breaker|Aksessuar|Metal/i.test(cleaned) && !/:/i.test(cleaned))
    ) {
      continue;
    }
    const m = cleaned.match(/^(.+?):\s*(.+)$/);
    if (!m) continue;
    const name = m[1]
      .replace(/^Metal\s*konstruktsiya/i, "Metal konstruktsiya")
      .trim();
    const right = m[2].trim();
    const unitMatch = right.match(
      /^([\d.]+)\s*(dona|metr|m)?\s*[-–—]\s*(.+)$/i,
    );
    let unit = "dona";
    let moneyRaw = right;
    if (unitMatch) {
      unit = (unitMatch[2] || "dona").toLowerCase().startsWith("m")
        ? "metr"
        : "dona";
      moneyRaw = unitMatch[3];
    }
    const money = parseMoney(moneyRaw);
    if (!money) continue;
    items.push({ name, unit, ...money });
  }
  return items;
}

function slug(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 56);
}

function toUsd(item, rate) {
  if (item.price != null && Number.isFinite(Number(item.price))) {
    return { ...item, price: Number(item.price), currency: "USD" };
  }
  if (item.priceUzs != null && rate > 0) {
    return {
      ...item,
      price: Math.round((Number(item.priceUzs) / rate) * 10000) / 10000,
      currency: "USD",
    };
  }
  return { ...item, price: null };
}

function emptyCatalog(dir, error) {
  return {
    ok: false,
    error: error || "Taminot ma’lumotlar bazasi topilmadi",
    path: dir,
    panels: [],
    inverters: [],
    batteries: [],
    breakers: [],
    cables: [],
    accessories: [],
    metal: null,
    settings: {},
    currency: {},
    rules: {},
    notes: [],
    inverterTypes: [],
    files: [],
    sources: [],
  };
}

function normalizeType(t) {
  return String(t || "")
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/g, "");
}

function deriveInverterTypes(inverters, settings) {
  // settings.json dagi inverter_types (ixtiyoriy)
  if (Array.isArray(settings?.inverter_types) && settings.inverter_types.length) {
    return settings.inverter_types.map((t) => ({
      id: normalizeType(t.id || t),
      label: t.label || String(t.id || t),
    }));
  }
  // Database type maydonidan — birinchi uchrash tartibida (Telegram tartibi)
  const seen = new Set();
  const types = [];
  for (const inv of inverters || []) {
    const id = normalizeType(inv.type || inv.subtype);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label = id.charAt(0).toUpperCase() + id.slice(1);
    types.push({ id, label });
  }
  return types;
}

function applyWarranties(list, settings, kind) {
  return (list || []).map((item) => {
    if (item.warrantyYears != null) return item;
    if (kind === "panel") {
      return {
        ...item,
        warrantyYears: settings.panel_warranty_years ?? null,
      };
    }
    if (kind === "inverter") {
      const t = normalizeType(item.type || item.subtype);
      return {
        ...item,
        warrantyYears: settings.inverter_warranty?.[t] ?? null,
      };
    }
    if (kind === "battery") {
      const chem = item.chemistry || "";
      const map = settings.battery_warranty || {};
      return {
        ...item,
        warrantyYears: map[chem] ?? map.AGM ?? null,
      };
    }
    return item;
  });
}

function loadPanelsCsv(filePath, settings) {
  return parseCsv(readText(filePath)).map((r, i) => ({
    id: `panel-${r.id || i + 1}`,
    category: "panel",
    name: r.name || `${r.brand || ""} ${r.model || ""}`.trim(),
    brand: r.brand || "",
    model: r.model || "",
    powerW: numOrNull(r.power_w ?? r.power),
    price: numOrNull(r.price ?? r.price_usd),
    warrantyYears:
      numOrNull(r.warranty_years) ?? settings.panel_warranty_years ?? null,
    unit: "dona",
    source: "panels.csv",
    sortOrder: Number(r.id) || i + 1,
  }));
}

function loadInvertersCsv(filePath, settings) {
  return parseCsv(readText(filePath)).map((r, i) => {
    const type = normalizeType(r.type || r.subtype || "");
    return {
      id: `inv-${r.id || i + 1}`,
      category: "inverter",
      name: r.name || `${r.brand || ""} ${r.model || ""}`.trim(),
      brand: r.brand || "",
      model: r.model || "",
      powerKw: numOrNull(r.power_kw ?? r.power),
      type,
      subtype: type,
      voltage: r.voltage || "",
      phase: numOrNull(r.phase),
      price: numOrNull(r.price ?? r.price_usd),
      warrantyYears:
        numOrNull(r.warranty_years) ??
        (type ? settings.inverter_warranty?.[type] : null) ??
        null,
      unit: "dona",
      source: "inverters.csv",
      sortOrder: Number(r.id) || i + 1,
    };
  });
}

function loadBatteriesCsv(filePath) {
  return parseCsv(readText(filePath)).map((r, i) => {
    const name = r.name || "";
    return {
      id: `bat-${r.id || i + 1}`,
      category: "battery",
      name,
      brand: r.brand || "",
      model: r.model || name,
      capacityKwh: numOrNull(r.capacity_kwh),
      capacityAh: numOrNull(r.capacity_ah),
      batteryCountHint: numOrNull(r.battery_count),
      voltage: r.voltage || "",
      chemistry: /GEL/i.test(name)
        ? "GEL"
        : /AGM/i.test(name)
          ? "AGM"
          : /LiFe/i.test(name)
            ? "LiFePO4"
            : "",
      price: numOrNull(r.price ?? r.price_usd),
      unit: "dona",
      source: "batteries.csv",
      sortOrder: Number(r.id) || i + 1,
    };
  });
}

/** database.db birinchi; boshqa sqlite faqat u yo‘q bo‘lsa */
function findSqliteFiles(dir) {
  const primary = path.join(dir, "database.db");
  if (fs.existsSync(primary)) return [primary];
  const names = ["supply.db"];
  const found = [];
  for (const name of names) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) found.push(p);
  }
  for (const f of fs.readdirSync(dir)) {
    if (/\.(db|sqlite)$/i.test(f) && f !== "database.db" && !names.includes(f)) {
      found.push(path.join(dir, f));
    }
  }
  return found;
}

/** @type {{ signature: string, data: object } | null} */
let cache = null;

export class SupplyRepository {
  constructor(dir = resolveSupplyDir()) {
    this.dir = dir;
  }

  exists() {
    return fs.existsSync(this.dir);
  }

  listFiles() {
    return listSupplySourceFiles(this.dir).map((f) => f.name);
  }

  invalidate() {
    cache = null;
  }

  load({ force = false } = {}) {
    const signature = supplyDirSignature(this.dir);
    if (!force && cache && cache.signature === signature) return cache.data;

    if (!this.exists()) {
      const empty = emptyCatalog(this.dir);
      cache = { signature, data: empty };
      return empty;
    }

    const files = this.listFiles();
    const sources = [];
    let currency = { usd_to_uzs: null };
    let settings = {};
    let rules = {};
    let notes = [];
    let panels = [];
    let inverters = [];
    let batteries = [];
    let breakers = [];
    let cables = [];
    let accessories = [];
    let metal = null;

    try {
      const currencyPath = path.join(this.dir, "currency.json");
      if (fs.existsSync(currencyPath)) {
        currency = { ...currency, ...readJson(currencyPath) };
        sources.push("currency.json");
      }
    } catch (err) {
      console.error("[supply] currency.json xato:", err?.message || err);
    }

    try {
      const settingsPath = path.join(this.dir, "settings.json");
      if (fs.existsSync(settingsPath)) {
        settings = readJson(settingsPath);
        rules =
          settings.rules && typeof settings.rules === "object"
            ? { ...settings.rules }
            : {};
        notes = Array.isArray(settings.notes) ? settings.notes : [];
        sources.push("settings.json");
      }
    } catch (err) {
      console.error("[supply] settings.json xato:", err?.message || err);
    }

    const rate =
      Number(currency.usd_to_uzs) || Number(settings.usd_to_uzs) || 0;

    // 1) database.db mavjud bo‘lsa — mahsulotlar FAQAT undan (CSV override yo‘q)
    let databaseLoaded = false;
    for (const dbPath of findSqliteFiles(this.dir)) {
      try {
        const sqlite = loadProductsFromSqlite(dbPath);
        const base = path.basename(dbPath);
        if (sqlite.panels?.length) {
          panels = sqlite.panels.map((p) => ({
            ...p,
            price: p.price ?? p.priceUsd,
            source: base,
          }));
        }
        if (sqlite.inverters?.length) {
          inverters = sqlite.inverters.map((inv) => ({
            ...inv,
            type: normalizeType(inv.type || inv.subtype),
            subtype: normalizeType(inv.type || inv.subtype),
            price: inv.price ?? inv.priceUsd,
            source: base,
          }));
        }
        if (sqlite.batteries?.length) {
          batteries = sqlite.batteries.map((b) => ({
            ...b,
            price: b.price ?? b.priceUsd,
            source: base,
          }));
        }
        if (sqlite.breakers?.length) {
          breakers = sqlite.breakers.map((b) => ({
            ...b,
            price: b.price ?? b.priceUsd,
            source: base,
          }));
        }
        if (sqlite.cables?.length) {
          cables = sqlite.cables.map((c) => ({
            ...c,
            price: c.price ?? c.priceUsd,
            source: base,
          }));
        }
        if (sqlite.accessories?.length) {
          accessories = sqlite.accessories.map((a) => ({
            ...a,
            price: a.price ?? a.priceUsd,
            source: base,
          }));
        }
        if (sqlite.metal?.length) {
          const m = sqlite.metal[0];
          metal = { ...m, price: m.price ?? m.priceUsd, source: base };
        }
        if (sqlite.settings && Object.keys(sqlite.settings).length) {
          settings = { ...sqlite.settings, ...settings };
        }
        if (sqlite.rules && Object.keys(sqlite.rules).length) {
          for (const [k, v] of Object.entries(sqlite.rules)) {
            if (rules[k] == null) {
              rules[k] = typeof v === "object" ? v.value : v;
            }
          }
        }
        sources.push(base);
        databaseLoaded =
          panels.length > 0 || inverters.length > 0 || batteries.length > 0;
        console.log(
          `[supply] sqlite ${base}: panels=${panels.length} inverters=${inverters.length} batteries=${batteries.length} databaseLoaded=${databaseLoaded}`,
        );
      } catch (err) {
        console.error(
          `[supply] ${path.basename(dbPath)} parse xato:`,
          err?.message || err,
        );
      }
    }

    // 2) CSV — faqat database.db yo‘q / kategoriya bo‘sh bo‘lsa (fallback/import)
    if (!databaseLoaded || !panels.length) {
      try {
        const panelsCsv = path.join(this.dir, "panels.csv");
        if (fs.existsSync(panelsCsv)) {
          const fromCsv = loadPanelsCsv(panelsCsv, settings);
          if (fromCsv.length) {
            panels = fromCsv;
            sources.push("panels.csv");
          }
        }
      } catch (err) {
        console.error("[supply] panels.csv xato:", err?.message || err);
      }
    }

    if (!databaseLoaded || !inverters.length) {
      try {
        const invCsv = path.join(this.dir, "inverters.csv");
        if (fs.existsSync(invCsv)) {
          const fromCsv = loadInvertersCsv(invCsv, settings);
          if (fromCsv.length) {
            inverters = fromCsv;
            sources.push("inverters.csv");
          }
        }
      } catch (err) {
        console.error("[supply] inverters.csv xato:", err?.message || err);
      }
    }

    if (!databaseLoaded || !batteries.length) {
      try {
        const batCsv = path.join(this.dir, "batteries.csv");
        if (fs.existsSync(batCsv)) {
          const fromCsv = loadBatteriesCsv(batCsv);
          if (fromCsv.length) {
            batteries = fromCsv;
            sources.push("batteries.csv");
          }
        }
      } catch (err) {
        console.error("[supply] batteries.csv xato:", err?.message || err);
      }
    }

    // 3) TXT — breakers / accessories / metal (DB da bo‘lmasa yoki TXT ustuvor narx manbai)
    try {
      const breakersTxt = path.join(this.dir, "breakers.txt");
      if (fs.existsSync(breakersTxt)) {
        const parsedBreakers = [];
        const parsedCables = [];
        for (const raw of parseNamedPriceLines(readText(breakersTxt))) {
          const item = toUsd(raw, rate);
          if (/Kabel/i.test(item.name)) {
            parsedCables.push({
              id: `cable-${slug(item.name)}`,
              category: "cable",
              name: item.name,
              unit: item.unit || "metr",
              price: item.price,
              subtype: "dc_cable",
              source: "breakers.txt",
            });
          } else {
            let subtype = "other";
            if (/YCB7|Avto|2P C/i.test(item.name)) subtype = "ac";
            else if (/PV-32|1000V|Upower|Upover/i.test(item.name))
              subtype = "dc";
            else if (/Surge/i.test(item.name)) subtype = "surge";
            else if (/YC6S/i.test(item.name)) subtype = "yc6s";
            parsedBreakers.push({
              id: `breaker-${subtype}-${slug(item.name)}`,
              category: "breaker",
              name: item.name,
              unit: item.unit || "dona",
              price: item.price,
              subtype,
              source: "breakers.txt",
            });
          }
        }
        if (parsedBreakers.length) {
          breakers = parsedBreakers;
          sources.push("breakers.txt");
        }
        if (parsedCables.length) {
          cables = parsedCables;
        }
      }
    } catch (err) {
      console.error("[supply] breakers.txt xato:", err?.message || err);
    }

    try {
      const accTxt = path.join(this.dir, "accessories.txt");
      if (fs.existsSync(accTxt)) {
        const parsedAcc = [];
        for (const raw of parseNamedPriceLines(readText(accTxt))) {
          const item = toUsd(raw, rate);
          if (/Metal/i.test(item.name)) {
            metal = {
              id: "metal-per-meter",
              category: "metal",
              name: "Metal konstruktsiya",
              unit: "metr",
              price: item.price,
              source: "accessories.txt",
            };
            continue;
          }
          let subtype = "accessory";
          if (/MC4/i.test(item.name)) subtype = "mc4";
          else if (/Orta|O‘rta|O'rta/i.test(item.name)) subtype = "orta_shayba";
          else if (/Chekka/i.test(item.name)) subtype = "chekka_shayba";
          parsedAcc.push({
            id: `acc-${subtype}`,
            category: "accessory",
            name: item.name,
            unit: item.unit || "dona",
            price: item.price,
            subtype,
            source: "accessories.txt",
          });
        }
        if (parsedAcc.length) {
          accessories = parsedAcc;
          sources.push("accessories.txt");
        }
        if (metal) sources.push("accessories.txt:metal");
      }
    } catch (err) {
      console.error("[supply] accessories.txt xato:", err?.message || err);
    }

    // Legacy TXT — faqat metal/breaker bo‘sh bo‘lsa
    try {
      const legacyTxt = path.join(this.dir, "Taminot_Narxlari.txt");
      if ((!metal || !breakers.length) && fs.existsSync(legacyTxt)) {
        for (const raw of parseNamedPriceLines(readText(legacyTxt))) {
          const item = toUsd(raw, rate);
          if (/Metal/i.test(item.name) && !metal) {
            metal = {
              id: "metal-per-meter",
              name: "Metal konstruktsiya",
              unit: "metr",
              price: item.price,
              category: "metal",
              source: "Taminot_Narxlari.txt",
            };
          }
        }
        sources.push("Taminot_Narxlari.txt");
      }
    } catch (err) {
      console.error("[supply] Taminot_Narxlari.txt xato:", err?.message || err);
    }

    // Sort by sortOrder / id (Telegram tartibi)
    const bySort = (a, b) =>
      (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
    panels = applyWarranties([...panels].sort(bySort), settings, "panel");
    inverters = applyWarranties(
      [...inverters].sort(bySort),
      settings,
      "inverter",
    );
    batteries = applyWarranties(
      [...batteries].sort(bySort),
      settings,
      "battery",
    );

    const inverterTypes = deriveInverterTypes(inverters, settings);
    const ok =
      panels.length > 0 || inverters.length > 0 || batteries.length > 0;

    const data = {
      ok,
      error: ok ? null : "Taminot ma’lumotlar bazasi topilmadi",
      path: this.dir,
      files,
      sources: [...new Set(sources)],
      databaseLoaded,
      panels,
      inverters,
      batteries,
      breakers,
      cables,
      accessories,
      metal,
      settings,
      currency: {
        usd_to_uzs: rate || Number(currency.usd_to_uzs) || null,
        currency: currency.currency || "USD",
      },
      rules,
      notes,
      inverterTypes,
      companyName: settings.companyName || null,
      reportTitle: settings.reportTitle || null,
      warranty: {
        panelYears: settings.panel_warranty_years ?? null,
        inverter: settings.inverter_warranty || {},
        battery: settings.battery_warranty || {},
      },
    };

    cache = { signature, data };
    return data;
  }
}

export function getSupplyRepository() {
  return new SupplyRepository();
}
