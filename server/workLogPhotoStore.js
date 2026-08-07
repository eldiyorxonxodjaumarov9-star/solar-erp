import { addDocumentWithId } from "./db/store.js";
import { telegramDateToDateKey } from "../shared/telegramEventTypes.js";

/**
 * Keldi/ketdi rasmini stage_photos kolleksiyasiga saqlaydi (Telegram + dastur).
 */
export async function saveWorkLogPhotoToDb({
  workerId,
  workerName,
  mode,
  date,
  fileBuffer,
  mimeType = "image/jpeg",
}) {
  const wid = String(workerId || "").trim();
  if (!wid || !fileBuffer?.length) return null;

  const photoType = mode === "arrival" ? "keldi" : "ketdi";
  const dateKey =
    telegramDateToDateKey(date, new Date().toISOString()) ||
    new Date().toISOString().slice(0, 10);
  const id = `${wid}_${photoType}_${dateKey}`;
  const mime = String(mimeType || "image/jpeg").toLowerCase();
  const imageData = `data:${mime};base64,${fileBuffer.toString("base64")}`;

  const record = {
    id,
    imageData,
    imageUrl: imageData,
    uploadDate: new Date().toISOString(),
    ustaId: wid,
    ustaName: String(workerName || wid).trim() || "Usta",
    brigadeId: "",
    brigadeName: "",
    projectId: "",
    projectName: "",
    type: photoType,
    dateKey,
    comment: photoType === "keldi" ? "Kelish yuz surati" : "Ketish yuz surati",
    source: "work_log",
  };

  await addDocumentWithId("stage_photos", id, record);

  return record;
}
