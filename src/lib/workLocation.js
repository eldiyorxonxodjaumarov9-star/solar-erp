import { Geolocation } from "@capacitor/geolocation";
import { api } from "../api/http.js";
import {
  formatLocationShort,
  formatLocationTelegramBlock,
  mapsLink,
} from "../../shared/workLocationFormat.js";

export { formatLocationShort, formatLocationTelegramBlock, mapsLink };

const DEVICE_GEO_MS = 18_000;

function isNativeApp() {
  try {
    return Boolean(
      typeof window !== "undefined" &&
        window.Capacitor?.isNativePlatform?.(),
    );
  } catch {
    return false;
  }
}

function withHardTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

function humanizeError(err, fallback = "Joylashuv olinmadi") {
  const msg = String(err?.message || err || "").toLowerCase();
  if (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed")
  ) {
    return new Error(
      "Internet aloqasi yo‘q. Wi‑Fi yoki mobil internetni yoqing.",
    );
  }
  if (msg.includes("abort")) {
    return new Error("So‘rov vaqti tugadi. Qayta urinib ko‘ring.");
  }
  if (err instanceof Error && err.message) return err;
  return new Error(fallback);
}

async function reverseGeocodeDirect(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&format=json&accept-language=uz,ru,en`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "SolarERP/1.0",
    },
  });
  if (!res.ok) return "";
  const data = await res.json();
  return String(data?.display_name || "").slice(0, 220);
}

async function reverseGeocode(lat, lng) {
  try {
    const direct = await reverseGeocodeDirect(lat, lng);
    if (direct) return direct;
  } catch {
    /* nominatim xato */
  }
  try {
    const data = await api.get(
      `/api/geo/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,
    );
    const addr = String(data?.address || "").trim();
    if (addr) return addr;
  } catch {
    /* server proxy yo‘q */
  }
  return "";
}

function geolocationErrorMessage(err) {
  const code = err?.code ?? err?.error?.code;
  const msg = String(err?.message || err?.error?.message || "").toLowerCase();
  if (code === 1 || msg.includes("permission") || msg.includes("denied")) {
    return "Geolokatsiya ruxsati yo‘q. Sozlamalar → Solar ERP → Joylashuv → «Ilova ishlatayotganda».";
  }
  if (code === 2 || msg.includes("unavailable")) {
    return "Joylashuv aniqlanmadi. GPS yoki Wi‑Fi ni yoqing.";
  }
  if (code === 3 || msg.includes("timeout")) {
    return "GPS vaqti tugadi. Taxminiy joy olinadi.";
  }
  return humanizeError(err).message;
}

function coordsFromPosition(pos) {
  const c = pos?.coords || pos;
  const lat = Number(c.latitude);
  const lng = Number(c.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Joylashuv koordinatalari noto‘g‘ri");
  }
  return {
    latitude: lat,
    longitude: lng,
    accuracy: Number(c.accuracy || 0),
  };
}

function buildLocation(coords, address = "") {
  const { latitude, longitude, accuracy, source = "device" } = coords;
  return {
    latitude,
    longitude,
    accuracy,
    source,
    address: String(address || coords.address || ""),
    capturedAt: new Date().toISOString(),
    mapsUrl: `https://maps.google.com/?q=${latitude},${longitude}`,
  };
}

function locationGranted(perm) {
  return perm?.location === "granted" || perm?.coarseLocation === "granted";
}

export async function ensureWorkLocationPermission() {
  if (!isNativeApp()) return;
  let perm = await Geolocation.checkPermissions();
  if (!locationGranted(perm)) {
    perm = await Geolocation.requestPermissions();
  }
  if (!locationGranted(perm)) {
    throw new Error(geolocationErrorMessage({ code: 1 }));
  }
}

function webGetPosition(options) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function webWatchFirstFix(options, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolokatsiya qo‘llab-quvvatlanmaydi"));
      return;
    }
    let watchId = null;
    let done = false;
    const finish = (fn, val) => {
      if (done) return;
      done = true;
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      fn(val);
    };
    const timer = setTimeout(() => {
      finish(reject, new Error(geolocationErrorMessage({ code: 3 })));
    }, timeoutMs);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        clearTimeout(timer);
        finish(resolve, coordsFromPosition(pos));
      },
      (err) => {
        clearTimeout(timer);
        finish(reject, new Error(geolocationErrorMessage(err)));
      },
      options,
    );
  });
}

