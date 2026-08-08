/**
 * Platformaga qarab API base URL.
 * Desktop/dev → VITE_API_BASE_HTTP (localhost)
 * Android APK → VITE_ANDROID_API_BASE yoki VITE_API_BASE (VPS)
 */
import { Capacitor } from "@capacitor/core";

function trimBase(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\/+$/, "");
}

export function isNativeCapacitor() {
  try {
    if (typeof Capacitor?.isNativePlatform === "function") {
      return Boolean(Capacitor.isNativePlatform());
    }
  } catch {
    /* ignore */
  }
  if (typeof window === "undefined") return false;
  const C = window.Capacitor;
  return Boolean(
    C && typeof C.isNativePlatform === "function" && C.isNativePlatform(),
  );
}

export function isAndroidNative() {
  if (!isNativeCapacitor()) return false;
  try {
    if (typeof Capacitor?.getPlatform === "function") {
      return String(Capacitor.getPlatform()).toLowerCase() === "android";
    }
  } catch {
    /* ignore */
  }
  const C = typeof window !== "undefined" ? window.Capacitor : null;
  if (C && typeof C.getPlatform === "function") {
    return String(C.getPlatform()).toLowerCase() === "android";
  }
  return /android/i.test(navigator.userAgent || "");
}

function isLocalHost() {
  if (typeof window === "undefined") return false;
  const host = String(window.location.hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1";
}

function isLoopbackOrLan(url) {
  try {
    const u = new URL(url.includes("://") ? url : `http://${url}`);
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h === "127.0.0.1" || h === "::1") return true;
    if (/^192\.168\./.test(h) || /^10\./.test(h) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(h))
      return true;
    return false;
  } catch {
    return false;
  }
}

/** Production APK hard fallback — hech qachon localhost bo‘lmasin. */
export const ANDROID_PRODUCTION_API_BASE = "http://77.237.237.94";

/**
 * Android production uchun public VPS API.
 * Localhost / LAN URLlar APK buildda rad etiladi.
 */
export function getAndroidApiBase() {
  const android = trimBase(import.meta.env.VITE_ANDROID_API_BASE);
  const general = trimBase(import.meta.env.VITE_API_BASE);
  const nativeFallback = trimBase(
    import.meta.env.VITE_NATIVE_API_BASE || "",
  );
  let candidate = android || general || nativeFallback;
  if (candidate && isLoopbackOrLan(candidate) && !import.meta.env.DEV) {
    console.error(
      "[api-base] Android production’da localhost/LAN API taqiqlangan:",
      candidate,
    );
    candidate = "";
  }
  if (!candidate && !import.meta.env.DEV) {
    candidate = ANDROID_PRODUCTION_API_BASE;
  }
  return candidate;
}

/** Desktop / brauzer (Vite HMR yoki Electron). */
export function getDesktopApiBase() {
  return trimBase(import.meta.env.VITE_API_BASE_HTTP);
}

/**
 * Yagona resolver.
 */
export function getApiBaseUrl() {
  // Capacitor Android: doimo public VPS (localhost/LAN yo‘q)
  if (isAndroidNative()) {
    return getAndroidApiBase();
  }
  if (isNativeCapacitor() && !import.meta.env.DEV) {
    return getAndroidApiBase();
  }
  if (import.meta.env.DEV) {
    return getDesktopApiBase();
  }
  if (isLocalHost()) {
    return getDesktopApiBase() || getAndroidApiBase();
  }
  return trimBase(import.meta.env.VITE_API_BASE) || getAndroidApiBase();
}

/** So‘rov kandidatlari (fallback zanjiri). */
export function getApiBaseCandidates() {
  if (isAndroidNative() || (isNativeCapacitor() && !import.meta.env.DEV)) {
    const android = getAndroidApiBase() || ANDROID_PRODUCTION_API_BASE;
    return android ? [android] : [];
  }
  if (import.meta.env.DEV) {
    const local = getDesktopApiBase();
    return local ? [local, ""] : [""];
  }
  if (isLocalHost()) {
    const bases = [];
    const local = getDesktopApiBase();
    if (local) bases.push(local);
    bases.push("");
    const remote = trimBase(import.meta.env.VITE_API_BASE) || getAndroidApiBase();
    if (remote && !bases.includes(remote) && !isLoopbackOrLan(remote)) {
      bases.push(remote);
    }
    return bases;
  }
  const remote = trimBase(import.meta.env.VITE_API_BASE);
  return remote ? [remote] : [""];
}

export function logApiBaseOnce() {
  if (typeof window === "undefined") return;
  const key = "__solar_api_base_logged";
  if (window[key]) return;
  window[key] = true;
  const platform = isAndroidNative()
    ? "android"
    : isNativeCapacitor()
      ? "native"
      : import.meta.env.DEV
        ? "dev"
        : "web";
  console.log(`[api-base] platform=${platform} API_BASE=${getApiBaseUrl() || "(relative)"}`);
}
