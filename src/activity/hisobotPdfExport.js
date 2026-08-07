import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { instantToTashkentYMD } from "../photos/tashkentTime";

/** jsPDF standart shrifti maxsus tirnoq belgilarini ko‘rsatmaydi — soddalashtiramiz. */
function clean(s) {
  return String(s ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, "-");
}

function timeHm(instant) {
  if (!instant) return "-";
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function dateDm(ymd) {
  const [, m, d] = String(ymd || "").split("-");
  if (!m || !d) return ymd || "-";
  return `${d}.${m}`;
}

function durationLabel(seconds) {
  const s = Number(seconds || 0);
  if (!s || s < 0) return "-";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h && m) return `${h} soat ${m} daq`;
  if (h) return `${h} soat`;
  return `${m} daq`;
}

/**
 * To‘liq hisobotni PDF qilib saqlaydi (barcha ustalar + kunma-kun tafsilot).
 * @param {{ monthLabelText: string; summary: object; rows: object[] }} data
 */
export function downloadHisobotPdf({ monthLabelText, summary, rows }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFontSize(15);
  doc.text(clean(`Solar ERP — Hisobot`), 14, 14);
  doc.setFontSize(11);
  doc.text(clean(`Oy: ${monthLabelText}`), 14, 21);
  doc.setFontSize(8);
  doc.setTextColor(120);
  const printedAt = new Intl.DateTimeFormat("uz-UZ", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
  doc.text(clean(`Tayyorlandi: ${printedAt} (Toshkent)`), pageW - 14, 14, { align: "right" });
  doc.setTextColor(0);

  // Umumiy ko‘rsatkichlar
  autoTable(doc, {
    startY: 26,
    head: [["Ko'rsatkich", "Qiymat"]],
    body: [
      ["Rasm tashlagan ustalar", `${summary.photoUstas} (jami ${summary.totalPhotos} rasm)`],
      ["Keldi/ketdi qilgan ustalar", `${summary.attendanceUstas} (${summary.totalArrivalDays} ish kuni)`],
      ["Yo'riqnoma imzolagan ustalar", String(summary.yorUstas)],
      ["Loyiha yakunlagan ustalar", String(summary.completedUstas)],
      ["Ketmagan kunlar (keldi bor, ketdi yo'q)", String(summary.totalIncomplete)],
      ["Jami ustalar", String(summary.totalUstas)],
    ].map((r) => r.map(clean)),
    styles: { fontSize: 9, cellPadding: 1.5 },
    headStyles: { fillColor: [14, 165, 233], textColor: 255, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 90 } },
    margin: { left: 14, right: 14 },
    tableWidth: 150,
  });

  // Asosiy jadval — barcha ustalar
  autoTable(doc, {
    startY: (doc.lastAutoTable?.finalY || 26) + 6,
    head: [[
      "Usta",
      "Login",
      "Rasm",
      "Keldi kun",
      "Ketdi kun",
      "Ketmagan",
      "Ishlagan vaqt",
      "Loyiha",
      "Yakunlagan",
      "Yo'riqnoma",
      "Ball",
    ]],
    body: rows.map((r) => [
      clean(r.name),
      clean(r.login || "-"),
      `${r.photoCount}${r.photoProjects ? ` (${r.photoProjects} loyiha)` : ""}`,
      String(r.arrivalDays),
      String(r.departureDays),
      r.incompleteDays ? String(r.incompleteDays) : "-",
      durationLabel(r.totalSeconds),
      String(r.joinedProjects),
      String(r.completedProjects),
      r.yorSignedAt ? `+ ${dateDm(instantToTashkentYMD(r.yorSignedAt))}` : "-",
      String(r.points?.total ?? 0),
    ]),
    styles: { fontSize: 8, cellPadding: 1.4 },
    headStyles: { fillColor: [14, 165, 233], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });

  // Har bir usta uchun kunma-kun tafsilot
  for (const r of rows) {
    if (!r.days || r.days.length === 0) continue;
    let y = (doc.lastAutoTable?.finalY || 30) + 8;
    if (y > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      y = 18;
    }
    doc.setFontSize(10);
    doc.text(clean(`${r.name}${r.login ? ` (${r.login})` : ""} — kunma-kun`), 14, y);
    autoTable(doc, {
      startY: y + 3,
      head: [["Sana", "Keldi (vaqt)", "Ketdi (vaqt)", "Davomiyligi", "Holat"]],
      body: r.days.map((d) => [
        dateDm(d.dateKey),
        timeHm(d.loginTime),
        timeHm(d.logoutTime),
        durationLabel(d.totalWorkTime),
        d.loginTime && d.logoutTime ? "To'liq" : d.loginTime ? "Ketdi yo'q" : "-",
      ]),
      styles: { fontSize: 8, cellPadding: 1.2 },
      headStyles: { fillColor: [100, 116, 139], textColor: 255, fontStyle: "bold" },
      margin: { left: 14, right: 14 },
      tableWidth: 150,
    });
  }

  doc.save(`hisobot-${monthLabelText.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}
