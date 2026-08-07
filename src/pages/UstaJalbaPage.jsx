import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  COMPLAINT_STATUS,
  COMPLAINT_STATUS_LABEL,
  useComplaints,
} from "../hooks/useComplaints";

function toDate(v) {
  if (!v) return null;
  if (typeof v === "object") {
    if (typeof v.toDate === "function") return v.toDate();
    if (typeof v.seconds === "number") return new Date(v.seconds * 1000);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtTime(v) {
  const d = toDate(v);
  if (!d) return "—";
  return new Intl.DateTimeFormat("uz-UZ", {
    timeZone: "Asia/Tashkent",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

const STATUS_BADGE = {
  yangi: "bg-amber-100 text-amber-700",
  qabul_qilingan: "bg-sky-100 text-sky-700",
  bajarildi: "bg-emerald-100 text-emerald-700",
};

export default function UstaJalbaPage() {
  const { session } = useAuth();
  const workerId = session?.workerId || "";
  const { complaints, acceptComplaint } = useComplaints();
  const [busyId, setBusyId] = useState("");

  const mine = useMemo(() => {
    const order = { yangi: 0, qabul_qilingan: 1, bajarildi: 2 };
    return complaints
      .filter((c) => String(c.ustaId) === String(workerId))
      .sort((a, b) => {
        const so = (order[a.status] ?? 9) - (order[b.status] ?? 9);
        if (so !== 0) return so;
        return (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0);
      });
  }, [complaints, workerId]);

  const handleAccept = async (id) => {
    setBusyId(id);
    try {
      await acceptComplaint(id);
    } finally {
      setBusyId("");
    }
  };

  return (
    <section className="rounded-[1.375rem] border border-slate-200/85 bg-white p-5 shadow-soft-lg sm:p-7">
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
        Jalba
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        Sizga biriktirilgan muammolar. Yangi jalbani «Qabul qildim» tugmasi bilan
        qabul qiling, ish tugagach «Bajardim» ni bosing.
      </p>

      <div className="mt-5 grid gap-3">
        {mine.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
            Hozircha sizga jalba yo‘q.
          </p>
        ) : (
          mine.map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-slate-200/85 bg-white p-4 shadow-soft-md"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 font-semibold text-slate-900">
                  {c.title || "Muammo"}
                </p>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    STATUS_BADGE[c.status] || "bg-slate-100 text-slate-600"
                  }`}
                >
                  {COMPLAINT_STATUS_LABEL[c.status] || c.status}
                </span>
              </div>
              {c.location ? (
                <p className="mt-1 text-xs text-slate-500">📍 {c.location}</p>
              ) : null}
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                {c.problem}
              </p>
              {c.comment ? (
                <p className="mt-1 text-sm text-slate-500">Izoh: {c.comment}</p>
              ) : null}
              <p className="mt-2 text-xs text-slate-400">
                Yuborilgan: {fmtTime(c.createdAt)}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {c.status === COMPLAINT_STATUS.NEW ? (
                  <button
                    type="button"
                    onClick={() => handleAccept(c.id)}
                    disabled={busyId === c.id}
                    className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
                  >
                    {busyId === c.id ? "…" : "Qabul qildim"}
                  </button>
                ) : (
                  <span className="text-sm font-medium text-sky-600">
                    ✓ Qabul qilingan
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
