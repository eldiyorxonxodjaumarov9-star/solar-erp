import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import {
  durationBetween,
  formatCaptionTime,
  isTelegramConfigured,
  telegramSendMessage,
  telegramSendPhoto,
} from "../telegramClient.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || "").toLowerCase();
    const name = String(file.originalname || "");
    const okMime =
      mime === "image/jpeg" ||
      mime === "image/jpg" ||
      mime === "image/png" ||
      mime === "image/pjpeg" ||
      mime === "image/x-png" ||
      mime === "image/webp";
    const okExt = /\.(jpe?g|png|webp)$/i.test(name);
    if (okMime || (!mime && okExt)) {
      cb(null, true);
      return;
    }
    cb(new Error("Fayl formati noto‘g‘ri"));
  },
});

const router = Router();

function runUpload(field) {
  return (req, res, next) => {
    upload.single(field)(req, res, (err) => {
      if (err) {
        const msg =
          err.message === "Fayl formati noto‘g‘ri"
            ? err.message
            : err.code === "LIMIT_FILE_SIZE"
              ? "Fayl juda katta"
              : "Fayl formati noto‘g‘ri";
        return res.status(400).json({ ok: false, error: msg });
      }
      next();
    });
  };
}

router.post("/arrival", runUpload("image"), async (req, res, next) => {
  try {
    if (!isTelegramConfigured()) {
      return res.status(503).json({ message: "Telegram sozlanmagan" });
    }
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ message: "Fayl tanlanmagan" });
    }

    const workerName = String(req.body.workerName || "Usta").trim() || "Usta";
    const workerId = String(req.body.workerId || "").trim();

    const arrivalIso = new Date().toISOString();
    const buf = await sharp(req.file.buffer)
      .rotate()
      .resize(900, 1200, { fit: "cover", position: "centre" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();

    const caption = [
      "Ishga keldim",
      `Usta: ${workerName}${workerId ? ` (id: ${workerId})` : ""}`,
      `Vaqt: ${formatCaptionTime(arrivalIso)}`,
      `ISO: ${arrivalIso}`,
    ].join("\n");

    await telegramSendPhoto(buf, "arrival.jpg", caption);

    return res.json({ ok: true, arrivalTime: arrivalIso });
  } catch (e) {
    next(e);
  }
});

router.post("/departure", runUpload("image"), async (req, res, next) => {
  try {
    if (!isTelegramConfigured()) {
      return res.status(503).json({ ok: false, error: "Telegram sozlanmagan" });
    }
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ ok: false, error: "Fayl tanlanmagan" });
    }

    const workerName = String(req.body.workerName || "Usta").trim() || "Usta";
    const workerId = String(req.body.workerId || "").trim();
    const arrivalTime = String(req.body.arrivalTime || "").trim();
    if (!arrivalTime) {
      return res.status(400).json({ ok: false, error: "Kelish vaqti yo‘q" });
    }

    const departureIso = new Date().toISOString();
    const totalWorkDuration = durationBetween(arrivalTime, departureIso);

    const buf = await sharp(req.file.buffer)
      .rotate()
      .resize(900, 1200, { fit: "cover", position: "centre" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();

    const caption = [
      "Ketdim",
      `Usta: ${workerName}${workerId ? ` (id: ${workerId})` : ""}`,
      `Kelish: ${formatCaptionTime(arrivalTime)}`,
      `Ketish: ${formatCaptionTime(departureIso)}`,
      `Jami ish: ${totalWorkDuration}`,
      `Ketish ISO: ${departureIso}`,
    ].join("\n");

    await telegramSendPhoto(buf, "departure.jpg", caption);

    return res.json({
      ok: true,
      departureTime: departureIso,
      totalWorkDuration,
    });
  } catch (e) {
    next(e);
  }
});

router.post("/day-off", async (req, res, next) => {
  try {
    if (!isTelegramConfigured()) {
      return res.status(503).json({ ok: false, error: "Telegram sozlanmagan" });
    }

    const workerName = String(req.body?.workerName || "Usta").trim() || "Usta";
    const workerId = String(req.body?.workerId || "").trim();
    const message = String(req.body?.message || "").trim();
    if (!message) {
      return res.status(400).json({ ok: false, error: "Xabar bo‘sh" });
    }

    const text = [
      "Bugun dam olaman",
      `Usta: ${workerName}${workerId ? ` (id: ${workerId})` : ""}`,
      `Xabar: ${message}`,
      `Yuborildi: ${formatCaptionTime(new Date().toISOString())}`,
    ].join("\n");

    await telegramSendMessage(text);
    return res.json({ message: "Muvaffaqiyatli yuborildi" });
  } catch (e) {
    next(e);
  }
});

router.post("/send-photo", runUpload("image"), async (req, res, next) => {
  try {
    if (!isTelegramConfigured()) {
      return res.status(503).json({ ok: false, error: "Telegram sozlanmagan" });
    }
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ ok: false, error: "Fayl tanlanmagan" });
    }
    const caption = String(req.body?.caption || "").slice(0, 1024);
    await telegramSendPhoto(
      req.file.buffer,
      req.file.originalname || "photo.jpg",
      caption,
    );
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post("/send-message", async (req, res, next) => {
  try {
    if (!isTelegramConfigured()) {
      return res.status(503).json({ message: "Telegram sozlanmagan" });
    }
    const message = String(req.body?.message || "").trim();
    if (!message) {
      return res.status(400).json({ message: "Xabar bo‘sh" });
    }
    await telegramSendMessage(message);
    return res.json({ message: "Muvaffaqiyatli yuborildi" });
  } catch (e) {
    next(e);
  }
});

export default router;
