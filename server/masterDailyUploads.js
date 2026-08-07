import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tashkentTodayYMD } from "../src/photos/tashkentTime.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "..", "data", "master-daily-uploads.json");

function readAll() {
  try {
    if (!fs.existsSync(DATA_FILE)) return {};
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(data) {
  const dir = path.dirname(DATA_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function dayBucket(dateKey = tashkentTodayYMD()) {
  const all = readAll();
  const key = String(dateKey || "").trim() || tashkentTodayYMD();
  if (!all[key] || typeof all[key] !== "object") all[key] = {};
  return { all, key, bucket: all[key] };
}

function workerKey(workerId, workerName) {
  const id = String(workerId || "").trim();
  if (id) return id;
  const name = String(workerName || "").trim().toLowerCase();
  if (name) return `name:${name}`;
  return "";
}

function ensureWorker(bucket, workerId, workerName, workerLogin = "") {
  const key = workerKey(workerId, workerName);
  if (!key) return null;
  if (!bucket[key] || typeof bucket[key] !== "object") {
    bucket[key] = {
      name: String(workerName || "").trim() || key,
      login: String(workerLogin || "").trim().toLowerCase(),
      loggedIn: false,
      arrival: false,
      departure: false,
      stage: false,
    };
  }
  const name = String(workerName || "").trim();
  if (name) bucket[key].name = name;
  const login = String(workerLogin || "").trim().toLowerCase();
  if (login) bucket[key].login = login;
  return bucket[key];
}

export function markMasterLogin(workerId, workerLogin, workerName, dateKey) {
  const { all, bucket } = dayBucket(dateKey);
  const row = ensureWorker(bucket, workerId, workerName, workerLogin);
  if (!row) return;
  row.loggedIn = true;
  writeAll(all);
}

export function markMasterArrivalUpload(workerId, workerName, dateKey) {
  const { all, bucket } = dayBucket(dateKey);
  const row = ensureWorker(bucket, workerId, workerName);
  if (!row) return;
  row.arrival = true;
  writeAll(all);
}

export function markMasterDepartureUpload(workerId, workerName, dateKey) {
  const { all, bucket } = dayBucket(dateKey);
  const row = ensureWorker(bucket, workerId, workerName);
  if (!row) return;
  row.departure = true;
  writeAll(all);
}

export function markMasterStageUpload(workerId, workerName, dateKey) {
  const { all, bucket } = dayBucket(dateKey);
  const row = ensureWorker(bucket, workerId, workerName);
  if (!row) return;
  row.stage = true;
  writeAll(all);
}

/** @returns {Record<string, { name: string, login?: string, loggedIn?: boolean, arrival: boolean, departure: boolean, stage: boolean }>} */
export function getMasterUploadsForDate(dateKey = tashkentTodayYMD()) {
  const { bucket } = dayBucket(dateKey);
  return { ...bucket };
}
