import { useMemo } from "react";
import { useProjects } from "../hooks/useProjects";
import {
  formatSomDisplay,
  isInProgressHolat,
  sumProjectPaymentsSom,
} from "../projects/projectStorage";

const overlayGradient =
  "linear-gradient(90deg, rgba(0,0,0,0.70), rgba(0,0,0,0.35), rgba(0,0,0,0.15))";

const glassCardClass =
  "rounded-[14px] border border-white/20 bg-white/[0.14] px-3 py-2 text-white shadow-sm backdrop-blur-[10px] supports-[backdrop-filter]:bg-white/[0.14]";

function StatMini({ label, value, compactValue }) {
  return (
    <div className={`${glassCardClass} min-w-0`}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-white/75 sm:text-[11px]">
        {label}
      </p>
      <p
        className={`mt-0.5 break-words font-semibold tabular-nums leading-snug ${
          compactValue
            ? "text-[11px] md:text-sm"
            : "text-sm md:text-base"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export default function DashboardHeroBanner() {
  const { projects } = useProjects();

  const { total, active, incomeFormatted } = useMemo(() => {
    const totalCount = projects.length;
    const activeCount = projects.filter((p) =>
      isInProgressHolat(p.holat),
    ).length;
    const sum = sumProjectPaymentsSom(projects);
    return {
      total: totalCount,
      active: activeCount,
      incomeFormatted: formatSomDisplay(String(sum)),
    };
  }, [projects]);

  return (
    <section
      className="relative mt-8 h-[180px] overflow-hidden rounded-[22px] border border-slate-200/40 shadow-[0_20px_45px_rgba(0,0,0,0.16)] ring-1 ring-slate-900/[0.06] md:h-[240px] dark:border-white/10 dark:ring-white/5"
      aria-label="Solar ERP banner"
    >
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/images/banner.png')" }}
      />
      <div
        className="absolute inset-0"
        style={{ background: overlayGradient }}
      />

      <div className="relative flex h-full flex-col md:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-end gap-3 p-5 md:gap-4 md:p-7">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-white drop-shadow-md md:text-2xl">
              Solar ERP tizimi
            </h3>
            <p className="mt-1 max-w-xl text-sm text-white/92 md:text-base">
              Loyihalarni boshqarish tizimi
            </p>
          </div>

          <div className="flex flex-wrap gap-2 md:hidden">
            <StatMini label="Loyihalar" value={String(total)} />
            <StatMini label="Jarayonda" value={String(active)} />
            <StatMini label="Daromad" value={incomeFormatted} compactValue />
          </div>
        </div>

        <div className="hidden w-[min(13.5rem,32%)] shrink-0 flex-col justify-end gap-2 p-5 pb-5 pr-6 pt-5 md:flex md:p-7 md:pl-2">
          <StatMini label="Loyihalar" value={String(total)} />
          <StatMini label="Jarayonda" value={String(active)} />
          <StatMini label="Daromad" value={incomeFormatted} compactValue />
        </div>
      </div>
    </section>
  );
}
