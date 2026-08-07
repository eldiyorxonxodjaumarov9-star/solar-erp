import { APP_PHOTO_TYPES } from "../photos/appPhotoTypes.js";
import { instantToTashkentYMD } from "../photos/tashkentTime.js";

export function photoMonth(instant) {
  const ymd = instantToTashkentYMD(instant);
  return ymd ? ymd.slice(0, 7) : "";
}

/** Usta uchun oy bo‘yicha barcha rasmlar (keldi/ketdi + loyiha). */
export function workerPhotosInMonth(photos, workerId, month) {
  const wid = String(workerId || "").trim();
  if (!wid) return [];
  return (photos || []).filter((p) => {
    if (String(p?.ustaId || "") !== wid) return false;
    return photoMonth(p?.uploadDate) === month;
  });
}

export function buildWorkerPhotoStats(photos, workerId, month) {
  const mine = workerPhotosInMonth(photos, workerId, month);
  const keldi = mine.filter((p) => String(p?.type || "") === APP_PHOTO_TYPES.KELDI).length;
  const ketdi = mine.filter((p) => String(p?.type || "") === APP_PHOTO_TYPES.KETDI).length;
  const loyiha = mine.length - keldi - ketdi;
  const photoProjects = new Set(
    mine.map((p) => String(p.projectId || "")).filter(Boolean),
  );
  return {
    photoCount: mine.length,
    keldiPhotos: keldi,
    ketdiPhotos: ketdi,
    loyihaPhotos: Math.max(0, loyiha),
    photoProjects: photoProjects.size,
  };
}
