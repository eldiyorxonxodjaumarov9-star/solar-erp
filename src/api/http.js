/**
 * Dev: bo‘sh URL → nisbiy `/api/...` (Vite proxy).
 * Desktop: `VITE_API_BASE_HTTP` (masalan http://127.0.0.1:5000).
 * Android APK: `VITE_ANDROID_API_BASE` yoki `VITE_API_BASE` (VPS).
 */
import {
  getApiBaseCandidates,
  getApiBaseUrl,
  isAndroidNative,
  isNativeCapacitor,
  logApiBaseOnce,
} from "./apiBase.js";

logApiBaseOnce();

const JSON_TIMEOUT_MS = 9000;
const FORMDATA_TIMEOUT_MS = 20000;

function withTimeout(ms) {
  if (typeof AbortController === "undefined") {
    return { signal: undefined, clear: () => {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function ensurePayloadSuccess(data) {
  if (!data || typeof data !== "object") return;
  if (data.ok === false || data.success === false) {
    const message = data.error || data.message || "Server xatosi";
    const err = new Error(message);
    err.apiDetail = data;
    throw err;
  }
}

function shouldTryNextBase(error, res) {
  if (res?.status === 404) return true;
  const msg = String(error?.message || "").toLowerCase();
  return (
    msg.includes("route not found") ||
    msg.includes("not found") ||
    msg.includes("serverga ulanish")
  );
}

function ensureApiBaseForNative() {
  if ((isAndroidNative() || isNativeCapacitor()) && !getApiBaseUrl()) {
    throw new Error(
      "APK uchun VITE_ANDROID_API_BASE / VITE_API_BASE sozlanmagan (VPS API).",
    );
  }
}

async function requestOnce(base, path, options = {}) {
  const url = `${base}${path}`;
  const { headers: optionHeaders, timeoutMs, ...fetchRest } = options;
  const t = withTimeout(timeoutMs || JSON_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      ...fetchRest,
      signal: t.signal,
      headers: {
        "Content-Type": "application/json",
        ...(optionHeaders || {}),
      },
    });
  } catch (error) {
    console.error(`[API] Network error: ${url}`, error);
    const err = new Error("Serverga ulanish yo‘q");
    err.cause = error;
    err.code = "NETWORK";
    err.url = url;
    throw err;
  } finally {
    t.clear();
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message = data?.error || data?.message || "Request failed";
    console.warn(`[API] ${res.status} ${url}`, { response: data });
    const err = new Error(message);
    err.apiDetail = data;
    err.status = res.status;
    err.url = url;
    throw err;
  }

  ensurePayloadSuccess(data);
  return data;
}

async function request(path, options = {}) {
  ensureApiBaseForNative();
  const bases = getApiBaseCandidates();
  let lastError = null;

  for (let i = 0; i < bases.length; i += 1) {
    const base = bases[i];
    try {
      return await requestOnce(base, path, options);
    } catch (error) {
      lastError = error;
      const hasNext = i < bases.length - 1;
      if (hasNext && shouldTryNextBase(error, { status: error?.status })) {
        console.info(`[API] ${base || "local"} xato — zaxira server sinanmoqda`);
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error("Serverga ulanish yo‘q");
}

async function postFormData(path, formData) {
  ensureApiBaseForNative();
  const bases = getApiBaseCandidates();
  let lastError = null;

  for (let i = 0; i < bases.length; i += 1) {
    const base = bases[i];
    const url = `${base}${path}`;
    const t = withTimeout(FORMDATA_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        body: formData,
        signal: t.signal,
      });
    } catch (error) {
      console.error(`[API] Network error (FormData): ${url}`, error);
      lastError = new Error("Serverga ulanish yo‘q");
      lastError.code = "NETWORK";
      if (i < bases.length - 1) continue;
      throw lastError;
    } finally {
      t.clear();
    }

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      const message = data?.error || data?.message || "Request failed";
      console.warn(`[API] ${res.status} ${url}`, { response: data });
      lastError = new Error(message);
      lastError.status = res.status;
      if (i < bases.length - 1 && shouldTryNextBase(lastError, res)) continue;
      throw lastError;
    }

    ensurePayloadSuccess(data);
    return data;
  }

  throw lastError || new Error("Serverga ulanish yo‘q");
}

export const api = {
  get: (path) => request(path),
  post: (path, body, reqOptions = {}) =>
    request(path, {
      method: "POST",
      body: JSON.stringify(body || {}),
      headers: reqOptions.headers,
    }),
  put: (path, body) =>
    request(path, { method: "PUT", body: JSON.stringify(body || {}) }),
  delete: (path) => request(path, { method: "DELETE" }),
  postFormData,
};

export { getApiBaseUrl, getApiBaseCandidates, isAndroidNative, isNativeCapacitor };
