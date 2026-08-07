import { getMetalPricePerMeter, getRuleNumber } from "./catalog.js";

/**
 * Metall: panelCount × metal_meter_per_panel × metal_price_per_meter (DB)
 */
export function calculateMetal({ required, panelCount, catalog }) {
  if (!required) {
    return {
      metalConstructionRequired: false,
      metalMeters: 0,
      metalUsd: 0,
    };
  }
  const metersPerPanel = getRuleNumber(catalog, "metal_meter_per_panel", null);
  const unitUsdPerMeter = getMetalPricePerMeter(catalog);
  if (metersPerPanel == null || unitUsdPerMeter == null) {
    return {
      ok: false,
      error: "Metall narxi yoki formula qoidasi bazada topilmadi",
    };
  }
  const count = Math.max(0, Number(panelCount) || 0);
  const metalMeters = count * metersPerPanel;
  const metalUsd = Math.round(metalMeters * unitUsdPerMeter * 100) / 100;
  return {
    ok: true,
    metalConstructionRequired: true,
    metalMeters,
    metalUsd,
    unitUsdPerMeter,
    metersPerPanel,
  };
}
