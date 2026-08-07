import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

function sanitizeFilename(name) {
  const n = String(name || "hisobot.pdf").trim() || "hisobot.pdf";
  return n.replace(/[^\w.\-+()]/g, "_").slice(0, 120);
}

/** Brauzer (desktop) — mobil WebView’da ko‘pincha ishlamaydi. */
function triggerDownloadBlob(blob, filename) {
  const safe = sanitizeFilename(filename);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safe;
  a.rel = "noopener";
  a.target = "_blank";
  a.style.display = "none";
  document.body.appendChild(a);
  requestAnimationFrame(() => {
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 2000);
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : "");
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * Capacitor Android: blob WebView orqali yuklanmaydi — fayl + Share.
 * Brauzer: Web Share API yoki oddiy yuklash.
 */
async function deliverPdfBlob(blob, filename) {
  const safe = sanitizeFilename(filename);
  const Cap = typeof window !== "undefined" ? window.Capacitor : null;
  const isNative = Cap?.isNativePlatform?.() === true;

  if (isNative) {
    try {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");
      const base64 = await blobToBase64(blob);
      await Filesystem.writeFile({
        path: safe,
        data: base64,
        directory: Directory.Cache,
      });
      const { uri } = await Filesystem.getUri({
        directory: Directory.Cache,
        path: safe,
      });
      await Share.share({
        title: "SolarERP PDF",
        text: safe,
        url: uri,
        dialogTitle: "PDF — Telegram / Drive / Fayllar orqali saqlang",
      });
      return;
    } catch (e) {
      if (e?.message === "Share canceled" || e?.name === "AbortError") return;
      console.warn("[pdf] Native share yo‘li xato:", e);
    }
  }

  if (typeof navigator !== "undefined" && typeof File !== "undefined" && navigator.share) {
    try {
      const file = new File([blob], safe, { type: "application/pdf" });
      const payload = { files: [file], title: safe };
      if (!navigator.canShare || navigator.canShare(payload)) {
        await navigator.share(payload);
        return;
      }
    } catch (e) {
      if (e?.name === "AbortError") return;
      console.warn("[pdf] Web Share xato:", e);
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (w) {
      setTimeout(() => URL.revokeObjectURL(url), 120_000);
      return;
    }
    URL.revokeObjectURL(url);
  } catch (e) {
    console.warn("[pdf] window.open:", e);
  }

  triggerDownloadBlob(blob, safe);
}

/**
 * @param {object} p
 * @param {string} p.projectTitle
 * @param {string} p.workerName
 * @param {string} p.yearMonth `YYYY-MM`
 * @param {string} p.periodHuman masalan `2026-05-01 — 2026-05-31`
 * @param {Array<{ viloyat: string; days: number }>} p.rows14
 * @param {Array<{ date: string; workDays: number }>} [p.detailRows] sana bo‘yicha (eski kunlik yozuvlar)
 * @param {string} [p.filename]
 */
export async function downloadViloyatIshKunlariMonthPdf(p) {
  const {
    projectTitle,
    workerName,
    yearMonth,
    periodHuman,
    rows14,
    detailRows = [],
    filename,
  } = p;

  const body = rows14.map(({ viloyat, days }) => [
    viloyat,
    days > 0 ? `${String(days).replace(".", ",")} kun` : "—",
  ]);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.setFontSize(15);
  doc.text("Solar ERP — viloyat bo‘yicha ish kunlari", 14, 16);
  doc.setFontSize(10);
  let y = 24;
  doc.text(`Loyiha: ${projectTitle}`, 14, y);
  y += 5;
  doc.text(`Usta: ${workerName}`, 14, y);
  y += 5;
  doc.text(`Oy: ${yearMonth}  (${periodHuman})`, 14, y);
  y += 8;

  autoTable(doc, {
    head: [["Viloyat", "Ish kunlari (jami)"]],
    body,
    startY: y,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: 255,
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });

  const after = doc.lastAutoTable?.finalY ?? y + 40;
  let y2 = after + 10;
  doc.setFontSize(11);
  doc.text("Yozuvlar bo‘yicha (sana / kun)", 14, y2);
  y2 += 6;
  doc.setFontSize(9);

  if (detailRows.length === 0) {
    doc.text("Kunlik sanalar yo‘q (oy bo‘yicha yagona yozuv).", 14, y2);
  } else {
    const sorted = [...detailRows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    autoTable(doc, {
      head: [["Sana", "Kunlar"]],
      body: sorted.map((r) => [
        String(r.date || "").slice(0, 10),
        String(Number(r.workDays || 0).toLocaleString("uz-UZ", { maximumFractionDigits: 2 })),
      ]),
      startY: y2,
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [71, 85, 105], textColor: 255, fontStyle: "bold" },
      margin: { left: 14, right: 14 },
    });
  }

  const blob = doc.output("blob");
  const fn = filename || `viloyat-ish-kunlari-${yearMonth}.pdf`;
  await deliverPdfBlob(blob, fn);
}
