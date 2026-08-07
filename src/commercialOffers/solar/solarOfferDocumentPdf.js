import { jsPDF } from "jspdf";
import { PANELS, resolvePanelImage, resolvePanelLogo } from "../../services/panelService.js";
import { INVERTERS, resolveInverterImage } from "../../services/inverterService.js";
import { BATTERIES, resolveBatteryImage } from "../../services/batteryService.js";
import {
  computeSolarOffer,
  DEFAULT_PROJECT_PRICE,
  formatSystemKw,
  resolveSolarCalculations,
} from "./solarOfferSchema.js";
import { drawPdfCompanyContacts } from "../companyPdfFooter.js";
import { solarPdfFileName, SOLAR_COMPANY, SOLAR_PHASE_OPTIONS } from "./solarOfferLayout.js";
import {
  cleanPdfText,
  formatSom,
} from "./solarOfferPdfUtils.js";
import { loadImageForPdf } from "./pdfImageLoader.js";
import { deliverPdfBlob } from "./pdfDeliver.js";

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

function offerAddress(offer) {
  const parts = [offer.region, offer.district].filter(Boolean);
  return parts.join(", ") || "Toshkent shahri";
}

function drawCheckbox(doc, x, y, checked) {
  const size = 3.2;
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.35);
  doc.rect(x, y - size + 0.6, size, size);
  if (checked) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("X", x + 0.65, y + 0.35);
  }
}

function drawPanelTypeOptions(doc, selected, startY) {
  let y = startY;
  const textX = MARGIN + 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  for (const panel of PANELS) {
    drawCheckbox(doc, MARGIN, y, panel.name === selected);
    doc.text(cleanPdfText(panel.name), textX, y);
    y += LINE;
  }

  return y + 2;
}

function drawInverterTypeOptions(doc, selected, startY) {
  let y = startY;
  const textX = MARGIN + 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  for (const inverter of INVERTERS) {
    drawCheckbox(doc, MARGIN, y, inverter.name === selected);
    doc.text(cleanPdfText(inverter.name), textX, y);
    y += LINE;
  }

  return y + 2;
}

function drawBatteryTypeOptions(doc, selected, startY) {
  let y = startY;
  const textX = MARGIN + 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  for (const battery of BATTERIES) {
    drawCheckbox(doc, MARGIN, y, battery.name === selected);
    doc.text(cleanPdfText(battery.name), textX, y);
    y += LINE;
  }

  return y + 2;
}

function drawPhaseOptions(doc, selected, startY) {
  let y = startY;
  const textX = MARGIN + 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  for (const phase of SOLAR_PHASE_OPTIONS) {
    drawCheckbox(doc, MARGIN, y, phase.value === selected);
    doc.text(cleanPdfText(phase.label), textX, y);
    y += LINE;
  }

  return y + 2;
}

