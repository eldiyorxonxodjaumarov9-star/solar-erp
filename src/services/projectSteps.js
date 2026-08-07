import {
  addCollectionDocWithId,
  listCollection,
  updateCollectionDoc,
} from "../firebase/firestoreCrud";
import {
  COLLECTIONS,
  PROJECT_PROGRESS_STAGES,
  STEP_STATUS,
} from "./schema.js";

export function projectStepDocId(projectId, stepNumber) {
  const p = String(projectId || "").replace(/\//g, "_");
  return `${p}_step_${stepNumber}`;
}

/** Usta rasm yuklaganda projectSteps yozuvini yangilaydi. */
export async function upsertProjectStepFromUpload({
  projectId,
  stepNumber,
  stageId,
  imageUrl,
  uploadedBy,
  uploadedByName,
  location,
  stagePhotoId,
}) {
  const pid = String(projectId || "").trim();
  const sn = Number(stepNumber);
  if (!pid || !sn) return null;

  const id = projectStepDocId(pid, sn);
  const now = new Date().toISOString();
  const payload = {
    projectId: pid,
    stepNumber: sn,
    stageId: String(stageId || ""),
    imageUrl: String(imageUrl || ""),
    uploadedBy: String(uploadedBy || ""),
    uploadedByName: String(uploadedByName || ""),
    location: location && typeof location === "object" ? location : null,
    status: STEP_STATUS.PENDING,
    uploadedAt: now,
    adminNote: "",
    stagePhotoId: String(stagePhotoId || ""),
    updatedAt: now,
  };

  await addCollectionDocWithId(COLLECTIONS.projectSteps, id, payload);
  return { id, ...payload };
}

export async function setProjectStepStatus(projectId, stepNumber, status, adminNote = "") {
  const id = projectStepDocId(projectId, stepNumber);
  return updateCollectionDoc(COLLECTIONS.projectSteps, id, {
    status,
    adminNote: String(adminNote || ""),
    reviewedAt: new Date().toISOString(),
  });
}

/** 3 bosqich accepted → progress 100. */
export function computeProjectProgressFromSteps(steps) {
  const byProject = new Map();
  for (const s of steps || []) {
    const pid = String(s.projectId || "").trim();
    if (!pid) continue;
    if (!byProject.has(pid)) byProject.set(pid, []);
    byProject.get(pid).push(s);
  }
  const out = new Map();
  for (const [pid, list] of byProject) {
    const accepted = PROJECT_PROGRESS_STAGES.filter((def) =>
      list.some(
        (s) =>
          Number(s.stepNumber) === def.stepNumber &&
          String(s.status) === STEP_STATUS.ACCEPTED,
      ),
    ).length;
    const progress = Math.round((accepted / PROJECT_PROGRESS_STAGES.length) * 100);
    out.set(pid, progress);
  }
  return out;
}

export async function syncProjectProgressField(projectId) {
  const pid = String(projectId || "").trim();
  if (!pid) return;
  const all = await listCollection(COLLECTIONS.projectSteps);
  const mine = all.filter((s) => String(s.projectId) === pid);
  const accepted = PROJECT_PROGRESS_STAGES.filter((def) =>
    mine.some(
      (s) =>
        Number(s.stepNumber) === def.stepNumber &&
        String(s.status) === STEP_STATUS.ACCEPTED,
    ),
  ).length;
  const progress = Math.round((accepted / PROJECT_PROGRESS_STAGES.length) * 100);
  const holat = progress >= 100 ? "tugallandi" : undefined;
  const patch = { progress, updatedAt: new Date().toISOString() };
  if (holat) patch.holat = holat;
  await updateCollectionDoc(COLLECTIONS.projects, pid, patch);
  return progress;
}

export function stageIdToStepNumber(stageId) {
  const found = PROJECT_PROGRESS_STAGES.find((s) => s.stageId === stageId);
  return found?.stepNumber || null;
}
