import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import PhotoThumbCard from "../components/PhotoThumbCard";
import { compressImageFileToDataUrl } from "../photos/imageCompress";
import { useProjects } from "../hooks/useProjects";
import { useUstaPhotos } from "../hooks/useUstaPhotos";
import { useWorkers } from "../hooks/useWorkers";
import {
  createUstaPhotoId,
  USTA_PHOTO_TYPE_OPTIONS,
} from "../photos/ustaPhotoStorage";
import { projectNumberKey } from "../projects/projectStorage";
import { appendUserActionLog } from "../activity/userActionsLogsStorage";

const INPUT_CLASS =
  "mt-1.5 w-full rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-slate-900/[0.04] transition-all placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-400/25";

function projectLabel(p) {
  const num = projectNumberKey(p.projectNumber);
  const hash = num ? `#${num}` : "—";
  const client = (p.clientName || "").trim() || "—";
  return `${hash} — ${client}`;
}

export default function UstaRasmlarPage() {
  const { session } = useAuth();
  const ustaId = session?.role === "usta" ? session.workerId : "";
  const ustaName = session?.role === "usta" ? session.name : "";

  const { workers } = useWorkers();
  const { projects } = useProjects();
  const { photos, addPhoto } = useUstaPhotos();

  const worker = useMemo(
    () => workers.find((w) => w.id === ustaId),
    [workers, ustaId],
  );

  const myPhotos = useMemo(
    () =>
      [...photos.filter((p) => p.ustaId === ustaId)].sort(
        (a, b) =>
          new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime(),
      ),
    [photos, ustaId],
  );

  const brigadeProjects = useMemo(() => {
    if (!worker?.brigadeId) return [];
    return projects
      .filter((p) => p.brigadeId === worker.brigadeId)
      .sort((a, b) =>
        projectLabel(a).localeCompare(projectLabel(b), "uz"),
      );
  }, [projects, worker?.brigadeId]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [projectId, setProjectId] = useState("");
  const [type, setType] = useState("general");
  const [comment, setComment] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);

  useEffect(() => {
    if (brigadeProjects.length === 0) {
      setProjectId("");
      return;
    }
    if (!brigadeProjects.some((p) => p.id === projectId)) {
      setProjectId(brigadeProjects[0].id);
    }
  }, [brigadeProjects, projectId]);

  const canUpload =
    Boolean(ustaId && worker && brigadeProjects.length > 0) && !busy;

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    setError("");
    if (!file || !worker || !ustaId) return;
    if (!file.type.startsWith("image/")) {
      setError("Faqat rasm fayli tanlang.");
      return;
    }
    const p = brigadeProjects.find((x) => x.id === projectId);
    if (!p) {
      setError("Loyiha tanlang.");
      return;
    }

    setBusy(true);
    try {
      const imageData = await compressImageFileToDataUrl(file, {
        maxWidth: 1280,
        quality: 0.82,
      });
      const rec = {
        id: createUstaPhotoId(),
        imageData,
        uploadDate: new Date().toISOString(),
        ustaId,
        ustaName: ustaName || worker.fullName || ustaId,
        brigadeId: worker.brigadeId || "",
        brigadeName: worker.brigadeName || "",
        projectId: p.id,
        projectName: projectLabel(p),
        type,
        comment: comment.trim(),
      };
      await addPhoto(rec);
      appendUserActionLog({
        ustaId,
        ustaName: rec.ustaName,
        actionType: "photo",
        projectName: rec.projectName,
      });
      setComment("");
      setFileInputKey((k) => k + 1);
    } catch {
      setError("Rasmni qayta ishlashda xatolik. Boshqa fayl urinib ko‘ring.");
    } finally {
      setBusy(false);
    }
  };

  const workerMissing = Boolean(ustaId) && !worker;

  return (
    <section className="rounded-[1.375rem] border border-slate-200/85 bg-gradient-to-br from-white via-white to-slate-50/80 p-6 shadow-soft-lg ring-1 ring-slate-900/[0.03] sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Rasmlar
          </h2>
          <p className="mt-3 text-sm text-slate-600 sm:text-base">
            Brigadangizga biriktirilgan loyihalar uchun rasm yuklang. Faqat
            o‘zingizning rasmlaringiz ko‘rinadi.
          </p>
        </div>
      </div>

      {workerMissing ? (
        <p className="mt-6 rounded-[1rem] border border-amber-200/90 bg-amber-50/90 px-4 py-3 text-sm text-amber-900">
          Profilingiz topilmadi. Administrator bilan bog‘laning.
        </p>
      ) : null}

      {!workerMissing && !worker?.brigadeId ? (
        <p className="mt-6 rounded-[1rem] border border-dashed border-slate-200/90 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
          Sizga brigada biriktirilmagan. Rasm yuklash uchun brigada bo‘lishingiz
          kerak.
        </p>
      ) : null}

      {!workerMissing && worker?.brigadeId && brigadeProjects.length === 0 ? (
        <p className="mt-6 rounded-[1rem] border border-dashed border-slate-200/90 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
          Brigadangizga biriktirilgan loyiha yo‘q.
        </p>
      ) : null}

      {!workerMissing && brigadeProjects.length > 0 ? (
        <div className="mt-8 space-y-4 rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03] sm:p-5">
          <p className="text-sm font-semibold text-slate-800">Yangi rasm</p>
          <div>
            <label htmlFor="ur-project" className="text-xs font-medium text-slate-600">
              Loyiha
            </label>
            <select
              id="ur-project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">Tanlang</option>
              {brigadeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {projectLabel(p)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ur-type" className="text-xs font-medium text-slate-600">
              Tur
            </label>
            <select
              id="ur-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={INPUT_CLASS}
            >
              {USTA_PHOTO_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ur-comment" className="text-xs font-medium text-slate-600">
              Izoh (ixtiyoriy)
            </label>
            <textarea
              id="ur-comment"
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className={`${INPUT_CLASS} resize-y`}
            />
          </div>
          <div>
            <label htmlFor={`ur-file-${fileInputKey}`} className="text-xs font-medium text-slate-600">
              Rasm fayli
            </label>
            <input
              key={fileInputKey}
              id={`ur-file-${fileInputKey}`}
              type="file"
              accept="image/*"
              disabled={!canUpload || !projectId}
              onChange={onPickFile}
              className="mt-1.5 block w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:brightness-105 disabled:opacity-50"
            />
          </div>
          {busy ? (
            <p className="text-xs text-slate-500">Yuklanmoqda…</p>
          ) : null}
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-10">
        <p className="text-sm font-semibold text-slate-800">
          Mening rasmlarim ({myPhotos.length})
        </p>
        {myPhotos.length === 0 ? (
          <div className="mt-4 rounded-[1rem] border border-dashed border-slate-200/90 bg-slate-50/80 px-4 py-12 text-center text-sm text-slate-600">
            Hozircha yuklangan rasm yo‘q
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {myPhotos.map((ph) => (
              <PhotoThumbCard key={ph.id} photo={ph} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
