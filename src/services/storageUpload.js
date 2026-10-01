import { api } from '../api/http.js';
import { withTimeout } from "../lib/asyncTimeout.js";

const STORAGE_TIMEOUT_MS = 30_000;

/**
 * Rasmni Firebase Storage ga yuklaydi.
 * @param {File|Blob} file
 * @param {string} storagePath masalan `stage_photos/projectId/ustaId_ts.jpg`
 * @returns {Promise<{ downloadUrl: string; storagePath: string }>}
 */
export async function uploadImageToStorage(file, storagePath) {
  const path = String(storagePath || "").replace(/^\/+/, "");
  const parts=path.split('/');
  if(parts.length!==6 || parts[0]!=='private'||parts[2]!=='projects'||parts[4]!=='images')throw new Error('Private Storage scope kerak');
  const form=new FormData();form.append('image',file,file.name||'photo.jpg');form.append('projectId',parts[3]);form.append('ownerId',parts[1]);
  const result = await withTimeout(
    api.postFormData('/api/upload/private-image',form),
    STORAGE_TIMEOUT_MS,
    "Rasm yuklash vaqti tugadi (Storage)",
  );
  return { downloadUrl: result.downloadUrl, storagePath: result.storagePath };
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
  return `private/${uid}/projects/${pid}/images/${ts}_${crypto.randomUUID()}.${ext}`;
}
