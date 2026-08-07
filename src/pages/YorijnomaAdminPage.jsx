import { useEffect, useMemo, useState } from "react";
import { listCollection, subscribeCollection } from "../firebase/firestoreCrud";

function formatDateTime(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("uz-UZ", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function YorijnomaAdminPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    let active = true;
    listCollection("usta_yorijnoma")
      .then((list) => {
        if (active) setRows(Array.isArray(list) ? list : []);
      })
      .catch((e) => {
        if (active) setError(e?.message || "Yuklab bo‘lmadi");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeCollection(
      "usta_yorijnoma",
      (list) => {
        setRows(Array.isArray(list) ? list : []);
        setLoading(false);
        setError("");
      },
      (e) => setError(e?.message || "Sinxronlash xatosi"),
    );
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          new Date(b.completedAt || 0).getTime() -
          new Date(a.completedAt || 0).getTime(),
      ),
    [rows],
  );

  return (
    <section className="rounded-[1.375rem] border border-slate-200/85 bg-white p-6 shadow-soft-lg ring-1 ring-slate-900/[0.03] sm:p-8">
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        Yo‘riqnoma
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
        Xavfsizlik yo‘riqnomasi bilan tanishib, imzo qo‘ygan ustalar ro‘yxati.
      </p>

      {error ? (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 ring-1 ring-amber-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-6 text-sm text-slate-500">Yuklanmoqda…</p>
      ) : sorted.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">
          Hali hech kim yo‘riqnomani tasdiqlamagan.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-semibold">#</th>
                <th className="px-3 py-2 font-semibold">Usta</th>
                <th className="px-3 py-2 font-semibold">Login</th>
                <th className="px-3 py-2 font-semibold">Sana / vaqt</th>
                <th className="px-3 py-2 font-semibold">Imzo</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr
                  key={r.id || i}
                  className="border-b border-slate-100 hover:bg-slate-50/70"
                >
                  <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                  <td className="px-3 py-2 font-semibold text-slate-900">
                    {r.name || r.login || "Usta"}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{r.login || "—"}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {formatDateTime(r.completedAt)}
                  </td>
                  <td className="px-3 py-2">
                    {r.signatureDataUrl ? (
                      <button
                        type="button"
                        onClick={() => setPreview(r)}
                        className="overflow-hidden rounded-md border border-slate-200 bg-white p-0.5 transition hover:ring-2 hover:ring-brand-400"
                      >
                        <img
                          src={r.signatureDataUrl}
                          alt="imzo"
                          className="h-10 w-24 object-contain"
                        />
                      </button>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {preview ? (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-900">
                  {preview.name || preview.login || "Usta"}
                </p>
                <p className="text-xs text-slate-500">
                  {formatDateTime(preview.completedAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <img
                src={preview.signatureDataUrl}
                alt="imzo"
                className="mx-auto max-h-72 w-full object-contain"
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
