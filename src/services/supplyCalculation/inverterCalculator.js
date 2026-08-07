import {
  getInverterById,
  inverterLabel,
  listInvertersByType,
} from "./catalog.js";

export function isInverterCompatible(inv, requestedSystemKw) {
  if (!inv) return false;
  return Number(inv.powerKw) >= Number(requestedSystemKw);
}

export function suggestInverters(catalog, type, requestedSystemKw) {
  return listInvertersByType(catalog, type)
    .filter((inv) => isInverterCompatible(inv, requestedSystemKw))
    .sort((a, b) => {
      const sa = Number(a.sortOrder) || 0;
      const sb = Number(b.sortOrder) || 0;
      if (sa !== sb) return sa - sb;
      return Number(a.powerKw) - Number(b.powerKw);
    });
}

export function calculateInverter({ inverterId, requestedSystemKw, catalog }) {
  if (!catalog?.panels && !catalog?.inverters) {
    return { ok: false, error: "Taminot ma’lumotlar bazasi topilmadi" };
  }
  const inv = getInverterById(catalog, inverterId);
  if (!inv) return { ok: false, error: "Inverter tanlanmadi" };
  if (!isInverterCompatible(inv, requestedSystemKw)) {
    return {
      ok: false,
      error: `Inverter quvvati tizimdan kichik bo‘lmasligi kerak (≥ ${requestedSystemKw} kW)`,
    };
  }
  const priceUsd = Number(inv.priceUsd);
  if (!Number.isFinite(priceUsd)) {
    return { ok: false, error: "Inverter narxi bazada topilmadi" };
  }
  return {
    ok: true,
    inverter: inv,
    inverterId: inv.id,
    inverterType: inv.type || inv.subtype,
    inverterName: inverterLabel(inv),
    inverterPowerKw: Number(inv.powerKw),
    inverterUsd: priceUsd,
    warrantyYears: inv.warrantyYears,
  };
}
