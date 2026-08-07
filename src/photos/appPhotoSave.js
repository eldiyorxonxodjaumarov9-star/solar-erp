import { withTimeout } from "../lib/asyncTimeout.js";
import {
  addCollectionDocWithId,
} from "../firebase/firestoreCrud.js";
import { compressImageFileToDataUrl } from "./imageCompress.js";
import {
  createUstaPhotoId,
  loadUstaPhotos,
  persistUstaPhotos,
} from "./ustaPhotoStorage.js";
import { uploadImageToStorage, buildPhotoStoragePath } from "../services/storageUpload.js";
import { upsertProjectStepFromUpload, stageIdToStepNumber } from "../services/projectSteps.js";

import { APP_PHOTO_TYPES } from "./appPhotoTypes.js";

const DEFAULT_MAX_WIDTH = 900;
const DEFAULT_QUALITY = 0.72;

export { APP_PHOTO_TYPES };

export async function dataUrlToFile(dataUrl, fileName = "photo.jpg") {
  const text = String(dataUrl || "");
  const comma = text.indexOf(",");
  if (comma < 0) throw new Error("Rasm formati noto'g'ri");
  const head = text.slice(0, comma);
  const b64 = text.slice(comma + 1);
  const mime = (head.match(/data:(.*?);base64/) || [])[1] || "image/jpeg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
  return new File([arr], fileName, { type: mime });
}

/**
 * Rasmni siqish (localStorage / Firebase hajmi uchun).
 * @returns {Promise<{ imageData: string; file: File }>}
 */
export async function prepareCompressedPhoto(input, opts = {}) {
  const maxWidth = opts.maxWidth ?? DEFAULT_MAX_WIDTH;
  const quality = opts.quality ?? DEFAULT_QUALITY;

  let file = input?.file || null;
  let imageData = String(input?.imageData || "").trim();

  if (file) {
    imageData = await compressImageFileToDataUrl(file, { maxWidth, quality });
  } else if (imageData.startsWith("data:")) {
    file = await dataUrlToFile(imageData, input?.fileName || "photo.jpg");
    imageData = await compressImageFileToDataUrl(file, { maxWidth, quality });
  } else {
    throw new Error("Rasm topilmadi");
  }

  const outFile = await dataUrlToFile(
    imageData,
    file?.name || input?.fileName || "photo.jpg",
  );
  return { imageData, file: outFile };
}

function mergeIntoLocalCache(record) {
  try {
    const local = loadUstaPhotos();
    const next = [record, ...local.filter((x) => x.id !== record.id)].sort(
      (a, b) =>
        new Date(b.uploadDate || 0).getTime() - new Date(a.uploadDate || 0).getTime(),
    );
    persistUstaPhotos(next);
  } catch (e) {
    console.warn("Mahalliy rasm keshi yangilanmadi:", e);
  }
}

/**
 * Rasmni siqib Firebase (stage_photos) + mahalliy keshga saqlaydi.
 * Admin «Rasmlar» va «Ish vaqtlari» sahifalarida ko‘rinadi.
 */
export async function saveAppPhoto({
  ustaId,
  ustaName,
  brigadeId = "",
  brigadeName = "",
  projectId = "",
  projectName = "",
  type = APP_PHOTO_TYPES.GENERAL,
  comment = "",
  dateKey = "",
  file,
  imageData,
  fileName,
  stageId = "",
  location = null,
}) {
  if (!ustaId) throw new Error("Usta ID kerak");

  const { imageData: compressed, file: outFile } = await withTimeout(
    prepareCompressedPhoto({
      file,
      imageData,
      fileName,
    }),
    20_000,
    "Rasm siqish vaqti tugadi",
  );

  const dk = String(dateKey || "").trim();
  const stableTypes = [APP_PHOTO_TYPES.KELDI, APP_PHOTO_TYPES.KETDI];
  const id = stableTypes.includes(type) && dk
    ? `${ustaId}_${type}_${dk}`
    : createUstaPhotoId();

  const record = {
    id,
    imageData: compressed,
    imageUrl: compressed,
    storageUrl: "",
    uploadDate: new Date().toISOString(),
    ustaId: String(ustaId),
    ustaName: String(ustaName || ustaId),
    brigadeId: String(brigadeId || ""),
    brigadeName: String(brigadeName || ""),
    projectId: String(projectId || ""),
    projectName: String(projectName || ""),
    type: String(type || APP_PHOTO_TYPES.GENERAL),
    comment: String(comment || ""),
    dateKey: dk,
    stageId: String(stageId || ""),
    location: location && typeof location === "object" ? location : null,
  };

  try {
    const storagePath = buildPhotoStoragePath({
      folder: "stage_photos",
      projectId: projectId || "attendance",
      userId: ustaId,
    });
    const { downloadUrl, storagePath: sp } = await uploadImageToStorage(
      outFile,
      storagePath,
    );
    record.storageUrl = downloadUrl;
    record.imageUrl = downloadUrl;
    record.storagePath = sp;
    record.imageData = "";
  } catch (storageErr) {
    console.warn(
      "Storage yuklash xato, base64 saqlanadi:",
      storageErr?.message || storageErr,
    );
  }

  try {
    await withTimeout(
      addCollectionDocWithId("stage_photos", id, record),
      25_000,
      "Firestore saqlash vaqti tugadi",
    );
  } catch (e) {
    console.warn("Firebase rasm saqlanmadi, faqat mahalliy:", e);
  }

  if (projectId && stageId && type === APP_PHOTO_TYPES.STAGE) {
    const stepNumber = stageIdToStepNumber(stageId);
    if (stepNumber) {
      void upsertProjectStepFromUpload({
        projectId,
        stepNumber,
        stageId,
        imageUrl: record.imageUrl || record.storageUrl,
        uploadedBy: ustaId,
        uploadedByName: ustaName,
        location,
        stagePhotoId: id,
      });
    }
  }
  mergeIntoLocalCache(record);

  return { ...record, file: outFile };
}

/** Admin jadvali uchun: ustaId + sana + tur bo‘yicha rasm xaritasi. */
export function buildWorkPhotoLookup(photos) {
  const map = new Map();
  for (const p of photos || []) {
    const t = String(p?.type || "");
    if (t !== APP_PHOTO_TYPES.KELDI && t !== APP_PHOTO_TYPES.KETDI) continue;
    const dk =
      String(p.dateKey || "").trim() ||
      String(p.uploadDate || "").slice(0, 10);
    if (!p.ustaId || !dk) continue;
    map.set(`${p.ustaId}|${dk}|${t}`, p);
  }
  return map;
}

export function photoTypeLabel(type) {
  const t = String(type || "");
  if (t === APP_PHOTO_TYPES.KELDI) return "Keldi";
  if (t === APP_PHOTO_TYPES.KETDI) return "Ketdi";
  if (t === APP_PHOTO_TYPES.STAGE) return "Loyiha bosqichi";
  if (t === APP_PHOTO_TYPES.BEFORE) return "Oldin";
  if (t === APP_PHOTO_TYPES.AFTER) return "Keyin";
  return "Umumiy";
}
