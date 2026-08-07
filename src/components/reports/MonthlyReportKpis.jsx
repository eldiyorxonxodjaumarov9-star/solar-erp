import { formatKw } from "../../reports/monthly/reportCalculations";

/**
 * @param {{ kpis: Record<string, number> }} props
 */
export default function MonthlyReportKpis({ kpis }) {
  const k = kpis || {};
  const cards = [
    { label: "Jami loyihalar", value: String(k.totalProjects ?? 0) },
    { label: "Jami quvvat", value: formatKw(k.totalKw) },
    { label: "O‘rtacha quvvat", value: formatKw(k.averageKw) },
    { label: "Eng katta", value: formatKw(k.maxKw) },
    { label: "Eng kichik", value: formatKw(k.minKw) },
    { label: "Tugallangan", value: String(k.completed ?? 0) },
    { label: "Jarayonda", value: String(k.inProgress ?? 0) },
    { label: "Quyosh paneli", value: String(k.solar ?? 0) },
    { label: "Issiqlik nasosi", value: String(k.heatPump ?? 0) },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-3 shadow-sm"
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            {c.label}
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
            {c.value}
          </p>
        </div>
      ))}
    </div>
  );
}
