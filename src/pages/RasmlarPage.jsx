import { useEffect, useMemo, useState } from "react";
import PhotoThumbCard from "../components/PhotoThumbCard";
import StageStepApprovalPanel from "../components/StageStepApprovalPanel";
import AppModalBackdrop from "../components/AppModalBackdrop";
import { SECTION_COPY } from "../navConfig";
import { useUstaPhotos } from "../hooks/useUstaPhotos";
import { USTA_PHOTO_TYPE_OPTIONS } from "../photos/ustaPhotoStorage";
import {
  formatTashkentDateMedium,
  instantToTashkentYMD,
  photoMatchesPeriod,
  tashkentTodayYMD,
} from "../photos/tashkentTime";

const SELECT_CLASS =
  "mt-1.5 w-full rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-slate-900/[0.04] transition-all focus:border-brand-400 focus:ring-2 focus:ring-brand-400/25 sm:max-w-[240px]";

const DATE_INPUT_CLASS =
  "mt-1.5 w-full min-w-0 rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-slate-900/[0.04] transition-all focus:border-brand-400 focus:ring-2 focus:ring-brand-400/25";

const FILTER_BTN =
  "rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition-all duration-200 hover:bg-slate-50 hover:shadow-md active:scale-[0.98] sm:text-sm";

const STAGE_ORDER = [
  "stage-1",
  "stage-2",
  "stage-3",
  "stage-4",
  "stage-5",
  "stage-6",
  "stage-7",
  "stage-8",
];

