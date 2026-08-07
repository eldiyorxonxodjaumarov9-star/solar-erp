import * as XLSX from "xlsx";
import { formatDisplayDate, monthLabelUz, monthSlugUz } from "./dateHelpers.js";
import { assertProjectsReadyForExport } from "./monthlyReportService.js";

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
export function downloadMonthlyReportExcel(data) {
  const projects = assertProjectsReadyForExport(data.projects || []);
  const year = data.year;
  const month = data.month;
  const monthPart = month === "all" ? "barcha-oylar" : monthSlugUz(month);
  const filename = `solar-erp-oylik-hisobot-${year}-${monthPart}.xlsx`;

  const k = data.kpis || {};
  const umumiy = [
    ["SOLAR ERP — OYLIK LOYIHALAR HISOBOTI"],
    ["Yil", year],
    ["Oy", month === "all" ? "Barcha oylar" : monthLabelUz(month)],
    ["Yaratilgan", new Date().toLocaleString("uz-UZ")],
    [],
    ["Ko‘rsatkich", "Qiymat"],
    ["Jami loyihalar", k.totalProjects ?? 0],
    ["Jami kW", k.totalKw ?? 0],
    ["O‘rtacha kW", k.averageKw ?? 0],
    ["Eng katta kW", k.maxKw ?? 0],
    ["Eng kichik kW", k.minKw ?? 0],
    ["Tugallangan", k.completed ?? 0],
    ["Jarayonda", k.inProgress ?? 0],
    ["Quyosh paneli", k.solar ?? 0],
    ["Issiqlik nasosi", k.heatPump ?? 0],
  ];

  const oylar = [
    ["Oy", "Loyiha soni", "Jami kW", "O‘rtacha kW", "Tugallangan", "Jarayonda"],
    ...(data.monthly || []).map((r) => [
      r.label,
      r.count,
      Number(r.totalKw) || 0,
      Number(r.averageKw) || 0,
      r.completed,
      r.inProgress,
    ]),
  ];

  const kw = [
    ["Quvvat oralig‘i", "Loyiha soni", "Jami kW", "Ulushi %"],
    ...(data.powerRanges || []).map((r) => [
      r.label,
      r.count,
      Number(r.totalKw) || 0,
      Number(r.sharePct) || 0,
    ]),
  ];

  const sys = [
    ["Sistema turi", "Loyiha soni", "Jami kW", "O‘rtacha kW", "Tugallangan", "Jarayonda"],
    ...(data.systemTypes || []).map((r) => [
      r.systemType,
      r.count,
      Number(r.totalKw) || 0,
      Number(r.averageKw) || 0,
      r.completed,
      r.inProgress,
    ]),
  ];

  const loyihalar = [
    [
      "№",
      "Sana",
      "Mijoz",
      "Telefon",
      "Viloyat",
      "Tuman",
      "Sistema turi",
      "Quvvat (kW)",
      "Holat",
      "Brigada",
      "ID",
    ],
    ...projects.map((p, i) => [
      i + 1,
      formatDisplayDate(p.reportDate),
      p.clientName || "",
      p.phone || "",
      p.region || "",
      p.district || "",
      p.systemType || "",
      Number(p.stationPower) || 0,
      p.status || "",
      p.brigadeName || "",
      p.id || "",
    ]),
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(umumiy), "Umumiy");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(oylar), "Oylar bo‘yicha");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kw), "kW bo‘yicha");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sys), "Sistema turlari");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(loyihalar), "Barcha loyihalar");
  XLSX.writeFile(wb, filename);
  return { filename, count: projects.length };
}
