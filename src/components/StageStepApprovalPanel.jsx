import { useState } from "react";
import { useProjectSteps } from "../hooks/useProjectSteps";
import {
  setProjectStepStatus,
  syncProjectProgressField,
} from "../services/projectSteps";
import {
  PROJECT_PROGRESS_STAGES,
  STEP_STATUS,
  STEP_STATUS_LABEL,
} from "../services/schema";

export default function StageStepApprovalPanel({ projectId, projectName }) {
  const { steps } = useProjectSteps(projectId);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  if (!projectId) return null;

  const handleReview = async (stepNumber, status) => {
    const key = `${projectId}_${stepNumber}`;
    if (busy === key) return;
    setBusy(key);
    try {
      await setProjectStepStatus(projectId, stepNumber, status, note);
      await syncProjectProgressField(projectId);
      setNote("");
    } catch (e) {
      alert(e?.message || "Xato");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <h3 className="text-sm font-semibold text-slate-900">
        Bosqichlarni tasdiqlash — {projectName}
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        3 ta bosqich qabul qilinganda loyiha progress 100% bo‘ladi.
      </p>
      <div className="mt-3">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Admin izohi (ixtiyoriy)"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </div>
      <ul className="mt-4 space-y-3">
        {PROJECT_PROGRESS_STAGES.map((def) => {
          const row =
            steps.find((s) => Number(s.stepNumber) === def.stepNumber) || null;
          const st = row?.status || "—";
          return (
            <li
              key={def.stepNumber}
              className="flex flex-col gap-2 rounded-lg border border-white bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">
                  {def.stepNumber}. {def.name}
                </p>
                <p className="text-xs text-slate-500">
                  Status: {STEP_STATUS_LABEL[st] || st}
                  {row?.uploadedByName ? ` · ${row.uploadedByName}` : ""}
                </p>
                {row?.imageUrl ? (
                  <a
                    href={row.imageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs text-brand-600 underline"
                  >
                    Rasmni ko‘rish
                  </a>
                ) : (
                  <p className="mt-1 text-xs text-amber-700">Hali yuklanmagan</p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={!row || busy === `${projectId}_${def.stepNumber}`}
                  onClick={() => handleReview(def.stepNumber, STEP_STATUS.ACCEPTED)}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                >
                  Qabul
                </button>
                <button
                  type="button"
                  disabled={!row || busy === `${projectId}_${def.stepNumber}`}
                  onClick={() => handleReview(def.stepNumber, STEP_STATUS.REJECTED)}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 disabled:opacity-40"
                >
                  Rad
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
