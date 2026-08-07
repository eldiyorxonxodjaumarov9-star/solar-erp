import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { somDigitsOnly } from "../projects/projectStorage";

export const REPORT_TITLE = "Solar ERP — Xarajatlar hisoboti";

export const REPORT_HEADERS = [
  "Sana",
  "Xarajat turi",
  "Summa (so'm)",
  "Loyiha",
  "Usta",
  "Brigada",
  "Izoh",
];

function escapeCsvCell(s) {
  const t = String(s ?? "");
  if (/[",\r\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

/** @param {Array<{ date: string; type: string; amount: string; projectName: string; ustaName: string; brigadeName: string; comment: string; createdAt: string }>} list */
export function expenseRowsForReport(list) {
  return [...list]
    .sort((a, b) => {
      const da = b.date.localeCompare(a.date);
      if (da !== 0) return da;
      return b.createdAt.localeCompare(a.createdAt);
    })
    .map((ex) => [
      ex.date,
      ex.type,
      somDigitsOnly(ex.amount),
      ex.projectName,
      ex.ustaName,
      ex.brigadeName || "",
      ex.comment || "",
    ]);
}

/** @param {(string|number)[][]} rows */
export function downloadExpensesCsv(rows, filename) {
  const lines = [
    REPORT_HEADERS.map(escapeCsvCell).join(","),
    ...rows.map((r) => r.map(escapeCsvCell).join(",")),
  ];
  const csv = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** @param {(string|number)[][]} rows */
export function downloadExpensesXlsx(rows, filename) {
  const aoa = [REPORT_HEADERS, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Xarajatlar");
  XLSX.writeFile(wb, filename);
}

/** @param {(string|number)[][]} rows */
export function downloadExpensesPdf(rows, filename) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(13);
  doc.text(REPORT_TITLE, 14, 14);
  autoTable(doc, {
    head: [REPORT_HEADERS],
    body: rows,
    startY: 20,
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: {
      fillColor: [14, 165, 233],
      textColor: 255,
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });
  doc.save(filename);
}

/**
 * @param {Expense[]} filteredExpenses
 * @param {'csv' | 'xlsx' | 'pdf'} format
 * @param {string} rangeSlug `YYYY-MM-DD-to-YYYY-MM-DD`
 */
export function downloadExpenseReport(filteredExpenses, format, rangeSlug) {
  const rows = expenseRowsForReport(filteredExpenses);
  const base = `xarajatlar-report-${rangeSlug}`;
  if (format === "csv") downloadExpensesCsv(rows, `${base}.csv`);
  else if (format === "xlsx") downloadExpensesXlsx(rows, `${base}.xlsx`);
  else downloadExpensesPdf(rows, `${base}.pdf`);
}
