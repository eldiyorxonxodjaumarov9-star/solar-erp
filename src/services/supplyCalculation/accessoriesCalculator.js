import { getRuleNumber } from "./catalog.js";

function line(name, qty, unitUsd, unitLabel = "dona", extra = {}) {
  const quantity = Math.round(Number(qty) * 100) / 100;
  const unit = Number(unitUsd);
  if (!Number.isFinite(unit)) {
    return null;
  }
  const totalUsd = Math.round(quantity * unit * 100) / 100;
  return { name, quantity, unitLabel, unitUsd: unit, totalUsd, ...extra };
}

function bySubtype(list, subtype) {
  return (list || []).find((x) => (x.subtype || x.type) === subtype) || null;
}

/**
 * Breaker / kabel / SPD — narxlar va qty qoidalari supply.db dan.
 */
export function calculateBreakers({ requestedSystemKw, panelCount, catalog }) {
  const kw = Number(requestedSystemKw) || 0;
  const panels = Number(panelCount) || 0;
  const perString = getRuleNumber(catalog, "panels_per_pv_string", null);
  const cablePerKw = getRuleNumber(catalog, "cable_meter_per_kw", null);
  const surgeQty = getRuleNumber(catalog, "surge_qty", null);
  const acQty = getRuleNumber(catalog, "ac_breaker_qty", null);

  if (
    perString == null ||
    cablePerKw == null ||
    surgeQty == null ||
    acQty == null
  ) {
    return { ok: false, error: "Breaker hisoblash qoidalari bazada topilmadi" };
  }

  const ac = bySubtype(catalog.breakers, "ac");
  const dc = bySubtype(catalog.breakers, "dc");
  const surge = bySubtype(catalog.breakers, "surge");
  const cable = (catalog.cables || [])[0] || bySubtype(catalog.breakers, "cable");

  if (!ac || !dc || !surge || !cable) {
    return {
      ok: false,
      error: "Breaker / kabel mahsulotlari bazada to‘liq emas",
    };
  }

  const dcQty = Math.max(1, Math.ceil(panels / perString));
  const cableM = Math.round(kw * cablePerKw);

  const items = [
    line(ac.name || ac.model, acQty, ac.priceUsd, ac.unit || "dona", {
      productId: ac.id,
    }),
    line(dc.name || dc.model, dcQty, dc.priceUsd, dc.unit || "dona", {
      productId: dc.id,
    }),
    line(cable.name || cable.model, cableM, cable.priceUsd, cable.unit || "metr", {
      productId: cable.id,
    }),
    line(surge.name || surge.model, surgeQty, surge.priceUsd, surge.unit || "dona", {
      productId: surge.id,
    }),
  ].filter(Boolean);

  if (items.length < 4) {
    return { ok: false, error: "Breaker narxlari bazada noto‘g‘ri" };
  }

  const totalUsd = Math.round(items.reduce((s, i) => s + i.totalUsd, 0) * 100) / 100;
  return { ok: true, items, totalUsd };
}

const ACCESSORY_RULE_BY_SUBTYPE = {
  mc4: "mc4_per_panel",
  orta_shayba: "middle_washer_per_panel",
  chekka_shayba: "edge_washer_per_panel",
};

export function calculateAccessories({ panelCount, catalog }) {
  const panels = Number(panelCount) || 0;
  const list = catalog?.accessories || [];
  if (!list.length) {
    return { ok: false, error: "Aksessuarlar bazada topilmadi" };
  }

  const items = [];
  for (const a of list) {
    const ruleKey = ACCESSORY_RULE_BY_SUBTYPE[a.subtype] || null;
    const perPanel = ruleKey ? getRuleNumber(catalog, ruleKey, null) : 1;
    if (perPanel == null) {
      return {
        ok: false,
        error: `Aksessuar qoidasi topilmadi: ${a.subtype || a.id}`,
      };
    }
    const row = line(
      a.name || a.model,
      Math.max(1, Math.round(panels * perPanel)),
      a.priceUsd,
      a.unit || "dona",
      { productId: a.id },
    );
    if (!row) {
      return { ok: false, error: `Aksessuar narxi yo‘q: ${a.id}` };
    }
    items.push(row);
  }

  const totalUsd = Math.round(items.reduce((s, i) => s + i.totalUsd, 0) * 100) / 100;
  return { ok: true, items, totalUsd };
}
