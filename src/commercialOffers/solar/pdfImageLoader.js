/**
 * Vite/Capacitor ichidagi statik rasmlarni PDF uchun yuklash.
 * WebView'da Image+crossOrigin ba'zan ishlamaydi — fetch ishonchliroq.
 */

function resolveAssetUrl(src) {
  const path = String(src || "").trim();
  if (!path) return "";
  if (/^https?:\/\//i.test(path) || /^data:/i.test(path) || /^blob:/i.test(path)) {
    return path;
  }

  const base =
    typeof import.meta !== "undefined" && import.meta.env?.BASE_URL
      ? String(import.meta.env.BASE_URL)
      : "/";
  const normalized = path.startsWith("/") ? path : `/${path}`;

  if (typeof window !== "undefined" && window.location?.origin) {
    const basePath = base.replace(/\/$/, "");
    if (basePath && basePath !== "") {
      return `${window.location.origin}${basePath}${normalized}`;
    }
    return `${window.location.origin}${normalized}`;
  }

  return normalized;
}

/**
 * @param {string} src
 * @returns {Promise<{ dataUrl: string, format: "PNG" | "JPEG", width: number, height: number }>}
 */
export async function loadImageForPdf(src) {
  const url = resolveAssetUrl(src);
  if (!url) throw new Error("Rasm yo'q");

  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return await blobToPdfImage(blob, url);
  } catch (fetchErr) {
    return await loadImageViaElement(url, fetchErr);
  }
}

async function blobToPdfImage(blob, urlHint) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas qo'llab-quvvatlanmaydi");
      ctx.drawImage(bitmap, 0, 0);
      return canvasToPdfImage(canvas, urlHint, blob.type);
    } finally {
      bitmap.close?.();
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    return await loadImageViaElement(objectUrl, null, blob.type, urlHint);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function canvasToPdfImage(canvas, urlHint, mimeType = "") {
  const width = canvas.width || 1;
  const height = canvas.height || 1;
  const lower = `${urlHint || ""} ${mimeType}`.toLowerCase();
  const format = lower.includes("png") ? "PNG" : "JPEG";
  const mime = format === "PNG" ? "image/png" : "image/jpeg";
  const quality = format === "PNG" ? undefined : 0.95;
  return {
    dataUrl: canvas.toDataURL(mime, quality),
    format,
    width,
    height,
  };
}

function loadImageViaElement(url, priorError, mimeType = "", urlHint = "") {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || 1;
      const height = img.naturalHeight || 1;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas qo'llab-quvvatlanmaydi"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(canvasToPdfImage(canvas, urlHint || url, mimeType));
    };
    img.onerror = () => {
      reject(priorError || new Error(`Rasm yuklanmadi: ${url}`));
    };
    img.src = url;
  });
}
