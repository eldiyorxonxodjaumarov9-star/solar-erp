import { api } from "../api/http.js";

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export function validateStageVideoFile(file) {
  if (!file) return { ok: false, error: "Video tanlanmadi" };
  const type = String(file.type || "").toLowerCase();
  if (!type.startsWith("video/")) {
    return { ok: false, error: "Faqat video fayl tanlang (mp4, mov va hokazo)" };
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return {
      ok: false,
      error: "Video juda katta (maks. 50 MB). Qisqaroq video yuklang.",
    };
  }
  return { ok: true };
}

/**
 * Bosqich videosini server diskiga yuklaydi.
 * @returns {Promise<{ videoUrl: string; storagePath: string; fileName: string }>}
 */
export async function uploadStageVideoFile(file, { projectId, stageId, ustaId }) {
  const check = validateStageVideoFile(file);
  if (!check.ok) throw new Error(check.error);

  const form = new FormData();
  form.append("video", file, file.name || "stage-video.mp4");
  form.append("projectId", String(projectId || ""));
  form.append("stageId", String(stageId || ""));
  form.append("ustaId", String(ustaId || ""));

  const data = await api.postFormData("/api/db/upload/stage-video", form);
  return {
    videoUrl: data.videoUrl,
    storagePath: data.storagePath,
    fileName: data.fileName,
  };
}
