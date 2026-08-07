/**
 * Katalog helperlari — mahsulot hardcode YO‘Q.
 * Ma’lumot faqat GET /api/supply/catalog (data/supply) orqali.
 */

export function panelLabel(p) {
  if (!p) return "";
  if (p.name) return String(p.name).trim();
  return `${p.brand || ""} ${p.model || ""}`.trim();
}

export function inverterLabel(inv) {
  if (!inv) return "";
  if (inv.name) return String(inv.name).trim();
  return `${inv.brand || ""} ${inv.model || ""}`.trim();
}

export function getRuleNumber(catalog, key, fallback = null) {
  const r = catalog?.rules?.[key];
  if (r == null || r === undefined) return fallback;
  const n = typeof r === "object" ? Number(r.value) : Number(r);
  return Number.isFinite(n) ? n : fallback;
}

export function getSettingNumber(catalog, key, fallback = null) {
  const v = catalog?.settings?.[key];
  if (v == null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function getSetting(catalog, key, fallback = null) {
  const v = catalog?.settings?.[key];
  return v == null || v === undefined ? fallback : v;
}

export function findById(list, id) {
  if (!id || !Array.isArray(list)) return null;
  return list.find((x) => x.id === id) || null;
}

export function getPanelById(catalog, id) {
  return findById(catalog?.panels, id);
}

export function getInverterById(catalog, id) {
  return findById(catalog?.inverters, id);
}

export function getBatteryById(catalog, id) {
  return findById(catalog?.batteries, id);
}

export function listInvertersByType(catalog, type) {
  const list = catalog?.inverters || [];
  if (!type) return list;
  const t = String(type).toLowerCase();
  return list.filter((i) => String(i.type || i.subtype || "").toLowerCase() === t);
}

export function buildWarrantyNotes(catalog) {
  return {
    panelYears: getSettingNumber(catalog, "panel_default_warranty", null),
    inverter: {
      ongrid: getSettingNumber(catalog, "ongrid_inverter_warranty", null),
      hybrid: getSettingNumber(catalog, "hybrid_inverter_warranty", null),
      offgrid: getSettingNumber(catalog, "offgrid_inverter_warranty", null),
      chastotnik: getSettingNumber(catalog, "chastotnik_inverter_warranty", null),
    },
    battery: {
      AGM: getSettingNumber(catalog, "agm_battery_warranty", null),
      GEL: getSettingNumber(catalog, "gel_battery_warranty", null),
      LiFePO4: getSetting(catalog, "lifepo4_warranty", null),
    },
  };
}

export function getOfferNotes(catalog) {
  const notes = getSetting(catalog, "offer_notes", null);
  return Array.isArray(notes) ? notes : [];
}

export function getExchangeRate(catalog, override) {
  if (override != null && override !== "" && Number.isFinite(Number(override))) {
    return Number(override);
  }
  return getSettingNumber(catalog, "exchange_rate_usd_uzs", null);
}

export function getMetalPricePerMeter(catalog) {
  const fromSettings = getSettingNumber(catalog, "metal_price_per_meter", null);
  if (fromSettings != null) return fromSettings;
  const metal = Array.isArray(catalog?.metal) ? catalog.metal[0] : catalog?.metal;
  return metal ? Number(metal.priceUsd ?? metal.price) || null : null;
}

/** Normalize API catalog for UI helpers */
export function normalizeCatalog(raw) {
  if (!raw || raw.ok === false) return raw;
  return {
    ...raw,
    panels: raw.panels || [],
    inverters: (raw.inverters || []).map((i) => ({
      ...i,
      type: i.type || i.subtype,
      powerKw: i.powerKw ?? i.power_kw,
      priceUsd: i.priceUsd ?? i.price_usd,
      warrantyYears: i.warrantyYears ?? i.warranty_years,
    })),
    batteries: raw.batteries || [],
    accessories: raw.accessories || [],
    breakers: raw.breakers || [],
    cables: raw.cables || [],
    metal: raw.metal || [],
    settings: raw.settings || {},
    rules: raw.rules || {},
    inverterTypes: Array.isArray(raw.inverterTypes) ? raw.inverterTypes : [],
  };
}
