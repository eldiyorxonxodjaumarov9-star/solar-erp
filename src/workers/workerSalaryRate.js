/** Stavka yozuvi UI va Firestore/offline CRUD uchun bir xil tekshiriladi. */
export function prepareWorkerSalaryRate(payload, previous = null) {
  const fields = ["salary", "workingDays", "salaryEffectiveDate"];
  if (!fields.some((field) => Object.hasOwn(payload, field))) return payload;

  const salary = Number(payload.salary ?? previous?.salary ?? 0);
  const workingDays = Number(payload.workingDays ?? previous?.workingDays ?? 30);
  const effectiveDate = String(payload.salaryEffectiveDate ?? previous?.salaryEffectiveDate ?? "").trim();
  if (!Number.isFinite(salary) || salary < 0) {
    throw new Error("Oylik ish haqi 0 yoki undan katta son bo‘lishi kerak.");
  }
  if (!Number.isInteger(workingDays) || workingDays <= 0) {
    throw new Error("Oydagi ish kunlari soni musbat butun son bo‘lishi kerak.");
  }
  const date = new Date(`${effectiveDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) ||
      !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== effectiveDate) {
    throw new Error("Stavka amal qilish sanasini to‘g‘ri kiriting.");
  }

  const salaryHistory = Array.isArray(previous?.salaryHistory) ? [...previous.salaryHistory] : [];
  const append = (rate) => {
    if (!salaryHistory.some((entry) => Number(entry.salary) === rate.salary &&
        Number(entry.workingDays) === rate.workingDays && entry.effectiveDate === rate.effectiveDate)) {
      salaryHistory.push(rate);
    }
  };
  // Eski stavkaning sanasi noma’lum bo‘lsa ham uning summasini yo‘qotmaymiz.
  if (previous) {
    append({
      salary: Number(previous.salary) || 0,
      workingDays: Number(previous.workingDays) > 0 ? Number(previous.workingDays) : 30,
      effectiveDate: String(previous.salaryEffectiveDate || ""),
    });
  }
  append({ salary, workingDays, effectiveDate });
  return { ...payload, salary, workingDays, dailySalary: salary / workingDays,
    salaryEffectiveDate: effectiveDate, salaryHistory };
}
