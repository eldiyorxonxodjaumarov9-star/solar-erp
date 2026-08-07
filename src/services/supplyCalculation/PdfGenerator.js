import { jsPDF } from "jspdf";
import { deliverPdfBlob } from "../../commercialOffers/solar/pdfDeliver.js";

const MARGIN = 16;
const LINE = 5.2;
const BLACK = [15, 23, 42];

function clean(t) {
  return String(t || "")
    .replace(/📞/g, "")
    .replace(/📦/g, "")
    .replace(/📌/g, "")
    .replace(/‘/g, "'")
    .replace(/’/g, "'")
    .replace(/“|”/g, '"')
    .replace(/—/g, "-")
    .replace(/─/g, "-");
}

/**
 * Telegram matnini A4 PDF ga aylantiradi.
 */
export class PdfGenerator {
  /**
   * @param {object} report — SupplyCalculator natijasi
   */
  constructor(report) {
    this.report = report;
  }

  fileName() {
    const date = (this.report?.createdAt || new Date().toISOString()).slice(0, 10);
    const name = String(this.report?.clientName || "mijoz")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\w.\-+]/g, "")
      .slice(0, 40) || "mijoz";
    return `taminot-${name}-${date}.pdf`;
  }

  build() {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const text =
      this.report?.telegramText ||
      "Hisobot mavjud emas";
    const lines = text.split("\n");
    let y = MARGIN;
    const pageH = doc.internal.pageSize.getHeight();
    const maxW = doc.internal.pageSize.getWidth() - MARGIN * 2;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...BLACK);

    for (const raw of lines) {
      const line = clean(raw);
      if (y > pageH - MARGIN) {
        doc.addPage();
        y = MARGIN;
      }
      if (!line.trim()) {
        y += LINE * 0.55;
        continue;
      }
      const wrapped = doc.splitTextToSize(line, maxW);
      const isHeader =
        /^(Hisobot|Tijoriy|Tizim|Tanlangan|Panellar|Metal|Inverter|Jami|Ism|Telefon|Kafolat|Eslatma|Panel|Invertor|Akkumulyator|Hybrid|OnGrid|AGM|LiFePO4|\d+\.)/.test(
          line,
        ) || /^Sunnur/i.test(line);
      doc.setFont("helvetica", isHeader ? "bold" : "normal");
      doc.text(wrapped, MARGIN, y);
      y += LINE * wrapped.length;
    }
    return doc;
  }

  async download() {
    const doc = this.build();
    const blob = doc.output("blob");
    const filename = this.fileName();
    return deliverPdfBlob(blob, filename);
  }
}

export async function downloadSupplyPdf(report) {
  const gen = new PdfGenerator(report);
  return gen.download();
}

export function buildSupplyPdfDoc(report) {
  return new PdfGenerator(report).build();
}

export function supplyPdfFileName(report) {
  return new PdfGenerator(report).fileName();
}
