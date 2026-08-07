import { useCallback, useEffect, useState } from "react";
import {
  addCollectionDocWithId,
  deleteCollectionDoc,
  listCollection,
  subscribeCollection,
  updateCollectionDoc,
} from "../firebase/firestoreCrud";
import {
  createUstaPhotoId,
  loadUstaPhotos,
  persistUstaPhotos,
  USTA_PHOTOS_CHANGED_EVENT,
} from "../photos/ustaPhotoStorage";
import { canUseLocalFallback } from "../api/localFallback";
import { dataUrlToFile } from "../photos/appPhotoSave.js";
import { uploadImageToStorage, buildPhotoStoragePath } from "../services/storageUpload.js";
import {
  upsertProjectStepFromUpload,
  stageIdToStepNumber,
} from "../services/projectSteps.js";

async function enrichPhotoWithStorage(photo) {
  const dataUrl = String(photo?.imageData || photo?.imageUrl || "");
  if (!dataUrl.startsWith("data:")) return photo;
  try {
    const file = await dataUrlToFile(dataUrl, "stage.jpg");
    const storagePath = buildPhotoStoragePath({
      folder: "stage_photos",
      projectId: photo.projectId,
      userId: photo.ustaId,
    });
    const { downloadUrl, storagePath: sp } = await uploadImageToStorage(file, storagePath);
    return {
      ...photo,
      storageUrl: downloadUrl,
      imageUrl: downloadUrl,
      storagePath: sp,
      imageData: "",
    };
  } catch (e) {
    console.warn("Storage upload:", e?.message || e);
    return photo;
  }
}

async function syncProjectStepFromPhoto(photo) {
  if (String(photo?.type) !== "stage_photo" || !photo?.projectId || !photo?.stageId) return;
  const stepNumber = stageIdToStepNumber(photo.stageId);
  if (!stepNumber) return;
  await upsertProjectStepFromUpload({
    projectId: photo.projectId,
    stepNumber,
    stageId: photo.stageId,
    imageUrl: photo.imageUrl || photo.storageUrl,
    uploadedBy: photo.ustaId,
    uploadedByName: photo.ustaName,
    location: photo.location,
    stagePhotoId: photo.id,
  });
}

export function useUstaPhotos() {
  const [photos, setPhotos] = useState(() => loadUstaPhotos());

  const refresh = useCallback(async () => {
    try {
      const list = await listCollection("stage_photos");
      const next = Array.isArray(list)
        ? list.sort(
            (a, b) =>
              new Date(b.uploadDate || 0).getTime() - new Date(a.uploadDate || 0).getTime(),
          )
        : [];
      setPhotos(next);
      persistUstaPhotos(next);
    } catch (error) {
      console.error("Photos load error:", error);
      setPhotos(loadUstaPhotos());
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeCollection(
      "stage_photos",
      (list) => {
        const next = Array.isArray(list)
          ? list.sort(
              (a, b) =>
                new Date(b.uploadDate || 0).getTime() - new Date(a.uploadDate || 0).getTime(),
            )
          : [];
        setPhotos(next);
        persistUstaPhotos(next);
      },
      (error) => {
        console.error("Photos live sync error:", error);
      },
    );
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  useEffect(() => {
    const syncFromLocal = () => setPhotos(loadUstaPhotos());
    window.addEventListener("storage", syncFromLocal);
    window.addEventListener(USTA_PHOTOS_CHANGED_EVENT, syncFromLocal);
    return () => {
      window.removeEventListener("storage", syncFromLocal);
      window.removeEventListener(USTA_PHOTOS_CHANGED_EVENT, syncFromLocal);
    };
  }, []);

  const setAndPersist = (next) => {
    setPhotos(next);
    persistUstaPhotos(next);
  };

  const addPhoto = async (photo) => {
    const id =
      String(photo?.id || "").trim() ||
      createUstaPhotoId();
    let payload = { ...photo, id };
    payload = await enrichPhotoWithStorage(payload);
    try {
      const created = await addCollectionDocWithId("stage_photos", id, payload);
      void syncProjectStepFromPhoto(created);
      return created;
    } catch (error) {
      if (canUseLocalFallback(error)) {
        const created = { ...photo, id };
        setPhotos((prev) => {
          const next = [created, ...prev].sort(
            (a, b) => new Date(b.uploadDate || 0).getTime() - new Date(a.uploadDate || 0).getTime(),
          );
          persistUstaPhotos(next);
          return next;
        });
        return created;
      }
      throw error;
    }
  };

  const updatePhoto = async (photoId, payload) => {
    let patch = { ...payload };
    patch = await enrichPhotoWithStorage({ ...patch, id: photoId });
    try {
      await updateCollectionDoc("stage_photos", photoId, patch);
      void syncProjectStepFromPhoto({ ...patch, id: photoId });
    } catch (error) {
      if (!canUseLocalFallback(error)) throw error;
    }
    setPhotos((prev) => {
      const next = prev
        .map((x) => (x.id === photoId ? { ...x, ...payload } : x))
        .sort(
          (a, b) => new Date(b.uploadDate || 0).getTime() - new Date(a.uploadDate || 0).getTime(),
        );
      persistUstaPhotos(next);
      return next;
    });
    return { id: photoId, ...payload };
  };

  const deletePhoto = async (photoId) => {
    if (!photoId) return;
    try {
      await deleteCollectionDoc("stage_photos", photoId);
    } catch (error) {
      if (!canUseLocalFallback(error)) throw error;
    }
    setPhotos((prev) => {
      const next = prev.filter((x) => x.id !== photoId);
      persistUstaPhotos(next);
      return next;
    });
  };

  return {
    photos,
    setAndPersist,
    refresh,
    addPhoto,
    updatePhoto,
    deletePhoto,
  };
}