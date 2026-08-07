/**
 * Catalog store — SupplyRepository asosida.
 * Hardcode mahsulot ro‘yxati YO‘Q.
 */
import { SupplyRepository } from "./SupplyRepository.js";
import { resolveSupplyDir, listSupplySourceFiles } from "./supplyDir.js";

const PRICE_KEYS = new Set([
  "price",
  "priceUsd",
  "priceUzs",
  "unitPrice",
  "unitUsd",
  "total",
  "totalUsd",
  "exchangeRate",
  "totalUzs",
  "currency",
]);

export function loadInternalCatalog({ force = false } = {}) {
  const repo = new SupplyRepository();
  const data = repo.load({ force });
  if (!data.ok) {
    return {
      ...data,
      inverterTypes: data.inverterTypes || [],
      sources: data.sources || data.files || [],
      settings: data.settings || {},
      mtimeMs: Date.now(),
      fetchedAt: new Date().toISOString(),
    };
  }

  const panels = (data.panels || []).map((p) => ({
    ...p,
    priceUsd: p.price,
    powerW: p.powerW,
  }));
  const inverters = (data.inverters || []).map((i) => ({
    ...i,
    priceUsd: i.price,
    subtype: i.type,
  }));
  const batteries = (data.batteries || []).map((b) => ({
    ...b,
    priceUsd: b.price,
  }));
  const accessories = (data.accessories || []).map((a) => ({
    ...a,
    priceUsd: a.price,
  }));
  const breakers = (data.breakers || []).map((b) => ({
    ...b,
    priceUsd: b.price,
  }));
  const cables = (data.cables || []).map((c) => ({
    ...c,
    priceUsd: c.price,
  }));
  const metal = data.metal
    ? [{ ...data.metal, priceUsd: data.metal.price }]
    : [];

  const settings = {
    ...data.settings,
    exchange_rate_usd_uzs: data.currency?.usd_to_uzs,
    metal_price_per_meter: data.metal?.price,
    panel_default_warranty: data.warranty?.panelYears,
    ongrid_inverter_warranty: data.warranty?.inverter?.ongrid,
    hybrid_inverter_warranty: data.warranty?.inverter?.hybrid,
    offgrid_inverter_warranty: data.warranty?.inverter?.offgrid,
    chastotnik_inverter_warranty: data.warranty?.inverter?.chastotnik,
    agm_battery_warranty: data.warranty?.battery?.AGM,
    gel_battery_warranty: data.warranty?.battery?.GEL,
    lifepo4_warranty: data.warranty?.battery?.LiFePO4,
    offer_notes: data.notes,
    companyName: data.companyName,
    reportTitle: data.reportTitle,
  };

  const rules = {};
  for (const [k, v] of Object.entries(data.rules || {})) {
    rules[k] = typeof v === "object" && v != null && "value" in v ? v : { value: v };
  }

  return {
    ok: true,
    path: data.path,
    sources: data.sources || data.files || [],
    databaseLoaded: Boolean(data.databaseLoaded),
    panels,
    inverters,
    batteries,
    accessories,
    breakers,
    cables,
    metal,
    settings,
    rules,
    notes: data.notes,
    warranty: data.warranty,
    currency: data.currency,
    companyName: data.companyName,
    reportTitle: data.reportTitle,
    raw: data,
    inverterTypes: data.inverterTypes || [],
    mtimeMs: Date.now(),
    fetchedAt: new Date().toISOString(),
  };
}

export function invalidateSupplyCatalogCache() {
  new SupplyRepository().invalidate();
}

export function reloadSupplyCatalog() {
  invalidateSupplyCatalogCache();
  return loadInternalCatalog({ force: true });
}

export function getInternalCatalog(opts) {
  return loadInternalCatalog(opts);
}

