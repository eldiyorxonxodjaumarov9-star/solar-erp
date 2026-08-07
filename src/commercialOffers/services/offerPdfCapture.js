import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

function slugify(name) {
  return String(name || "forma")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "forma";
}

export function offerPdfFileName(prefix, clientName) {
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}-${slugify(clientName)}-${date}.pdf`;
}

async function elementToPdf(element) {
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#ffffff",
    logging: false,
    useCORS: true,
  });

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = 210;
  const pageHeight = 297;
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const imgData = canvas.toDataURL("image/jpeg", 0.92);

  let heightLeft = imgHeight;
  let position = 0;
  pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  return pdf;
}

export async function downloadOfferPdf(element, fileName) {
  if (!element) throw new Error("Forma topilmadi");
  const pdf = await elementToPdf(element);
  pdf.save(fileName);
}

export async function offerPdfBlobUrl(element) {
  if (!element) throw new Error("Forma topilmadi");
  const pdf = await elementToPdf(element);
  return URL.createObjectURL(pdf.output("blob"));
}
