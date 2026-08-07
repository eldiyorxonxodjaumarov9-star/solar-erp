export const USTA_PHOTOS_STORAGE_KEY = "ustaPhotos";

export const USTA_PHOTOS_CHANGED_EVENT = "solar-erp-usta-photos-changed";

/** @typedef {'before' | 'after' | 'general'} UstaPhotoType */

export const USTA_PHOTO_TYPE_OPTIONS = [
  { value: "before", label: "Oldin (before)" },
  { value: "after", label: "Keyin (after)" },
  { value: "general", label: "Umumiy" },
  { value: "stage_photo", label: "Tugallangan (vazifa rasmi)" },
  { value: "keldi", label: "Keldi (ish vaqti)" },
  { value: "ketdi", label: "Ketdi (ish vaqti)" },
];

/**
 * @typedef {{
 *   id: string;
 *   imageData: string;
 *   uploadDate: string;
 *   ustaId: string;
 *   ustaName: string;
 *   brigadeId: string;
 *   brigadeName: string;
 *   projectId: string;
 *   projectName: string;
 *   type: string;
 *   comment: string;
 * }} UstaPhoto
 */

/** @returns {UstaPhoto[]} */
export function loadUstaPhotos() {
  try {
    const raw = localStorage.getItem(USTA_PHOTOS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => {
        if (!p || typeof p.id !== "string") return false;
        const hasImage =
          typeof p.imageData === "string" &&
          p.imageData.length > 0;
        const hasVideo =
          typeof p.videoUrl === "string" && p.videoUrl.length > 0;
        if (!hasImage && !hasVideo) return false;
        return (
          typeof p.uploadDate === "string" &&
          typeof p.ustaId === "string" &&
          typeof p.ustaName === "string" &&
          typeof p.brigadeId === "string" &&
          typeof p.brigadeName === "string" &&
          typeof p.projectId === "string" &&
          typeof p.projectName === "string" &&
          typeof p.type === "string" &&
          typeof p.comment === "string"
        );
      })
      .map((p) => ({ ...p }));
  } catch {
    return [];
  }
}

/** @param {UstaPhoto[]} list */
export function persistUstaPhotos(list) {
  try {
    localStorage.setItem(USTA_PHOTOS_STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(USTA_PHOTOS_CHANGED_EVENT));
  } catch (error) {
    console.error("Usta photos localStorage save error:", error);
  }
}

export function createUstaPhotoId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `ph-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