async function capacitorWatchFirstFix(options, timeoutMs) {
  return new Promise((resolve, reject) => {
    let watchId = null;
    let done = false;
    const finish = (fn, val) => {
      if (done) return;
      done = true;
      if (watchId != null) {
        Geolocation.clearWatch({ id: watchId }).catch(() => {});
      }
      fn(val);
    };
    const timer = setTimeout(() => {
      finish(reject, new Error(geolocationErrorMessage({ code: 3 })));
    }, timeoutMs);

    Geolocation.watchPosition(options, (position, err) => {
      if (position) {
        clearTimeout(timer);
        try {
          finish(resolve, coordsFromPosition(position));
        } catch (e) {
          finish(reject, e);
        }
        return;
      }
      if (err?.code === 1) {
        clearTimeout(timer);
        finish(reject, new Error(geolocationErrorMessage(err)));
      }
    })
      .then((id) => {
        watchId = id;
      })
      .catch((e) => {
        clearTimeout(timer);
        finish(reject, e);
      });
  });
}

async function tryCapacitorPosition() {
  let perm = await Geolocation.checkPermissions();
  if (!locationGranted(perm)) {
    perm = await Geolocation.requestPermissions();
  }
  if (!locationGranted(perm)) {
    throw new Error(geolocationErrorMessage({ code: 1 }));
  }

  const gpsOpts = {
    enableHighAccuracy: true,
    timeout: 16_000,
    maximumAge: 60_000,
  };

  try {
    const pos = await Geolocation.getCurrentPosition(gpsOpts);
    return coordsFromPosition(pos);
  } catch {
    /* watch */
  }

  try {
    return await capacitorWatchFirstFix(gpsOpts, 14_000);
  } catch {
    /* tarmoq */
  }

  const networkOpts = {
    enableHighAccuracy: false,
    timeout: 10_000,
    maximumAge: 300_000,
  };

  try {
    const pos = await Geolocation.getCurrentPosition(networkOpts);
    return coordsFromPosition(pos);
  } catch {
    return capacitorWatchFirstFix(networkOpts, 10_000);
  }
}

async function tryBrowserPosition() {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new Error("Geolokatsiya qo‘llab-quvvatlanmaydi");
  }

  const gpsOpts = {
    enableHighAccuracy: true,
    maximumAge: 60_000,
    timeout: 16_000,
  };

  try {
    return coordsFromPosition(await webGetPosition(gpsOpts));
  } catch {
    /* watch */
  }

  try {
    return await webWatchFirstFix(gpsOpts, 14_000);
  } catch {
    /* tarmoq */
  }

  return coordsFromPosition(
    await webGetPosition({
      enableHighAccuracy: false,
      maximumAge: 300_000,
      timeout: 10_000,
    }),
  );
}

async function readDeviceCoordinates() {
  if (isNativeApp()) {
    try {
      return await tryCapacitorPosition();
    } catch {
      return tryBrowserPosition();
    }
  }
  return tryBrowserPosition();
}

async function readIpFromServer() {
  const data = await api.get("/api/geo/approx");
  const lat = Number(data?.latitude);
  const lng = Number(data?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Server joylashuv qaytarmadi");
  }
  return {
    latitude: lat,
    longitude: lng,
    accuracy: Number(data.accuracy) || 5000,
    source: "ip",
    address: String(data.address || ""),
  };
}

async function readIpFromPublicApi() {
  const res = await fetch("https://ipwho.is/", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`ipwho HTTP ${res.status}`);
  const data = await res.json();
  if (!data?.success) throw new Error("ipwho");
  const lat = Number(data.latitude);
  const lng = Number(data.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("ipwho koordinata yo‘q");
  }
  const address = [data.city, data.region, data.country]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(", ");
  return {
    latitude: lat,
    longitude: lng,
    accuracy: 5000,
    source: "ip",
    address,
  };
}

async function readIpFromIpApiCo() {
  const res = await fetch("https://ipapi.co/json/", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`ipapi HTTP ${res.status}`);
  const data = await res.json();
  const lat = Number(data.latitude);
  const lng = Number(data.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("ipapi koordinata yo‘q");
  }
  const address = [data.city, data.region, data.country_name]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(", ");
  return {
    latitude: lat,
    longitude: lng,
    accuracy: 5000,
    source: "ip",
    address,
  };
}

