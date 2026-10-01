import {
  formatSomDisplay,
  formatSomWithSpaces,
  somDigitsOnly,
} from "../projects/projectStorage";

/** UI: "5 000 000 so‘m" */
export function formatCurrency(value) {
  return formatSomDisplay(value);
}

/** Faqat raqam (number). Manfiy / NaN → 0. */
export function parseSalaryNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  const digits = somDigitsOnly(value);
  if (!digits) return 0;
  const n = Number(digits);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

/** Kunlik haq = oylik summa / ish kunlari soni. */
export function calcDailySalary(salary, workingDays = 30) {
  const days = Number(workingDays);
  if (!Number.isInteger(days) || days <= 0) return 0;
  return parseSalaryNumber(salary) / days;
}

/**
 * Input ko‘rinishi: raqam yozilganda "5 000 000 so‘m".
 * Bo‘sh → "".
 */
export function formatSalaryInputDisplay(digitsOrNumber) {
  const digits = somDigitsOnly(digitsOrNumber);
  if (!digits) return "";
  return `${formatSomWithSpaces(digits)} so‘m`;
}

export const SALARY_INPUT_PLACEHOLDER = "0 000 000 so‘m";

/** Formadan kelgan matndan faqat digits (DB’ga so‘m matni ketmasin). */
export function salaryDigitsFromInput(raw) {
  return somDigitsOnly(raw);
}
