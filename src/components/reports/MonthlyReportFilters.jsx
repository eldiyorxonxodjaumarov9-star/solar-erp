import { MONTH_LABELS_UZ } from "../../reports/monthly/dateHelpers";
import {
  STATUS_FILTER_OPTIONS,
  SYSTEM_TYPE_PRESETS,
} from "../../reports/monthly/projectNormalizer";
import { REGIONS, districtOptionsForRegion } from "../../data/regionDistricts";

const SELECT =
  "mt-1 w-full rounded-xl border border-slate-200/90 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/25";

/**
 * @param {{
 *   year: number;
 *   month: number | 'all';
 *   systemType: string;
 *   status: string;
 *   region: string;
 *   district: string;
 *   dynamicSystemTypes: string[];
 *   onChange: (patch: Record<string, unknown>) => void;
 * }} props
 */
export default function MonthlyReportFilters({
  year,
  month,
  systemType,
  status,
  region,
  district,
  dynamicSystemTypes,
  onChange,
}) {
  const years = [year - 2, year - 1, year, year + 1, year + 2].filter(
    (y, i, a) => a.indexOf(y) === i && y >= 2020,
  );
  const systemOptions = [
    "Barchasi",
    ...new Set([...SYSTEM_TYPE_PRESETS, ...(dynamicSystemTypes || [])]),
  ];
  const districtOpts =
    region && region !== "Barchasi"
      ? districtOptionsForRegion(region)
      : [];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <label className="block text-xs font-medium text-slate-600">
        Yil
        <select
          className={SELECT}
          value={year}
          onChange={(e) => onChange({ year: Number(e.target.value) })}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs font-medium text-slate-600">
        Oy
        <select
          className={SELECT}
          value={month === "all" ? "all" : String(month)}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ month: v === "all" ? "all" : Number(v) });
          }}
        >
          <option value="all">Barcha oylar</option>
          {MONTH_LABELS_UZ.map((label, i) => (
            <option key={label} value={i + 1}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs font-medium text-slate-600">
        Sistema turi
        <select
          className={SELECT}
          value={systemType}
          onChange={(e) => onChange({ systemType: e.target.value })}
        >
          {systemOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs font-medium text-slate-600">
        Loyiha holati
        <select
          className={SELECT}
          value={status}
          onChange={(e) => onChange({ status: e.target.value })}
        >
          {STATUS_FILTER_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs font-medium text-slate-600">
        Viloyat
        <select
          className={SELECT}
          value={region}
          onChange={(e) =>
            onChange({ region: e.target.value, district: "Barchasi" })
          }
        >
          <option value="Barchasi">Barchasi</option>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs font-medium text-slate-600">
        Tuman
        <select
          className={SELECT}
          value={district}
          disabled={region === "Barchasi"}
          onChange={(e) => onChange({ district: e.target.value })}
        >
          <option value="Barchasi">Barchasi</option>
          {districtOpts.map((d) => {
            const value = typeof d === "object" ? d.value : d;
            const label = typeof d === "object" ? d.label : d;
            return (
              <option key={value} value={value}>
                {label}
              </option>
            );
          })}
        </select>
      </label>
    </div>
  );
}
