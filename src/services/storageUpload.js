import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { ensureFirebaseAuth, storage } from "./firebase.js";
import { withTimeout } from "../lib/asyncTimeout.js";

const STORAGE_TIMEOUT_MS = 30_000;

/**
 * Rasmni Firebase Storage ga yuklaydi.
 * @param {File|Blob} file
 * @param {string} storagePath masalan `stage_photos/projectId/ustaId_ts.jpg`
 * @returns {Promise<{ downloadUrl: string; storagePath: string }>}
 */
export async function uploadImageToStorage(file, storagePath) {
  await withTimeout(
    ensureFirebaseAuth(),
    15_000,
    "Firebase ulanish vaqti tugadi",
  );
  if (!storage) {
    throw new Error("Firebase Storage sozlanmagan");
  }
  const path = String(storagePath || "").replace(/^\/+/, "");
  if (!path) throw new Error("Storage yo‘li kerak");

  const storageRef = ref(storage, path);
  const snapshot = await withTimeout(
    uploadBytes(storageRef, file, {
      contentType: file.type || "image/jpeg",
    }),
    STORAGE_TIMEOUT_MS,
    "Rasm yuklash vaqti tugadi (Storage)",
  );
  const downloadUrl = await withTimeout(
    getDownloadURL(snapshot.ref),
    15_000,
    "Yuklangan rasm URL olinmadi",
  );
  return { downloadUrl, storagePath: path };
}

export function buildPhotoStoragePath({
  folder = "photos",
  projectId = "",
  userId = "",
  suffix = "",
} = {}) {
  const ts = Date.now();
  const pid = String(projectId || "general").replace(/[^\w-]/g, "_");
  const uid = String(userId || "user").replace(/[^\w-]/g, "_");
  const ext = suffix || "jpg";
  return `${folder}/${pid}/${uid}_${ts}.${ext}`;
}
