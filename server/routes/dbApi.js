import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  addDocument,
  addDocumentWithId,
  countWhere,
  deleteDocument,
  findAssistantByLogin,
  findWorkerByLogin,
  getDocument,
  importCollection,
  incrementWorkerPoints,
  listCollection,
  mergeProjectStageLock,
  saveWorkerPoints,
  syncCollectionsMerge,
  updateDocument,
} from "../db/store.js";
import { markMasterLogin } from "../masterDailyUploads.js";
import {
  fetchReminderFirestoreData,
  isFirebaseServerConfigured,
} from "../firebaseServer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, "..", "..", "data", "uploads");
const upload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, cb) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      cb(null, UPLOADS_DIR);
    },
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname || "") || ".mp4";
      cb(null, `stage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 55 * 1024 * 1024 },
});

export function createDbRouter() {
  const router = express.Router();

  router.post("/upload/stage-video", upload.single("video"), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ ok: false, error: "Video fayl kerak" });
      }
      const rel = path.relative(path.join(__dirname, "..", ".."), req.file.path);
      const videoUrl = `/api/media/${req.file.filename}`;
      return res.json({
        ok: true,
        videoUrl,
        storagePath: rel.replace(/\\/g, "/"),
        fileName: req.file.originalname || req.file.filename,
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error?.message || "Xato" });
    }
  });

  router.post("/project_stage_locks/:projectId/merge-stage", async (req, res) => {
    try {
      const { stageId, stagePayload } = req.body || {};
      const item = await mergeProjectStageLock(
        req.params.projectId,
        stageId,
        stagePayload,
      );
      return res.json({ ok: true, item });
    } catch (error) {
      return res.status(400).json({ ok: false, error: error?.message || "Xato" });
    }
  });

  router.post("/workers/:id/points/increment", async (req, res) => {
    try {
      const { field, amount, totalDelta } = req.body || {};
      const item = await incrementWorkerPoints(
        req.params.id,
        field,
        amount,
        totalDelta,
      );
      return res.json({ ok: true, item });
    } catch (error) {
      return res.status(400).json({ ok: false, error: error?.message || "Xato" });
    }
  });

  router.put("/workers/:id/points", async (req, res) => {
    try {
      const item = await saveWorkerPoints(req.params.id, req.body?.points || req.body);
      return res.json({ ok: true, item });
    } catch (error) {
      return res.status(400).json({ ok: false, error: error?.message || "Xato" });
    }
  });

  router.post("/sync-all", async (req, res) => {
    try {
      const collections =
        req.body?.collections && typeof req.body.collections === "object"
          ? req.body.collections
          : req.body && typeof req.body === "object"
            ? req.body
            : {};
      const result = await syncCollectionsMerge(collections);
      return res.json({ ok: true, ...result });
    } catch (error) {
      console.error("POST /api/db/sync-all", error);
      return res.status(400).json({ ok: false, error: error?.message || "Xato" });
    }
  });

  router.post("/import/:collection", async (req, res) => {
    try {
      const docs = Array.isArray(req.body?.items) ? req.body.items : req.body;
      const count = await importCollection(req.params.collection, docs);
      return res.json({ ok: true, count });
    } catch (error) {
      return res.status(400).json({ ok: false, error: error?.message || "Xato" });
    }
  });

  router.get("/:collection/count", async (req, res) => {
    try {
      const { field, value } = req.query;
      const count = await countWhere(req.params.collection, field, value);
      return res.json({ ok: true, count });
    } catch (error) {
      return res.status(400).json({ ok: false, error: error?.message || "Xato" });
    }
  });

  router.post("/:collection/with-id/:id", async (req, res) => {
    try {
      const created = await addDocumentWithId(
        req.params.collection,
        req.params.id,
        req.body || {},
      );
      return res.status(201).json({ ok: true, item: created });
    } catch (error) {
      return res.status(400).json({ ok: false, error: error?.message || "Xato" });
    }
  });

  router.get("/:collection/:id", async (req, res) => {
    try {
      const doc = await getDocument(req.params.collection, req.params.id);
      if (!doc) return res.status(404).json({ ok: false, error: "Topilmadi" });
      return res.json({ ok: true, item: doc });
    } catch (error) {
      return res.status(400).json({ ok: false, error: error?.message || "Xato" });
    }
  });

  router.put("/:collection/:id", async (req, res) => {
    try {
      const updated = await updateDocument(
        req.params.collection,
        req.params.id,
        req.body || {},
      );
      return res.json({ ok: true, item: updated });
    } catch (error) {
      return res.status(400).json({ ok: false, error: error?.message || "Xato" });
    }
  });

  router.delete("/:collection/:id", async (req, res) => {
    try {
      await deleteDocument(req.params.collection, req.params.id);
      return res.json({ ok: true });
    } catch (error) {
      return res.status(400).json({ ok: false, error: error?.message || "Xato" });
    }
  });

  router.get("/:collection", async (req, res) => {
    try {
      const list = await listCollection(req.params.collection);
      return res.json({ ok: true, items: list });
    } catch (error) {
      console.error("GET /api/db/:collection", error);
      return res.status(400).json({ ok: false, error: error?.message || "Xato" });
    }
  });

  router.post("/:collection", async (req, res) => {
    try {
      const created = await addDocument(req.params.collection, req.body || {});
      return res.status(201).json({ ok: true, item: created });
    } catch (error) {
      return res.status(400).json({ ok: false, error: error?.message || "Xato" });
    }
  });

  return router;
}

async function findWorkerLogin(loginLower) {
  const worker = await findWorkerByLogin(loginLower);
  if (worker) return worker;
  if (!isFirebaseServerConfigured()) return null;
  try {
    const { workers } = await fetchReminderFirestoreData({ bypassCache: true });
    return (
      workers.find(
        (w) => String(w?.login || "").trim().toLowerCase() === loginLower,
      ) || null
    );
  } catch {
    return null;
  }
}

async function findAssistantLogin(loginLower) {
  const assistant = await findAssistantByLogin(loginLower);
  if (assistant) return assistant;
  if (!isFirebaseServerConfigured()) return null;
  try {
    const { initializeApp, getApps } = await import("firebase/app");
    const { getAuth, signInAnonymously } = await import("firebase/auth");
    const { collection, getDocs, getFirestore, query } = await import(
      "firebase/firestore"
    );
    const { resolveFirebaseConfigFromEnv } = await import(
      "../../shared/firebasePublicConfig.js"
    );
    const cfg = resolveFirebaseConfigFromEnv(process.env);
    const app = getApps().length ? getApps()[0] : initializeApp(cfg);
    const auth = getAuth(app);
    if (!auth.currentUser) await signInAnonymously(auth);
    const db = getFirestore(app);
    const snap = await getDocs(query(collection(db, "assistants")));
    const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    return (
      list.find(
        (a) => String(a?.login || "").trim().toLowerCase() === loginLower,
      ) || null
    );
  } catch {
    return null;
  }
}

export async function handleSqlLogin(req, res) {
  try {
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const role = String(payload.role || "").trim().toLowerCase();
    const loginLower = String(payload.login || "").trim().toLowerCase();
    const password = String(payload.password || "");

    if (!loginLower || !password) {
      return res.status(400).json({ ok: false, error: "Login va parol kerak" });
    }

    if (role === "usta" || role === "master") {
      const worker = await findWorkerLogin(loginLower);
      if (!worker || String(worker.password || "") !== password) {
        return res.status(401).json({ ok: false, error: "Login yoki parol noto'g'ri." });
      }
      const session = {
        role: "usta",
        login: String(worker.login || "").trim() || loginLower,
        name:
          String(worker.fullName || "").trim() ||
          String(worker.name || "").trim() ||
          "Usta",
        workerId: worker.id,
      };
      markMasterLogin(session.workerId, session.login, session.name);
      return res.json({ ok: true, session });
    }

    if (role === "asisten") {
      const assistant = await findAssistantLogin(loginLower);
      if (!assistant || String(assistant.password || "") !== password) {
        return res.status(401).json({ ok: false, error: "Login yoki parol noto'g'ri." });
      }
      const session = {
        role: "asisten",
        login: String(assistant.login || "").trim() || loginLower,
        name: String(assistant.fullName || "").trim() || "Asisten",
        assistantId: assistant.id,
        masterName: "Administrator",
      };
      return res.json({ ok: true, session });
    }

    return res.status(400).json({ ok: false, error: "Noto'g'ri role" });
  } catch (error) {
    console.error("SQL login error:", error);
    return res.status(500).json({ ok: false, error: "Server xatosi" });
  }
}
