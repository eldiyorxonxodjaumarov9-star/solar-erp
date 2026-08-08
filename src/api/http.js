/**
 * Dev: bo‘sh URL → nisbiy `/api/...` (Vite proxy).
 * Desktop: `VITE_API_BASE_HTTP` (masalan http://127.0.0.1:5000).
 * Android APK: `VITE_ANDROID_API_BASE` yoki `VITE_API_BASE` (VPS).
 *
 * Android: CapacitorHttp.request (native) — CORS/preflight yo‘q, timeout ishlaydi.
 * Global fetch patch O‘CHIRILGAN (abort hang qilardi).
 */
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import {
  getApiBaseCandidates,
  getApiBaseUrl,
  isAndroidNative,
  isNativeCapacitor,
  logApiBaseOnce,
} from "./apiBase.js";

logApiBaseOnce();

const JSON_TIMEOUT_MS = 12000;
const FORMDATA_TIMEOUT_MS = 20000;

function withTimeout(ms) {
  if (typeof AbortController === "undefined") {
    return { signal: undefined, clear: () => {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

/** Abort ishlamasa ham Promise.race orqali majburiy timeout. */
function raceTimeout(promise, ms, label = "request") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error("Serverga ulanish yo‘q");
      err.code = "NETWORK";
      err.name = "TimeoutError";
      err.message = `${label} timeout ${ms}ms`;
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
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
    msg.includes("serverga ulanish") ||
    msg.includes("timeout")
  );
}

function ensureApiBaseForNative() {
  if ((isAndroidNative() || isNativeCapacitor()) && !getApiBaseUrl()) {
    throw new Error(
      "APK uchun VITE_ANDROID_API_BASE / VITE_API_BASE sozlanmagan (VPS API).",
    );
  }
}

function useNativeHttp() {
  return (
    typeof Capacitor !== "undefined" &&
    Capacitor?.isNativePlatform?.() &&
    typeof CapacitorHttp?.request === "function"
  );
}

async function requestOnceNative(base, path, options = {}) {
  const url = `${base}${path}`;
  const method = String(options.method || "GET").toUpperCase();
  const timeoutMs = options.timeoutMs || JSON_TIMEOUT_MS;
  const headers = { ...(options.headers || {}) };
  const hasBody = options.body != null && method !== "GET" && method !== "HEAD";
  if (hasBody && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }

  let data;
  let status;
  try {
    let bodyData;
    if (hasBody) {
      if (typeof options.body === "string") {
        try {
          bodyData = JSON.parse(options.body);
        } catch {
          bodyData = options.body;
        }
      } else {
        bodyData = options.body;
      }
    }
    const req = {
      url,
      method,
      headers,
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
      responseType: "json",
    };
    if (hasBody) req.data = bodyData;
    const res = await raceTimeout(CapacitorHttp.request(req), timeoutMs + 1500, url);
    status = res?.status ?? 0;
    data = res?.data ?? null;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        data = null;
      }
    }
  } catch (error) {
    console.error(`[API] Native HTTP error: ${url}`, error?.name, error?.message);
    const err = new Error("Serverga ulanish yo‘q");
    err.cause = error;
    err.code = "NETWORK";
    err.url = url;
    err.name = error?.name || "NetworkError";
    throw err;
  }

  if (status < 200 || status >= 300) {
    const message = data?.error || data?.message || "Request failed";
    console.warn(`[API] ${status} ${url}`, { response: data });
    const err = new Error(message);
    err.apiDetail = data;
    err.status = status;
    err.url = url;
    throw err;
  }

  ensurePayloadSuccess(data);
  return data;
}

async function requestOnceFetch(base, path, options = {}) {
  const url = `${base}${path}`;
  const { headers: optionHeaders, timeoutMs, ...fetchRest } = options;
  const method = String(fetchRest.method || "GET").toUpperCase();
  const hasBody = fetchRest.body != null && method !== "GET" && method !== "HEAD";
  const headers = { ...(optionHeaders || {}) };
  if (hasBody && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }
  const ms = timeoutMs || JSON_TIMEOUT_MS;
  const t = withTimeout(ms);
  let res;
  try {
    res = await raceTimeout(
      fetch(url, {
        ...fetchRest,
        method,
        signal: t.signal,
        headers,
      }),
      ms + 500,
      url,
    );
  } catch (error) {
    console.error(`[API] Network error: ${url}`, error?.name, error?.message);
    const err = new Error("Serverga ulanish yo‘q");
    err.cause = error;
    err.code = "NETWORK";
    err.url = url;
    err.name = error?.name || "NetworkError";
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

async function requestOnce(base, path, options = {}) {
  if (useNativeHttp()) {
    return requestOnceNative(base, path, options);
  }
  return requestOnceFetch(base, path, options);
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
  // FormData native CapacitorHttp da murakkab — web fetch (Android cleartext OK)
  const bases = getApiBaseCandidates();
  let lastError = null;

  for (let i = 0; i < bases.length; i += 1) {
    const base = bases[i];
    const url = `${base}${path}`;
    const t = withTimeout(FORMDATA_TIMEOUT_MS);
    let res;
    try {
      res = await raceTimeout(
        fetch(url, {
          method: "POST",
          body: formData,
          signal: t.signal,
        }),
        FORMDATA_TIMEOUT_MS + 500,
        url,
      );
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
  get: (path, reqOptions = {}) =>
    request(path, {
      method: "GET",
      headers: reqOptions.headers,
      timeoutMs: reqOptions.timeoutMs,
    }),
  post: (path, body, reqOptions = {}) =>
    request(path, {
      method: "POST",
      body: JSON.stringify(body || {}),
      headers: reqOptions.headers,
      timeoutMs: reqOptions.timeoutMs,
    }),
  put: (path, body, reqOptions = {}) =>
    request(path, {
      method: "PUT",
      body: JSON.stringify(body || {}),
      headers: reqOptions.headers,
      timeoutMs: reqOptions.timeoutMs,
    }),
  delete: (path, reqOptions = {}) =>
    request(path, {
      method: "DELETE",
      headers: reqOptions.headers,
      timeoutMs: reqOptions.timeoutMs,
    }),
  postFormData,
};

export { getApiBaseUrl, getApiBaseCandidates, isAndroidNative, isNativeCapacitor };
