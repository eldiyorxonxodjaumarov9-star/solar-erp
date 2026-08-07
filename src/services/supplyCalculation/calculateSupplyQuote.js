import {
  buildWarrantyNotes,
  getExchangeRate,
  getOfferNotes,
} from "./catalog.js";
import { calculatePanels } from "./panelCalculator.js";
import { calculateInverter } from "./inverterCalculator.js";
import { calculateMetal } from "./metalCalculator.js";
import {
  calculateAccessories,
  calculateBreakers,
} from "./accessoriesCalculator.js";
import { calculateBatteryBank } from "./batteryCalculator.js";
import { calculateTotals } from "./pricingCalculator.js";

/**
 * To‘liq Taminot quote — barcha narxlar `catalog` (supply.db) dan.
 * @param {Record<string, unknown>} input
 * @param {object} catalog — GET /api/supply/catalog javobi
 */
export function calculateSupplyQuote(input = {}, catalog) {
  if (!catalog || catalog.ok === false || !catalog.panels?.length) {
    return {
      ok: false,
      error: catalog?.error || "Taminot ma’lumotlar bazasi topilmadi",
    };
  }

  const requestedSystemKw = Number(input.requestedSystemKw) || 0;
  if (requestedSystemKw < 1 || requestedSystemKw > 100) {
    return { ok: false, error: "Tizim quvvati 1–100 kW oralig‘ida bo‘lishi kerak" };
  }

  const panels = calculatePanels({
    requestedSystemKw,
    panelId: input.panelId,
    catalog,
  });
  if (!panels.ok) return panels;

  const inverter = calculateInverter({
    inverterId: input.inverterId,
    requestedSystemKw,
    catalog,
  });
  if (!inverter.ok) return inverter;

  const metal = calculateMetal({
    required: Boolean(input.metalConstructionRequired),
    panelCount: panels.panelCount,
    catalog,
  });
  if (metal.ok === false) return metal;

  const breakers = calculateBreakers({
    requestedSystemKw,
    panelCount: panels.panelCount,
    catalog,
  });
  if (!breakers.ok) return breakers;

  const accessories = calculateAccessories({
    panelCount: panels.panelCount,
    catalog,
  });
  if (!accessories.ok) return accessories;

  const needsBatteryPrompt =
    inverter.inverterType === "hybrid" || inverter.inverterType === "offgrid";
  const battery = calculateBatteryBank({
    required: Boolean(input.batteryRequired) && needsBatteryPrompt,
    batteryId: input.batteryId,
    loadKw: Number(input.batteryLoadKw) || requestedSystemKw,
    backupHours: Number(input.batteryBackupHours) || 4,
    catalog,
  });
  if (battery.ok === false) return battery;

  const exchangeRate = getExchangeRate(catalog, input.exchangeRate);
  const totals = calculateTotals({
    panelTotalUsd: panels.panelTotalUsd,
    inverterUsd: inverter.inverterUsd,
    metalUsd: metal.metalUsd,
    breakersUsd: breakers.totalUsd,
    accessoriesUsd: accessories.totalUsd,
    batteryTotalUsd: battery.batteryTotalUsd || 0,
    exchangeRate,
  });
  if (!totals.ok) return totals;

  return {
    ok: true,
    requestedSystemKw,
    ...panels,
    ...inverter,
    ...metal,
    breakers: breakers.items,
    breakersTotalUsd: breakers.totalUsd,
    accessories: accessories.items,
    accessoriesTotalUsd: accessories.totalUsd,
    ...battery,
    ...totals,
    warranty: buildWarrantyNotes(catalog),
    notes: getOfferNotes(catalog),
    clientName: String(input.clientName || "").trim(),
    phone: String(input.phone || "").trim(),
    catalogMtimeMs: catalog.mtimeMs ?? null,
    createdAt: new Date().toISOString(),
  };
}

export {
  calculatePanels,
  calculateInverter,
  calculateMetal,
  calculateBreakers,
  calculateAccessories,
  calculateBatteryBank,
  calculateTotals,
};
