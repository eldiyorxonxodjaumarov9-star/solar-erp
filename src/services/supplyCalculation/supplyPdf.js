import { jsPDF } from "jspdf";
import { deliverPdfBlob } from "../../commercialOffers/solar/pdfDeliver.js";
import { formatUsd, formatUzs } from "./pricingCalculator.js";

const MARGIN = 18;
const LINE = 5.4;
const BLACK = [15, 23, 42];

function clean(t) {
  return String(t || "")
    .replace(/‘/g, "'")
    .replace(/’/g, "'")
    .replace(/“|”/g, '"')
    .replace(/—/g, "-")
    .replace(/–/g, "-");
}

function ensureSpace(doc, y, need = 24) {
  const pageH = doc.internal.pageSize.getHeight();
  if (y > pageH - need) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

function writeLine(doc, text, y, opts = {}) {
  const {
    bold = false,
    size = 10,
    color = BLACK,
    indent = 0,
  } = opts;
  y = ensureSpace(doc, y);
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(size);
  doc.setTextColor(...color);
  const maxW = doc.internal.pageSize.getWidth() - MARGIN * 2 - indent;
  const lines = doc.splitTextToSize(clean(text), maxW);
  doc.text(lines, MARGIN + indent, y);
  return y + LINE * lines.length;
}

function fmtDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return String(iso || "");
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function safeFilePart(s) {
  return (
    String(s || "mijoz")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\w.\-+]/g, "")
      .slice(0, 40) || "mijoz"
  );
}

export function supplyPdfFileName(quote, mode = "client") {
  const date = (quote?.createdAt || new Date().toISOString()).slice(0, 10);
  const prefix = mode === "admin" ? "taminot-admin" : "taminot";
  return `${prefix}-${safeFilePart(quote?.clientName)}-${date}.pdf`;
}

/**
 * @param {object} quote — public yoki full
 * @param {{ mode?: 'client'|'admin', pricing?: object|null }} opts
 */