export default function RasmlarPage() {
  const { photos, deletePhoto, updatePhoto } = useUstaPhotos();
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [photoEditFields, setPhotoEditFields] = useState({
    projectName: "",
    brigadeName: "",
    comment: "",
    stageName: "",
    type: "general",
  });
  const [photoSaveBusy, setPhotoSaveBusy] = useState(false);

  useEffect(() => {
    if (!editTarget) return;
    setPhotoEditFields({
      projectName: String(editTarget.projectName || ""),
      brigadeName: String(editTarget.brigadeName || ""),
      comment: String(editTarget.comment || ""),
      stageName: String(editTarget.stageName || ""),
      type: String(editTarget.type || "general"),
    });
  }, [editTarget]);

  const [periodMode, setPeriodMode] = useState(
    /** @type {'today'|'pick'|'week'|'month'} */ ("month"),
  );
  const [pickDate, setPickDate] = useState(() => tashkentTodayYMD());
  const [brigadeFilter, setBrigadeFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");

  const brigadeOptions = useMemo(() => {
    const m = new Map();
    photos.forEach((p) => {
      const id = p.brigadeId || "";
      if (!m.has(id)) {
        m.set(id, p.brigadeName?.trim() || "Brigada yo‘q");
      }
    });
    return [...m.entries()].sort((a, b) =>
      String(a[1]).localeCompare(String(b[1]), "uz"),
    );
  }, [photos]);

  const projectOptions = useMemo(() => {
    const m = new Map();
    photos
      .filter((p) => !brigadeFilter || (p.brigadeId || "") === brigadeFilter)
      .forEach((p) => {
      const id = p.projectId || "";
      if (!m.has(id)) {
        m.set(id, p.projectName?.trim() || "Loyiha nomi yo‘q");
      }
      });
    return [...m.entries()].sort((a, b) =>
      String(a[1]).localeCompare(String(b[1]), "uz"),
    );
  }, [photos, brigadeFilter]);

  const filtered = useMemo(() => {
    return photos.filter((p) => {
      const ymd = instantToTashkentYMD(p.uploadDate);
      if (!photoMatchesPeriod(ymd, periodMode, pickDate)) return false;
      if (brigadeFilter && (p.brigadeId || "") !== brigadeFilter) return false;
      if (projectFilter && (p.projectId || "") !== projectFilter) return false;
      return true;
    });
  }, [photos, periodMode, pickDate, brigadeFilter, projectFilter]);

  const byProject = useMemo(() => {
    const m = new Map();
    for (const p of filtered) {
      const key = p.projectId || "__none__";
      const name = p.projectName?.trim() || "Loyiha nomi yo‘q";
      if (!m.has(key)) {
        m.set(key, {
          projectId: p.projectId || "",
          projectName: name,
          brigadeName: p.brigadeName?.trim() || "Brigada yo‘q",
          photos: [],
        });
      }
      m.get(key).photos.push(p);
    }
    const list = [...m.values()].map((g) => {
      const sorted = [...g.photos].sort(
        (a, b) =>
          new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime(),
      );
      const ustaIds = new Set(sorted.map((x) => x.ustaId).filter(Boolean));
      return {
        ...g,
        photos: sorted,
        ustaCount: ustaIds.size,
        photoCount: sorted.length,
      };
    });
    list.sort((a, b) => a.projectName.localeCompare(b.projectName, "uz"));
    return list;
  }, [filtered]);

  const selectedProject = useMemo(
    () => byProject.find((p) => p.projectId === selectedProjectId) || null,
    [byProject, selectedProjectId],
  );

  // Filterlar o'zgarganda invalid tanlangan loyiha qolib ketmasin.
  useEffect(() => {
    if (selectedProjectId && !selectedProject) {
      setSelectedProjectId("");
    }
  }, [selectedProjectId, selectedProject]);

  const byBrigadeWithProjects = useMemo(() => {
    const m = new Map();
    for (const p of byProject) {
      const key = p.brigadeName || "Brigada yo‘q";
      if (!m.has(key)) {
        m.set(key, { brigadeName: key, projects: [] });
      }
      m.get(key).projects.push(p);
    }
    const list = [...m.values()].map((g) => ({
      ...g,
      projects: [...g.projects].sort((a, b) =>
        a.projectName.localeCompare(b.projectName, "uz"),
      ),
    }));
    list.sort((a, b) => a.brigadeName.localeCompare(b.brigadeName, "uz"));
    return list;
  }, [byProject]);

  const selectedProjectPhotosByDate = useMemo(() => {
    if (!selectedProject) return [];
    const dm = new Map();
    for (const ph of selectedProject.photos) {
      const dkey = instantToTashkentYMD(ph.uploadDate);
      if (!dm.has(dkey)) dm.set(dkey, []);
      dm.get(dkey).push(ph);
    }
    return [...dm.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [selectedProject]);

  const selectedProjectStageGroups = useMemo(() => {
    if (!selectedProject) return [];
    const stageMap = new Map();
    const stagePhotos = selectedProject.photos.filter((p) => p.type === "stage_photo");
    for (const ph of stagePhotos) {
      const stageId = String(ph.stageId || "");
      if (!stageId) continue;
      if (!stageMap.has(stageId)) {
        stageMap.set(stageId, {
          stageId,
          stageName: ph.stageName || stageId,
          photos: [],
        });
      }
      stageMap.get(stageId).photos.push(ph);
    }
    const orderIndex = (stageId) => {
      const idx = STAGE_ORDER.indexOf(stageId);
      return idx === -1 ? 999 : idx;
    };
    return [...stageMap.values()]
      .map((group) => ({
        ...group,
        photos: [...group.photos].sort((a, b) => {
          const aSlot = Number(a.slotNumber || 0);
          const bSlot = Number(b.slotNumber || 0);
          if (aSlot !== bSlot) return aSlot - bSlot;
          return new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime();
        }),
      }))
      .sort((a, b) => orderIndex(a.stageId) - orderIndex(b.stageId));
  }, [selectedProject]);

  const emptyTodayCopy =
    periodMode === "today" && !brigadeFilter && filtered.length === 0;

  const copy = SECTION_COPY.rasmlar;

  const savePhotoEdit = async () => {
    if (!editTarget?.id || photoSaveBusy) return;
    setPhotoSaveBusy(true);
    try {
      await updatePhoto(editTarget.id, {
        projectName: photoEditFields.projectName.trim(),
        brigadeName: photoEditFields.brigadeName.trim(),
        comment: photoEditFields.comment.trim(),
        stageName: photoEditFields.stageName.trim(),
        type: photoEditFields.type,
      });
      setEditTarget(null);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Saqlanmadi.");
    } finally {
      setPhotoSaveBusy(false);
    }
  };

  const confirmDeletePhoto = async () => {
    if (!deleteTarget?.id) return;
    try {
      await deletePhoto(String(deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "O‘chirilmadi.");
    }
  };

  return (
    <section className="rounded-[1.375rem] border border-slate-200/85 bg-gradient-to-br from-white via-white to-slate-50/80 p-6 shadow-soft-lg ring-1 ring-slate-900/[0.03] sm:p-8">
      <div className="min-w-0">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {copy.title}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
          {copy.description}
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-4 rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03] sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Sana, brigadir va loyiha
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`${FILTER_BTN} ${periodMode === "today" ? "border-brand-400 bg-brand-50 text-brand-900" : ""}`}
            onClick={() => setPeriodMode("today")}
          >
            Bugungi sana
          </button>
          <button
            type="button"
            className={`${FILTER_BTN} ${periodMode === "pick" ? "border-brand-400 bg-brand-50 text-brand-900" : ""}`}
            onClick={() => {
              setPeriodMode("pick");
              setPickDate(tashkentTodayYMD());
            }}
          >
            Sana tanlash
          </button>
          <button
            type="button"
            className={`${FILTER_BTN} ${periodMode === "week" ? "border-brand-400 bg-brand-50 text-brand-900" : ""}`}
            onClick={() => setPeriodMode("week")}
          >
            Hafta
          </button>
          <button
            type="button"
            className={`${FILTER_BTN} ${periodMode === "month" ? "border-brand-400 bg-brand-50 text-brand-900" : ""}`}
            onClick={() => setPeriodMode("month")}
          >
            Oy
          </button>
        </div>

        {periodMode === "pick" ? (
          <div className="max-w-xs">
            <label htmlFor="rp-pick" className="block text-xs font-medium text-slate-600">
              Sana
            </label>
            <input
              id="rp-pick"
              type="date"
              value={pickDate}
              onChange={(e) => setPickDate(e.target.value)}
              className={DATE_INPUT_CLASS}
            />
          </div>
        ) : null}

        <div className="max-w-xs sm:max-w-[260px]">
          <label htmlFor="rp-brigade" className="block text-xs font-medium text-slate-600">
            Brigada
          </label>
          <select
            id="rp-brigade"
            value={brigadeFilter}
            onChange={(e) => {
              setBrigadeFilter(e.target.value);
              setProjectFilter("");
              setSelectedProjectId("");
            }}
            className={SELECT_CLASS}
          >
            <option value="">Hammasi</option>
            {brigadeOptions.map(([id, name]) => (
              <option key={id || "__empty"} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="max-w-xs sm:max-w-[260px]">
          <label htmlFor="rp-project" className="block text-xs font-medium text-slate-600">
            Loyiha
          </label>
          <select
            id="rp-project"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">Hammasi</option>
            {projectOptions.map(([id, name]) => (
              <option key={id || "__empty_proj"} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-8 rounded-[1rem] border border-dashed border-slate-200/90 bg-slate-50/80 px-4 py-14 text-center shadow-inner">
          <p className="text-base font-medium text-slate-700">
            {emptyTodayCopy
              ? "Bugungi sana uchun rasmlar yuklanmagan"
              : photos.length === 0
                ? "Hozircha yuklangan rasm yo‘q"
                : "Tanlangan filtr bo‘yicha rasm yo‘q"}
          </p>
        </div>
      ) : selectedProject ? (
        <div className="mt-8 rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03] sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-slate-900">
                {selectedProject.projectName}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Brigada: {selectedProject.brigadeName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedProjectId("")}
              className="rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50"
            >
              Loyihalar ro‘yxatiga qaytish
            </button>
          </div>

          {selectedProjectStageGroups.length > 0 ? (
            <>
              <StageStepApprovalPanel
                projectId={selectedProject.projectId}
                projectName={selectedProject.projectName}
              />
            <div className="space-y-6">
              {selectedProjectStageGroups.map((group, idx) => (
                <div
                  key={group.stageId}
                  className="rounded-xl border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03]"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      Bosqich {idx + 1}: {group.stageName}
                    </p>
                    <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                      {group.photos.length}/3 rasm
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {group.photos.map((ph) => (
                      <PhotoThumbCard
                        key={ph.id}
                        photo={ph}
                        adminActions
                        onEdit={setEditTarget}
                        onDelete={(p) => setDeleteTarget(p)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            </>
          ) : (
            <div className="space-y-6">
              {selectedProjectPhotosByDate.map(([ymd, plist]) => (
                <div key={ymd}>
                  <p className="mb-2 text-sm font-semibold text-slate-800">
                    {formatTashkentDateMedium(`${ymd}T12:00:00+05:00`)}
                  </p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {plist.map((ph) => (
                      <PhotoThumbCard
                        key={ph.id}
                        photo={ph}
                        adminActions
                        onEdit={setEditTarget}
                        onDelete={(p) => setDeleteTarget(p)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-8">
          {byBrigadeWithProjects.map((group) => (
            <div
              key={group.brigadeName}
              className="rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03] sm:p-5"
            >
              <p className="mb-3 text-base font-semibold text-slate-900">
                Brigada: {group.brigadeName}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {group.projects.map((project) => (
                  <button
                    key={project.projectId || project.projectName}
                    type="button"
                    onClick={() => setSelectedProjectId(project.projectId)}
                    className="rounded-xl border border-slate-200/90 bg-slate-50 p-3 text-left transition-all hover:bg-slate-100"
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {project.projectName}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Usta soni:{" "}
                      <span className="font-semibold text-slate-800">{project.ustaCount}</span>
                      {" · "}
                      Rasm soni:{" "}
                      <span className="font-semibold text-slate-800">{project.photoCount}</span>
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {editTarget ? (
        <AppModalBackdrop onClose={() => setEditTarget(null)} panelMaxWidthClass="max-w-md">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Rasmni tahrirlash</h3>
            <p className="mt-1 text-xs text-slate-500">Rasm faylini almashtirib bo‘lmaydi</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600">Loyiha nomi</label>
                <input
                  type="text"
                  value={photoEditFields.projectName}
                  onChange={(e) =>
                    setPhotoEditFields((f) => ({ ...f, projectName: e.target.value }))
                  }
                  className={DATE_INPUT_CLASS}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Brigada</label>
                <input
                  type="text"
                  value={photoEditFields.brigadeName}
                  onChange={(e) =>
                    setPhotoEditFields((f) => ({ ...f, brigadeName: e.target.value }))
                  }
                  className={DATE_INPUT_CLASS}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Bosqich nomi</label>
                <input
                  type="text"
                  value={photoEditFields.stageName}
                  onChange={(e) =>
                    setPhotoEditFields((f) => ({ ...f, stageName: e.target.value }))
                  }
                  className={DATE_INPUT_CLASS}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Turi</label>
                <select
                  value={photoEditFields.type}
                  onChange={(e) =>
                    setPhotoEditFields((f) => ({ ...f, type: e.target.value }))
                  }
                  className={SELECT_CLASS}
                >
                  {USTA_PHOTO_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Izoh</label>
                <textarea
                  value={photoEditFields.comment}
                  onChange={(e) =>
                    setPhotoEditFields((f) => ({ ...f, comment: e.target.value }))
                  }
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                />
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-700"
                onClick={() => setEditTarget(null)}
              >
                Bekor
              </button>
              <button
                type="button"
                disabled={photoSaveBusy}
                className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => void savePhotoEdit()}
              >
                {photoSaveBusy ? "Saqlanmoqda…" : "Saqlash"}
              </button>
            </div>
          </div>
        </AppModalBackdrop>
      ) : null}
      {deleteTarget ? (
        <AppModalBackdrop onClose={() => setDeleteTarget(null)} panelMaxWidthClass="max-w-sm">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Rasmni o‘chirish</h3>
            <p className="mt-2 text-sm text-slate-600">
              {deleteTarget.projectName ? String(deleteTarget.projectName) : "Rasm"} — bu amalni
              qaytarib bo‘lmaydi.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-700"
                onClick={() => setDeleteTarget(null)}
              >
                Bekor
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white"
                onClick={() => void confirmDeletePhoto()}
              >
                O‘chirish
              </button>
            </div>
          </div>
        </AppModalBackdrop>
      ) : null}
    </section>
  );
}
