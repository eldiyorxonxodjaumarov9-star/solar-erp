import { Router } from "express";
import multer from "multer";
import sharp from "sharp";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || "");
    const mime = String(file.mimetype || "").toLowerCase();
    const okMime =
      mime === "image/jpeg" ||
      mime === "image/jpg" ||
      mime === "image/pjpeg" ||
      mime === "image/png" ||
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

router.post("/process-image", (req, res, next) => {
  upload.single("image")(req, res, (err) => {
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
}, async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ ok: false, error: "Fayl tanlanmagan" });
    }

    const buf = await sharp(req.file.buffer)
      .rotate()
      .resize(900, 1200, { fit: "cover", position: "centre" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();

    const b64 = buf.toString("base64");
    return res.json({
      ok: true,
      imageData: `data:image/jpeg;base64,${b64}`,
    });
  } catch (e) {
    console.error("[upload/process-image]", e);
    return res.status(400).json({ ok: false, error: "Fayl formati noto‘g‘ri" });
  }
});

export default router;