export function buildSupplyPdfDoc(quote, opts = {}) {
  const mode = opts.mode === "admin" ? "admin" : "client";
  const pricing = opts.pricing || null;
  const showPrices = mode === "admin" && pricing;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGIN;

  y = writeLine(doc, "Solar ERP / Sunnur Energy Tech", y, { bold: true, size: 14 });
  y = writeLine(
    doc,
    mode === "admin"
      ? "Energybor / Solar ERP — Ichki (Admin) taklif"
      : "Energybor / Solar ERP — Tijoriy taklif",
    y,
    { size: 11 },
  );
  y += 2;
  y = writeLine(doc, `Hisobot yaratilgan sana: ${fmtDate(quote.createdAt)}`, y);
  if (quote.clientName) y = writeLine(doc, `Mijoz: ${quote.clientName}`, y);
  if (quote.phone) y = writeLine(doc, `Telefon: ${quote.phone}`, y);
  y += 3;

  y = writeLine(doc, `Tizim quvvati: ${quote.requestedSystemKw} kVt`, y, { bold: true });
  y = writeLine(doc, `Tanlangan panel: ${quote.panelName}`, y);
  y = writeLine(doc, `Panellar: ${quote.panelCount} dona`, y);
  if (showPrices && pricing.panelTotalUsd != null) {
    y = writeLine(
      doc,
      `Panel jami: ${formatUsd(pricing.panelTotalUsd)}`,
      y,
      { indent: 2, size: 9 },
    );
  }

  if (quote.metalConstructionRequired) {
    y = writeLine(doc, `Metall konstruksiya: ${quote.metalMeters} metr`, y);
    if (showPrices && pricing.metalUsd != null) {
      y = writeLine(doc, `Metall: ${formatUsd(pricing.metalUsd)}`, y, {
        indent: 2,
        size: 9,
      });
    }
  } else {
    y = writeLine(doc, "Metall konstruksiya: Yo'q", y);
  }

  y = writeLine(doc, `Inverter: ${quote.inverterName}`, y);
  if (showPrices && pricing.inverterUsd != null) {
    y = writeLine(doc, `Inverter: ${formatUsd(pricing.inverterUsd)}`, y, {
      indent: 2,
      size: 9,
    });
  }
  y += 3;

  y = writeLine(doc, "--- Breakerlar ---", y, { bold: true });
  (quote.breakers || []).forEach((item, i) => {
    y = writeLine(doc, `${i + 1}. ${item.name}`, y, { indent: 2 });
    let qtyLine = `${item.quantity} ${item.unitLabel || "dona"}`;
    if (showPrices) {
      const p = (pricing.breakers || []).find((b) => b.name === item.name);
      if (p) qtyLine += ` — ${formatUsd(p.totalUsd)}`;
    }
    y = writeLine(doc, qtyLine, y, { indent: 6, size: 9 });
  });
  y += 2;

  y = writeLine(doc, "--- Aksessuarlar ---", y, { bold: true });
  (quote.accessories || []).forEach((item, i) => {
    y = writeLine(doc, `${i + 1}. ${item.name}`, y, { indent: 2 });
    let qtyLine = `${item.quantity} ${item.unitLabel || "dona"}`;
    if (showPrices) {
      const p = (pricing.accessories || []).find((a) => a.name === item.name);
      if (p) qtyLine += ` — ${formatUsd(p.totalUsd)}`;
    }
    y = writeLine(doc, qtyLine, y, { indent: 6, size: 9 });
  });
  y += 2;

  if (quote.batteryRequired && quote.batteryConfig) {
    const b = quote.batteryConfig;
    y = writeLine(doc, "Akkumulyator:", y, { bold: true });
    y = writeLine(
      doc,
      `${b.brand ? `${b.brand} ` : ""}${b.model || b.name} × ${quote.batteryCount}`,
      y,
      { indent: 2 },
    );
    if (b.capacityKwh != null) {
      y = writeLine(doc, `Sig'im: ${b.capacityKwh} kWh`, y, { indent: 2, size: 9 });
    }
    if (showPrices && pricing.batteryTotalUsd != null) {
      y = writeLine(doc, formatUsd(pricing.batteryTotalUsd), y, {
        indent: 2,
        size: 9,
      });
    }
    y += 2;
  }

  if (showPrices) {
    y = writeLine(doc, "Jami xarajat:", y, { bold: true, size: 11 });
    y = writeLine(doc, `USD: ${formatUsd(pricing.totalUsd)}`, y, { bold: true });
    y = writeLine(doc, `UZS: ${formatUzs(pricing.totalUzs)}`, y, { bold: true });
    y = writeLine(doc, `Kurs: 1 USD = ${pricing.exchangeRate} UZS`, y, { size: 9 });
    y += 3;
  }

  y = writeLine(doc, "Kafolat (ishlab chiqaruvchidan)", y, { bold: true });
  const warranty = quote.warranty || {};
  y = writeLine(doc, `Panel: ${warranty.panelYears ?? "—"} yil`, y, { indent: 2 });
  const invW =
    warranty.inverter?.[quote.inverterType] ?? quote.warrantyYears ?? "—";
  y = writeLine(doc, `Inverter: ${invW} yil`, y, { indent: 2 });
  if (quote.batteryRequired && quote.batteryConfig) {
    const chem = quote.batteryConfig.chemistry;
    const bw =
      warranty.battery?.[chem] ?? quote.batteryConfig.warrantyYears ?? "—";
    y = writeLine(doc, `Akkumulyator (${chem || "—"}): ${bw} yil`, y, { indent: 2 });
  }
  y += 3;

  y = writeLine(doc, "Eslatma:", y, { bold: true });
  (quote.notes || []).forEach((n, i) => {
    y = writeLine(doc, `${i + 1}. ${n}`, y, { indent: 2, size: 9 });
  });

  return doc;
}

export async function generateSupplyPdf(quote, opts = {}) {
  const mode = opts.mode === "admin" ? "admin" : "client";
  const doc = buildSupplyPdfDoc(quote, opts);
  const blob = doc.output("blob");
  return { blob, filename: supplyPdfFileName(quote, mode), doc };
}

export async function downloadSupplyPdf(quote, opts = {}) {
  const { blob, filename } = await generateSupplyPdf(quote, opts);
  return deliverPdfBlob(blob, filename);
}
