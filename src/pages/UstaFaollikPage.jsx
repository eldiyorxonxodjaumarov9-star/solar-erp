import { useMemo } from "react";
import { SECTION_COPY } from "../navConfig";
import { useProjects } from "../hooks/useProjects";
import { useWorkers } from "../hooks/useWorkers";
import { isCompletedHolat } from "../projects/projectStorage";

function projectWorkerIdSet(project) {
  const ids = new Set();
  const direct = String(project?.ustaId || project?.assignedWorkerId || "").trim();
  if (direct) ids.add(direct);
  const extra = Array.isArray(project?.assignedWorkerIds)
    ? project.assignedWorkerIds.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  for (const id of extra) ids.add(id);
  return ids;
}

export default function UstaFaollikPage() {
  const copy = SECTION_COPY["usta-faolligi"];
  const { workers } = useWorkers();
  const { projects } = useProjects();

  const analytics = useMemo(() => {
    const projectCount = projects.length || 1;
    return workers
      .map((w) => {
        const wid = String(w.id || "").trim();
        const related = projects.filter((p) => projectWorkerIdSet(p).has(wid));
        const completed = related.filter((p) => isCompletedHolat(p.holat)).length;
        const active = related.length - completed;
        const totalKw = related.reduce((sum, p) => {
          const n = parseFloat(String(p.powerKw ?? "").replace(",", "."));
          return sum + (Number.isFinite(n) ? n : 0);
        }, 0);
        return {
          id: wid,
          name: String(w.fullName || w.name || "Usta").trim(),
          login: String(w.login || "").trim(),
          joinedProjects: related.length,
          completedProjects: completed,
          activeProjects: active,
          participationPercent: Math.round((related.length / projectCount) * 100),
          totalKw: Math.round(totalKw * 10) / 10,
        };
      })
      .sort((a, b) => b.joinedProjects - a.joinedProjects || a.name.localeCompare(b.name, "uz"));
  }, [workers, projects]);

  const top = analytics[0];

  return (
    <section className="rounded-[1.375rem] border border-slate-200/85 bg-gradient-to-br from-white via-white to-slate-50/80 p-6 shadow-soft-lg ring-1 ring-slate-900/[0.03] sm:p-8">
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        {copy.title}
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
        {copy.description}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200/85 bg-white p-4 shadow-soft-md">
          <p className="text-xs text-slate-500">Ustalar soni</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{workers.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200/85 bg-white p-4 shadow-soft-md">
          <p className="text-xs text-slate-500">Loyihalar soni</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{projects.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200/85 bg-white p-4 shadow-soft-md">
          <p className="text-xs text-slate-500">Eng faol usta</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{top?.name || "—"}</p>
          <p className="text-xs text-slate-500">{top ? `${top.joinedProjects} loyiha` : ""}</p>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200/85 bg-white shadow-soft-md">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Usta</th>
              <th className="px-4 py-3">Login</th>
              <th className="px-4 py-3">Qatnashgan</th>
              <th className="px-4 py-3">Tugatgan</th>
              <th className="px-4 py-3">Jarayonda</th>
              <th className="px-4 py-3">Ulushi</th>
              <th className="px-4 py-3">Quvvat</th>
            </tr>
          </thead>
          <tbody>
            {analytics.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 text-slate-700">
                <td className="px-4 py-3 font-medium text-slate-900">{r.name}</td>
                <td className="px-4 py-3">{r.login || "—"}</td>
                <td className="px-4 py-3">{r.joinedProjects}</td>
                <td className="px-4 py-3">{r.completedProjects}</td>
                <td className="px-4 py-3">{r.activeProjects}</td>
                <td className="px-4 py-3">{r.participationPercent}%</td>
                <td className="px-4 py-3">{r.totalKw} kW</td>
              </tr>
            ))}
            {analytics.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={7}>
                  Hozircha ma’lumot yo‘q.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
