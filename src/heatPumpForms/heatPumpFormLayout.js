export const FORM_TITLE = "ISSIQLIK NASOSI TIZIMINI TANLASH FORMASI";

export const HEAT_PUMP_COLLECTION = "heatPumpForms";

export const SYSTEM_POWER_OPTIONS = [
  "10 kW",
  "12 kW",
  "15 kW",
  "16 kW",
  "18 kW",
  "20 kW",
  "21 kW",
  "25 kW",
  "29 kW",
  "30 kW",
];

export const REFRIGERANT_OPTIONS = ["R290", "R32"];

export const ELECTRIC_SUPPLY_OPTIONS = ["220V (1 faza)", "380V (3 faza)"];

export const OBJECT_TYPE_OPTIONS = ["Xonadon", "Tashkilot", "Boshqa"];

export const HEATING_SYSTEM_OPTIONS = ["Radiator", "Fancoil", "Topliy pol"];

export const BUFFER_TANK_OPTIONS = ["0L", "50L", "100L", "150L", "200L", "300L"];

export const BOILER_OPTIONS = ["0L", "80L", "100L", "150L", "200L", "300L"];

export const WIFI_MONITOR_OPTIONS = ["Ha", "Yo'q"];

export const INSTALLATION_OPTIONS = ["Faqat uskuna", "To'liq montaj"];

export const PACKAGE_OPTIONS = [
  "Faqat issiqlik nasosi",
  "Issiqlik nasosi + bufer tank",
];

export function todayDateParts(date = new Date()) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear());
  return { dateDay: day, dateMonth: month, dateYear: year };
}

import { offerPdfFileName } from "../commercialOffers/offerPdfNames.js";

export function pdfFileName(clientName) {
  return offerPdfFileName("heat_pump", clientName);
}
