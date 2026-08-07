import { jsPDF } from "jspdf";
import { offerPdfFileName } from "../commercialOffers/offerPdfNames.js";
import { cleanPdfText, formatSom } from "../commercialOffers/solar/solarOfferPdfUtils.js";
import { DEFAULT_HEAT_PUMP_PRICE } from "./heatPumpFormSchema.js";
import {
  expandSystemPowerCounts,
  formatSystemPowerSummary,
  normalizeSystemPowerCounts,
} from "./heatPumpSystemPower.js";
import { drawPdfCompanyContacts } from "../commercialOffers/companyPdfFooter.js";
import { deliverPdfBlob } from "../commercialOffers/solar/pdfDeliver.js";
import { SOLAR_COMPANY } from "../commercialOffers/solar/solarOfferLayout.js";

const BLACK = [0, 0, 0];
const MARGIN = 22;
const LINE = 5.8;

function drawSquareBullet(doc, x, y) {
  doc.setFillColor(...BLACK);
  doc.rect(x, y - 2.6, 2.2, 2.2, "F");
}

function sectionTitle(doc, title, y) {
  drawSquareBullet(doc, MARGIN, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...BLACK);
  doc.text(cleanPdfText(title), MARGIN + 6, y);
  return y + LINE + 2;
}

function writeBullets(doc, items, startY) {
  let y = startY;
  const textX = MARGIN + 6;
  const maxW = doc.internal.pageSize.getWidth() - MARGIN - textX;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...BLACK);

  for (const line of items) {
    if (!line) continue;
    if (y > doc.internal.pageSize.getHeight() - 24) {
      doc.addPage();
      y = MARGIN;
    }
    drawSquareBullet(doc, MARGIN, y);
    const wrapped = doc.splitTextToSize(cleanPdfText(line), maxW);
    doc.text(wrapped, textX, y);
    y += LINE * wrapped.length;
  }
  return y;
}

function formDateLabel(form) {
  const d = form.dateDay || "";
  const m = form.dateMonth || "";
  const y = form.dateYear || "";
  if (d && m && y) return `${d}/${m}/${y}`;
  if (form.formDate) return String(form.formDate);
  return "";
}

function objectTypeLabel(form) {
  if (form.objectType === "Boshqa" && form.otherObject) {
    return `Boshqa: ${form.otherObject}`;
  }
  return form.objectType || "—";
}

/**
 * Issiqlik nasosi — professional «Tijoriy Taklif» PDF (forma blankasi emas).
 * @param {Record<string, unknown>} form
 */
export function buildHeatPumpOfferDocumentPdf(form) {
  const companyName = SOLAR_COMPANY.name;
  const companyPhone = SOLAR_COMPANY.phone;
  const powerCounts = normalizeSystemPowerCounts(form);
  const powerList = expandSystemPowerCounts(powerCounts);
  const powerSummary = formatSystemPowerSummary(powerCounts);

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  let y = MARGIN;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...BLACK);
  doc.text(cleanPdfText("Tijoriy Taklif"), MARGIN, y);
  y += LINE + 4;

  doc.setFontSize(13);
  doc.text(
    cleanPdfText(`Issiqlik nasosi tizimi — ${powerSummary}`),
    MARGIN,
    y,
  );
  y += LINE + 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  const intro = `Hurmatli ${form.clientName},\nSizga energiya tejamkor va yuqori samarali ${powerSummary} issiqlik nasosi tizimini taklif etamiz. Quyida tanlangan parametrlar va tizim tarkibi keltirilgan.`;
  const introLines = doc.splitTextToSize(
    cleanPdfText(intro),
    doc.internal.pageSize.getWidth() - MARGIN * 2,
  );
  doc.text(introLines, MARGIN, y);
  y += LINE * introLines.length + 6;

  y = sectionTitle(doc, "Tizim parametrlari", y);
  y = writeBullets(
    doc,
    [
      ...(powerList.length
        ? powerList.map((item) => `Tizim quvvati: ${item}`)
        : ["Tizim quvvati: —"]),
      `Xladagent turi: ${form.refrigerant || "—"}`,
      `Elektr ta'minoti: ${form.electricSupply || "—"}`,
      `Komplekt turi: ${form.packageType || "—"}`,
    ],
    y,
  );
  y += 6;

  y = sectionTitle(doc, "Obyekt ma'lumotlari", y);
  y = writeBullets(
    doc,
    [
      `Obyekt turi: ${objectTypeLabel(form)}`,
      `Isitiladigan maydon: ${form.heatedArea || "—"} m²`,
      `Shift balandligi: ${form.ceilingHeight || "—"} metr`,
      `Isitish tizimi: ${form.heatingSystem || "—"}`,
      form.fancoilCount
        ? `Fancoil soni: ${form.fancoilCount} dona`
        : null,
    ].filter(Boolean),
    y,
  );
  y += 6;

  y = sectionTitle(doc, "Jihozlar", y);
  y = writeBullets(
    doc,
    [
      `Bufer tank: ${form.bufferTank || "—"}`,
      `Boiler: ${form.boiler || "—"}`,
      `Sensorli monitor (WiFi): ${form.wifiMonitor || "—"}`,
    ],
    y,
  );
  y += 6;

  y = sectionTitle(doc, "Montaj", y);
  y = writeBullets(
    doc,
    [`Montaj turi: ${form.installationType || "—"}`],
    y,
  );
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(cleanPdfText("14. Narxi"), MARGIN, y);
  y += LINE + 1;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text(
    cleanPdfText(formatSom(Number(form.offerPrice) || DEFAULT_HEAT_PUMP_PRICE)),
    MARGIN,
    y,
  );
  y += LINE + 6;

  y = sectionTitle(doc, "Mijoz ma'lumotlari", y);
  y = writeBullets(
    doc,
    [
      `Mijoz: ${form.clientName || "—"}`,
      `Telefon: ${form.phone || "—"}`,
      formDateLabel(form) ? `Sana: ${formDateLabel(form)}` : null,
    ].filter(Boolean),
    y,
  );
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(cleanPdfText(String(companyName)), MARGIN, y);
  y += LINE;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  drawPdfCompanyContacts(doc, MARGIN, MARGIN + 6, y, [companyPhone, "Toshkent shahri"], LINE);

  return {
    doc,
    fileName: offerPdfFileName("heat_pump", form.clientName),
  };
}

export async function downloadHeatPumpOfferDocumentPdf(form) {
  const { doc, fileName } = buildHeatPumpOfferDocumentPdf(form);
  const blob = doc.output("blob");
  return deliverPdfBlob(blob, fileName);
}

export function heatPumpOfferDocumentPdfBlobUrl(form) {
  const { doc } = buildHeatPumpOfferDocumentPdf(form);
  return URL.createObjectURL(doc.output("blob"));
}
