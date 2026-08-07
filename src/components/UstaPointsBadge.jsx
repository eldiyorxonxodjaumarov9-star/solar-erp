import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useWorkerPoints } from "../hooks/usePoints";
import WorkerPointsSummary from "./WorkerPointsSummary";

function StarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.5l2.95 5.98 6.6.96-4.78 4.66 1.13 6.57L12 17.98 6.1 20.67l1.13-6.57L2.45 9.44l6.6-.96L12 2.5z" />
    </svg>
  );
}

export default function UstaPointsBadge() {
  const { session } = useAuth();
  const workerId = session?.workerId || "";
  const p = useWorkerPoints(workerId);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

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

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Ballar"
        className="flex h-11 items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 text-amber-700 shadow-sm transition-all duration-200 ease-out hover:bg-amber-100 hover:shadow-md active:scale-[0.97]"
      >
        <StarIcon />
        <span
          className={`text-sm font-bold tabular-nums ${p.total < 0 ? "text-red-600" : ""}`}
        >
          {p.total}
        </span>
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,92vw)]">
          <WorkerPointsSummary points={p} showRules className="shadow-xl" />
        </div>
      ) : null}
    </div>
  );
}
