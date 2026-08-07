import {
  downloadHeatPumpOfferDocumentPdf,
  heatPumpOfferDocumentPdfBlobUrl,
} from "./heatPumpOfferDocumentPdf.js";

/** Issiqlik nasosi — professional Tijoriy Taklif PDF (forma blankasi emas). */
export async function downloadHeatPumpFormPdf(form) {
  return downloadHeatPumpOfferDocumentPdf(form);
}

export async function heatPumpFormPdfBlobUrl(form) {
  return heatPumpOfferDocumentPdfBlobUrl(form);
}
