import { api } from "./http";
import { loadWorkers, persistWorkers } from "../workers/workerStorage";
import { loadBrigades, persistBrigades } from "../brigades/brigadeStorage";
import { loadProjects, persistProjects } from "../projects/projectStorage";
import { loadExpenses, persistExpenses } from "../expenses/expenseStorage";
import { loadUstaPhotos, persistUstaPhotos } from "../photos/ustaPhotoStorage";
import { loadAssistants, persistAssistants } from "../assistants/assistantStorage";
import {
  loadUserActivityLogs,
  persistUserActivityLogs,
} from "../activity/userActivityLogsStorage";

export const DB_SYNC_DONE_EVENT = "solar-erp-db-sync-done";

const STAGE_LOCK_LS = "project_stage_bot_locks_v1";
const YORIJNOMA_LS = "solar-erp-usta-yorijnoma-v1";

const PULL_COLLECTIONS = [
  "workers",
  "brigades",
  "projects",
  "expenses",
  "stage_photos",
  "assistants",
  "user_activity_logs",
  "usta_yorijnoma",
  "project_stage_locks",
  "jalbalar",
  "work_logs",
  "project_worker_days",
];

function loadYorijnomaDocs() {
  try {
    const raw = localStorage.getItem(YORIJNOMA_LS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return [];
    return Object.entries(parsed)
      .map(([workerId, row]) => {
        if (!row || typeof row !== "object") return null;
        const dk = String(row.dateKey || row.completedAt || "legacy").slice(0, 10);
        return {
          id: `${workerId}_${dk}`,
          workerId,
          ...row,
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function loadProjectStageLockDocs() {
  try {
    const raw = localStorage.getItem(STAGE_LOCK_LS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return [];
    return Object.entries(parsed).map(([projectId, stages]) => ({
      id: projectId,
      projectId,
      stages: stages && typeof stages === "object" ? stages : {},
    }));
  } catch {
    return [];
  }
}

/** Mahalliy keshdan barcha kolleksiyalarni yig‘adi. */
export function collectLocalCollectionsForSync() {
  const collections = {
    workers: loadWorkers(),
    brigades: loadBrigades(),
    projects: loadProjects(),
    expenses: loadExpenses(),
    stage_photos: loadUstaPhotos(),
    assistants: loadAssistants(),
    user_activity_logs: loadUserActivityLogs(),
    usta_yorijnoma: loadYorijnomaDocs(),
    project_stage_locks: loadProjectStageLockDocs(),
  };

  const out = {};
  for (const [name, items] of Object.entries(collections)) {
    if (Array.isArray(items) && items.length) {
      out[name] = items;
    }
  }
  return out;
}

function persistCollectionLocally(name, items) {
  const list = Array.isArray(items) ? items : [];
  switch (name) {
    case "workers":
      persistWorkers(list);
      break;
    case "brigades":
      persistBrigades(list);
      break;
    case "projects":
      persistProjects(list);
      break;
    case "expenses":
      persistExpenses(list);
      break;
    case "stage_photos":
      persistUstaPhotos(
        list.sort(
          (a, b) =>
            new Date(b.uploadDate || 0).getTime() - new Date(a.uploadDate || 0).getTime(),
        ),
      );
      break;
    case "assistants":
      persistAssistants(list);
      break;
    case "user_activity_logs":
      persistUserActivityLogs(list);
      break;
    case "usta_yorijnoma": {
      const map = {};
      for (const row of list) {
        const wid = String(row.workerId || row.id || "").split("_")[0];
        if (wid) map[wid] = row;
      }
      localStorage.setItem(YORIJNOMA_LS, JSON.stringify(map));
      break;
    }
    case "project_stage_locks": {
      const map = {};
      for (const row of list) {
        const pid = String(row.projectId || row.id || "").trim();
        if (pid) map[pid] = row.stages && typeof row.stages === "object" ? row.stages : {};
      }
      localStorage.setItem(STAGE_LOCK_LS, JSON.stringify(map));
      break;
    }
    default:
      break;
  }
}

/** Bazadan mahalliy keshga tortish. */
export async function pullDatabaseToLocalStorage() {
  const pulled = {};
  for (const name of PULL_COLLECTIONS) {
    try {
      const data = await api.get(`/api/db/${encodeURIComponent(name)}`);
      const items = Array.isArray(data?.items) ? data.items : [];
      persistCollectionLocally(name, items);
      pulled[name] = items.length;
    } catch (error) {
      console.warn(`[db-sync] pull ${name}:`, error?.message || error);
    }
  }
  return pulled;
}

/** localStorage → SQL, keyin SQL → localStorage (to‘liq yangilash). */
export async function fullDatabaseSync() {
  try {
    const status = await api.get("/status");
    if (!status?.sql) {
      return { ok: false, skipped: true, reason: "sql_unavailable" };
    }

    const collections = collectLocalCollectionsForSync();
    const localCount = Object.values(collections).reduce(
      (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
      0,
    );

    let push = { total: 0, counts: {} };
    if (localCount > 0) {
      push = await api.post("/api/db/sync-all", { collections });
    }

    const pulled = await pullDatabaseToLocalStorage();

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(DB_SYNC_DONE_EVENT));
    }

    return { ok: true, push, pulled, localCount };
  } catch (error) {
    console.warn("[db-sync] full sync skipped:", error?.message || error);
    return { ok: false, error: error?.message || String(error) };
  }
}
