import { Router } from "express";
import { Worker } from "../models/Worker.js";
import { Project } from "../models/Project.js";
import { Brigade } from "../models/Brigade.js";
import { Expense } from "../models/Expense.js";
import { StagePhoto } from "../models/StagePhoto.js";
import { WorkLog } from "../models/WorkLog.js";

const router = Router();
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.post("/login", async (req, res) => {
  try {
    const login = String(req.body?.login || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const role = String(req.body?.role || "").trim().toLowerCase();
    const worker = await Worker.findOne({ loginLower: login }).lean();
    if (!worker || worker.password !== password) {
      return res.status(401).json({ ok: false, error: "Login yoki parol noto‘g‘ri." });
    }
    if (role && worker.role !== role) {
      return res.status(403).json({ ok: false, error: "Ruxsat yo‘q." });
    }
    return res.json({
      ok: true,
      session: {
        role: worker.role,
        login: worker.login,
        name: worker.fullName || worker.name || worker.login,
        workerId: String(worker._id),
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/workers", async (_req, res) => {
  const workers = await Worker.find().sort({ createdAt: -1 }).lean();
  res.json(workers.map((w) => ({ id: String(w._id), ...w })));
});

router.post("/workers", async (req, res) => {
  const payload = req.body || {};
  const worker = await Worker.create({
    ...payload,
    loginLower: String(payload.login || "").trim().toLowerCase(),
    fullName: payload.fullName || payload.name || "",
    name: payload.name || payload.fullName || "",
  });
  res.status(201).json({ id: String(worker._id), ...worker.toObject() });
});

router.put("/workers/:id", async (req, res) => {
  const payload = req.body || {};
  const worker = await Worker.findByIdAndUpdate(
    req.params.id,
    {
      ...payload,
      ...(payload.login ? { loginLower: String(payload.login).trim().toLowerCase() } : {}),
    },
    { new: true },
  ).lean();
  if (!worker) return res.status(404).json({ error: "Worker not found" });
  res.json({ id: String(worker._id), ...worker });
});

router.delete("/workers/:id", async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id);
    if (!worker) {
      return res.status(404).json({ message: "Xodim topilmadi" });
    }
    await worker.deleteOne();
    return res.status(200).json({ message: "Muvaffaqiyatli o‘chirildi" });
  } catch (error) {
    console.error("Delete worker error:", error);
    return res.status(500).json({ message: "Serverda xatolik" });
  }
});

router.get("/brigades", async (_req, res) => {
  const brigades = await Brigade.find().sort({ createdAt: -1 }).lean();
  res.json(brigades.map((b) => ({ id: String(b._id), ...b })));
});

router.post(
  "/brigades",
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const name = String(payload.name || "").trim();
    const phone = String(payload.phone || "").trim();

    console.log("[BRIGADES][POST] payload:", payload);

    if (!name) {
      return res.status(400).json({
        ok: false,
        error: "Brigada nomi majburiy.",
      });
    }

    const brigade = await Brigade.create({ name, phone });
    return res.status(201).json({ id: String(brigade._id), ...brigade.toObject() });
  }),
);

router.put("/brigades/:id", async (req, res) => {
  const brigade = await Brigade.findByIdAndUpdate(req.params.id, req.body || {}, { new: true }).lean();
  if (!brigade) return res.status(404).json({ error: "Brigade not found" });
  res.json({ id: String(brigade._id), ...brigade });
});

router.delete("/brigades/:id", async (req, res) => {
  try {
    const brigade = await Brigade.findById(req.params.id);
    if (!brigade) {
      return res.status(404).json({ message: "Brigada topilmadi" });
    }
    await brigade.deleteOne();
    return res.status(200).json({ message: "Muvaffaqiyatli o‘chirildi" });
  } catch (error) {
    console.error("Delete brigade error:", error);
    return res.status(500).json({ message: "Serverda xatolik" });
  }
});

router.get("/projects", async (_req, res) => {
  const projects = await Project.find().sort({ createdAt: -1 }).lean();
  res.json(projects.map((p) => ({ id: String(p._id), ...p })));
});

router.get("/projects/:id", async (req, res) => {
  const project = await Project.findById(req.params.id).lean();
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json({ id: String(project._id), ...project });
});

