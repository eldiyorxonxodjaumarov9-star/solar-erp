import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { api } from "../api/http";
import {
  sendProjectPhotosDirect,
  sendStagePhotosDirect,
} from "../telegram/clientTelegram";
import { logTelegramEventClient } from "../telegram/telegramEventLog";
import {
  projectPhotosTelegramEvent,
  stagePhotosTelegramEvent,
} from "../telegram/buildTelegramEvent";
import {
  mergeProjectStageLock,
  subscribeDocument,
} from "../firebase/firestoreCrud";
import { awardPoint } from "../points/pointsAward";
import { useProjects } from "../hooks/useProjects";
import { useUstaPhotos } from "../hooks/useUstaPhotos";
import { useWorkers } from "../hooks/useWorkers";
import { isCompletedHolat, projectNumberKey } from "../projects/projectStorage";
import {
  compressImageFileToDataUrl,
  getImageErrorMessage,
  processImage3x4WithFallback,
} from "../photos/imageCompress";
import { uploadStageVideoFile, validateStageVideoFile } from "../photos/stageVideoUpload";
import {
  getStageNote,
  getStageSlotHint,
  getStageSlotLabel,
  getStageSubtitle,
  isStageImageRecord,
  isStageVideoRecord,
  STAGE_HANDOVER_ID,
  STAGE_PHOTO_SLOTS,
  STAGES,
} from "../projects/stageConfig";

const PROGRESS_STORAGE_KEY = "usta_project_progress_v2";
const STAGE_LOCK_LS = "project_stage_bot_locks_v1";

const INVERTER_INPUT_CLASS =
  "mt-1 w-full rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none ring-slate-900/[0.04] transition-all placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-400/25";

