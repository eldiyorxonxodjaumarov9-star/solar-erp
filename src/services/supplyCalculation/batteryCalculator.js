import { getBatteryById } from "./catalog.js";

/**
 * requiredKwh = (loadKw * backupHours) / (DoD * inverterEfficiency)
 * count = ceil(requiredKwh / battery.capacityKwh)
 */
export function calculateBatteryBank({
  required,
  batteryId,
  loadKw,
  backupHours = 4,
  dod = 0.9,
  inverterEfficiency = 0.95,
  catalog,
}) {
  if (!required) {
    return {
      batteryRequired: false,
      batteryCount: 0,
      batteryTotalUsd: 0,
      batteryConfig: null,
    };
  }
  const bat = getBatteryById(catalog, batteryId);
  if (!bat) {
    return { ok: false, error: "Akkumulyator tanlanmadi", batteryRequired: true };
  }
  const priceUsd = Number(bat.priceUsd);
  if (!Number.isFinite(priceUsd)) {
    return { ok: false, error: "Akkumulyator narxi bazada topilmadi" };
  }
  const capacityKwh = Number(bat.capacityKwh);
  if (!capacityKwh) {
    return { ok: false, error: "Akkumulyator sig‘imi bazada topilmadi" };
  }
  const load = Number(loadKw) || 0;
  const hours = Number(backupHours) || 0;
  const depth = Math.min(0.95, Math.max(0.5, Number(dod) || 0.9));
  const eff = Math.min(0.99, Math.max(0.8, Number(inverterEfficiency) || 0.95));
  const requiredKwh =
    hours > 0 && load > 0 ? (load * hours) / (depth * eff) : capacityKwh;
  const batteryCount = Math.max(1, Math.ceil(requiredKwh / capacityKwh));
  const batteryTotalUsd = Math.round(batteryCount * priceUsd * 100) / 100;

  return {
    ok: true,
    batteryRequired: true,
    batteryConfig: {
      id: bat.id,
      brand: bat.brand,
      model: bat.model,
      name: bat.name,
      voltage: bat.voltage,
      capacityAh: bat.capacityAh,
      capacityKwh,
      chemistry: bat.chemistry,
      priceUsd,
      warrantyYears: bat.warrantyYears,
      loadKw: load,
      backupHours: hours,
      dod: depth,
      inverterEfficiency: eff,
      requiredKwh: Math.round(requiredKwh * 100) / 100,
    },
    batteryCount,
    batteryTotalUsd,
  };
}