router.post("/projects", async (req, res) => {
  const payload = req.body || {};
  const project = await Project.create({
    ...payload,
    clientName: payload.clientName || payload.client_name || "",
    client_name: payload.client_name || payload.clientName || "",
    address: payload.address || payload.location || "",
    location: payload.location || payload.address || "",
    powerKw: payload.powerKw || String(payload.power || ""),
    power: Number(payload.power ?? payload.powerKw ?? 0) || 0,
    holat: payload.holat || (payload.status === "tugallandi" ? "Tugallandi" : "Jarayonda"),
    status: payload.status || (String(payload.holat || "").toLowerCase().includes("tug") ? "tugallandi" : "jarayonda"),
  });
  res.status(201).json({ id: String(project._id), ...project.toObject() });
});

router.put("/projects/:id", async (req, res) => {
  const payload = req.body || {};
  const project = await Project.findByIdAndUpdate(
    req.params.id,
    {
      ...payload,
      ...(payload.holat || payload.status
        ? {
            holat:
              payload.holat ||
              (String(payload.status || "").toLowerCase() === "tugallandi"
                ? "Tugallandi"
                : "Jarayonda"),
            status:
              payload.status ||
              (String(payload.holat || "").toLowerCase().includes("tug")
                ? "tugallandi"
                : "jarayonda"),
          }
        : {}),
    },
    { new: true },
  ).lean();
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json({ id: String(project._id), ...project });
});

router.put("/projects/:id/status", async (req, res) => {
  const status = String(req.body?.status || "jarayonda");
  const project = await Project.findByIdAndUpdate(
    req.params.id,
    {
      status,
      holat: status === "tugallandi" ? "Tugallandi" : "Jarayonda",
    },
    { new: true },
  ).lean();
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json({ id: String(project._id), ...project });
});

router.get("/photos/:project_id", async (req, res) => {
  const list = await StagePhoto.find({ projectId: req.params.project_id }).sort({ updatedAt: -1 }).lean();
  res.json(list.map((x) => ({ id: String(x._id), ...x })));
});

router.post("/photos", async (req, res) => {
  const doc = await StagePhoto.create(req.body || {});
  res.status(201).json({ id: String(doc._id), ...doc.toObject() });
});

router.put("/photos/:id", async (req, res) => {
  const doc = await StagePhoto.findByIdAndUpdate(req.params.id, req.body || {}, { new: true }).lean();
  if (!doc) return res.status(404).json({ error: "Photo not found" });
  res.json({ id: String(doc._id), ...doc });
});

router.delete("/photos/:id", async (req, res) => {
  try {
    const photo = await StagePhoto.findById(req.params.id);
    if (!photo) {
      return res.status(404).json({ message: "Rasm topilmadi" });
    }
    await photo.deleteOne();
    return res.status(200).json({ message: "Muvaffaqiyatli o‘chirildi" });
  } catch (error) {
    console.error("Delete photo error:", error);
    return res.status(500).json({ message: "Serverda xatolik" });
  }
});

router.get("/expenses", async (_req, res) => {
  const expenses = await Expense.find().sort({ createdAt: -1 }).lean();
  res.json(expenses.map((x) => ({ id: String(x._id), ...x })));
});

router.get("/expenses/:project_id", async (req, res) => {
  const expenses = await Expense.find({ projectId: req.params.project_id }).sort({ createdAt: -1 }).lean();
  res.json(expenses.map((x) => ({ id: String(x._id), ...x })));
});

router.post("/expenses", async (req, res) => {
  const expense = await Expense.create(req.body || {});
  res.status(201).json({ id: String(expense._id), ...expense.toObject() });
});

router.put("/expenses/:id", async (req, res) => {
  const expense = await Expense.findByIdAndUpdate(req.params.id, req.body || {}, { new: true }).lean();
  if (!expense) return res.status(404).json({ error: "Expense not found" });
  res.json({ id: String(expense._id), ...expense });
});

router.delete("/expenses/:id", async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ message: "Xarajat topilmadi" });
    }
    await expense.deleteOne();
    return res.status(200).json({ message: "Muvaffaqiyatli o‘chirildi" });
  } catch (error) {
    console.error("Delete expense error:", error);
    return res.status(500).json({ message: "Serverda xatolik" });
  }
});

router.post("/work_logs", async (req, res) => {
  const log = await WorkLog.create(req.body || {});
  res.status(201).json({ id: String(log._id), ...log.toObject() });
});

router.get("/work_logs", async (_req, res) => {
  const logs = await WorkLog.find().sort({ createdAt: -1 }).lean();
  res.json(logs.map((x) => ({ id: String(x._id), ...x })));
});

export default router;
