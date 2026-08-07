import { useMemo } from "react";
import { useWorkers } from "../hooks/useWorkers";
import { workerDisplayName } from "../workers/workerStorage";
import {
  calcDailySalary,
  formatCurrency,
  parseSalaryNumber,
} from "../workers/salaryUtils";

function workerStatusLabel(worker) {
  const raw = String(
    worker?.status || worker?.holat || worker?.state || "",
  )
    .trim()
    .toLowerCase();
  if (!raw) return "Faol";
  if (raw.includes("noaktiv") || raw.includes("inactive") || raw === "off") {
    return "Nofaol";
  }
  return "Faol";
}

function isActiveWorker(worker) {
  return workerStatusLabel(worker) === "Faol";
}

/**
 * Xarajatlar — «Xodimlar oyligi»: workers kolleksiyasidan oylik/kunlik.
 * Admin sahifasida ko‘rinadi; ma’lumot Masterlar bo‘limi bilan bir xil manbadan.
 */
export default function EmployeePayrollSection() {
  const { workers } = useWorkers();

  const rows = useMemo(() => {
    return [...workers]
      .map((w) => {
        const salary = parseSalaryNumber(w.salary);
        return {
          id: w.id,
          name: workerDisplayName(w) || "—",
          position: String(w.position || "Master").trim() || "Master",
          salary,
          dailySalary: calcDailySalary(salary),
          status: workerStatusLabel(w),
          active: isActiveWorker(w),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "uz"));
  }, [workers]);

  const activeRows = useMemo(() => rows.filter((r) => r.active), [rows]);

  const stats = useMemo(() => {
    const count = activeRows.length;
    const totalSalary = activeRows.reduce((sum, r) => sum + r.salary, 0);
    const totalDailySalary = activeRows.reduce(
      (sum, r) => sum + r.dailySalary,
      0,
    );
    const averageSalary = count > 0 ? Math.round(totalSalary / count) : 0;
    return {
      count,
      totalSalary,
      averageSalary,
      totalDailySalary,
    };
  }, [activeRows]);

  return (
    <div className="mt-10 border-t border-slate-200/80 pt-10">
      <div className="mb-6">
        <h3 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
          Xodimlar oyligi
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Masterlar (workers) kolleksiyasidagi oylik ma’lumotlari — tahrir Masterlar
          bo‘limida.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03]">
          <p className="text-xs font-medium text-slate-500">Jami xodimlar</p>
          <p className="mt-2 text-xl font-bold tracking-tight text-slate-900 tabular-nums">
            {stats.count}
          </p>
        </div>
        <div className="rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03]">
          <p className="text-xs font-medium text-slate-500">Jami oylik xarajat</p>
          <p className="mt-2 text-lg font-bold tracking-tight text-slate-900 tabular-nums sm:text-xl">
            {formatCurrency(stats.totalSalary)}
          </p>
        </div>
        <div className="rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03]">
          <p className="text-xs font-medium text-slate-500">O‘rtacha oylik</p>
          <p className="mt-2 text-lg font-bold tracking-tight text-slate-900 tabular-nums sm:text-xl">
            {formatCurrency(stats.averageSalary)}
          </p>
        </div>
        <div className="rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03]">
          <p className="text-xs font-medium text-slate-500">
            Jami kunlik xodim xarajati
          </p>
          <p className="mt-2 text-lg font-bold tracking-tight text-slate-900 tabular-nums sm:text-xl">
            {formatCurrency(stats.totalDailySalary)}
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-[1rem] border border-dashed border-slate-200/90 bg-slate-50/80 px-4 py-10 text-center text-sm text-slate-500">
          Hozircha xodimlar yo‘q. Masterlar bo‘limidan qo‘shing.
        </div>
      ) : (
        <>
          <ul className="mt-6 space-y-3 md:hidden">
            {rows.map((row, index) => (
              <li
                key={row.id}
                className="rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-500">№ {index + 1}</p>
                    <p className="mt-0.5 font-semibold text-slate-900">{row.name}</p>
                    <p className="text-sm text-slate-600">{row.position}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${
                      row.active
                        ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                        : "bg-slate-100 text-slate-600 ring-slate-200"
                    }`}
                  >
                    {row.status}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-sm">
                  <div>
                    <dt className="text-xs text-slate-500">Oylik</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">
                      {formatCurrency(row.salary)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Kunlik</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">
                      {formatCurrency(row.dailySalary)}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          <div className="mt-6 hidden overflow-x-auto rounded-[1.125rem] border border-slate-200/85 bg-white shadow-soft-md ring-1 ring-slate-900/[0.03] md:block">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/90">
                  <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                    №
                  </th>
                  <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                    Xodim
                  </th>
                  <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                    Lavozim
                  </th>
                  <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                    Oylik
                  </th>
                  <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                    Kunlik
                  </th>
                  <th className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                    Holati
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="whitespace-nowrap px-4 py-3.5 tabular-nums text-slate-600">
                      {index + 1}
                    </td>
                    <td className="max-w-[220px] px-4 py-3.5 font-medium text-slate-900">
                      <span className="line-clamp-2">{row.name}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">
                      {row.position}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-medium tabular-nums text-slate-900">
                      {formatCurrency(row.salary)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 tabular-nums text-slate-700">
                      {formatCurrency(row.dailySalary)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${
                          row.active
                            ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                            : "bg-slate-100 text-slate-600 ring-slate-200"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
