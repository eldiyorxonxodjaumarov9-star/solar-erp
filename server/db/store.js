import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const COLLECTIONS = [
  "workers",
  "brigades",
  "projects",
  "expenses",
  "stage_photos",
  "work_logs",
  "user_activity_logs",
  "usta_yorijnoma",
  "jalbalar",
  "assistants",
  "project_worker_days",
  "project_stage_locks",
  "telegram_events",
  "telegramAttendanceLogs",
  "dailyAttendanceReports",
];

const SQLITE_PATH =
  process.env.SQLITE_PATH ||
  path.join(__dirname, "..", "..", "data", "solar-erp.db");

let sqliteDb = null;
/** @type {import('pg').Pool | null} */
let pgPool = null;
let driver = "sqlite";

function nowIso() {
  return new Date().toISOString();
}

function parseCreatedAt(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isNaN(t) ? 0 : t;
  }
  if (typeof value === "object") {
    if (typeof value.seconds === "number") return value.seconds * 1000;
    if (typeof value.toDate === "function") {
      try {
        return value.toDate().getTime();
      } catch {
        return 0;
      }
    }
    if (typeof value._seconds === "number") return value._seconds * 1000;
  }
  return 0;
}

function sortByCreatedAtDesc(items) {
  return [...items].sort(
    (a, b) => parseCreatedAt(b.createdAt) - parseCreatedAt(a.createdAt),
  );
}

function assertCollection(name) {
  if (!COLLECTIONS.includes(name)) {
    throw new Error(`Noto'g'ri kolleksiya: ${name}`);
  }
}

function newId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function stripMeta(row) {
  if (!row || typeof row !== "object") return row;
  const { collection: _c, ...rest } = row;
  return rest;
}

function initSqlite() {
  const dir = path.dirname(SQLITE_PATH);
  fs.mkdirSync(dir, { recursive: true });
  sqliteDb = new Database(SQLITE_PATH);
  sqliteDb.pragma("journal_mode = WAL");
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (collection, id)
    );
    CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents(collection);
    CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(collection, created_at DESC);
  `);
  driver = "sqlite";
  console.log(`[db] SQLite: ${SQLITE_PATH}`);
}

async function initPostgres() {
  const { default: pg } = await import("pg");
  pgPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (collection, id)
    );
    CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents(collection);
    CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(collection, created_at DESC);
  `);
  driver = "postgres";
  console.log("[db] PostgreSQL ulanish ochildi");
}

export async function initDb() {
  if (sqliteDb || pgPool) return;
  if (process.env.DATABASE_URL) {
    await initPostgres();
  } else {
    initSqlite();
  }
}

export function getDbDriver() {
  return driver;
}

export function getSqlitePath() {
  return SQLITE_PATH;
}

async function sqliteAll(collection) {
  const rows = sqliteDb
    .prepare(
      `SELECT id, data, created_at AS createdAt, updated_at AS updatedAt
       FROM documents WHERE collection = ?`,
    )
    .all(collection);
  return rows.map((r) => {
    let data = {};
    try {
      data = JSON.parse(r.data || "{}");
    } catch {
      data = {};
    }
    return { id: r.id, ...data, createdAt: data.createdAt || r.createdAt, updatedAt: data.updatedAt || r.updatedAt };
  });
}

async function pgAll(collection) {
  const res = await pgPool.query(
    `SELECT id, data, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM documents WHERE collection = $1`,
    [collection],
  );
  return res.rows.map((r) => ({
    id: r.id,
    ...(r.data || {}),
    createdAt: r.data?.createdAt || r.createdAt,
    updatedAt: r.data?.updatedAt || r.updatedAt,
  }));
}

export async function listCollection(name) {
  assertCollection(name);
  await initDb();
  const items = driver === "postgres" ? await pgAll(name) : await sqliteAll(name);
  return sortByCreatedAtDesc(items);
}

export async function getDocument(name, id) {
  assertCollection(name);
  await initDb();
  if (driver === "postgres") {
    const res = await pgPool.query(
      `SELECT id, data FROM documents WHERE collection = $1 AND id = $2`,
      [name, id],
    );
    if (!res.rows[0]) return null;
    return { id: res.rows[0].id, ...(res.rows[0].data || {}) };
  }
  const row = sqliteDb
    .prepare(`SELECT id, data FROM documents WHERE collection = ? AND id = ?`)
    .get(name, id);
  if (!row) return null;
  let data = {};
  try {
    data = JSON.parse(row.data || "{}");
  } catch {
    data = {};
  }
  return { id: row.id, ...data };
}

export async function countWhere(name, field, value) {
  assertCollection(name);
  const items = await listCollection(name);
  return items.filter((doc) => String(doc?.[field] ?? "") === String(value ?? "")).length;
}

