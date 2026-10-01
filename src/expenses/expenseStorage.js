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
 *   payrollWorkerId?: string;
 *   payrollMonth?: string;
 *   payrollPaymentType?: "advance" | "salary";
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

const PAYROLL_DRAFT_KEY = "solar-erp-payroll-payment-draft";

// Keep the operation ID and submitted payload through a reload/retry in this tab.
export function loadPayrollDraft() {
  try { return JSON.parse(sessionStorage.getItem(PAYROLL_DRAFT_KEY) || "null"); }
  catch { return null; }
}
export function persistPayrollDraft(draft) {
  if (draft) sessionStorage.setItem(PAYROLL_DRAFT_KEY, JSON.stringify(draft));
  else sessionStorage.removeItem(PAYROLL_DRAFT_KEY);
}

export function preparePayrollExpense(input, session) {
  if (session?.role !== "admin") throw new Error("Faqat admin to'lov qo'sha oladi.");
  const amount = Number(String(input.amount || "").replace(/\s/g, ""));
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(amount)) {
    throw new Error("Musbat butun summa kiriting.");
  }
  const date = String(input.date || "");
  const instant = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== date) {
    throw new Error("Haqiqiy to'lov sanasini kiriting.");
  }
  const payrollWorkerId = String(input.payrollWorkerId || "").trim();
  if (!payrollWorkerId) throw new Error("Pul oluvchi ishchini tanlang.");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.payrollMonth || "")) throw new Error("Ish haqi oyini tanlang.");
  if (!["advance", "salary"].includes(input.payrollPaymentType)) throw new Error("To'lov turini tanlang.");
  const id = String(input.id || "");
  if (!/^payroll-[a-zA-Z0-9_-]+$/.test(id)) throw new Error("To'lov amalining IDsi noto'g'ri.");
  return {
    id, amount: String(amount), date, type: "Mexnat haqi",
    payrollWorkerId, payrollMonth: input.payrollMonth, payrollPaymentType: input.payrollPaymentType,
    // ustaId remains the expense author, never the recipient.
    ustaId: String(session.workerId || ""), ustaName: String(session.name || session.login || "Admin"),
    createdByRole: "admin", createdByLogin: String(session.login || ""),
    projectId: "", projectName: "", brigadeId: "", brigadeName: "", comment: "",
  };
}