export function stripPricesFromProduct(product) {
  if (!product || typeof product !== "object") return product;
  const out = {};
  for (const [k, v] of Object.entries(product)) {
    if (PRICE_KEYS.has(k)) continue;
    if (/price|narx|cost|usd|uzs|currency/i.test(k) && !/powerKw|capacityKwh|requestedSystemKw/i.test(k))
      continue;
    out[k] = v;
  }
  return out;
}

export function toPublicCatalog(internal) {
  if (!internal?.ok) {
    return {
      ok: false,
      error: internal?.error || "Taminot ma’lumotlar bazasi topilmadi",
      path: internal?.path,
      panels: [],
      inverters: [],
      batteries: [],
      accessories: [],
      breakers: [],
      cables: [],
      metal: [],
      inverterTypes: internal?.inverterTypes || [],
      sources: internal?.sources || [],
      settings: {
        offer_notes: internal?.notes,
        panel_default_warranty: internal?.warranty?.panelYears,
      },
      rules: {},
    };
  }
  return {
    ok: true,
    path: internal.path,
    sources: internal.sources,
    panels: (internal.panels || []).map(stripPricesFromProduct),
    inverters: (internal.inverters || []).map(stripPricesFromProduct),
    batteries: (internal.batteries || []).map(stripPricesFromProduct),
    accessories: (internal.accessories || []).map(stripPricesFromProduct),
    breakers: (internal.breakers || []).map(stripPricesFromProduct),
    cables: (internal.cables || []).map(stripPricesFromProduct),
    metal: (internal.metal || []).map(stripPricesFromProduct),
    inverterTypes: internal.inverterTypes || [],
    settings: {
      panel_default_warranty: internal.warranty?.panelYears,
      ongrid_inverter_warranty: internal.warranty?.inverter?.ongrid,
      hybrid_inverter_warranty: internal.warranty?.inverter?.hybrid,
      offgrid_inverter_warranty: internal.warranty?.inverter?.offgrid,
      chastotnik_inverter_warranty: internal.warranty?.inverter?.chastotnik,
      offer_notes: internal.notes,
      companyName: internal.companyName,
      reportTitle: internal.reportTitle,
    },
    rules: Object.fromEntries(
      Object.entries(internal.rules || {}).map(([k, v]) => [
        k,
        typeof v === "object" ? { value: v.value, unit: v.unit, name: v.name } : { value: v },
      ]),
    ),
    fetchedAt: internal.fetchedAt,
  };
}

export function toPublicQuote(quote) {
  return quote;
}

export function toPricingBlock(quote) {
  if (!quote?.ok) return null;
  return {
    totalUsd: quote.totalUsd,
    totalUzs: quote.totalUzs,
    exchangeRate: quote.exchangeRate,
    panel: quote.panel
      ? {
          name: quote.panel.name,
          count: quote.panel.count,
          unitPrice: quote.panel.unitPrice,
          total: quote.panel.total,
        }
      : null,
    inverter: quote.inverter
      ? {
          name: quote.inverter.name,
          unitPrice: quote.inverter.unitPrice,
          total: quote.inverter.total,
        }
      : null,
    metal: quote.metal?.required
      ? {
          meters: quote.metal.meters,
          unitPrice: quote.metal.unitPrice,
          total: quote.metal.total,
        }
      : null,
    breakers: quote.breakers || [],
    accessories: quote.accessories || [],
    battery: quote.battery
      ? {
          name: quote.battery.name,
          quantity: quote.battery.quantity,
          unitPrice: quote.battery.unitPrice,
          total: quote.battery.total,
        }
      : null,
    panelTotalUsd: quote.panel?.total,
    inverterUsd: quote.inverter?.total,
    metalUsd: quote.metal?.total,
    batteryTotalUsd: quote.battery?.total,
  };
}

export function getSupplyCatalog(opts) {
  return toPublicCatalog(loadInternalCatalog(opts));
}

export function isSupplyDbAvailable() {
  return listSupplySourceFiles(resolveSupplyDir()).length > 0;
}

export function getSupplyDbPath() {
  return resolveSupplyDir();
}

export function resolveSupplyDbPath() {
  return resolveSupplyDir();
}
