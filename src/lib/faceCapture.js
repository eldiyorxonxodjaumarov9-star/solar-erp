import { withTimeout, errorMessage } from "./asyncTimeout.js";

const VIDEO_CONSTRAINTS = [
  { video: { facingMode: { ideal: "user" } }, audio: false },
  { video: { facingMode: "user" }, audio: false },
  { video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false },
  { video: true, audio: false },
];

export const CAMERA_TIMEOUT_MS = 15_000;
export const CAPTURE_BLOB_TIMEOUT_MS = 10_000;

export function formatCameraError(err) {
  const name = err instanceof Error ? err.name : "";
  const msg = err instanceof Error ? err.message : String(err || "");
  const lower = `${name} ${msg}`.toLowerCase();

  if (
    lower.includes("vaqti tugadi") ||
    lower.includes("timeout") ||
    lower.includes("javob bermadi")
  ) {
    return "Kamera javob bermadi. Qayta urinib ko‘ring yoki kompyuterdan rasm tanlang.";
  }
  if (name === "NotAllowedError" || lower.includes("permission") || lower.includes("denied")) {
    return (
      "Kameraga ruxsat berilmadi. Windows: Settings → Privacy & security → Camera → " +
      "«Desktop apps» va SolarERP uchun ruxsatni yoqing."
    );
  }
  if (name === "NotFoundError" || lower.includes("not found") || lower.includes("topilmadi")) {
    return "Kamera topilmadi. Qurilmada kamera borligini tekshiring yoki fayldan rasm tanlang.";
  }
  if (
    name === "NotReadableError" ||
    lower.includes("could not start video") ||
    lower.includes("in use") ||
    lower.includes("band")
  ) {
    return "Kamera band yoki ochilmadi. Boshqa ilovani yoping yoki fayldan rasm tanlang.";
  }
  if (name === "OverconstrainedError") {
    return "Kamera mos kelmayapti. Qayta urinib ko‘ring yoki fayldan rasm tanlang.";
  }
  if (lower.includes("qo‘llab-quvvatlanmaydi") || lower.includes("secure")) {
    return "Bu muhitda kamera API ishlamaydi. Kompyuterdan rasm tanlang.";
  }
  if (msg && !/^could not start video source$/i.test(msg.trim())) {
    return msg;
  }
  return "Kamera ochilmadi. Qayta urinib ko‘ring yoki fayldan rasm tanlang.";
}

export function stopMediaStream(stream) {
  try {
    stream?.getTracks?.().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }
}

export async function acquireCameraStream(timeoutMs = CAMERA_TIMEOUT_MS) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Kamera qo‘llab-quvvatlanmaydi");
  }

  let lastError;
  for (const constraints of VIDEO_CONSTRAINTS) {
    try {
      return await withTimeout(
        navigator.mediaDevices.getUserMedia(constraints),
        timeoutMs,
        "Kamera javob bermadi. Qayta urinib ko‘ring",
      );
    } catch (e) {
      lastError = e;
      // Permission denied — qayta urinish foydasiz
      const name = e instanceof Error ? e.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") break;
    }
  }
  throw lastError || new Error("Kamera ochilmadi");
}

export async function attachStreamToVideo(video, stream, timeoutMs = 8000) {
  video.srcObject = stream;
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.muted = true;

  await withTimeout(
    new Promise((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onFail = () => {
        cleanup();
        reject(new Error("Kamera tasvirini ko‘rsatib bo‘lmadi"));
      };
      const cleanup = () => {
        video.removeEventListener("loadedmetadata", onReady);
        video.removeEventListener("error", onFail);
      };
      video.addEventListener("loadedmetadata", onReady, { once: true });
      video.addEventListener("error", onFail, { once: true });
      if (video.readyState >= 1) onReady();
    }),
    timeoutMs,
    "Kamera tasviri yuklanmadi",
  );

  try {
    await withTimeout(video.play(), 5000, "Kamera play timeout");
  } catch {
    /* Ba’zi WebViewlarda play() rad etilsa ham stream ishlaydi */
  }

  if (!video.videoWidth || !video.videoHeight) {
    // ba’zi qurilmalarda metadata kechikadi
    await new Promise((r) => setTimeout(r, 300));
  }
}

/**
 * canvas.toBlob ba’zan Electron’da hech qachon chaqirilmaydi — timeout + toDataURL zaxira.
 * @param {HTMLCanvasElement} canvas
 * @param {number} [quality]
 */
export async function canvasToJpegBlob(canvas, quality = 0.88) {
  const blob = await withTimeout(
    new Promise((resolve, reject) => {
      try {
        canvas.toBlob(
          (b) => (b && b.size > 0 ? resolve(b) : reject(new Error("Rasm yaratilmadi"))),
          "image/jpeg",
          quality,
        );
      } catch (e) {
        reject(e);
      }
    }),
    CAPTURE_BLOB_TIMEOUT_MS,
    "Rasm blob yaratilmadi (timeout)",
  ).catch(async (err) => {
    // Fallback: toDataURL → File
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (!dataUrl || !dataUrl.startsWith("data:image")) {
      throw err instanceof Error ? err : new Error(errorMessage(err, "Rasm yaratilmadi"));
    }
    const res = await fetch(dataUrl);
    const b = await res.blob();
    if (!b || b.size < 32) throw new Error("Rasm yaratilmadi");
    return b;
  });
  return blob;
}

/** Capacitor native kamera (APK). Desktop Electron’da odatda yo‘q. */
export async function captureWithCapacitorCamera() {
  const C = typeof window !== "undefined" ? window.Capacitor : null;
  if (!C?.isNativePlatform?.()) {
    throw new Error("Native kamera mavjud emas");
  }
  const { Camera, CameraResultType, CameraSource } = await import(
    "@capacitor/camera"
  );
  try {
    await Camera.requestPermissions({ permissions: ["camera"] });
  } catch {
    /* eski versiya */
  }
  const photo = await withTimeout(
    Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      correctOrientation: true,
    }),
    CAMERA_TIMEOUT_MS,
    "Kamera javob bermadi. Qayta urinib ko‘ring",
  );
  const dataUrl = String(photo?.dataUrl || "");
  if (!dataUrl.startsWith("data:image")) {
    throw new Error("Native kameradan rasm olinmadi");
  }
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  if (!blob?.size) throw new Error("Rasm bo‘sh");
  return new File([blob], `yuz-${Date.now()}.jpg`, {
    type: blob.type || "image/jpeg",
  });
}
