import DashboardHeroBanner from "../components/DashboardHeroBanner";
import { useExpenses } from "../hooks/useExpenses";
import { useWorkers } from "../hooks/useWorkers";
import { useBrigades } from "../hooks/useBrigades";
import { useComplaints } from "../hooks/useComplaints";
import { useUstaPhotos } from "../hooks/useUstaPhotos";
import { useUserActivityLogs } from "../hooks/useUserActivityLogs";
import { sumExpenseAmounts } from "../expenses/expenseStorage";
import { useProjects } from "../hooks/useProjects";
import { tashkentTodayYMD } from "../photos/tashkentTime";
import { normalizePoints } from "../points/pointsAward";
import {
  formatSomDisplay,
  formatSomWithSpaces,
  isCompletedHolat,
  isInProgressHolat,
  sumProjectPaymentsSom,
} from "../projects/projectStorage";

function formatProfitSom(profit) {
  const n = Math.round(profit || 0);
  const mag = Math.abs(n);
  const core = `${formatSomWithSpaces(String(mag))} so‘m`;
  if (n < 0) return `− ${core}`;
  return core;
}

export default function Dashboard() {
  const { projects } = useProjects();
  const { expenses } = useExpenses();
  const { workers } = useWorkers();
  const { brigades } = useBrigades();
  const { complaints } = useComplaints();
  const { photos } = useUstaPhotos();
  const { logs } = useUserActivityLogs();

  const today = tashkentTodayYMD();
  const completed = projects.filter((p) => isCompletedHolat(p.holat)).length;
  const activeCount = projects.filter((p) => isInProgressHolat(p.holat)).length;
  const totalIncome = sumProjectPaymentsSom(projects);
  const totalExpense = sumExpenseAmounts(expenses);
  const profit = totalIncome - totalExpense;

  const todayLogs = logs.filter((l) => {
    const dk =
      String(l.dateKey || "").trim() ||
      String(l.loginTime || "").slice(0, 10);
    return dk === today;
  });
  const arrivedToday = new Set(
    todayLogs.filter((l) => l.loginTime).map((l) => l.ustaId),
  ).size;
  const absentToday = Math.max(0, workers.length - arrivedToday);

  const leaderboard = [...workers]
    .map((w) => ({
      name: w.fullName || w.name || w.login,
      total: normalizePoints(w.points).total,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const recentPhotos = [...photos]
    .sort(
      (a, b) =>
        new Date(b.uploadDate || 0).getTime() - new Date(a.uploadDate || 0).getTime(),
    )
    .slice(0, 6);

  const recentComplaints = [...complaints]
    .sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
    )
    .slice(0, 5);

  const stats = [
    { title: "Jami loyihalar", value: String(projects.length), note: `Faol: ${activeCount}` },
    { title: "Jarayondagi", value: String(activeCount), note: `Tugagan: ${completed}` },
    { title: "Tugagan", value: String(completed), note: "100% progress" },
    { title: "Jami ustalar", value: String(workers.length), note: `${brigades.length} brigada` },
    { title: "Bugun kelganlar", value: String(arrivedToday), note: `Kelmagan: ${absentToday}` },
    { title: "Jami xarajat", value: formatSomDisplay(String(totalExpense)), note: "Barcha chiqimlar" },
    { title: "Daromad", value: formatSomDisplay(String(totalIncome)), note: "Mijoz to‘lovlari" },
    { title: "Foyda", value: formatProfitSom(profit), note: "Daromad − xarajat" },
  ];

  return (
    <>
      <section className="rounded-[1.375rem] bg-gradient-to-r from-brand-900 via-brand-800 to-accent-500 p-6 text-white shadow-soft-lg ring-1 ring-white/10 sm:p-8">
        <p className="text-sm font-medium tracking-wide text-white/85">Boshqaruv paneli</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Xush kelibsiz, Solar ERP
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/90 sm:text-base">
          Loyihalar, ustalar, ish vaqti va moliya — barchasi jonli Firebase ma’lumotlari.
        </p>
      </section>

      <DashboardHeroBanner
        projects={projects}
        expenses={expenses}
        workers={workers}
      />

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <article
            key={s.title}
            className="rounded-[1.125rem] border border-slate-200/85 bg-white p-5 shadow-soft-md ring-1 ring-slate-900/[0.03]"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {s.title}
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{s.value}</p>
            <p className="mt-1 text-xs text-slate-500">{s.note}</p>
          </article>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-soft-md">
          <h3 className="font-semibold text-slate-900">Ustalar reytingi (ball)</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {leaderboard.length === 0 ? (
              <li className="text-slate-500">Hali ball yo‘q</li>
            ) : (
              leaderboard.map((row, i) => (
                <li key={row.name} className="flex justify-between border-b border-slate-100 py-1">
                  <span>
                    {i + 1}. {row.name}
                  </span>
                  <span className="font-medium text-brand-700">{row.total}</span>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-soft-md">
          <h3 className="font-semibold text-slate-900">Oxirgi shikoyatlar</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {recentComplaints.length === 0 ? (
              <li className="text-slate-500">Shikoyat yo‘q</li>
            ) : (
              recentComplaints.map((c) => (
                <li key={c.id} className="border-b border-slate-100 py-1">
                  <span className="font-medium">{c.ustaName}</span>
                  <span className="text-slate-500"> — {c.title || c.problem}</span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-soft-md">
        <h3 className="font-semibold text-slate-900">Oxirgi yuklangan rasmlar</h3>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {recentPhotos.map((p) => (
            <a
              key={p.id}
              href={p.imageUrl || p.storageUrl || "#"}
              target="_blank"
              rel="noreferrer"
              className="aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
            >
              <img
                src={p.imageUrl || p.imageData}
                alt=""
                className="h-full w-full object-cover"
              />
            </a>
          ))}
        </div>
      </section>
    </>
  );
}
