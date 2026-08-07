/**
 * Rasm qayta ishlash: JPG/PNG, 3:4 markaz crop, server fallback.
 */

const JPEG_QUALITY = 0.82;
const TARGET_W = 900;
const ASPECT = 3 / 4;

function extensionLooksLikeImage(name) {
  return /\.(jpe?g|png|webp)$/i.test(String(name || ""));
}

/**
 * @param {File} file
 * @returns {{ ok: true } | { ok: false; error: string }}
 */
export function validateImageFile(file) {
  if (!file || !(file instanceof Blob)) {
    return { ok: false, error: "Fayl tanlanmagan" };
  }
  const type = String(file.type || "").toLowerCase();
  const name = "name" in file ? String(file.name || "") : "";
  const allowedMime =
    type === "image/jpeg" ||
    type === "image/jpg" ||
    type === "image/png" ||
    type === "image/webp" ||
    type === "image/pjpeg" ||
    type === "image/x-png" ||
    type === "";
  if (type && !allowedMime) {
    return { ok: false, error: "Fayl formati noto‘g‘ri" };
  }
  if (!type && !extensionLooksLikeImage(name)) {
    return { ok: false, error: "Fayl formati noto‘g‘ri" };
  }
  return { ok: true };
}

/**
 * @param {unknown} err
 * @returns {string}
 */
export function getImageErrorMessage(err) {
  const m = (err instanceof Error ? err.message : String(err || "")).trim();
  if (!m) return "Fayl formati noto‘g‘ri";

  if (m === "Fayl tanlanmadi") return "Fayl tanlanmagan";
  if (m.includes("Fayl tanlanmadi")) return "Fayl tanlanmagan";

  if (
    m.includes("Serverga ulanishda") ||
    m === "Serverga ulanish yo‘q"
  ) {
    return "Serverga ulanish yo‘q";
  }

  if (
    m.includes("firebase-auth-disabled") ||
    m.includes("auth/configuration-not-found")
  ) {
    return "Firebase o‘chiq, mahalliy saqlash rejimi ishlayapti.";
  }

  if (
    m === "Fayl tanlanmagan" ||
    m === "Fayl formati noto‘g‘ri" ||
    m === "Fayl juda katta"
  ) {
    return m;
  }
  if (m.startsWith("Fayl ") || m.includes("noto‘g‘ri")) {
    return m;
  }

  if (/Request failed|Failed to fetch|NetworkError|network|load failed/i.test(m)) {
    return "Serverga ulanish yo‘q";
  }

  if (/Canvas|createImageBitmap|O‘qish|Rasm yuklanmadi/i.test(m)) {
    return "Fayl formati noto‘g‘ri";
  }

  if (m.length > 5 && m.length < 160 && !/^\d+$/.test(m)) {
    return m;
  }

  return "Fayl formati noto‘g‘ri";
}

/**
 * @param {File} file
 * @returns {Promise<{ source: CanvasImageSource; sw: number; sh: number }>}
 */
async function loadRasterSource(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        sw: bitmap.width,
        sh: bitmap.height,
      };
    } catch {
      // continue
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Fayl formati noto‘g‘ri"));
      img.src = url;
    });
    URL.revokeObjectURL(url);
    const sw = img.naturalWidth || img.width;
    const sh = img.naturalHeight || img.height;
    if (!sw || !sh) {
      throw new Error("Fayl formati noto‘g‘ri");
    }
    return { source: img, sw, sh };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/**
 * 3:4 portrait, markaz crop, stretch yo‘q.
 * @param {File} file
 * @param {{ targetWidth?: number; quality?: number }} opts
 */
export async function processImage3x4DataUrl(file, opts = {}) {
  const v = validateImageFile(file);
  if (!v.ok) throw new Error(v.error);

  const targetWidth = opts.targetWidth ?? TARGET_W;
  const quality = opts.quality ?? JPEG_QUALITY;
  const targetHeight = Math.round(targetWidth / ASPECT);

  const { source, sw, sh } = await loadRasterSource(file);

  const imgAspect = sw / sh;
  let sx = 0;
  let sy = 0;
  let cw = sw;
  let ch = sh;

  if (imgAspect > ASPECT) {
    cw = Math.round(sh * ASPECT);
    sx = Math.round((sw - cw) / 2);
  } else if (imgAspect < ASPECT) {
    ch = Math.round(sw / ASPECT);
    sy = Math.round((sh - ch) / 2);
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Fayl formati noto‘g‘ri");
    ctx.drawImage(source, sx, sy, cw, ch, 0, 0, targetWidth, targetHeight);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    if (source && typeof source.close === "function") {
      try {
        source.close();
      } catch {
        // ignore
      }
    }
  }
}

/**
 * @param {File} file
 * @param {(path: string, fd: FormData) => Promise<{ imageData?: string }>} postFormDataFn
 */
export async function processImage3x4WithFallback(file, postFormDataFn) {
  const v = validateImageFile(file);
  if (!v.ok) throw new Error(v.error);

  try {
    return await processImage3x4DataUrl(file);
  } catch (clientErr) {
    console.warn("[image] client process failed, trying server", clientErr);
    const fd = new FormData();
    const name =
      "name" in file && file.name
        ? file.name
        : file.type === "image/png"
          ? "photo.png"
          : "photo.jpg";
    fd.append("image", file, name);
    const res = await postFormDataFn("/api/upload/process-image", fd);
    const data = res?.imageData;
    if (typeof data !== "string" || !data.startsWith("data:image/")) {
      throw new Error("Fayl formati noto‘g‘ri");
    }
    return data;
  }
}

/**
 * Faylni canvas orqali qisqartirish (localStorage hajmi uchun).
 * @param {File} file
 * @param {{ maxWidth?: number; quality?: number }} opts
 * @returns {Promise<string>} data URL (image/jpeg)
 */
export async function compressImageFileToDataUrl(file, opts = {}) {
  const maxWidth = opts.maxWidth ?? 1280;
  const quality = opts.quality ?? JPEG_QUALITY;

  const v = validateImageFile(file);
  if (!v.ok) throw new Error(v.error);

  const { source, sw, sh } = await loadRasterSource(file);

  try {
    let width = sw;
    let height = sh;
    if (width > maxWidth) {
      height = Math.round((height * maxWidth) / width);
      width = maxWidth;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Fayl formati noto‘g‘ri");
    ctx.drawImage(source, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    if (source && typeof source.close === "function") {
      try {
        source.close();
      } catch {
        // ignore
      }
    }
  }
}

/** @deprecated use processImage3x4DataUrl */
export function processWorkTimePhotoFile(file, opts = {}) {
  return processImage3x4DataUrl(file, opts);
}
