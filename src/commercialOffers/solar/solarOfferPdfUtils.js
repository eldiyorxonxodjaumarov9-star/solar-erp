/** PDF matnini soddalashtirish (jsPDF font cheklovlari). */
export function cleanPdfText(s) {
  return String(s ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, "-")
    .replace(/oʻ/g, "o'")
    .replace(/gʻ/g, "g'")
    .replace(/Oʻ/g, "O'")
    .replace(/Gʻ/g, "G'");
}

export function formatSom(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0 so'm";
  return `${Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ")} so'm`;
}

/** Inputdan faqat raqamlarni ajratib son qaytaradi. */
export function parseSomInput(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return 0;
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

/** Form input ko'rinishi: 100000 → "100 000 so'm" */
export function formatSomInput(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "";
  if (n === 0) return "0 so'm";
  return formatSom(n);
}
