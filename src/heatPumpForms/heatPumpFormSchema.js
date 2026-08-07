import { todayDateParts } from "./heatPumpFormLayout.js";
import {
  emptySystemPowerCounts,
  expandSystemPowerCounts,
  formatSystemPowerSummary,
  hasSystemPowerSelection,
  normalizeSystemPowerCounts,
} from "./heatPumpSystemPower.js";

export const DEFAULT_HEAT_PUMP_PRICE = 100_000;

export const DEFAULT_HEAT_PUMP_FORM = {
  systemPowerCounts: emptySystemPowerCounts(),
  refrigerant: "",
  electricSupply: "",
  objectType: "",
  otherObject: "",
  heatedArea: "",
  ceilingHeight: "",
  heatingSystem: "",
  fancoilCount: "",
  bufferTank: "",
  boiler: "",
  wifiMonitor: "",
  installationType: "",
  packageType: "",
  offerPrice: DEFAULT_HEAT_PUMP_PRICE,
  clientName: "",
  phone: "",
  ...todayDateParts(),
};

function reqSelect(form, key, label, errors) {
  if (!String(form[key] || "").trim()) {
    errors[key] = `${label} tanlang`;
  }
}

export function validateHeatPumpForm(form) {
  const errors = {};

  if (!hasSystemPowerSelection(normalizeSystemPowerCounts(form))) {
    errors.systemPower = "Tizim quvvatini tanlang";
  }

  reqSelect(form, "refrigerant", "Xladagent turi", errors);
  reqSelect(form, "electricSupply", "Elektr ta'minoti", errors);
  reqSelect(form, "objectType", "Obyekt turi", errors);
  reqSelect(form, "heatingSystem", "Isitish tizimi", errors);
  reqSelect(form, "bufferTank", "Bufer tank", errors);
  reqSelect(form, "boiler", "Boiler", errors);
  reqSelect(form, "wifiMonitor", "Sensorli monitor", errors);
  reqSelect(form, "installationType", "Montaj", errors);
  reqSelect(form, "packageType", "Komplekt turi", errors);

  if (form.objectType === "Boshqa" && !String(form.otherObject || "").trim()) {
    errors.otherObject = "Boshqa obyekt nomini yozing";
  }

  if (!String(form.heatedArea || "").trim()) {
    errors.heatedArea = "Isitiladigan maydon majburiy";
  }

  if (!String(form.ceilingHeight || "").trim()) {
    errors.ceilingHeight = "Shift balandligi majburiy";
  }

  if (!String(form.clientName || "").trim()) {
    errors.clientName = "Mijoz ismi majburiy";
  }

  if (!String(form.phone || "").trim()) {
    errors.phone = "Telefon majburiy";
  }

  const offerPrice = Number(form.offerPrice);
  if (!Number.isFinite(offerPrice) || offerPrice < 0) {
    errors.offerPrice = "Narx noto'g'ri";
  }

  return errors;
}

export function formToFirestorePayload(form, createdBy = "") {
  const now = new Date().toISOString();
  const formDate = `${form.dateDay || ""}/${form.dateMonth || ""}/${form.dateYear || ""}`;
  const systemPowerCounts = normalizeSystemPowerCounts(form);
  const systemPowerList = expandSystemPowerCounts(systemPowerCounts);
  return {
    clientName: String(form.clientName || "").trim(),
    phone: String(form.phone || "").trim(),
    type: "heat_pump",
    systemPowerCounts,
    systemPowerList,
    systemPower: formatSystemPowerSummary(systemPowerCounts),
    refrigerant: String(form.refrigerant || "").trim(),
    electricSupply: String(form.electricSupply || "").trim(),
    objectType: String(form.objectType || "").trim(),
    otherObject: String(form.otherObject || "").trim(),
    heatedArea: String(form.heatedArea || "").trim(),
    ceilingHeight: String(form.ceilingHeight || "").trim(),
    heatingSystem: String(form.heatingSystem || "").trim(),
    fancoilCount: String(form.fancoilCount || "").trim(),
    bufferTank: String(form.bufferTank || "").trim(),
    boiler: String(form.boiler || "").trim(),
    wifiMonitor: String(form.wifiMonitor || "").trim(),
    installationType: String(form.installationType || "").trim(),
    packageType: String(form.packageType || "").trim(),
    offerPrice: Number(form.offerPrice) || DEFAULT_HEAT_PUMP_PRICE,
    formDate,
    dateDay: String(form.dateDay || "").trim(),
    dateMonth: String(form.dateMonth || "").trim(),
    dateYear: String(form.dateYear || "").trim(),
    createdBy: String(createdBy || "").trim(),
    updatedAt: now,
  };
}

export function recordToForm(record) {
  if (!record) return null;

  let dateDay = record.dateDay || "";
  let dateMonth = record.dateMonth || "";
  let dateYear = record.dateYear || "";

  if ((!dateDay || !dateMonth || !dateYear) && record.formDate) {
    const parts = String(record.formDate).split("/");
    if (parts.length >= 3) {
      [dateDay, dateMonth, dateYear] = parts;
    }
  }

  if (!dateDay && record.createdAt) {
    const p = todayDateParts(new Date(record.createdAt));
    dateDay = p.dateDay;
    dateMonth = p.dateMonth;
    dateYear = p.dateYear;
  }

  return {
    systemPowerCounts: normalizeSystemPowerCounts(record),
    refrigerant: record.refrigerant || "",
    electricSupply: record.electricSupply || "",
    objectType: record.objectType || "",
    otherObject: record.otherObject || "",
    heatedArea: record.heatedArea || "",
    ceilingHeight: record.ceilingHeight || "",
    heatingSystem: record.heatingSystem || "",
    fancoilCount: record.fancoilCount || "",
    bufferTank: record.bufferTank || "",
    boiler: record.boiler || "",
    wifiMonitor: record.wifiMonitor || "",
    installationType: record.installationType || "",
    packageType: record.packageType || "",
    offerPrice: Number(record.offerPrice ?? record.projectPrice) || DEFAULT_HEAT_PUMP_PRICE,
    clientName: record.clientName || "",
    phone: record.phone || "",
    dateDay,
    dateMonth,
    dateYear,
  };
}
