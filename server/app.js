import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import apiRouter from "./routes/index.js";
import uploadRouter from "./routes/upload.js";
import telegramWorkRouter from "./routes/telegramWork.js";

function buildCorsOriginMatcher() {
  const fromList = (process.env.FRONTEND_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const single = process.env.FRONTEND_ORIGIN?.trim();
  const defaults = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
  ];
  const allowList = [...new Set([...(single ? [single] : []), ...defaults, ...fromList])];
  const isDev = process.env.NODE_ENV !== "production";

  return (origin, cb) => {
    if (!origin) {
      return cb(null, true);
    }
    if (allowList.includes(origin)) {
      return cb(null, true);
    }
    if (isDev) {
      try {
        const u = new URL(origin);
        if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
          return cb(null, true);
        }
      } catch {
        // ignore
      }
    }
    return cb(null, false);
  };
}

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: buildCorsOriginMatcher(),
      credentials: false,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );
  app.use(express.json({ limit: "20mb" }));
  app.use("/api/upload", uploadRouter);
  app.use("/api/telegram", telegramWorkRouter);
  app.use((req, _res, next) => {
    const ct = String(req.headers["content-type"] || "");
    if (ct.includes("multipart/form-data")) {
      console.log(`[API] ${req.method} ${req.originalUrl} (multipart)`);
    } else {
      console.log(`[API] ${req.method} ${req.originalUrl}`, req.body || {});
    }
    next();
  });
  app.use((req, res, next) => {
    if (req.path === "/api/health" || req.path === "/api/db-status") return next();
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        message: "Database ulanmagan. MongoDB ishga tushganini tekshiring.",
      });
    }
    return next();
  });

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.get("/api/db-status", (_req, res) => {
    const states = ["disconnected", "connected", "connecting", "disconnecting"];
    const readyState = mongoose.connection.readyState;
    res.json({
      ok: true,
      db: states[readyState] || String(readyState),
    });
  });

  app.use("/api", apiRouter);
  app.use((error, _req, res, _next) => {
    console.error("[API] Unhandled error:", error);
    if (error?.name === "ValidationError") {
      const first = Object.values(error.errors || {})[0];
      return res.status(400).json({
        message: first?.message || "Validation xatosi.",
      });
    }
    res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  });
  return app;
}
