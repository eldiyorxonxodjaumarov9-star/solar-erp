import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { COMPLAINT_STATUS, useComplaints } from "../hooks/useComplaints";

function toMillis(v) {
  if (!v) return 0;
  if (typeof v === "object") {
    if (typeof v.toDate === "function") return v.toDate().getTime();
    if (typeof v.seconds === "number") return v.seconds * 1000;
  }
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function BellIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export default function UstaNotificationBell() {
  const { session } = useAuth();
  const workerId = session?.workerId || "";
  const { complaints, acceptComplaint } = useComplaints();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState("");
  const navigate = useNavigate();
  const ref = useRef(null);

  const newOnes = useMemo(
    () =>
      complaints
        .filter(
          (c) =>
            String(c.ustaId) === String(workerId) &&
            c.status === COMPLAINT_STATUS.NEW,
        )
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)),
    [complaints, workerId],
  );

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const count = newOnes.length;

  const handleAccept = async (id) => {
    setBusyId(id);
    try {
      await acceptComplaint(id);
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Bildirishnomalar"
        className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-700 shadow-sm transition-all duration-200 ease-out hover:border-slate-300 hover:bg-slate-50 hover:shadow-md active:scale-[0.97]"
      >
        <BellIcon />
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white shadow ring-2 ring-white">
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,90vw)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Bildirishnomalar</p>
            <span className="text-xs text-slate-500">{count} ta yangi</span>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {count === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">
                Yangi jalba yo‘q.
              </p>
            ) : (
              newOnes.map((c) => (
                <div
                  key={c.id}
                  className="border-b border-slate-50 px-4 py-3 last:border-0"
                >
                  <p className="text-sm font-semibold text-slate-900">
                    {c.title || "Yangi jalba"}
                  </p>
                  {c.location ? (
                    <p className="text-xs text-slate-500">📍 {c.location}</p>
                  ) : null}
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">
                    {c.problem}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleAccept(c.id)}
                    disabled={busyId === c.id}
                    className="mt-2 w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
                  >
                    {busyId === c.id ? "…" : "Qabul qildim"}
                  </button>
                </div>
              ))
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate("/usta-panel/jalba");
            }}
            className="w-full border-t border-slate-100 px-4 py-3 text-center text-sm font-semibold text-brand-600 hover:bg-brand-50"
          >
            Jalba bo‘limini ochish
          </button>
        </div>
      ) : null}
    </div>
  );
}