async function readIpCoordinates() {
  const providers = [readIpFromServer, readIpFromPublicApi, readIpFromIpApiCo];

  let lastErr = null;
  for (const provider of providers) {
    try {
      return await withHardTimeout(
        provider(),
        10_000,
        "Internet joylashuv vaqti tugadi",
      );
    } catch (e) {
      lastErr = humanizeError(e);
    }
  }
  throw lastErr || new Error("Joylashuv olinmadi. Internetni tekshiring.");
}

async function readCoordinates() {
  try {
    const device = await withHardTimeout(
      readDeviceCoordinates(),
      DEVICE_GEO_MS,
      geolocationErrorMessage({ code: 3 }),
    );
    return { ...device, source: "device" };
  } catch {
    /* GPS — IP zaxirasi */
  }

  return readIpCoordinates();
}

/** GPS ruxsatisiz — faqat internet (IP) orqali taxminiy joy (~1–5 km). */
export async function getApproxWorkLocation() {
  const coords = await readIpCoordinates();
  return buildLocation(coords, String(coords.address || ""));
}

/** Aniq joy: avval GPS, keyin manzil matni, oxirida IP zaxirasi. */
export async function getPreciseWorkLocation() {
  try {
    return await getCurrentWorkLocation({ withAddress: true });
  } catch (gpsErr) {
    console.warn("GPS joy olinmadi, IP sinanmoqda:", gpsErr);
    try {
      return await getApproxWorkLocation();
    } catch {
      return null;
    }
  }
}

/**
 * Telegram guruhga xarita pin yuborish uchun: GPS ruxsati + qurilma koordinatasi + manzil.
 * VPS serverga bog‘liq emas — to‘g‘ridan Telegram sendVenue/sendLocation ishlatiladi.
 */
export async function getTelegramShareLocation() {
  try {
    await ensureWorkLocationPermission();
  } catch (e) {
    console.warn("Joylashuv ruxsati:", e);
  }

  try {
    const coords = await withHardTimeout(
      readDeviceCoordinates(),
      DEVICE_GEO_MS,
      geolocationErrorMessage({ code: 3 }),
    );
    const address = await reverseGeocode(coords.latitude, coords.longitude);
    return buildLocation({ ...coords, source: "device" }, address);
  } catch (gpsErr) {
    console.warn("Qurilma GPS olinmadi:", gpsErr);
    try {
      return await getApproxWorkLocation();
    } catch {
      return null;
    }
  }
}

function hasValidCoords(loc) {
  return (
    loc &&
    Number.isFinite(Number(loc.latitude)) &&
    Number.isFinite(Number(loc.longitude))
  );
}

/** Kelish/ketish uchun eng yaxshi joy — GPS ustuvor. */
export async function resolveWorkLocation(existing) {
  if (
    hasValidCoords(existing) &&
    existing.source === "device" &&
    String(existing.address || "").trim()
  ) {
    return existing;
  }

  if (hasValidCoords(existing) && existing.source === "device") {
    const enriched = await enrichWorkLocationAddress(existing);
    if (String(enriched.address || "").trim()) return enriched;
  }

  try {
    const fresh = await getCurrentWorkLocation({ withAddress: true });
    if (fresh?.source === "device") return fresh;
    if (hasValidCoords(existing) && existing.source === "device") return existing;
    return fresh;
  } catch (e) {
    console.warn("GPS joy olinmadi:", e);
  }

  try {
    return await getApproxWorkLocation();
  } catch (e) {
    console.warn("IP joy olinmadi:", e);
    return hasValidCoords(existing) ? existing : null;
  }
}

export async function getCurrentWorkLocation({ withAddress = false } = {}) {
  const coords = await readCoordinates();
  let address = String(coords.address || "");
  if (withAddress && coords.source === "device") {
    const geocoded = await reverseGeocode(coords.latitude, coords.longitude);
    if (geocoded) address = geocoded;
  }
  return buildLocation(coords, address);
}

export async function enrichWorkLocationAddress(location) {
  if (!hasValidCoords(location)) return location;
  if (String(location.address || "").trim()) return location;
  if (location.source === "ip") return location;
  const address = await reverseGeocode(location.latitude, location.longitude);
  return { ...location, address };
}
