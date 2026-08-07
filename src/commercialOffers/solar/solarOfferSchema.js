import {
  getBatteryByName,
  isValidBatteryType,
  resolveBatteryImage,
} from "../../services/batteryService.js";
import {
  getMetalConstructionByName,
  isValidMetalConstructionType,
  resolveMetalConstructionImage,
} from "../../services/metalConstructionService.js";
import {
  getInverterByName,
  isValidInverterType,
  resolveInverterImage,
} from "../../services/inverterService.js";
import {
  getPanelByName,
  isValidPanelType,
  normalizePanelName,
  resolvePanelImage,
  resolvePanelLogo,
} from "../../services/panelService.js";
import { isValidSolarPhase, SOLAR_COMPANY } from "./solarOfferLayout.js";

export const DEFAULT_PANEL_POWER = 650;
export const PRICE_PER_KW_UNDER_10 = 3_500_000;
export const PRICE_PER_KW_10_PLUS = 3_600_000;
export const YEARLY_KWH_PER_KW = 1500;

export const DEFAULT_PROJECT_PRICE = 100_000;

export const DEFAULT_SOLAR_FORM = {
  clientName: "",
  phone: "",
  region: "",
  district: "",
  stationPower: null,
  phase: "",
  panelType: "",
  panelImage: "",
  panelLogo: "",
  panelPower: DEFAULT_PANEL_POWER,
  panelCount: "",
  inverterType: "",
  inverterImage: "",
  hasBattery: "",
  batteryType: "",
  batteryImage: "",
  batteryCapacity: "",
  metalConstruction: "",
  metalConstructionImage: "",
  projectPrice: DEFAULT_PROJECT_PRICE,
  installationPeriod: "3–5 ish kuni",
};

/** @param {number} kw */
export function formatSystemKw(kw) {
  const n = Number(kw);
  if (!Number.isFinite(n)) return "0";
  return Number(n.toFixed(2)).toString();
}

/**
 * Foydalanuvchi kiritgan panel quvvati va soni bo'yicha hisob-kitob.
 * @param {{ stationPower?: number | null, panelPower?: number, panelCount?: number | string }} form
 */
export function computeSolarOffer(form) {
  const stationPower = Number(form?.stationPower) || 0;
  const panelPower = Number(form?.panelPower) || 0;
  const panelCount = Number(form?.panelCount) || 0;
  const pricePerKw =
    stationPower >= 10 ? PRICE_PER_KW_10_PLUS : PRICE_PER_KW_UNDER_10;
  const totalPrice = Math.round(stationPower * pricePerKw);
  const realSystemPower =
    panelPower > 0 && panelCount > 0
      ? Math.round(((panelPower * panelCount) / 1000) * 100) / 100
      : 0;
  const yearlyProduction = Math.round(realSystemPower * YEARLY_KWH_PER_KW);

  return {
    stationPower,
    pricePerKw,
    totalPrice,
    panelPower,
    panelCount,
    realSystemPower,
    yearlyProduction,
  };
}

function req(form, key, label, errors) {
  if (!String(form[key] ?? "").trim()) errors[key] = `${label} majburiy`;
}

function reqPositiveNumber(form, key, label, errors) {
  const n = Number(form[key]);
  if (!Number.isFinite(n) || n <= 0) {
    errors[key] = `${label} kiriting`;
  }
}

export function validateSolarOfferForm(form) {
  const errors = {};
  req(form, "clientName", "Mijoz ismi", errors);
  req(form, "phone", "Telefon", errors);
  req(form, "region", "Viloyat", errors);
  req(form, "district", "Tuman", errors);
  if (!isValidPanelType(form.panelType)) {
    errors.panelType = "Panel turini tanlang";
  }
  if (!isValidInverterType(form.inverterType)) {
    errors.inverterType = "Inverter turini tanlang";
  }
  const hasBattery = String(form.hasBattery || "").trim();
  if (hasBattery !== "yes" && hasBattery !== "no") {
    errors.hasBattery = "Akkumulyator bor yoki yo‘qligini tanlang";
  } else if (hasBattery === "yes") {
    if (!isValidBatteryType(form.batteryType)) {
      errors.batteryType = "Akkumulyator turini tanlang";
    } else if (!String(form.batteryCapacity ?? "").trim()) {
      errors.batteryCapacity = "Akkumulyator quvvatini kiriting";
    }
  }
  if (!isValidMetalConstructionType(form.metalConstruction)) {
    errors.metalConstruction = "Metall konstruksiyani tanlang";
  }
  reqPositiveNumber(form, "panelPower", "Panel quvvati", errors);
  reqPositiveNumber(form, "panelCount", "Panel soni", errors);

  const stationPower = Number(form.stationPower);
  if (!Number.isFinite(stationPower) || stationPower < 1 || stationPower > 100) {
    errors.stationPower = "Stansiya quvvatini tanlang";
  }

  if (!isValidSolarPhase(form.phase)) {
    errors.phase = "Fazani tanlang";
  }

  const projectPrice = Number(form.projectPrice);
  if (!Number.isFinite(projectPrice) || projectPrice < 0) {
    errors.projectPrice = "Loyiha ishlari narxi noto'g'ri";
  }

  return errors;
}

