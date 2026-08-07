function sanitizeFilename(name) {
  const n = String(name || "tijoriy-taklif.pdf").trim() || "tijoriy-taklif.pdf";
  return n.replace(/[^\w.\-+()]/g, "_").slice(0, 120);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function triggerDownloadBlob(blob, filename) {
  const safe = sanitizeFilename(filename);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safe;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  requestAnimationFrame(() => {
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 2000);
  });
  return { ok: true, savedPath: safe, method: "download" };
}

/** APK — Downloads/Documents ga avtomatik saqlash (Share/papka tanlash yo‘q). */
async function savePdfOnNative(blob, filename) {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const base64 = await blobToBase64(blob);
  const safe = sanitizeFilename(filename);

  try {
    const perm = await Filesystem.checkPermissions();
    if (perm.publicStorage === "prompt" || perm.publicStorage === "denied") {
      await Filesystem.requestPermissions();
    }
  } catch {
    /* Eski plugin versiyalari */
  }

  const targets = [
    { directory: Directory.ExternalStorage, path: `Download/${safe}`, label: "Downloads" },
    { directory: Directory.Documents, path: safe, label: "Documents" },
    { directory: Directory.External, path: safe, label: "Fayllar" },
  ];

  for (const { directory, path, label } of targets) {
    try {
      await Filesystem.writeFile({
        path,
        data: base64,
        directory,
        recursive: true,
      });
      return { ok: true, savedPath: `${label}/${safe}`, method: "native" };
    } catch (e) {
      console.warn("[pdf] Native save urinishi xato:", directory, path, e);
    }
  }

  throw new Error("PDF saqlab bo'lmadi. Xotira ruxsatini tekshiring.");
}

/**
 * Desktop brauzer — yuklash; APK — Downloads ga avtomatik saqlash.
 * @returns {Promise<{ ok: boolean, savedPath?: string, method?: string }>}
 */
export async function deliverPdfBlob(blob, filename) {
  const safe = sanitizeFilename(filename);
  const Cap = typeof window !== "undefined" ? window.Capacitor : null;
  const isNative = Cap?.isNativePlatform?.() === true;

  if (isNative) {
    return savePdfOnNative(blob, safe);
  }

  return triggerDownloadBlob(blob, safe);
}
