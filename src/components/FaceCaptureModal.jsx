import { useCallback, useEffect, useRef, useState } from "react";
import { prepareCompressedPhoto } from "../photos/appPhotoSave";
import { withTimeout, attendanceLog, errorMessage } from "../lib/asyncTimeout";
import {
  acquireCameraStream,
  attachStreamToVideo,
  canvasToJpegBlob,
  captureWithCapacitorCamera,
  formatCameraError,
  stopMediaStream,
} from "../lib/faceCapture";

/**
 * Dastur ichida yuz surati. Desktop: getUserMedia + fayl tanlash fallback.
 */
export default function FaceCaptureModal({ open, title, onClose, onCapture }) {
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const streamRef = useRef(null);
  const startingRef = useRef(false);
  const cancelledRef = useRef(false);
  const onCaptureRef = useRef(onCapture);
  const [error, setError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [showFileFallback, setShowFileFallback] = useState(false);

  useEffect(() => {
    onCaptureRef.current = onCapture;
  }, [onCapture]);

  const emitCapture = useCallback((payload) => {
    onCaptureRef.current?.(payload);
  }, []);

  const stopCamera = useCallback(() => {
    startingRef.current = false;
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  }, []);

  const waitForVideoElement = useCallback(async () => {
    for (let i = 0; i < 50; i += 1) {
      if (cancelledRef.current) throw new Error("Bekor qilindi");
      if (videoRef.current) return videoRef.current;
      await new Promise((r) => requestAnimationFrame(r));
    }
    throw new Error("Kamera oynasi tayyor emas");
  }, []);

  const startCamera = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    cancelledRef.current = false;
    setError("");
    setCameraReady(false);
    setShowFileFallback(false);
    setStatus("Kamera ochilmoqda…");
    attendanceLog("start capture");

    try {
      stopCamera();
      startingRef.current = true;

      // APK: native kamera
      try {
        const C = window.Capacitor;
        if (C?.isNativePlatform?.()) {
          setStatus("Native kamera…");
          const file = await captureWithCapacitorCamera();
          setStatus("Rasm siqilmoqda…");
          const prepared = await withTimeout(
            prepareCompressedPhoto({ file, fileName: file.name }),
            20_000,
            "Rasm tayyorlash vaqti tugadi",
          );
          attendanceLog("image captured", "capacitor");
          stopCamera();
          if (!cancelledRef.current) emitCapture(prepared);
          return;
        }
      } catch (nativeErr) {
        attendanceLog("native camera failed", errorMessage(nativeErr));
        /* desktop / fallback ga o‘tamiz */
      }

      const video = await waitForVideoElement();
      setStatus("Kamera ruxsati…");
      const stream = await acquireCameraStream();
      if (cancelledRef.current) {
        stopMediaStream(stream);
        return;
      }
      streamRef.current = stream;
      attendanceLog("permission granted / camera started");
      setStatus("Kamera tasviri…");
      await attachStreamToVideo(video, stream);
      if (cancelledRef.current) {
        stopCamera();
        return;
      }
      setCameraReady(true);
      setStatus("");
      attendanceLog("camera ready");
    } catch (e) {
      setCameraReady(false);
      const msg = formatCameraError(e);
      setError(msg);
      setShowFileFallback(true);
      setStatus("");
      attendanceLog("camera error", msg);
    } finally {
      startingRef.current = false;
    }
  }, [emitCapture, stopCamera, waitForVideoElement]);

  useEffect(() => {
    if (!open) {
      cancelledRef.current = true;
      stopCamera();
      setError("");
      setBusy(false);
      setStatus("");
      setShowFileFallback(false);
      return undefined;
    }

    cancelledRef.current = false;
    const timer = setTimeout(() => {
      void startCamera();
    }, 80);

    return () => {
      clearTimeout(timer);
      cancelledRef.current = true;
      stopCamera();
    };
  }, [open, startCamera, stopCamera]);

  const finishWithFile = async (rawFile) => {
    if (!rawFile) throw new Error("Rasm tanlanmadi");
    setStatus("Rasm siqilmoqda…");
    const prepared = await withTimeout(
      prepareCompressedPhoto({ file: rawFile, fileName: rawFile.name }),
      20_000,
      "Rasm tayyorlash vaqti tugadi",
    );
    if (!prepared?.file || prepared.file.size < 32) {
      throw new Error("Rasm bo‘sh yoki yaroqsiz");
    }
    attendanceLog("image captured", "file");
    stopCamera();
    emitCapture(prepared);
  };

  const handleCapture = async () => {
    const video = videoRef.current;
    if (!video || !cameraReady || busy) return;
    setBusy(true);
    setError("");
    setStatus("Rasm olinmoqda…");
    try {
      const vw = video.videoWidth || 0;
      const vh = video.videoHeight || 0;
      if (!vw || !vh) {
        throw new Error("Kamera tasviri tayyor emas (0×0). Qayta urinib ko‘ring.");
      }
      const cropW = vw * 0.58;
      const cropH = vh * 0.74;
      const cropX = (vw - cropW) / 2;
      const cropY = (vh - cropH) / 2;

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(cropW));
      canvas.height = Math.max(1, Math.round(cropH));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Kamera tayyor emas");
      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      const blob = await canvasToJpegBlob(canvas, 0.88);
      const rawFile = new File([blob], `yuz-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });
      await finishWithFile(rawFile);
    } catch (e) {
      const msg = errorMessage(e, "Surat olinmadi");
      setError(msg);
      setShowFileFallback(true);
      attendanceLog("capture failed", msg);
    } finally {
      setBusy(false);
      setStatus("");
    }
  };

  const handleFilePicked = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      await finishWithFile(file);
    } catch (e) {
      setError(errorMessage(e, "Rasm o‘qilmadi"));
    } finally {
      setBusy(false);
      setStatus("");
    }
  };

  const handleClose = () => {
    cancelledRef.current = true;
    stopCamera();
    setBusy(false);
    onClose?.();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1300] flex flex-col bg-black text-white">
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3 pt-[calc(env(safe-area-inset-top,0px)+12px)]">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{title || "Yuz surati"}</p>
          <p className="text-xs text-slate-300">
            {status || (cameraReady ? "Old kamera" : "Kamera / fayl")}
          </p>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/20"
        >
          Bekor qilish
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="h-full max-h-[72vh] w-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />
        {!cameraReady ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
            {!error ? (
              <>
                <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                <p className="text-sm text-slate-200">{status || "Kamera ochilmoqda…"}</p>
              </>
            ) : (
              <p className="text-sm text-red-300">{error}</p>
            )}
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className="border-[3px] border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
              style={{
                width: "min(72vw, 280px)",
                height: "min(88vw, 360px)",
                borderRadius: "50%",
              }}
            />
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-3 border-t border-white/10 bg-slate-950/90 px-4 py-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
        {error && cameraReady ? (
          <p className="text-center text-xs text-red-300">{error}</p>
        ) : !error ? (
          <p className="text-center text-xs text-slate-400">
            Yuzingiz oval ichida bo‘lsin
          </p>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void handleFilePicked(e)}
        />

        {(error || showFileFallback) && (
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void startCamera()}
              className="w-full rounded-xl border border-white/20 py-2.5 text-sm font-medium text-slate-200 disabled:opacity-40"
            >
              Qayta urinish
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-xl border border-amber-400/50 bg-amber-500/20 py-2.5 text-sm font-medium text-amber-100 disabled:opacity-40"
            >
              Kompyuterdan rasm tanlash
            </button>
          </div>
        )}

        {!error && !cameraReady ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-xl border border-white/20 py-2.5 text-sm font-medium text-slate-200 disabled:opacity-40"
          >
            Rasm faylini tanlash
          </button>
        ) : null}

        <button
          type="button"
          disabled={!cameraReady || busy}
          onClick={() => void handleCapture()}
          className="w-full rounded-xl bg-brand-600 py-3.5 text-base font-bold disabled:opacity-40"
        >
          {busy ? status || "Saqlanmoqda…" : "Suratga olish"}
        </button>
      </div>
    </div>
  );
}
