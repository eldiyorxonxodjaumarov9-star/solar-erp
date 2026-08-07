export const USTA_PROJECT_PROGRESS_KEY = "ustaProjectProgress";
export const USTA_PROJECT_PROGRESS_CHANGED_EVENT =
  "solar-erp-usta-project-progress-changed";

/**
 * @typedef {{
 *   projectId: string;
 *   ustaId: string;
 *   stages: Record<string, { status: 'pending' | 'done' | 'not_done'; updatedAt: string }>;
 *   updatedAt: string;
 * }} UstaProjectProgress
 */

/** @returns {UstaProjectProgress[]} */
export function loadUstaProjectProgress() {
  try {
    const raw = localStorage.getItem(USTA_PROJECT_PROGRESS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x) =>
          x &&
          typeof x.projectId === "string" &&
          typeof x.ustaId === "string" &&
          x.stages &&
          typeof x.stages === "object" &&
          typeof x.updatedAt === "string",
      )
      .map((x) => ({ ...x, stages: { ...x.stages } }));
  } catch {
    return [];
  }
}

/** @param {UstaProjectProgress[]} list */
export function persistUstaProjectProgress(list) {
  localStorage.setItem(USTA_PROJECT_PROGRESS_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(USTA_PROJECT_PROGRESS_CHANGED_EVENT));
}

/** @returns {UstaProjectProgress | null} */
export function getUstaProjectProgress(projectId, ustaId, list) {
  const pid = String(projectId || "").trim();
  const uid = String(ustaId || "").trim();
  if (!pid || !uid) return null;
  const source = Array.isArray(list) ? list : loadUstaProjectProgress();
  return source.find((x) => x.projectId === pid && x.ustaId === uid) || null;
}

