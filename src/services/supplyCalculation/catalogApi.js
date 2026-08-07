import { api, getApiBaseUrl, isAndroidNative, isNativeCapacitor } from "../../api/http.js";
import { loadAdminCredentials } from "../../auth/adminDefaults.js";

/**
 * Admin so‘rov headerlari (server narx endpointlari uchun).
 */
export function adminSupplyHeaders(session) {
  if (!session || session.role !== "admin") return {};
  const creds = loadAdminCredentials();
  return {
    "X-Solar-Role": "admin",
    "X-Solar-Login": creds.login || session.login || "admin",
    "X-Solar-Password": creds.password || "",
  };
}

const NETWORK_MSG =
  "Taminot serveriga ulanib bo‘lmadi. Internet aloqasini tekshiring yoki qayta urinib ko‘ring.";
const DB_MSG = "Taminot ma’lumotlar bazasi topilmadi";

function supplyPlatform() {
  if (isAndroidNative()) return "android";
  if (isNativeCapacitor()) return "native";
  return "web";
}

function friendlySupplyError(err, kind = "network") {
  const status = err?.status;
  const msg = String(err?.message || "");
  const body = err?.apiDetail || null;
  console.error("[supply-mobile] status:", status);
  console.error("[supply-mobile] body:", body ? JSON.stringify(body).slice(0, 400) : msg);

  if (kind === "db" || (status === 503 && /topilmadi|database|bazasi/i.test(msg))) {
    return DB_MSG;
  }
  if (
    err?.code === "NETWORK" ||
    status === 0 ||
    status === 404 ||
    /ulanish|route not found|failed to fetch|network/i.test(msg)
  ) {
    return NETWORK_MSG;
  }
  if (/topilmadi/i.test(msg) && status === 503) return DB_MSG;
  return msg || NETWORK_MSG;
}

/**
 * Avval health, keyin catalog.
 */
export async function fetchSupplyCatalog() {
  const base = getApiBaseUrl() || "(relative)";
  const platform = supplyPlatform();
  console.log(`[supply-mobile] platform=${platform}`);
  console.log(`[supply-mobile] API_BASE=${base}`);

  try {
    const healthUrl = `${base}/api/supply/health`;
    console.log(`[supply-mobile] GET ${healthUrl}`);
    const health = await api.get("/api/supply/health");
    console.log(`[supply-mobile] status=200`);
    console.log(
      `[supply-mobile] databaseLoaded=${Boolean(health?.databaseLoaded)} panels=${health?.panels ?? "?"} inverters=${health?.inverters ?? "?"} batteries=${health?.batteries ?? "?"}`,
    );

    if (!health?.ok) {
      return {
        ok: false,
        errorKind: "network",
        error: NETWORK_MSG,
        panels: [],
        inverters: [],
        batteries: [],
        accessories: [],
        settings: {},
        rules: {},
      };
    }

    if (health.databaseLoaded === false || health.catalogOk === false) {
      return {
        ok: false,
        errorKind: "db",
        error: DB_MSG,
        panels: [],
        inverters: [],
        batteries: [],
        accessories: [],
        settings: {},
        rules: {},
        health,
      };
    }

    const data = await api.get("/api/supply/catalog");
    if (!data || data.ok === false) {
      return {
        ok: false,
        errorKind: "db",
        error: data?.error || DB_MSG,
        panels: [],
        inverters: [],
        batteries: [],
        accessories: [],
        settings: {},
        rules: {},
      };
    }

    console.log(
      `[supply-mobile] catalog panels=${data.panels?.length || 0} inverters=${data.inverters?.length || 0} batteries=${data.batteries?.length || 0}`,
    );
    return sanitizePublicCatalog(data);
  } catch (err) {
    const error = friendlySupplyError(err, "network");
    return {
      ok: false,
      errorKind: /bazasi topilmadi/i.test(error) ? "db" : "network",
      error,
      panels: [],
      inverters: [],
      batteries: [],
      accessories: [],
      settings: {},
      rules: {},
    };
  }
}

function stripPriceFields(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = { ...obj };
  for (const k of Object.keys(out)) {
    if (/^(price|priceUsd|priceUzs|unitPrice|unitUsd|total|totalUsd|totalUzs|exchangeRate|currency|cost|narx)$/i.test(k)) {
      delete out[k];
    }
  }
  return out;
}

export function sanitizePublicCatalog(data) {
  return {
    ...data,
    ok: true,
    panels: (data.panels || []).map(stripPriceFields),
    inverters: (data.inverters || []).map(stripPriceFields),
    batteries: (data.batteries || []).map(stripPriceFields),
    accessories: (data.accessories || []).map(stripPriceFields),
    breakers: (data.breakers || []).map(stripPriceFields),
    cables: (data.cables || []).map(stripPriceFields),
    metal: Array.isArray(data.metal)
      ? data.metal.map(stripPriceFields)
      : data.metal
        ? stripPriceFields(data.metal)
        : null,
  };
}

export async function calculateSupplyOnServer(input, { includePrices = false, session } = {}) {
  const headers = includePrices ? adminSupplyHeaders(session) : {};
  try {
    return await api.post(
      "/api/supply/calculate",
      { ...input, includePrices: Boolean(includePrices) },
      { headers },
    );
  } catch (err) {
    return {
      ok: false,
      error: friendlySupplyError(err),
    };
  }
}

export async function reloadSupplyCatalog(session) {
  return api.post("/api/supply/reload", {}, { headers: adminSupplyHeaders(session) });
}
