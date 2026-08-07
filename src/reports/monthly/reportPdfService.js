import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  formatDisplayDate,
  monthLabelUz,
  monthSlugUz,
} from "./dateHelpers.js";
import { formatKw, formatPct } from "./reportCalculations.js";
import { assertProjectsReadyForExport } from "./monthlyReportService.js";

/** PDF standart shriftlari uchun o‘zbek harflarini xavfsizlashtirish */
function pdfText(value) {
  return String(value ?? "")
    .replace(/\u2018|\u2019|\u02BB|\u02BC|\u2018/g, "'")
    .replace(/ʻ/g, "'")
    .replace(/ʼ/g, "'")
    .replace(/‘/g, "'")
    .replace(/’/g, "'")
    .replace(/–/g, "-")
    .replace(/—/g, "-");
}

function addFooter(doc, pageH) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(
      pdfText(`Sunnur Energy Tech  |  Solar ERP  |  Sahifa ${i}/${pages}`),
      14,
      pageH - 8,
    );
  }
}

/**
 * @param {{
 *   year: number;
 *   month: number | 'all';
 *   kpis: Record<string, number>;
 *   monthly: Array<Record<string, unknown>>;
 *   powerRanges: Array<Record<string, unknown>>;
 *   systemTypes: Array<Record<string, unknown>>;
 *   projects: Array<Record<string, unknown>>;
 * }} data
 */
export async function downloadMonthlyReportPdf(data) {
  const projects = assertProjectsReadyForExport(data.projects || []);
  const year = data.year;
  const month = data.month;
  const monthPart = month === "all" ? "barcha-oylar" : monthSlugUz(month);
  const filename = `solar-erp-oylik-hisobot-${year}-${monthPart}.pdf`;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let y = 14;

  // Logo (banner yoki yo‘q)
  try {
    const logoUrl = `${window.location.origin}/images/banner.png`;
    const res = await fetch(logoUrl);
    if (res.ok) {
      const blob = await res.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      doc.addImage(dataUrl, "PNG", 14, y, 42, 12);
      y += 16;
    }
  } catch {
    /* logo ixtiyoriy */
  }

  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(pdfText("SOLAR ERP — OYLIK LOYIHALAR HISOBOTI"), 14, y);
  y += 7;
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  const periodLabel =
    month === "all"
      ? `${year} — Barcha oylar`
      : `${year} — ${monthLabelUz(month)}`;
  doc.text(pdfText(`Davr: ${periodLabel}`), 14, y);
  y += 5;
  doc.text(
    pdfText(`Hisobot yaratilgan: ${new Date().toLocaleString("uz-UZ")}`),
    14,
    y,
  );
  y += 5;
  doc.text(pdfText("Sunnur Energy Tech"), 14, y);
  y += 8;

  const k = data.kpis || {};
  autoTable(doc, {
    startY: y,
    head: [[pdfText("Ko‘rsatkich"), pdfText("Qiymat")]],
    body: [
      [pdfText("Jami loyihalar"), String(k.totalProjects ?? 0)],
      [pdfText("Jami sistema quvvati"), formatKw(k.totalKw)],
      [pdfText("O‘rtacha loyiha quvvati"), formatKw(k.averageKw)],
      [pdfText("Eng katta loyiha"), formatKw(k.maxKw)],
      [pdfText("Eng kichik loyiha"), formatKw(k.minKw)],
      [pdfText("Tugallangan"), String(k.completed ?? 0)],
      [pdfText("Jarayonda"), String(k.inProgress ?? 0)],
      [pdfText("Quyosh paneli"), String(k.solar ?? 0)],
      [pdfText("Issiqlik nasosi"), String(k.heatPump ?? 0)],
    ],
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [14, 165, 233], textColor: 255 },
    margin: { left: 14, right: 14 },
  });

  y = (doc.lastAutoTable?.finalY || y) + 10;
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(pdfText("Oylar kesimidagi hisobot"), 14, y);
  y += 2;

  autoTable(doc, {
    startY: y + 2,
    head: [[
      pdfText("Oy"),
      pdfText("Loyiha soni"),
      pdfText("Jami kW"),
      pdfText("O‘rtacha kW"),
      pdfText("Tugallangan"),
      pdfText("Jarayonda"),
    ]],
    body: (data.monthly || []).map((r) => [
      pdfText(r.label),
      String(r.count),
      formatKw(r.totalKw),
      formatKw(r.averageKw),
      String(r.completed),
      String(r.inProgress),
    ]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [2, 132, 199], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });

  y = (doc.lastAutoTable?.finalY || y) + 10;
  if (y > pageH - 40) {
    doc.addPage();
    y = 16;
  }
  doc.setFontSize(11);
  doc.text(pdfText("kW bo‘yicha guruhlash"), 14, y);

  autoTable(doc, {
    startY: y + 4,
    head: [[
      pdfText("Quvvat oralig‘i"),
      pdfText("Loyiha soni"),
      pdfText("Jami kW"),
      pdfText("Ulushi"),
    ]],
    body: (data.powerRanges || []).map((r) => [
      pdfText(r.label),
      String(r.count),
      formatKw(r.totalKw),
      formatPct(r.sharePct),
    ]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [2, 132, 199], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });

  y = (doc.lastAutoTable?.finalY || y) + 10;
  if (y > pageH - 40) {
    doc.addPage();
    y = 16;
  }
  doc.setFontSize(11);
  doc.text(pdfText("Sistema turi bo‘yicha"), 14, y);

  autoTable(doc, {
    startY: y + 4,
    head: [[
      pdfText("Sistema turi"),
      pdfText("Loyiha soni"),
      pdfText("Jami kW"),
      pdfText("O‘rtacha kW"),
      pdfText("Tugallangan"),
      pdfText("Jarayonda"),
    ]],
    body: (data.systemTypes || []).map((r) => [
      pdfText(r.systemType),
      String(r.count),
      formatKw(r.totalKw),
      formatKw(r.averageKw),
      String(r.completed),
      String(r.inProgress),
    ]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [2, 132, 199], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });

  doc.addPage();
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(
    pdfText(`Loyihalar ro‘yxati (jami ${projects.length})`),
    14,
    16,
  );

  autoTable(doc, {
    startY: 20,
    head: [[
      "№",
      pdfText("Sana"),
      pdfText("Mijoz"),
      pdfText("Telefon"),
      pdfText("Viloyat"),
      pdfText("Tuman"),
      pdfText("Sistema"),
      pdfText("kW"),
      pdfText("Holat"),
      pdfText("Brigada"),
    ]],
    body: projects.map((p, i) => [
      String(i + 1),
      formatDisplayDate(p.reportDate),
      pdfText(p.clientName || "—"),
      pdfText(p.phone || "—"),
      pdfText(p.region || "—"),
      pdfText(p.district || "—"),
      pdfText(p.systemType || "—"),
      String(Number(p.stationPower) || 0),
      pdfText(p.status || "—"),
      pdfText(p.brigadeName || "—"),
    ]),
    styles: { fontSize: 7, cellPadding: 1.2, overflow: "linebreak" },
    headStyles: { fillColor: [14, 165, 233], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 10, right: 10, bottom: 14 },
    rowPageBreak: "avoid",
  });

  addFooter(doc, pageH);
  void pageW;
  doc.save(filename);
  return { filename, count: projects.length };
}
