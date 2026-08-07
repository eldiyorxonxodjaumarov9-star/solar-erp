export const EXPENSES_STORAGE_KEY = "expenses";

export const EXPENSES_CHANGED_EVENT = "solar-erp-expenses-changed";

/** Tanlangan xarajat turlari */
export const EXPENSE_TYPE_OPTIONS = [
  "Materiallar",
  "Transport",
  "Mexnat haqi",
  "Ijara",
  "Boshqa",
];

/**
 * @typedef {{
 *   id: string;
 *   ustaId: string;
 *   ustaName: string;
 *   brigadeId: string;
 *   brigadeName: string;
 *   projectId: string;
 *   projectName: string;
 *   amount: string;
 *   date: string;
 *   type: string;
 *   comment: string;
 *   createdAt: string;
 * }} Expense
 */

/** @returns {Expense[]} */
export function loadExpenses() {
  try {
    const raw = localStorage.getItem(EXPENSES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const list = parsed
      .filter(
        (e) =>
          e &&
          typeof e.id === "string" &&
          typeof e.ustaId === "string" &&
          typeof e.ustaName === "string" &&
          typeof e.brigadeId === "string" &&
          typeof e.brigadeName === "string" &&
          typeof e.projectId === "string" &&
          typeof e.projectName === "string" &&
          typeof e.amount === "string" &&
          typeof e.date === "string" &&
          typeof e.type === "string" &&
          typeof e.comment === "string" &&
          typeof e.createdAt === "string",
      )
      .map((e) => ({ ...e }));

    list.sort((a, b) => {
      const da = b.date.localeCompare(a.date);
      if (da !== 0) return da;
      return b.createdAt.localeCompare(a.createdAt);
    });
    return list;
  } catch {
    return [];
  }
}

/** @param {Expense[]} list */
export function persistExpenses(list) {
  localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(EXPENSES_CHANGED_EVENT));
}

export function createExpenseId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `e-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** @param {Expense[]} expenses */
export function sumExpenseAmounts(expenses) {
  return expenses.reduce((acc, e) => {
    const n = Math.round(Number(String(e.amount).replace(/\s/g, "")) || 0);
    return acc + Math.max(0, n);
  }, 0);
}

/** @param {Expense[]} expenses */
export function uniqueProjectCount(expenses) {
  return new Set(expenses.map((e) => e.projectId).filter(Boolean)).size;
}
