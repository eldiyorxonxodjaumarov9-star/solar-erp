import { useMemo, useState } from "react";
import { useWorkers } from "../hooks/useWorkers";
import {
  COMPLAINT_STATUS,
  COMPLAINT_STATUS_LABEL,
  useComplaints,
} from "../hooks/useComplaints";

function isUstaWorker(w) {
  const pos = String(w?.position || "").trim().toLowerCase();
  if (!pos) return true;
  return pos !== "developer" && pos !== "admin" && pos !== "dasturchi";
}

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
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

const STATUS_BADGE = {
  yangi: "bg-amber-100 text-amber-700",
  qabul_qilingan: "bg-sky-100 text-sky-700",
  bajarildi: "bg-emerald-100 text-emerald-700",
};

export default function JalbaAdminPage() {
  const { workers } = useWorkers();
  const { complaints, error, createComplaint, deleteComplaint, acceptComplaint, markDone } =
    useComplaints();

  const ustaWorkers = useMemo(
    () =>
      (workers || [])
        .filter(isUstaWorker)
        .sort((a, b) =>
          String(a.fullName || a.name || "").localeCompare(
            String(b.fullName || b.name || ""),
            "uz",
          ),
        ),
    [workers],
  );

  const [ustaId, setUstaId] = useState("");
  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState("");
  const [location, setLocation] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const sortedComplaints = useMemo(() => {
    const order = { yangi: 0, qabul_qilingan: 1, bajarildi: 2 };
    return [...complaints].sort((a, b) => {
      const so = (order[a.status] ?? 9) - (order[b.status] ?? 9);
      if (so !== 0) return so;
      return (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0);
    });
  }, [complaints]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setNote("");
    const w = ustaWorkers.find((x) => String(x.id) === String(ustaId));
    if (!w) {
      setNote("Ustani tanlang.");
      return;
    }
    if (!problem.trim()) {
      setNote("Muammo matnini kiriting.");
      return;
    }
    setBusy(true);
    try {
      await createComplaint({
        ustaId: w.id,
        ustaName: w.fullName || w.name || w.login,
        ustaLogin: w.login || "",
        title,
        problem,
        location,
        comment,
      });
      setTitle("");
      setProblem("");
      setLocation("");
      setComment("");
      setNote("Jalba yuborildi — ustadan 1 ball olinadi, bildirishnoma bordi.");
    } catch (err) {
      setNote(err?.message || "Yuborishda xatolik.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteComplaint(id);
    } catch {
      /* ignore */
    }
  };

  return (
    <section className="rounded-[1.375rem] border border-slate-200/85 bg-white p-6 shadow-soft-lg ring-1 ring-slate-900/[0.03] sm:p-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Jalba
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          O‘rnatish joyida muammo bo‘lsa, shu yerga yozing va tegishli ustani
          belgilang. Har bir jalba uchun ustadan <strong>1 ball olinadi</strong>.
          Ustaga dastur ichida bildirishnoma boradi; u «Qabul qildim» ni bosgach,
          jalba uning bo‘limiga tushadi.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-6 grid gap-4 rounded-xl border border-slate-200/85 bg-slate-50/60 p-4 sm:p-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Usta *</span>
            <select
              value={ustaId}
              onChange={(e) => setUstaId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
            >
              <option value="">— Ustani tanlang —</option>
              {ustaWorkers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.fullName || w.name || w.login}
                  {w.login ? ` (${w.login})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">
              Manzil / joy
            </span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Masalan: Chilonzor 5-kvartal, ob'yekt nomi"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Mavzu</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Qisqa sarlavha (ixtiyoriy)"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Muammo *</span>
          <textarea
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            rows={3}
            placeholder="Muammoni batafsil yozing…"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Izoh</span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="Qo‘shimcha izoh (ixtiyoriy)"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Yuborilmoqda…" : "Jalba yuborish"}
          </button>
          {note ? (
            <span className="text-sm font-medium text-slate-600">{note}</span>
          ) : null}
        </div>
      </form>

      {error ? (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 ring-1 ring-amber-200">
          {error}
        </p>
      ) : null}

      <div className="mt-8">
        <h3 className="text-lg font-semibold text-slate-900">
          Yuborilgan jalbalar{" "}
          <span className="text-sm font-normal text-slate-500">
            ({sortedComplaints.length})
          </span>
        </h3>
        <div className="mt-3 grid gap-3">
          {sortedComplaints.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
              Hozircha jalba yo‘q.
            </p>
          ) : (
            sortedComplaints.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-slate-200/85 bg-white p-4 shadow-soft-md"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">
                      {c.ustaName || c.ustaLogin || "Usta"}
                      {c.title ? (
                        <span className="font-normal text-slate-500">
                          {" "}
                          — {c.title}
                        </span>
                      ) : null}
                    </p>
                    {c.location ? (
                      <p className="text-xs text-slate-500">📍 {c.location}</p>
                    ) : null}
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      STATUS_BADGE[c.status] || "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {COMPLAINT_STATUS_LABEL[c.status] || c.status}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                  {c.problem}
                </p>
                {c.comment ? (
                  <p className="mt-1 text-sm text-slate-500">Izoh: {c.comment}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                  <span>Yuborilgan: {fmtTime(c.createdAt)}</span>
                  {c.status !== COMPLAINT_STATUS.NEW && c.acceptedAt ? (
                    <span>Qabul qilingan: {fmtTime(c.acceptedAt)}</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void acceptComplaint(c.id)}
                    className="rounded-md bg-sky-50 px-2 py-1 font-semibold text-sky-700 hover:bg-sky-100"
                  >
                    Qabul
                  </button>
                  <button
                    type="button"
                    onClick={() => void markDone(c.id)}
                    className="rounded-md bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    Bajarildi
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
                    className="rounded-md px-2 py-1 font-semibold text-rose-500 hover:bg-rose-50"
                  >
                    O‘chirish
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
