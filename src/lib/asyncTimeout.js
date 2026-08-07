/**
 * Promise’ga hard timeout — hech qachon cheksiz kutmaslik.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} message
 * @returns {Promise<T>}
 */
export function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(message || `Vaqt tugadi (${ms}ms)`));
    }, Math.max(1, Number(ms) || 1));
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * @param {unknown} err
 * @param {string} fallback
 */
export function errorMessage(err, fallback = "Xatolik") {
  if (err instanceof Error && err.message) return err.message;
  const s = String(err || "").trim();
  return s || fallback;
}

export function isDevAttendanceLog() {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
}

/** @param {string} step @param {unknown} [detail] */
export function attendanceLog(step, detail) {
  if (!isDevAttendanceLog()) return;
  if (detail !== undefined) {
    console.info(`[attendance] ${step}`, detail);
  } else {
    console.info(`[attendance] ${step}`);
  }
}
