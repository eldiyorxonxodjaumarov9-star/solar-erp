import { formatDisplayDate } from "../../reports/monthly/dateHelpers";

/**
 * @param {{
 *   projects: Array<Record<string, unknown>>;
 *   search: string;
 *   sortBy: 'date' | 'power' | 'name';
 *   sortDir: 'asc' | 'desc';
 *   page: number;
 *   pageSize: number;
 *   onSearch: (v: string) => void;
 *   onSort: (by: 'date' | 'power' | 'name') => void;
 *   onPage: (p: number) => void;
 * }} props
 */
export default function MonthlyProjectsTable({
  projects,
  search,
  sortBy,
  sortDir,
  page,
  pageSize,
  onSearch,
  onSort,
  onPage,
}) {
  const total = projects?.length || 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pages);
  const slice = (projects || []).slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  const sortIcon = (key) => {
    if (sortBy !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-slate-800">
          Loyihalar ro‘yxati{" "}
          <span className="font-normal text-slate-500">({total})</span>
        </h3>
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Mijoz, telefon yoki ID…"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/25 sm:max-w-xs"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">№</th>
              <th className="px-3 py-2">
                <button type="button" onClick={() => onSort("date")}>
                  Sana{sortIcon("date")}
                </button>
              </th>
              <th className="px-3 py-2">
                <button type="button" onClick={() => onSort("name")}>
                  Mijoz{sortIcon("name")}
                </button>
              </th>
              <th className="px-3 py-2">Telefon</th>
              <th className="px-3 py-2">Viloyat</th>
              <th className="px-3 py-2">Tuman</th>
              <th className="px-3 py-2">Sistema turi</th>
              <th className="px-3 py-2">
                <button type="button" onClick={() => onSort("power")}>
                  Quvvati{sortIcon("power")}
                </button>
              </th>
              <th className="px-3 py-2">Holati</th>
              <th className="px-3 py-2">Brigada</th>
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-slate-500">
                  Mos loyiha topilmadi
                </td>
              </tr>
            ) : (
              slice.map((p, i) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 tabular-nums text-slate-500">
                    {(safePage - 1) * pageSize + i + 1}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {formatDisplayDate(p.reportDate)}
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-800">
                    {p.clientName || "—"}
                  </td>
                  <td className="px-3 py-2">{p.phone || "—"}</td>
                  <td className="px-3 py-2">{p.region || "—"}</td>
                  <td className="px-3 py-2">{p.district || "—"}</td>
                  <td className="px-3 py-2">{p.systemType || "—"}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {Number(p.stationPower) || 0} kW
                  </td>
                  <td className="px-3 py-2">{p.status || "—"}</td>
                  <td className="px-3 py-2">{p.brigadeName || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => onPage(safePage - 1)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40"
          >
            Oldingi
          </button>
          <span className="text-slate-600">
            {safePage} / {pages}
          </span>
          <button
            type="button"
            disabled={safePage >= pages}
            onClick={() => onPage(safePage + 1)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40"
          >
            Keyingi
          </button>
        </div>
      )}
    </div>
  );
}
