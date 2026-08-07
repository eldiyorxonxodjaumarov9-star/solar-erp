import { formatKw } from "../../reports/monthly/reportCalculations";

/** @param {{ rows: Array<Record<string, unknown>> }} props */
export function MonthsBreakdownTable({ rows }) {
  return (
    <Section title="Oylar bo‘yicha hisobot">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Oy</th>
            <th className="px-3 py-2">Loyiha soni</th>
            <th className="px-3 py-2">Jami kW</th>
            <th className="px-3 py-2">O‘rtacha kW</th>
            <th className="px-3 py-2">Tugallangan</th>
            <th className="px-3 py-2">Jarayonda</th>
          </tr>
        </thead>
        <tbody>
          {(rows || []).map((r) => (
            <tr key={r.month} className="border-t border-slate-100">
              <td className="px-3 py-2 font-medium text-slate-800">{r.label}</td>
              <td className="px-3 py-2 tabular-nums">{r.count}</td>
              <td className="px-3 py-2 tabular-nums">{formatKw(r.totalKw)}</td>
              <td className="px-3 py-2 tabular-nums">{formatKw(r.averageKw)}</td>
              <td className="px-3 py-2 tabular-nums">{r.completed}</td>
              <td className="px-3 py-2 tabular-nums">{r.inProgress}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

/** @param {{ rows: Array<Record<string, unknown>> }} props */
export function PowerRangeReport({ rows }) {
  return (
    <Section title="kW bo‘yicha guruhlash">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Quvvat oralig‘i</th>
            <th className="px-3 py-2">Loyiha soni</th>
            <th className="px-3 py-2">Jami kW</th>
            <th className="px-3 py-2">Ulushi</th>
            <th className="px-3 py-2">Sistema tarkibi</th>
          </tr>
        </thead>
        <tbody>
          {(rows || []).map((r) => (
            <tr key={r.id} className="border-t border-slate-100">
              <td className="px-3 py-2 font-medium">{r.label}</td>
              <td className="px-3 py-2 tabular-nums">{r.count}</td>
              <td className="px-3 py-2 tabular-nums">{formatKw(r.totalKw)}</td>
              <td className="px-3 py-2 tabular-nums">
                {(Number(r.sharePct) || 0).toFixed(1)}%
              </td>
              <td className="px-3 py-2 text-xs text-slate-600">
                {Object.entries(r.bySystem || {})
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(", ") || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

/** @param {{ rows: Array<Record<string, unknown>> }} props */
export function SystemTypeReport({ rows }) {
  return (
    <Section title="Sistema turi bo‘yicha">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Sistema turi</th>
            <th className="px-3 py-2">Loyiha soni</th>
            <th className="px-3 py-2">Jami kW</th>
            <th className="px-3 py-2">O‘rtacha kW</th>
            <th className="px-3 py-2">Tugallangan</th>
            <th className="px-3 py-2">Jarayonda</th>
          </tr>
        </thead>
        <tbody>
          {(rows || []).map((r) => (
            <tr key={r.systemType} className="border-t border-slate-100">
              <td className="px-3 py-2 font-medium">{r.systemType}</td>
              <td className="px-3 py-2 tabular-nums">{r.count}</td>
              <td className="px-3 py-2 tabular-nums">{formatKw(r.totalKw)}</td>
              <td className="px-3 py-2 tabular-nums">{formatKw(r.averageKw)}</td>
              <td className="px-3 py-2 tabular-nums">{r.completed}</td>
              <td className="px-3 py-2 tabular-nums">{r.inProgress}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function Section({ title, children }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
