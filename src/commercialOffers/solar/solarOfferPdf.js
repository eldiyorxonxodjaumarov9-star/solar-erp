import {
  downloadSolarOfferDocumentPdf,
  solarOfferDocumentPdfBlobUrl,
} from "./solarOfferDocumentPdf.js";

/** Quyosh paneli — professional Tijoriy Taklif PDF (forma blankasi emas). */
export async function downloadSolarOfferPdf(offer) {
  return downloadSolarOfferDocumentPdf(offer);
}

export async function solarOfferPdfBlobUrl(offer) {
  return solarOfferDocumentPdfBlobUrl(offer);
}