function loadStageLocksAll() {
  try {
    const raw = localStorage.getItem(STAGE_LOCK_LS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function loadStageLocksForProject(projectId) {
  const all = loadStageLocksAll();
  const row = all[projectId];
  return row && typeof row === "object" ? row : {};
}

function saveStageLockLocal(projectId, stageId, payload) {
  try {
    const all = loadStageLocksAll();
    const prev = all[projectId] && typeof all[projectId] === "object" ? all[projectId] : {};
    all[projectId] = { ...prev, [stageId]: payload };
    localStorage.setItem(STAGE_LOCK_LS, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

function projectCrewIdSet(project) {
  const s = new Set();
  if (!project) return s;
  if (project.ustaId) s.add(String(project.ustaId));
  if (project.assignedWorkerId) s.add(String(project.assignedWorkerId));
  if (Array.isArray(project.assignedWorkerIds)) {
    project.assignedWorkerIds.forEach((id) => s.add(String(id)));
  }
  return s;
}

function formatDateShort(ymd) {
  if (!ymd) return "—";
  try {
    const d = new Date(`${ymd}T12:00:00`);
    if (Number.isNaN(d.getTime())) return ymd;
    return new Intl.DateTimeFormat("uz-UZ", { dateStyle: "medium" }).format(d);
  } catch {
    return ymd;
  }
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed || fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function cardStatusClass(status) {
  if (status === "done") return "bg-emerald-100 text-emerald-700";
  if (status === "not_done") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-600";
}

function statusBadgeClass(holat) {
  const s = String(holat || "").toLowerCase();
  if (s.includes("tug")) return "bg-emerald-100 text-emerald-700";
  if (s.includes("reja")) return "bg-amber-100 text-amber-700";
  return "bg-sky-100 text-sky-700";
}

function projectNumberDisplay(p) {
  const n = projectNumberKey(p?.projectNumber);
  return n ? `#${n}` : "—";
}

function SourcePickModal({ onClose, onPickCamera, onPickGallery }) {
  return (
    <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/50 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+140px)] pt-10 sm:items-center sm:p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
        <h3 className="text-lg font-semibold text-white">Rasm tanlash</h3>
        <p className="mt-1 text-sm text-slate-300">Kamera yoki galereyadan tanlang</p>

        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={onPickCamera}
            className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Kamera
          </button>

          <button
            type="button"
            onClick={onPickGallery}
            className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Galereya
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700"
          >
            Bekor qilish
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UstaLoyihalarPage() {
  const { session } = useAuth();
  const { workers } = useWorkers();
  const { projects, setAndPersist: persistProjects, setProjectStatus } = useProjects();
  const {
    photos,
    addPhoto,
    updatePhoto,
    deletePhoto,
  } = useUstaPhotos();

  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [progressList, setProgressList] = useState(() =>
    readJson(PROGRESS_STORAGE_KEY, []),
  );
  const [warning, setWarning] = useState("");
  const [busySlot, setBusySlot] = useState("");
  const [busyVideoStageId, setBusyVideoStageId] = useState("");
  const [pendingUpload, setPendingUpload] = useState(null);
  const [stageSendBusyId, setStageSendBusyId] = useState("");
  const [stageTelegramStatus, setStageTelegramStatus] = useState({});
  const [finishBusy, setFinishBusy] = useState(false);
  /** Loyihada bosqich botga yuborilgach — barcha ustalar uchun qulf */
  const [stageLocks, setStageLocks] = useState({});

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const currentSession = useMemo(() => {
    try {
      const raw = localStorage.getItem("currentSession");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }, []);

  const ustaId =
    session?.role === "usta"
      ? session.workerId
      : currentSession?.role === "usta"
        ? String(currentSession.workerId || "")
        : "";

  const worker = useMemo(
    () => workers.find((w) => w.id === ustaId),
    [workers, ustaId],
  );
  const workerLogin = String(session?.login || worker?.login || "").trim();

  const assignedProjects = useMemo(() => {
    if (!worker || !ustaId) return [];
    return projects
      .filter((p) => {
        const direct =
          String(p.ustaId || p.assignedWorkerId || "") === ustaId;
        const crew = Array.isArray(p.assignedWorkerIds)
          ? p.assignedWorkerIds.map((x) => String(x))
          : [];
        return direct || crew.includes(ustaId);
      })
      .sort((a, b) =>
        String(projectNumberKey(a.projectNumber)).localeCompare(
          String(projectNumberKey(b.projectNumber)),
          undefined,
          { numeric: true },
        ),
      );
  }, [projects, worker, ustaId]);

  const activeProjects = useMemo(
    () => assignedProjects.filter((p) => !isCompletedHolat(p.holat)),
    [assignedProjects],
  );

  const completedProjects = useMemo(
    () => assignedProjects.filter((p) => isCompletedHolat(p.holat)),
    [assignedProjects],
  );

  const selectedProject = useMemo(
    () => assignedProjects.find((p) => p.id === selectedProjectId) || null,
    [assignedProjects, selectedProjectId],
  );

  const selectedProjectIsCompleted = useMemo(
    () => (selectedProject ? isCompletedHolat(selectedProject.holat) : false),
    [selectedProject],
  );

  useEffect(() => {
    if (!selectedProjectId) return;
    if (!selectedProject) setSelectedProjectId("");
  }, [selectedProjectId, selectedProject]);

  useEffect(() => {
    if (selectedProject && selectedProjectIsCompleted) {
      setSelectedProjectId("");
      setWarning("Tugallangan loyihaga kirish mumkin emas.");
    }
  }, [selectedProject, selectedProjectIsCompleted]);

  const saveProgressList = (next) => {
    setProgressList(next);
    writeJson(PROGRESS_STORAGE_KEY, next);
  };

  useEffect(() => {
    if (!selectedProject?.id) {
      setStageLocks({});
      return undefined;
    }
    setStageLocks(loadStageLocksForProject(selectedProject.id));
    let cancelled = false;
    const unsub = subscribeDocument(
      "project_stage_locks",
      selectedProject.id,
      (doc) => {
        if (cancelled) return;
        const remote = doc?.stages && typeof doc.stages === "object" ? doc.stages : {};
        setStageLocks(remote);
      },
      () => {
        /* mahalliy rejimda Firebase yo‘q bo‘lsa — faqat localStorage */
      },
    );
    return () => {
      cancelled = true;
      if (typeof unsub === "function") unsub();
    };
  }, [selectedProject?.id]);

  const stageMap = useMemo(() => {
    if (!selectedProject || !ustaId) return {};
    return (
      progressList.find(
        (x) => x.projectId === selectedProject.id && x.ustaId === ustaId,
      )?.stages || {}
    );
  }, [selectedProject, ustaId, progressList]);

  const crewIdSet = useMemo(
    () => projectCrewIdSet(selectedProject),
    [selectedProject],
  );

  const projectCrewPhotos = useMemo(() => {
    if (!selectedProject) return [];
    return photos
      .filter(
        (p) =>
          p.projectId === selectedProject.id && crewIdSet.has(String(p.ustaId)),
      )
      .sort(
        (a, b) =>
          new Date(b.uploadDate || 0).getTime() -
          new Date(a.uploadDate || 0).getTime(),
      );
  }, [photos, selectedProject, crewIdSet]);

  const photosByStage = useMemo(() => {
    const map = {};
    for (const s of STAGES) {
      map[s.id] = projectCrewPhotos
        .filter((ph) => String(ph.stageId) === s.id)
        .sort(
          (a, b) =>
            new Date(a.uploadDate || 0).getTime() -
            new Date(b.uploadDate || 0).getTime(),
        );
    }
    return map;
  }, [projectCrewPhotos]);

  const photosListForStage = (stageId) => photosByStage[stageId] || [];

  /** Joriy usta: o‘z slot rasmlari soni */
  const myFilledSlotCount = (stageId) => {
    const list = photosListForStage(stageId);
    return STAGE_PHOTO_SLOTS.reduce((count, slotNumber) => {
      const hasSlot = list.some(
        (p) =>
          isStageImageRecord(p) &&
          String(p.ustaId) === String(ustaId) &&
          Number(p.slotNumber || 0) === slotNumber,
      );
      return count + (hasSlot ? 1 : 0);
    }, 0);
  };

  const myPhotosForBot = (stageId) => {
    const list = photosListForStage(stageId);
    return STAGE_PHOTO_SLOTS.map((slotNumber) =>
      list.find(
        (p) =>
          isStageImageRecord(p) &&
          String(p.ustaId) === String(ustaId) &&
          Number(p.slotNumber || 0) === slotNumber,
      ),
    ).filter(Boolean);
  };

  const progressValue = useMemo(() => {
    const doneCount = STAGES.filter((stage) => {
      const hasLock = Boolean(stageLocks[stage.id]);
      return hasLock;
    }).length;
    return Math.round((doneCount / STAGES.length) * 100);
  }, [stageLocks]);

  const remaining = Math.max(0, 100 - progressValue);

  /** Keyingi bosqich: oldingi bosqich botga yuborilguncha ochilmaydi */
  const isStageLockedLocal = (stageIdx) => {
    if (stageIdx === 0) return false;
    const prev = STAGES[stageIdx - 1];
    return !stageLocks[prev.id];
  };

  const slotPhotoForStage = (stageId, slotNumber) => {
    const list = photosListForStage(stageId);
    return (
      list.find(
        (p) =>
          isStageImageRecord(p) &&
          String(p.ustaId) === String(ustaId) &&
          Number(p.slotNumber || 0) === Number(slotNumber),
      ) || null
    );
  };

  const stageVideoForStage = (stageId) => {
    const list = photosListForStage(stageId);
    return (
      list.find(
        (p) =>
          isStageVideoRecord(p) && String(p.ustaId) === String(ustaId),
      ) || null
    );
  };

  const saveStageMap = (nextMap) => {
    if (!selectedProject || !ustaId) return;

    const now = new Date().toISOString();
    const nextList = [...progressList];
    const idx = nextList.findIndex(
      (x) => x.projectId === selectedProject.id && x.ustaId === ustaId,
    );

    const payload = {
      projectId: selectedProject.id,
      ustaId,
      stages: nextMap,
      updatedAt: now,
    };

    if (idx >= 0) nextList[idx] = payload;
    else nextList.push(payload);

    saveProgressList(nextList);
  };

  const handoverInverter =
    stageMap[STAGE_HANDOVER_ID]?.inverter && typeof stageMap[STAGE_HANDOVER_ID].inverter === "object"
      ? stageMap[STAGE_HANDOVER_ID].inverter
      : { email: "", key: "", password: "" };

  const updateInverterField = (field, value) => {
    if (!selectedProject || !ustaId) return;
    const prevStage = stageMap[STAGE_HANDOVER_ID] || {};
    const prevInv =
      prevStage.inverter && typeof prevStage.inverter === "object" ? prevStage.inverter : {};
    saveStageMap({
      ...stageMap,
      [STAGE_HANDOVER_ID]: {
        ...prevStage,
        inverter: {
          email: String(prevInv.email || ""),
          key: String(prevInv.key || ""),
          password: String(prevInv.password || ""),
          [field]: value,
        },
      },
    });
  };

  const handleStageDone = (stage, idx) => {
    if (isStageLockedLocal(idx)) return;
    if (stageLocks[stage.id]) return;

    if (myFilledSlotCount(stage.id) !== STAGE_PHOTO_SLOTS.length) {
      setWarning("Bosqich bajarilishi uchun o‘zingizning 1, 2 va 3-slot rasmlaringizni yuklang.");
      saveStageMap({
        ...stageMap,
        [stage.id]: {
          ...(stageMap[stage.id] || {}),
          attempted: true,
          status: "pending",
          updatedAt: new Date().toISOString(),
        },
      });
      return;
    }

    setWarning("");
    saveStageMap({
      ...stageMap,
      [stage.id]: {
        ...(stageMap[stage.id] || {}),
        attempted: true,
        status: "done",
        updatedAt: new Date().toISOString(),
      },
    });
  };

  const handleStageNotDone = (stage, idx) => {
    if (isStageLockedLocal(idx)) return;
    if (stageLocks[stage.id]) return;

    setWarning("");
    const next = { ...stageMap };

    next[stage.id] = {
      ...(next[stage.id] || {}),
      attempted: false,
      status: "not_done",
      updatedAt: new Date().toISOString(),
    };

    for (let i = idx + 1; i < STAGES.length; i += 1) {
      const sid = STAGES[i].id;
      next[sid] = {
        ...(next[sid] || {}),
        attempted: false,
        status: "pending",
        updatedAt: new Date().toISOString(),
      };
    }

    saveStageMap(next);
  };

  const handlePickStageSlot = (stageId, slotNumber) => {
    if (stageLocks[stageId]) {
      setWarning(
        "Bu bosqich jamoa nomidan botga yuborilgan — qayta rasm qo‘sha olmaysiz.",
      );
      return;
    }
    setPendingUpload({ stageId, slotNumber });
  };

  const handleSourcePick = (kind) => {
    setTimeout(() => {
      if (kind === "camera") cameraInputRef.current?.click();
      if (kind === "gallery") galleryInputRef.current?.click();
    }, 100);
  };

  const handleFileChosen = async (file) => {
    const uploadInfo = pendingUpload;
    setPendingUpload(null);

    if (!selectedProject || !worker || !ustaId || !uploadInfo || !file) return;

    if (stageLocks[uploadInfo.stageId]) {
      setWarning(
        "Bu bosqich botga yuborilgan — yangi rasm qo‘sha olmaysiz.",
      );
      return;
    }
    const busyKey = `${uploadInfo.stageId}-${uploadInfo.slotNumber}`;
    setBusySlot(busyKey);
    setWarning("");

    try {
      let imageData = "";
      try {
        imageData = await processImage3x4WithFallback(file, api.postFormData);
      } catch (processError) {
        // Safety fallback: compress locally to avoid quota crashes.
        console.warn("3x4 process failed, using compressed fallback:", processError);
        imageData = await compressImageFileToDataUrl(file, {
          maxWidth: 900,
          quality: 0.75,
        });
      }

      const oldPhoto = photos.find(
        (p) =>
          p.projectId === selectedProject.id &&
          p.ustaId === ustaId &&
          p.stageId === uploadInfo.stageId &&
          Number(p.slotNumber || 0) === Number(uploadInfo.slotNumber),
      );

      const newPhoto = {
        id: oldPhoto?.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        imageData,
        imageUrl: imageData,
        uploadDate: new Date().toISOString(),
        ustaId,
        ustaName: session?.name || worker.fullName || ustaId,
        brigadeId: selectedProject.brigadeId || worker.brigadeId || "",
        brigadeName: selectedProject.brigadeName || worker.brigadeName || "",
        projectId: selectedProject.id,
        projectName: selectedProject.clientName || projectNumberDisplay(selectedProject),
        stageId: uploadInfo.stageId,
        stageName: STAGES.find((s) => s.id === uploadInfo.stageId)?.name || "",
        slotNumber: uploadInfo.slotNumber,
        type: "stage_photo",
        comment: "",
      };

      if (oldPhoto?.id) {
        await updatePhoto(oldPhoto.id, newPhoto);
      } else {
        await addPhoto(newPhoto);
      }
      setWarning("");
    } catch (error) {
      console.error("Rasm yuklash xatosi:", error);
      const msg = getImageErrorMessage(error);
      setWarning(msg);
      alert(msg);
    } finally {
      setBusySlot("");
    }
  };

  const handleRemovePhoto = async (photoId) => {
    const ph = photos.find((x) => String(x.id) === String(photoId));
    if (ph && stageLocks[ph.stageId]) {
      setWarning("Botga yuborilgan bosqichdan rasm o‘chirib bo‘lmaydi.");
      return;
    }
    if (ph && String(ph.ustaId) !== String(ustaId)) {
      setWarning("Boshqa usta yuklagan rasmini faqat u o‘chira oladi.");
      return;
    }
    try {
      await deletePhoto(String(photoId));
    } catch (error) {
      console.error("Rasmni o'chirish xatosi:", error);
      setWarning("Rasmni o'chirib bo'lmadi");
    }
  };

  const handleVideoPick = (stageId) => {
    if (stageLocks[stageId]) {
      setWarning("Bu bosqich botga yuborilgan — videoni almashtirib bo‘lmaydi.");
      return;
    }
    videoInputRef.current?.setAttribute("data-stage-id", stageId);
    videoInputRef.current?.click();
  };

  const handleVideoChosen = async (stageId, file) => {
    if (!selectedProject || !worker || !ustaId || !stageId || !file) return;
    if (stageLocks[stageId]) {
      setWarning("Bu bosqich botga yuborilgan — videoni almashtirib bo‘lmaydi.");
      return;
    }

    const check = validateStageVideoFile(file);
    if (!check.ok) {
      setWarning(check.error);
      alert(check.error);
      return;
    }

    setBusyVideoStageId(stageId);
    setWarning("");
    try {
      const uploaded = await uploadStageVideoFile(file, {
        projectId: selectedProject.id,
        stageId,
        ustaId,
      });
      const oldVideo = stageVideoForStage(stageId);
      const videoRecord = {
        id: oldVideo?.id || `${Date.now()}-vid-${Math.random().toString(16).slice(2)}`,
        imageData: "",
        imageUrl: "",
        videoUrl: uploaded.videoUrl,
        storagePath: uploaded.storagePath,
        fileName: uploaded.fileName,
        mediaType: "video",
        uploadDate: new Date().toISOString(),
        ustaId,
        ustaName: session?.name || worker.fullName || ustaId,
        brigadeId: selectedProject.brigadeId || worker.brigadeId || "",
        brigadeName: selectedProject.brigadeName || worker.brigadeName || "",
        projectId: selectedProject.id,
        projectName: selectedProject.clientName || projectNumberDisplay(selectedProject),
        stageId,
        stageName: STAGES.find((s) => s.id === stageId)?.name || "",
        slotNumber: 0,
        type: "stage_photo",
        comment: "",
      };
      if (oldVideo?.id) {
        await updatePhoto(oldVideo.id, videoRecord);
      } else {
        await addPhoto(videoRecord);
      }
    } catch (error) {
      console.error("Video yuklash xatosi:", error);
      const msg = error instanceof Error ? error.message : "Video yuklanmadi";
      setWarning(msg);
      alert(msg);
    } finally {
      setBusyVideoStageId("");
    }
  };

  const handleSendStageToBot = async (stage) => {
    if (!selectedProject || !worker || !ustaId) return;
    if (stageLocks[stage.id]) {
      setWarning("Bu bosqich allaqachon botga yuborilgan.");
      return;
    }
    const mine = myPhotosForBot(stage.id);
    if (mine.length !== STAGE_PHOTO_SLOTS.length) {
      setWarning("Botga yuborish uchun o‘zingizning 1, 2 va 3-slot rasmlaringiz bo‘lishi kerak.");
      return;
    }

    setWarning("");
    setStageSendBusyId(stage.id);
    try {
      const inv =
        stage.id === STAGE_HANDOVER_ID && stageMap[STAGE_HANDOVER_ID]?.inverter
          ? stageMap[STAGE_HANDOVER_ID].inverter
          : null;
      const stageVideo = stageVideoForStage(stage.id);
      const payload = {
        workerName: session?.name || worker.fullName || "Usta",
        workerId: ustaId,
        workerLogin,
        workerPhone: String(worker.phone || "").trim(),
        brigadeName:
          selectedProject.brigadeName || worker.brigadeName || "",
        projectName: selectedProject.clientName || projectNumberDisplay(selectedProject),
        stageName: stage.name,
        photos: mine.map((ph) => String(ph.imageData || ph.imageUrl || "")).slice(0, 3),
        slotLabels: STAGE_PHOTO_SLOTS.map((slot) => getStageSlotLabel(stage.id, slot)),
        videoUrl: stageVideo?.videoUrl ? String(stageVideo.videoUrl) : "",
        videoFileName: stageVideo?.fileName || "stage-video.mp4",
        inverter: inv
          ? {
              email: String(inv.email || "").trim(),
              key: String(inv.key || "").trim(),
              password: String(inv.password || "").trim(),
            }
          : undefined,
      };
      try {
        await api.post("/api/telegram/stage-photos", payload);
      } catch (firstError) {
        const msg = firstError instanceof Error ? firstError.message : "";
        // Transient proxy/network hiccups sometimes produce generic "Request failed".
        if (msg === "Request failed" || msg === "Serverga ulanish yo‘q") {
          await new Promise((resolve) => setTimeout(resolve, 400));
          try {
            await api.post("/api/telegram/stage-photos", payload);
          } catch (secondError) {
            console.error("stage-photos server orqali yuborilmadi, to‘g‘ridan urinilmoqda:", secondError);
            await sendStagePhotosDirect(payload);
            await logTelegramEventClient(stagePhotosTelegramEvent(payload));
          }
        } else {
          console.error("stage-photos server xatosi, to‘g‘ridan urinilmoqda:", firstError);
          await sendStagePhotosDirect(payload);
          await logTelegramEventClient(stagePhotosTelegramEvent(payload));
        }
      }

      const lockPayload = {
        sentAt: new Date().toISOString(),
        ustaId,
        ustaName: session?.name || worker.fullName || ustaId,
        brigadeName: payload.brigadeName,
        ...(payload.inverter ? { inverter: payload.inverter } : {}),
      };
      saveStageLockLocal(selectedProject.id, stage.id, lockPayload);
      setStageLocks((prev) => ({ ...prev, [stage.id]: lockPayload }));
      try {
        await mergeProjectStageLock(selectedProject.id, stage.id, lockPayload);
      } catch (lockErr) {
        console.warn("Firestore bosqich qulfi saqlanmadi (mahalliy saqlangan):", lockErr);
      }

      setStageTelegramStatus((prev) => ({
        ...prev,
        [stage.id]: "Botga yuborildi — bosqich jamoa uchun yopildi.",
      }));
      void awardPoint(ustaId, "rasm");
    } catch (error) {
      console.error("Bosqich rasmlarini botga yuborish xatosi:", error);
      const message = error instanceof Error ? error.message : "Botga yuborilmadi";
      setStageTelegramStatus((prev) => ({
        ...prev,
        [stage.id]: message,
      }));
    } finally {
      setStageSendBusyId("");
    }
  };

  const allStagesReady = useMemo(
    () => STAGES.every((s) => Boolean(stageLocks[s.id])),
    [stageLocks],
  );

  const canFinish = allStagesReady;

  const handleFinishProject = async () => {
    if (!selectedProject || finishBusy) return;

    if (!canFinish) {
      setWarning(
        "Har bir bosqichni ketma-ket botga yuboring — shundan keyin loyiha yakunlanadi.",
      );
      return;
    }

    setFinishBusy(true);
    setWarning("");
    try {
      const allProjectPhotos = projectCrewPhotos
        .filter(isStageImageRecord)
        .map((p) => ({
          image: String(p.imageData || p.imageUrl || ""),
          stageName: String(p.stageName || ""),
          slotNumber: Number(p.slotNumber || 0),
        }))
        .filter((x) => x.image);

      if (allProjectPhotos.length > 0) {
        const projectPhotosPayload = {
          workerName: session?.name || worker?.fullName || "Usta",
          workerId: ustaId,
          workerLogin,
          projectName: selectedProject.clientName || projectNumberDisplay(selectedProject),
          photos: allProjectPhotos,
        };
        try {
          await api.post("/api/telegram/project-photos", projectPhotosPayload);
        } catch (projErr) {
          console.error("project-photos server orqali yuborilmadi, to‘g‘ridan urinilmoqda:", projErr);
          await sendProjectPhotosDirect(projectPhotosPayload);
          await logTelegramEventClient(projectPhotosTelegramEvent(projectPhotosPayload));
        }
      }

      await setProjectStatus(selectedProject.id, "tugallandi");
      void awardPoint(ustaId, "loyiha");
      alert("🎉 Loyiha yakunlandi va rasmlar botga yuborildi.");
      setSelectedProjectId("");
    } catch (error) {
      console.error("Project finish flow error:", error);
      persistProjects(
        projects.map((p) =>
          p.id === selectedProject.id ? { ...p, holat: "Tugallandi" } : p,
        ),
      );
      alert("Loyiha holati yangilandi, lekin botga yuborishda xatolik bo‘lishi mumkin.");
      setSelectedProjectId("");
    } finally {
      setFinishBusy(false);
    }
  };

  if (selectedProject) {
    return (
      <section className="rounded-[1.375rem] border border-slate-200/85 bg-gradient-to-br from-white via-white to-slate-50/80 p-6 shadow-soft-lg ring-1 ring-slate-900/[0.03] sm:p-8">
        <button
          type="button"
          onClick={() => setSelectedProjectId("")}
          className="rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50"
        >
          Orqaga
        </button>

        <div className="mt-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              {selectedProject.clientName || projectNumberDisplay(selectedProject)}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              <span className="text-slate-500">Telefon:</span> {selectedProject.phone || "—"}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              <span className="text-slate-500">Manzil:</span> {selectedProject.address || "—"}
            </p>
          </div>
          <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${statusBadgeClass(selectedProject.holat)}`}>
            {selectedProject.holat || "—"}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
            Quvvat: {selectedProject.powerKw || "—"} kW
          </span>
          <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
            Tizim turi: {selectedProject.systemType || "—"}
          </span>
          <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
            Usta: {selectedProject.ustaName || session?.name || "—"}
          </span>
        </div>

        <div className="mt-6 rounded-[1rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03]">
          <p className="text-sm font-semibold text-slate-900">Umumiy jarayon</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{progressValue}%</p>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-600 to-cyan-500"
              style={{ width: `${progressValue}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-600">Qolgan: {remaining}%</p>
        </div>

        <div className="mt-6 space-y-3">
          {STAGES.map((stage, idx) => {
            const prevLocked = isStageLockedLocal(idx);
            const botLocked = Boolean(stageLocks[stage.id]);
            const canEditPhotos = !prevLocked && !botLocked;
            const stagePhotos = photosByStage[stage.id] || [];
            const stageVideo = stageVideoForStage(stage.id);
            const myBot = myPhotosForBot(stage.id);
            const mySlots = myFilledSlotCount(stage.id);
            const isComplete = botLocked;
            const rawStatus = stageMap[stage.id]?.status || "pending";
            const status = isComplete ? "done" : rawStatus === "not_done" ? "not_done" : "pending";
            const attempted = Boolean(stageMap[stage.id]?.attempted) || isComplete;

            return (
              <article
                key={stage.id}
                className={`rounded-[1rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03] ${prevLocked ? "opacity-50" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      Bosqich {idx + 1}
                    </p>
                    <p className="mt-1 font-semibold text-slate-900">{stage.name}</p>
                    {getStageSubtitle(stage.id) ? (
                      <p className="mt-1 text-xs font-medium text-brand-700">
                        {getStageSubtitle(stage.id)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600">
                      {stage.percent}%
                    </span>
                    <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${cardStatusClass(status)}`}>
                      {status === "done"
                        ? "Bajarildi"
                        : status === "not_done"
                          ? "Bajarilmadi"
                          : "Kutilmoqda"}
                    </span>
                  </div>
                </div>

                {prevLocked ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Oldingi bosqich botga yuborilguncha bu bosqich ochilmaydi
                  </p>
                ) : null}

                {botLocked ? (
                  <p className="mt-2 text-xs font-medium text-emerald-700">
                    Bu bosqich jamoa nomidan botga yuborilgan — qayta rasm qo‘shilmaydi. Keyingi
                    bosqich ochiq.
                  </p>
                ) : null}

                {stage.id === STAGE_HANDOVER_ID && !prevLocked ? (
                  <div className="mt-3 rounded-xl border border-slate-200/90 bg-slate-50/80 p-3">
                    <p className="text-xs font-semibold text-slate-800">
                      Invertor ma’lumotlari (ixtiyoriy)
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Mijozga topshirishda invertor uchun email, key va parol bo‘lsa yozib qoldiring.
                    </p>
                    <label className="mt-2 block text-[11px] font-medium text-slate-600">
                      Email
                      <input
                        type="email"
                        autoComplete="off"
                        disabled={botLocked}
                        value={String(handoverInverter.email || "")}
                        onChange={(e) => updateInverterField("email", e.target.value)}
                        placeholder="invertor@email.com"
                        className={INVERTER_INPUT_CLASS}
                      />
                    </label>
                    <label className="mt-2 block text-[11px] font-medium text-slate-600">
                      Key
                      <input
                        type="text"
                        autoComplete="off"
                        disabled={botLocked}
                        value={String(handoverInverter.key || "")}
                        onChange={(e) => updateInverterField("key", e.target.value)}
                        placeholder="Invertor kaliti"
                        className={INVERTER_INPUT_CLASS}
                      />
                    </label>
                    <label className="mt-2 block text-[11px] font-medium text-slate-600">
                      Parol
                      <input
                        type="text"
                        autoComplete="off"
                        disabled={botLocked}
                        value={String(handoverInverter.password || "")}
                        onChange={(e) => updateInverterField("password", e.target.value)}
                        placeholder="Parol"
                        className={INVERTER_INPUT_CLASS}
                      />
                    </label>
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleStageDone(stage, idx)}
                    disabled={prevLocked || botLocked}
                    className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm transition-all hover:bg-emerald-100 disabled:pointer-events-none"
                  >
                    Bajarildi
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStageNotDone(stage, idx)}
                    disabled={prevLocked || botLocked}
                    className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 shadow-sm transition-all hover:bg-red-100 disabled:pointer-events-none"
                  >
                    Bajarilmadi
                  </button>
                  <span className="rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
                    Siz: {mySlots}/{STAGE_PHOTO_SLOTS.length} rasm
                    {stageVideo ? " · video bor" : ""}
                  </span>
                </div>

                {!prevLocked ? (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {STAGE_PHOTO_SLOTS.map((slotNumber) => {
                      const slotPhoto = slotPhotoForStage(stage.id, slotNumber);
                      const slotLabel = getStageSlotLabel(stage.id, slotNumber);
                      const slotHint = getStageSlotHint(stage.id, slotNumber);
                      const busyKey = `${stage.id}-${slotNumber}`;
                      return (
                        <div
                          key={`${stage.id}-slot-${slotNumber}`}
                          className="relative overflow-hidden rounded-lg border border-slate-200"
                        >
                          {slotPhoto ? (
                            <>
                              <img
                                src={slotPhoto.imageUrl || slotPhoto.imageData}
                                alt={slotLabel}
                                className="aspect-[3/4] w-full object-cover"
                              />
                              {canEditPhotos ? (
                                <button
                                  type="button"
                                  onClick={() => handleRemovePhoto(slotPhoto.id)}
                                  className="absolute right-1 top-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                                >
                                  X
                                </button>
                              ) : null}
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled={busySlot === busyKey || !canEditPhotos}
                              onClick={() => handlePickStageSlot(stage.id, slotNumber)}
                              className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-0.5 bg-slate-50 px-1 text-center text-[10px] font-medium text-slate-600 transition-all hover:bg-slate-100 disabled:pointer-events-none"
                            >
                              {busySlot === busyKey ? (
                                "Yuklanmoqda..."
                              ) : (
                                <>
                                  <span>{slotLabel}</span>
                                  {slotHint ? (
                                    <span className="text-[9px] font-normal text-slate-500">
                                      {slotHint}
                                    </span>
                                  ) : null}
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {!prevLocked ? (
                  <div className="mt-3 rounded-xl border border-slate-200/90 bg-slate-50/70 p-3">
                    <p className="text-xs font-semibold text-slate-800">
                      Video jonatish (ixtiyoriy)
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-600">{getStageNote(stage.id)}</p>
                    {stageVideo?.videoUrl ? (
                      <div className="mt-2 space-y-2">
                        <video
                          src={stageVideo.videoUrl}
                          controls
                          playsInline
                          className="max-h-48 w-full rounded-lg border border-slate-200 bg-black"
                        />
                        {canEditPhotos ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleVideoPick(stage.id)}
                              disabled={busyVideoStageId === stage.id}
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                            >
                              Videoni almashtirish
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemovePhoto(stageVideo.id)}
                              className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100"
                            >
                              Videoni o‘chirish
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={!canEditPhotos || busyVideoStageId === stage.id}
                        onClick={() => handleVideoPick(stage.id)}
                        className="mt-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-60"
                      >
                        {busyVideoStageId === stage.id ? "Video yuklanmoqda..." : "Video yuklash"}
                      </button>
                    )}
                  </div>
                ) : null}

                {!prevLocked ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSendStageToBot(stage)}
                      disabled={
                        stageSendBusyId === stage.id ||
                        botLocked ||
                        myBot.length !== STAGE_PHOTO_SLOTS.length
                      }
                      className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm transition-all hover:bg-blue-100 disabled:pointer-events-none disabled:opacity-60"
                    >
                      {stageSendBusyId === stage.id ? "Yuborilmoqda..." : "Botga yuborish (3 rasm)"}
                    </button>
                    {stageTelegramStatus[stage.id] ? (
                      <p className="text-xs text-slate-600">{stageTelegramStatus[stage.id]}</p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

        {warning ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {warning}
          </p>
        ) : null}

        <div className="mt-6 rounded-[1rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03]">
          <p className="text-sm text-slate-700">
            Har bosqichda o‘zingizning 3 ta rasm slotini to‘ldiring. Video ixtiyoriy — majburiy emas.
            Ketma-ket botga yuboring — barcha bosqichlar yuborilgach loyihani yakunlash mumkin.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleFinishProject}
              disabled={!canFinish || finishBusy}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-soft-md transition-all hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-50"
            >
              {finishBusy ? "Yuborilmoqda..." : "Loyihani yakunlash"}
            </button>
          </div>
        </div>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            handleFileChosen(file);
          }}
        />

        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            handleFileChosen(file);
          }}
        />

        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            const stageId = e.target.getAttribute("data-stage-id") || "";
            e.target.value = "";
            if (file && stageId) void handleVideoChosen(stageId, file);
          }}
        />

        {pendingUpload ? (
          <SourcePickModal
            onClose={() => setPendingUpload(null)}
            onPickCamera={() => handleSourcePick("camera")}
            onPickGallery={() => handleSourcePick("gallery")}
          />
        ) : null}
      </section>
    );
  }

  return (
    <section className="rounded-[1.375rem] border border-slate-200/85 bg-gradient-to-br from-white via-white to-slate-50/80 p-6 shadow-soft-lg ring-1 ring-slate-900/[0.03] sm:p-8">
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        Loyihalar
      </h2>
      <p className="mt-2 text-sm text-slate-600">Mening tayinlangan loyihalarim</p>

      <div className="mt-7">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Faol loyihalar</h3>
          <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
            {activeProjects.length}
          </span>
        </div>

        {activeProjects.length === 0 ? (
          <p className="rounded-[1rem] border border-dashed border-slate-200/90 bg-slate-50/80 px-4 py-8 text-center text-sm leading-relaxed text-slate-500">
            Faol loyihalar yo‘q
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {activeProjects.map((p) => (
              <li
                key={p.id}
                onClick={() => setSelectedProjectId(p.id)}
                className="cursor-pointer rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03]"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-base font-bold text-slate-900">
                    {projectNumberDisplay(p)}
                  </p>
                  <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${statusBadgeClass(p.holat)}`}>
                    {p.holat}
                  </span>
                </div>

                <div className="mt-3 space-y-1 text-sm text-slate-600">
                  <p><span className="text-slate-500">Mijoz ismi:</span> {p.clientName || "—"}</p>
                  <p><span className="text-slate-500">Telefon:</span> {p.phone || "—"}</p>
                  <p className="line-clamp-2"><span className="text-slate-500">Manzil:</span> {p.address || "—"}</p>
                  <p><span className="text-slate-500">Holat:</span> {p.holat || "—"}</p>
                  <p><span className="text-slate-500">Quvvat:</span> {p.powerKw || "—"} kW</p>
                  <p><span className="text-slate-500">Boshlanish sanasi:</span> {formatDateShort(p.startDate)}</p>
                  <p><span className="text-slate-500">Tugash sanasi:</span> {formatDateShort(p.endDate)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Tugallangan loyihalar</h3>
          <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
            {completedProjects.length}
          </span>
        </div>

        {completedProjects.length === 0 ? (
          <p className="rounded-[1rem] border border-dashed border-slate-200/90 bg-slate-50/80 px-4 py-8 text-center text-sm leading-relaxed text-slate-500">
            Hali tugallangan loyiha yo‘q
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {completedProjects.map((p) => (
              <li
                key={p.id}
                className="rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03]"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-base font-bold text-slate-900">
                    {projectNumberDisplay(p)}
                  </p>
                  <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${statusBadgeClass(p.holat)}`}>
                    {p.holat}
                  </span>
                </div>

                <div className="mt-3 space-y-1 text-sm text-slate-600">
                  <p><span className="text-slate-500">Mijoz ismi:</span> {p.clientName || "—"}</p>
                  <p><span className="text-slate-500">Telefon:</span> {p.phone || "—"}</p>
                  <p className="line-clamp-2"><span className="text-slate-500">Manzil:</span> {p.address || "—"}</p>
                  <p><span className="text-slate-500">Holat:</span> {p.holat || "—"}</p>
                  <p><span className="text-slate-500">Quvvat:</span> {p.powerKw || "—"} kW</p>
                  <p><span className="text-slate-500">Boshlanish sanasi:</span> {formatDateShort(p.startDate)}</p>
                  <p><span className="text-slate-500">Tugash sanasi:</span> {formatDateShort(p.endDate)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
