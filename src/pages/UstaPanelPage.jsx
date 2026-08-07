import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useWorkerPoints } from "../hooks/usePoints";
import WorkerPointsSummary from "../components/WorkerPointsSummary";

function SolarMark({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="32" cy="32" r="14" fill="currentColor" className="text-amber-400" />
      <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-amber-600">
        <path d="M32 8v6M32 50v6M8 32h6M50 32h6" />
        <path d="M15 15l4 4M45 45l4 4M49 15l-4 4M19 45l-4 4" opacity="0.85" />
      </g>
    </svg>
  );
}

export default function UstaPanelPage() {
  const { session } = useAuth();
  const workerId = session?.role === "usta" ? String(session.workerId || "") : "";
  const ustaLogin =
    session?.role === "usta" ? (session.login || "").trim() || "Usta" : "";
  const ustaName =
    session?.role === "usta" ? (session.name || "").trim() || ustaLogin : "";
  const points = useWorkerPoints(workerId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Bosh sahifa
        </h1>
        <p className="mt-2 text-sm font-medium text-slate-600 sm:text-base">
          Xush kelibsiz,{" "}
          <span className="text-slate-900">{ustaName}</span>
          {ustaLogin && ustaName !== ustaLogin ? (
            <span className="text-slate-500"> ({ustaLogin})</span>
          ) : null}
        </p>
      </div>

      <WorkerPointsSummary points={points} className="max-w-md" showRules />

      <section className="rounded-[1.375rem] border border-slate-200/85 bg-gradient-to-br from-white via-white to-slate-50/80 p-8 shadow-soft-lg ring-1 ring-slate-900/[0.03] sm:p-10">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 to-orange-50 shadow-inner ring-1 ring-amber-200/60">
            <SolarMark className="h-12 w-12" />
          </div>
          <h2 className="mt-6 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Solar ERP tizimi
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-600 sm:text-base">
            Har kuni &quot;Ish vaqti&quot; bo‘limida kelish rasmi va yo‘riqnoma imzosi
            qo‘yiladi. Keyin loyihalar va xarajatlarda ishlang — har harakat uchun ball
            qo‘shiladi.
          </p>
          <Link
            to="/usta-panel/ish-vaqti"
            className="mt-6 inline-flex rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-brand-700"
          >
            Ish vaqtiga o‘tish
          </Link>
        </div>
      </section>
    </div>
  );
}
