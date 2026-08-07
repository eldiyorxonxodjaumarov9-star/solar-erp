import {
  POINT_CATEGORIES,
  POINTS_RULES_TEXT,
  formatCategoryValue,
  formatPointsCompact,
  normalizePoints,
} from "../points/pointsAward";

function StarIcon({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.5l2.95 5.98 6.6.96-4.78 4.66 1.13 6.57L12 17.98 6.1 20.67l1.13-6.57L2.45 9.44l6.6-.96L12 2.5z" />
    </svg>
  );
}

function CategoryRow({ categoryKey, label, value }) {
  const isMinus = categoryKey === "etiroz";
  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-sm">
      <p className="font-medium text-slate-700">{label}</p>
      <span
        className={`font-semibold tabular-nums ${isMinus && value > 0 ? "text-red-600" : "text-slate-900"}`}
      >
        {formatCategoryValue(categoryKey, value)}
        {!isMinus ? " ball" : ""}
      </span>
    </div>
  );
}

/** Usta va admin — bir xil ball ko‘rinishi. */
export default function WorkerPointsSummary({
  points,
  compact = false,
  showTitle = true,
  showRules = false,
  className = "",
}) {
  const p = normalizePoints(points);

  if (compact) {
    return (
      <div
        className={`flex items-center justify-between gap-2 rounded-[14px] border border-amber-100 bg-amber-50/80 px-3 py-2.5 ${className}`}
      >
        {showTitle ? (
          <div className="flex shrink-0 items-center gap-1.5 text-amber-700">
            <StarIcon />
            <span className="text-[11px] font-semibold uppercase tracking-wide">Ball</span>
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <span className="truncate text-[10px] leading-snug text-slate-500 sm:text-[11px]">
            {formatPointsCompact(p)}
          </span>
          <span
            className={`shrink-0 text-base font-bold tabular-nums ${p.total < 0 ? "text-red-600" : "text-amber-700"}`}
          >
            {p.total}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-[1.125rem] border border-amber-100 bg-gradient-to-br from-amber-50/90 to-white shadow-soft-md ring-1 ring-amber-900/[0.04] ${className}`}
    >
      <div className="flex items-center justify-between border-b border-amber-100/80 bg-amber-50/60 px-4 py-3">
        <div className="flex items-center gap-2 text-amber-800">
          <StarIcon className="text-amber-600" />
          <p className="text-sm font-semibold text-slate-900">Ball tizimi</p>
        </div>
        <span
          className={`text-xl font-bold tabular-nums ${p.total < 0 ? "text-red-600" : "text-amber-700"}`}
        >
          {p.total}
        </span>
      </div>
      <div className="divide-y divide-slate-50">
        {POINT_CATEGORIES.map((c) => (
          <CategoryRow
            key={c.key}
            categoryKey={c.key}
            label={c.label}
            value={p[c.key]}
          />
        ))}
      </div>
      {showRules ? (
        <div className="border-t border-slate-100 px-4 py-3 text-xs leading-relaxed text-slate-500">
          {POINTS_RULES_TEXT}
        </div>
      ) : null}
    </div>
  );
}