async function drawPanelSection(doc, form, startY) {
  let y = startY;
  const panelImage = resolvePanelImage(form.panelType, form.panelImage);
  const panelLogo = resolvePanelLogo(form.panelType, form.panelLogo);
  const pageH = doc.internal.pageSize.getHeight();

  if (panelLogo) {
    try {
      const logo = await loadImageForPdf(panelLogo);
      const logoW = 50;
      const logoH = (logo.height / logo.width) * logoW;
      if (y + logoH + 20 > pageH - MARGIN) {
        doc.addPage();
        y = MARGIN;
      }
      doc.addImage(logo.dataUrl, logo.format, MARGIN, y, logoW, logoH);
      y += logoH + 4;
    } catch {
      // Logo yuklanmasa panel rasmi bilan davom etiladi
    }
  }

  if (panelImage) {
    try {
      const { dataUrl, format, width, height } = await loadImageForPdf(panelImage);
      const imgW = 80;
      const imgH = (height / width) * imgW;
      if (y + imgH + 20 > pageH - MARGIN) {
        doc.addPage();
        y = MARGIN;
      }
      doc.addImage(dataUrl, format, MARGIN, y, imgW, imgH);
      y += imgH + 5;
    } catch {
      // Rasm bo'lmasa matn bilan davom etiladi
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(cleanPdfText("Panel turi"), MARGIN, y);
  y += LINE;
  doc.setFont("helvetica", "normal");
  doc.text(cleanPdfText(String(form.panelType || "")), MARGIN, y);
  y += LINE + 3;
  return drawPanelTypeOptions(doc, form.panelType, y);
}

async function drawInverterSection(doc, form, startY) {
  let y = startY;
  const pageH = doc.internal.pageSize.getHeight();
  const inverterImage = resolveInverterImage(form.inverterType, form.inverterImage);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(cleanPdfText("7. Inverter turi"), MARGIN, y);
  y += LINE + 2;

  if (inverterImage) {
    try {
      const { dataUrl, format, width, height } = await loadImageForPdf(inverterImage);
      const imgW = 85;
      const imgH = (height / width) * imgW;
      if (y + imgH + 30 > pageH - MARGIN) {
        doc.addPage();
        y = MARGIN;
      }
      doc.addImage(dataUrl, format, MARGIN, y, imgW, imgH);
      y += imgH + 5;
    } catch {
      // Rasm yuklanmasa checkbox ro'yxati bilan davom etiladi
    }
  }

  return drawInverterTypeOptions(doc, form.inverterType, y);
}

async function drawBatterySection(doc, form, startY) {
  let y = startY;
  const pageH = doc.internal.pageSize.getHeight();
  const hasBattery =
    form.hasBattery === "yes" ||
    (form.hasBattery !== "no" && Boolean(String(form.batteryType || "").trim()));

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(cleanPdfText("Akkumulyator"), MARGIN, y);
  y += LINE + 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  if (!hasBattery) {
    doc.text(cleanPdfText("Akkumulyator: Yo‘q"), MARGIN, y);
    return y + LINE;
  }

  const batteryImage = resolveBatteryImage(form.batteryType, form.batteryImage);
  doc.text(cleanPdfText("Akkumulyator: Ha"), MARGIN, y);
  y += LINE + 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(cleanPdfText("Akkumulyator turi"), MARGIN, y);
  y += LINE + 2;

  if (batteryImage) {
    try {
      const { dataUrl, format, width, height } = await loadImageForPdf(batteryImage);
      const imgW = 85;
      const imgH = (height / width) * imgW;
      if (y + imgH + 30 > pageH - MARGIN) {
        doc.addPage();
        y = MARGIN;
      }
      doc.addImage(dataUrl, format, MARGIN, y, imgW, imgH);
      y += imgH + 5;
    } catch {
      // Rasm yuklanmasa checkbox ro'yxati bilan davom etiladi
    }
  }

  return drawBatteryTypeOptions(doc, form.batteryType, y);
}

/**
 * Professional «Tijoriy Taklif» PDF — forma blankasi emas.
 * @param {Record<string, unknown>} offer
 */
export async function buildSolarOfferDocumentPdf(offer) {
  const form = { ...offer };
  const calc = resolveSolarCalculations(form);
  const companyName = SOLAR_COMPANY.name;
  const companyPhone = SOLAR_COMPANY.phone;

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  let y = MARGIN;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...BLACK);
  doc.text(cleanPdfText("Tijoriy Taklif"), MARGIN, y);
  y += LINE + 4;

  doc.setFontSize(13);
  doc.text(
    cleanPdfText(
      `${form.stationPower} kVt On-Grid Quyosh Elektr Stansiyasi — ${form.panelType}`,
    ),
    MARGIN,
    y,
  );
  y += LINE + 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  const intro = `Hurmatli ${form.clientName},\nSizga yuqori sifatli va energiya tejamkor ${form.stationPower} kVt quyosh elektr stansiyasini taklif etamiz. Ushbu tizim sanoat, ofis yoki tijorat obyektlari uchun mo'ljallangan bo'lib, elektr xarajatlarini keskin kamaytiradi va uzoq muddatli energiya mustaqilligini ta'minlaydi.`;
  const introLines = doc.splitTextToSize(
    cleanPdfText(intro),
    doc.internal.pageSize.getWidth() - MARGIN * 2,
  );
  doc.text(introLines, MARGIN, y);
  y += LINE * introLines.length + 6;

  y = await drawPanelSection(doc, form, y);
  y += 4;

  y = await drawInverterSection(doc, form, y);
  y += 4;

  y = await drawBatterySection(doc, form, y);
  y += 4;

  y = sectionTitle(doc, "Fazasi", y);
  y = drawPhaseOptions(doc, form.phase, y);
  y += 4;

  y = sectionTitle(doc, "Tizim tarkibi", y);
  const systemLines = [
    `Quyosh panellari: ${form.panelType} — yuqori samaradorlik, 25 yillik zavod kafolati`,
    `Panel quvvati: ${calc.panelPower} W`,
    `Panellar soni: ${calc.panelCount} dona`,
    `Haqiqiy sistema quvvati: ${formatSystemKw(calc.realSystemPower)} kW`,
    `Inverter: ${form.inverterType} — 5 yillik kafolat, yuqori ishonchlilik`,
    `Akkumulyator: ${
      form.hasBattery === "no"
        ? "Yo‘q"
        : form.batteryType
          ? `${form.batteryType}${form.batteryCapacity ? ` — ${form.batteryCapacity}` : ""}`
          : "—"
    }`,
    `Karkaz: ${form.metalConstruction || "metall konstruksiya"}`,
    "Tizim turi: On-Grid (tarmoqqa ulangan)",
    `Yillik ishlab chiqarish: ${calc.yearlyProduction.toLocaleString("en-US").replace(/,/g, " ")} kVt-soat`,
  ].filter(Boolean);
  y = writeBullets(doc, systemLines, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(cleanPdfText("13. Loyiha ishlari narxi"), MARGIN, y);
  y += LINE + 1;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text(
    cleanPdfText(formatSom(Number(form.projectPrice) || DEFAULT_PROJECT_PRICE)),
    MARGIN,
    y,
  );
  y += LINE + 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(cleanPdfText("14. O'rnatish muddati"), MARGIN, y);
  y += LINE + 1;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text(
    cleanPdfText(String(form.installationPeriod || "3-5 ish kuni")),
    MARGIN,
    y,
  );
  y += 8;

  y = sectionTitle(doc, "Kafolat va servis", y);
  y = writeBullets(
    doc,
    [
      "Panellar — 25 yil zavod kafolati",
      "Inverter — 5 yil kafolat",
      "Bepul servis — 1 yil",
    ],
    y,
  );
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(cleanPdfText(String(companyName)), MARGIN, y);
  y += LINE;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  drawPdfCompanyContacts(doc, MARGIN, MARGIN + 6, y, [companyPhone, offerAddress(form)], LINE);

  return { doc, fileName: solarPdfFileName(form.clientName) };
}

export async function downloadSolarOfferDocumentPdf(offer) {
  const { doc, fileName } = await buildSolarOfferDocumentPdf(offer);
  const blob = doc.output("blob");
  return deliverPdfBlob(blob, fileName);
}

export async function solarOfferDocumentPdfBlobUrl(offer) {
  const { doc } = await buildSolarOfferDocumentPdf(offer);
  return URL.createObjectURL(doc.output("blob"));
}
