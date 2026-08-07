import { SOLAR_COMPANY } from "./solar/solarOfferLayout.js";
import { cleanPdfText } from "./solar/solarOfferPdfUtils.js";

const INSTAGRAM_RGB = [225, 48, 108];

export function drawPdfSquareBullet(doc, x, y) {
  doc.setFillColor(0, 0, 0);
  doc.rect(x, y - 2.6, 2.2, 2.2, "F");
}

export function drawPdfInstagramRow(doc, bulletX, textX, y) {
  drawPdfSquareBullet(doc, bulletX, y);
  const label = cleanPdfText("Instagram: ");
  const handle = cleanPdfText(SOLAR_COMPANY.instagramHandle);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  doc.text(label, textX, y);
  const labelW = doc.getTextWidth(label);
  doc.setTextColor(...INSTAGRAM_RGB);
  if (typeof doc.textWithLink === "function") {
    doc.textWithLink(handle, textX + labelW, y, { url: SOLAR_COMPANY.instagramUrl });
  } else {
    doc.text(handle, textX + labelW, y);
  }
  doc.setTextColor(0, 0, 0);
}

export function drawPdfBulletText(doc, bulletX, textX, y, text) {
  drawPdfSquareBullet(doc, bulletX, y);
  doc.setTextColor(0, 0, 0);
  doc.text(cleanPdfText(String(text)), textX, y);
}

export function drawPdfCompanyContacts(doc, bulletX, textX, startY, lines, lineHeight) {
  let y = startY;
  drawPdfInstagramRow(doc, bulletX, textX, y);
  y += lineHeight;
  for (const line of lines.filter(Boolean)) {
    drawPdfBulletText(doc, bulletX, textX, y, line);
    y += lineHeight;
  }
  return y;
}