export function formToSolarPayload(form, createdBy = "") {
  const calc = computeSolarOffer(form);
  const now = new Date().toISOString();
  return {
    type: "solar_panel",
    clientName: String(form.clientName || "").trim(),
    phone: String(form.phone || "").trim(),
    region: String(form.region || "").trim(),
    district: String(form.district || "").trim(),
    stationPower: calc.stationPower,
    phase: isValidSolarPhase(form.phase) ? form.phase : "",
    panelType: normalizePanelName(form.panelType),
    panelImage: resolvePanelImage(form.panelType, form.panelImage),
    panelLogo: resolvePanelLogo(form.panelType, form.panelLogo),
    panelPower: calc.panelPower,
    panelCount: calc.panelCount,
    realSystemPower: calc.realSystemPower,
    inverterType: String(form.inverterType || "").trim(),
    inverterImage: resolveInverterImage(form.inverterType, form.inverterImage),
    hasBattery: form.hasBattery === "yes" ? "yes" : form.hasBattery === "no" ? "no" : "",
    batteryType:
      form.hasBattery === "yes" ? String(form.batteryType || "").trim() : "",
    batteryImage:
      form.hasBattery === "yes"
        ? resolveBatteryImage(form.batteryType, form.batteryImage)
        : "",
    batteryCapacity:
      form.hasBattery === "yes" ? String(form.batteryCapacity || "").trim() : "",
    metalConstruction: String(form.metalConstruction || "").trim(),
    metalConstructionImage: resolveMetalConstructionImage(
      form.metalConstruction,
      form.metalConstructionImage,
    ),
    projectPrice: Number(form.projectPrice) || DEFAULT_PROJECT_PRICE,
    pricePerKw: calc.pricePerKw,
    totalPrice: calc.totalPrice,
    installationPeriod: String(form.installationPeriod || "3–5 ish kuni").trim(),
    yearlyProduction: calc.yearlyProduction,
    companyName: SOLAR_COMPANY.name,
    companyPhone: SOLAR_COMPANY.phone,
    createdBy: String(createdBy || "").trim(),
    updatedAt: now,
  };
}

export function recordToSolarForm(record) {
  if (!record) return null;
  const panelType = normalizePanelName(record.panelType || "");
  const panel = getPanelByName(panelType);
  const inverterType = String(record.inverterType || record.inverter || "").trim();
  const inverter = getInverterByName(inverterType);
  return {
    clientName: record.clientName || "",
    phone: record.phone || "",
    region: record.region || "",
    district: record.district || "",
    stationPower: Number(record.stationPower) || null,
    phase: isValidSolarPhase(record.phase) ? record.phase : "",
    panelType,
    panelImage: record.panelImage || panel?.image || "",
    panelLogo: record.panelLogo || panel?.logo || "",
    panelPower: Number(record.panelPower ?? record.panelPowerWatt) || DEFAULT_PANEL_POWER,
    panelCount: Number(record.panelCount) || "",
    inverterType,
    inverterImage: record.inverterImage || inverter?.image || "",
    hasBattery:
      record.hasBattery === "yes" || record.hasBattery === "no"
        ? record.hasBattery
        : record.batteryType
          ? "yes"
          : "",
    batteryType: record.batteryType || "",
    batteryImage:
      record.batteryImage || getBatteryByName(record.batteryType)?.image || "",
    batteryCapacity: record.batteryCapacity || "",
    metalConstruction: record.metalConstruction || "",
    metalConstructionImage:
      record.metalConstructionImage ||
      getMetalConstructionByName(record.metalConstruction)?.image ||
      "",
    projectPrice: Number(record.projectPrice ?? record.projectWorkPrice) || DEFAULT_PROJECT_PRICE,
    installationPeriod: record.installationPeriod || "3–5 ish kuni",
  };
}

/** Firestore yozuvidan yoki formadan PDF uchun bir xil hisob-kitob. */
export function resolveSolarCalculations(source) {
  const merged = {
    ...source,
    panelPower: source?.panelPower ?? source?.panelPowerWatt,
  };
  const calc = computeSolarOffer(merged);
  const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    stationPower: num(source?.stationPower, calc.stationPower),
    pricePerKw: num(source?.pricePerKw, calc.pricePerKw),
    totalPrice: num(source?.totalPrice, calc.totalPrice),
    panelPower: num(merged.panelPower, calc.panelPower),
    panelCount: num(source?.panelCount, calc.panelCount),
    realSystemPower: num(source?.realSystemPower, calc.realSystemPower),
    yearlyProduction: num(source?.yearlyProduction, calc.yearlyProduction),
  };
}
