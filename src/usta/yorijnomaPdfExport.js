import { jsPDF } from "jspdf";
import {
  USTA_YORIJNOMA_CONFIRM_TEXT,
  USTA_YORIJNOMA_SECTIONS,
  USTA_YORIJNOMA_SUBTITLE,
  USTA_YORIJNOMA_TITLE,
} from "./yorijnomaContent.js";

function clean(s) {
  return String(s ?? "")
    .replace(/[‘’ʻʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, "-");
}

function tashkentNowLabel(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return clean(new Date().toLocaleString("uz-UZ"));
  return clean(
    new Intl.DateTimeFormat("uz-UZ", {
      timeZone: "Asia/Tashkent",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(d),
  );
}

function ensureSpace(doc, y, needed, margin = 18) {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed > pageH - margin) {
    doc.addPage();
    return margin;
  }
  return y;
}

function writeLines(doc, text, x, y, maxWidth, lineHeight = 5) {
  const lines = doc.splitTextToSize(clean(text), maxWidth);
  for (const line of lines) {
    y = ensureSpace(doc, y, lineHeight + 2);
    doc.text(line, x, y);
    y += lineHeight;
  }
  return y;
}

/**
 * Imzolangan yo'riqnoma PDF (matn + imzo).
 * @returns {Promise<Blob>}
 */
export async function buildYorijnomaPdfBlob({
  workerName = "Usta",
  workerLogin = "",
  workerId = "",
  signatureDataUrl = "",
  completedAt = "",
}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentW = pageW - margin * 2;
  let y = 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(clean(USTA_YORIJNOMA_TITLE), pageW / 2, y, { align: "center" });
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(clean(USTA_YORIJNOMA_SUBTITLE), pageW / 2, y, { align: "center" });
  y += 10;

  doc.setFontSize(10);
  doc.setTextColor(60);
  y = writeLines(
    doc,
    `Usta: ${workerName}${workerLogin ? ` (${workerLogin})` : ""}`,
    margin,
    y,
    contentW,
  );
  if (workerId) {
    y = writeLines(doc, `ID: ${workerId}`, margin, y, contentW);
  }
  y = writeLines(doc, `Tasdiqlangan vaqt: ${tashkentNowLabel(completedAt)}`, margin, y, contentW);
  doc.setTextColor(0);
  y += 4;

  doc.setDrawColor(200);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  for (const section of USTA_YORIJNOMA_SECTIONS) {
    y = ensureSpace(doc, y, 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(clean(section.title), margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);

    for (const item of section.items || []) {
      y = writeLines(doc, `• ${item}`, margin + 2, y, contentW - 4, 4.8);
      y += 1;
    }
    for (const warn of section.warn || []) {
      doc.setTextColor(180, 0, 0);
      y = writeLines(doc, `! ${warn}`, margin + 2, y, contentW - 4, 4.8);
      doc.setTextColor(0);
      y += 1;
    }
    y += 4;
  }

  y = ensureSpace(doc, y, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  y = writeLines(doc, "Tasdiqlash:", margin, y, contentW);
  y += 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  y = writeLines(doc, USTA_YORIJNOMA_CONFIRM_TEXT, margin, y, contentW, 4.8);
  y += 6;

  const sig = String(signatureDataUrl || "").trim();
  if (sig.startsWith("data:image")) {
    y = ensureSpace(doc, y, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Imzo:", margin, y);
    y += 4;
    try {
      doc.addImage(sig, "PNG", margin, y, 70, 28);
      y += 32;
    } catch {
      y = writeLines(doc, "(Imzo rasmi PDF ga qo'shilmadi)", margin, y, contentW);
    }
  }

  y = ensureSpace(doc, y, 10);
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(
    clean("Ushbu hujjat Solar ERP tizimi orqali elektron imzo bilan tasdiqlangan."),
    margin,
    y,
  );

  const arrayBuffer = doc.output("arraybuffer");
  return new Blob([arrayBuffer], { type: "application/pdf" });
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("PDF o'qilmadi"));
    reader.readAsDataURL(blob);
  });
}

export function buildYorijnomaTelegramCaption({
  workerName = "Usta",
  workerLogin = "",
  workerId = "",
  completedAt = "",
}) {
  return [
    "✅ Yo'riqnoma tasdiqlandi (PDF)",
    `Usta: ${workerName}${workerLogin ? ` (${workerLogin})` : ""}`,
    workerId ? `ID: ${workerId}` : "",
    "Xavfsizlik qoidalari bilan tanishib chiqildi va imzo qo'yildi.",
    `Vaqt: ${tashkentNowLabel(completedAt)}`,
  ]
    .filter(Boolean)
    .join("\n");
}
