import { offerPdfFileName } from "../offerPdfNames.js";

export const SOLAR_FORM_TITLE = "TIJORIY TAKLIF FORMASI";

export const SOLAR_KV_OPTIONS = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100];

/** @typedef {{ value: "220V" | "380V", label: string }} SolarPhaseOption */

/** @type {SolarPhaseOption[]} */
export const SOLAR_PHASE_OPTIONS = [
  { value: "220V", label: "220V (1 faza)" },
  { value: "380V", label: "380V (3 faza)" },
];

/** @param {string} [phase] */
export function isValidSolarPhase(phase) {
  return phase === "220V" || phase === "380V";
}

/** @param {string} [phase] */
export function solarPhaseLabel(phase) {
  return SOLAR_PHASE_OPTIONS.find((opt) => opt.value === phase)?.label || "";
}

export const SOLAR_COMPANY = {
  name: "Sunnur Energy Tech",
  phone: "+998 71 200 18 81",
  instagramHandle: "@sunnur_energy_tech",
  instagramUrl: "https://www.instagram.com/sunnur_energy_tech",
};

export function formatTodayUz(date = new Date()) {
  return date.toLocaleDateString("uz-UZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Tashkent",
  });
}

export function solarPdfFileName(clientName) {
  return offerPdfFileName("solar_panel", clientName);
}
