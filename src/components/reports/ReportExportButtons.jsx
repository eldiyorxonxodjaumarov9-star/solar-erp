/**
 * @param {{
 *   busy: boolean;
 *   onPdf: () => void;
 *   onExcel: () => void;
 *   loadedCount: number;
 * }} props
 */
export default function ReportExportButtons({
  busy,
  onPdf,
  onExcel,
  loadedCount,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy || loadedCount < 0}
        onClick={onPdf}
        className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-50"
      >
        {busy ? "Tayyorlanmoqda…" : "PDF yuklab olish"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onExcel}
        className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
      >
        Excel yuklab olish
      </button>
      <span className="text-xs text-slate-500">
        Export: barcha mos {loadedCount} ta loyiha
      </span>
    </div>
  );
}