async function upsertDocument(name, id, payload, { merge = true } = {}) {
  assertCollection(name);
  await initDb();
  const ts = nowIso();
  const existing = await getDocument(name, id);
  const base = merge && existing ? { ...existing } : {};
  delete base.id;
  const data = {
    ...base,
    ...(payload || {}),
    createdAt: base.createdAt || existing?.createdAt || ts,
    updatedAt: ts,
  };

  if (driver === "postgres") {
    await pgPool.query(
      `INSERT INTO documents (collection, id, data, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4::timestamptz, $5::timestamptz)
       ON CONFLICT (collection, id) DO UPDATE SET
         data = EXCLUDED.data,
         updated_at = EXCLUDED.updated_at`,
      [name, id, JSON.stringify(data), data.createdAt, data.updatedAt],
    );
  } else {
    sqliteDb
      .prepare(
        `INSERT INTO documents (collection, id, data, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(collection, id) DO UPDATE SET
           data = excluded.data,
           updated_at = excluded.updated_at`,
      )
      .run(name, id, JSON.stringify(data), data.createdAt, data.updatedAt);
  }
  return { id, ...data };
}

export async function addDocument(name, payload) {
  const id = newId();
  return upsertDocument(name, id, payload, { merge: false });
}

export async function addDocumentWithId(name, id, payload) {
  const docId = String(id || "").trim() || newId();
  return upsertDocument(name, docId, payload, { merge: true });
}

export async function updateDocument(name, id, payload) {
  const docId = String(id || "").trim();
  if (!docId) throw new Error("id kerak");
  return upsertDocument(name, docId, payload, { merge: true });
}

export async function deleteDocument(name, id) {
  assertCollection(name);
  await initDb();
  const docId = String(id || "").trim();
  if (!docId) return;
  if (driver === "postgres") {
    await pgPool.query(`DELETE FROM documents WHERE collection = $1 AND id = $2`, [
      name,
      docId,
    ]);
  } else {
    sqliteDb
      .prepare(`DELETE FROM documents WHERE collection = ? AND id = ?`)
      .run(name, docId);
  }
}

export async function mergeProjectStageLock(projectId, stageId, stagePayload) {
  const pid = String(projectId || "").trim();
  const sid = String(stageId || "").trim();
  if (!pid || !sid) throw new Error("projectId va stageId kerak");
  const existing = (await getDocument("project_stage_locks", pid)) || { projectId: pid };
  const stages = { ...(existing.stages || {}) };
  stages[sid] = {
    ...(stages[sid] || {}),
    ...(stagePayload || {}),
    updatedAt: nowIso(),
  };
  return upsertDocument("project_stage_locks", pid, {
    projectId: pid,
    stages,
  });
}

export async function incrementWorkerPoints(workerId, field, amount, totalDelta) {
  const wid = String(workerId || "").trim();
  if (!wid) return;
  const doc = (await getDocument("workers", wid)) || { id: wid };
  const points = { ...(doc.points || {}) };
  const n = Number(amount) || 0;
  const td = Number(totalDelta);
  points[field] = Math.max(0, (Number(points[field]) || 0) + n);
  if (Number.isFinite(td)) {
    points.total = Math.max(0, (Number(points.total) || 0) + td);
  }
  points.updatedAt = nowIso();
  return upsertDocument("workers", wid, { points }, { merge: true });
}

export async function saveWorkerPoints(workerId, points) {
  const wid = String(workerId || "").trim();
  if (!wid) return;
  const payload = {
    ...(points || {}),
    updatedAt: nowIso(),
  };
  return upsertDocument("workers", wid, { points: payload }, { merge: true });
}

/** Migratsiya: bir kolleksiyaga ko‘p hujjat import. */
export async function importCollection(name, docs, { merge = false } = {}) {
  assertCollection(name);
  if (!Array.isArray(docs)) return 0;
  let count = 0;
  for (const doc of docs) {
    if (!doc || typeof doc !== "object") continue;
    const id = String(doc.id || "").trim() || newId();
    const { id: _drop, ...rest } = doc;
    await upsertDocument(name, id, rest, { merge });
    count += 1;
  }
  return count;
}

/** Bir nechta kolleksiyani merge bilan sinxronlash (localStorage → SQL). */
export async function syncCollectionsMerge(payload) {
  const collections = payload && typeof payload === "object" ? payload : {};
  const counts = {};
  let total = 0;
  for (const [name, docs] of Object.entries(collections)) {
    if (!Array.isArray(docs) || !docs.length) continue;
    const count = await importCollection(name, docs, { merge: true });
    counts[name] = count;
    total += count;
  }
  return { total, counts };
}

export async function findWorkerByLogin(loginLower) {
  const l = String(loginLower || "").trim().toLowerCase();
  if (!l) return null;
  const items = await listCollection("workers");
  return (
    items.find((w) => String(w.loginLower || w.login || "").trim().toLowerCase() === l) ||
    null
  );
}

export async function findAssistantByLogin(loginLower) {
  const l = String(loginLower || "").trim().toLowerCase();
  if (!l) return null;
  const items = await listCollection("assistants");
  return (
    items.find((a) => String(a.loginLower || a.login || "").trim().toLowerCase() === l) ||
    null
  );
}

/** Server eslatmalari uchun. */
export async function listRecentActivityLogs(sinceYmd) {
  const since = String(sinceYmd || "").trim();
  const all = await listCollection("user_activity_logs");
  if (!since) return all;
  return all.filter((log) => String(log?.dateKey || "").trim() >= since);
}

export async function listRecentStagePhotos(sinceIso) {
  const since = String(sinceIso || "").trim();
  const all = await listCollection("stage_photos");
  if (!since) return all;
  return all.filter((p) => String(p?.uploadDate || "").trim() >= since);
}
