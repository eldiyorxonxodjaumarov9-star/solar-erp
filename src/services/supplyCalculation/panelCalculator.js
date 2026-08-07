import { getPanelById, panelLabel } from "./catalog.js";

/**
 * Energybor BOM: Math.floor(kW*1000 / W)
 */
export function calcPanelCount(requestedSystemKw, panelPowerW) {
  const kw = Number(requestedSystemKw) || 0;
  const w = Number(panelPowerW) || 0;
  if (kw <= 0 || w <= 0) return 0;
  return Math.max(1, Math.floor((kw * 1000) / w));
}

export function calculatePanels({ requestedSystemKw, panelId, catalog }) {
  if (!catalog?.ok && !catalog?.panels?.length) {
    return { ok: false, error: "Taminot ma’lumotlar bazasi topilmadi" };
  }
  const panel = getPanelById(catalog, panelId);
  if (!panel) {
    return { ok: false, error: "Panel tanlanmadi" };
  }
  const powerW = Number(panel.powerW) || 0;
  const priceUsd = Number(panel.priceUsd);
  if (!Number.isFinite(priceUsd)) {
    return { ok: false, error: "Panel narxi bazada topilmadi" };
  }
  const panelCount = calcPanelCount(requestedSystemKw, powerW);
  const totalPowerW = panelCount * powerW;
  const totalPowerKw = Math.round((totalPowerW / 1000) * 100) / 100;
  const panelTotalUsd = Math.round(panelCount * priceUsd * 100) / 100;

  return {
    ok: true,
    panel,
    panelId: panel.id,
    panelName: panelLabel(panel),
    panelPowerW: powerW,
    panelUnitUsd: priceUsd,
    panelCount,
    totalPowerW,
    totalPowerKw,
    panelTotalUsd,
  };
}
