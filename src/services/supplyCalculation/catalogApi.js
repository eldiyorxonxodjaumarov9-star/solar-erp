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
  const cause = err?.cause;
  console.error("[supply-mobile] status:", status);
  console.error("[supply-mobile] error.name:", err?.name || cause?.name || "");
  console.error("[supply-mobile] error.message:", msg);
  if (cause?.message) console.error("[supply-mobile] cause:", cause.message);
  console.error(
    "[supply-mobile] body:",
    body ? JSON.stringify(body).slice(0, 400) : "(none)",
  );

  if (kind === "db" || (status === 503 && /topilmadi|database|bazasi/i.test(msg))) {
    return DB_MSG;
  }
  if (/timeout/i.test(msg) || err?.name === "TimeoutError") {
    return "Taminot serveri javob bermadi (timeout). VPS ishlayotganini tekshiring.";
  }
  if (
    err?.code === "NETWORK" ||
    status === 0 ||
    /ulanish|failed to fetch|network|abort|connect/i.test(msg)
  ) {
    return NETWORK_MSG;
  }
  if (status === 404 || /route not found|not found/i.test(msg)) {
    return "Taminot API topilmadi (404). Nginx /api/supply/ proxy va server yangilanganini tekshiring.";
  }
  if (/topilmadi/i.test(msg) && status === 503) return DB_MSG;
  return msg || NETWORK_MSG;
}

function emptyFail(errorKind, error, extra = {}) {
  return {
    ok: false,
    errorKind,
    error,
    panels: [],
    inverters: [],
    batteries: [],
    accessories: [],
    settings: {},
    rules: {},
    debug: extra.debug || null,
  };
}

/**
 * Avval health, keyin catalog.
 */
export async function fetchSupplyCatalog() {
  const base = getApiBaseUrl() || "";
  const platform = supplyPlatform();
  const healthUrl = base
    ? `${base}/api/supply/health`
    : "/api/supply/health";
  const debugBase = { platform, apiBase: base || "(relative)", healthUrl };

  console.log(`[supply-mobile] platform=${platform}`);
  console.log(`[supply-mobile] apiBase=${base || "(relative)"}`);
  console.log(`[supply-mobile] healthUrl=${healthUrl}`);

  if (isAndroidNative() || isNativeCapacitor()) {
    if (!base || /127\.0\.0\.1|localhost|192\.168\./i.test(base)) {
      console.error("[supply-mobile] BAD apiBase for Android:", base);
      return emptyFail("network", NETWORK_MSG, {
        debug: { ...debugBase, errorName: "BadApiBase" },
      });
    }
  }

  try {
    console.log(`[supply-mobile] GET ${healthUrl}`);
    const health = await api.get("/api/supply/health");
    console.log(`[supply-mobile] status=200`);
    console.log(
      `[supply-mobile] databaseLoaded=${Boolean(health?.databaseLoaded)} panels=${health?.panels ?? "?"} inverters=${health?.inverters ?? "?"} batteries=${health?.batteries ?? "?"}`,
    );

    if (!health?.ok) {
      return emptyFail("network", NETWORK_MSG, {
        debug: { ...debugBase, status: 200, errorName: "HealthNotOk" },
      });
    }

    if (health.databaseLoaded === false || health.catalogOk === false) {
      return {
        ...emptyFail("db", DB_MSG, {
          debug: { ...debugBase, status: 200, errorName: "DbNotLoaded" },
        }),
        health,
      };
    }

    const catalogUrl = base
      ? `${base}/api/supply/catalog`
      : "/api/supply/catalog";
    console.log(`[supply-mobile] GET ${catalogUrl}`);
    const data = await api.get("/api/supply/catalog");
    if (!data || data.ok === false) {
      return emptyFail("db", data?.error || DB_MSG, {
        debug: { ...debugBase, status: data?.status, errorName: "CatalogFail" },
      });
    }

    console.log(
      `[supply-mobile] catalog panels=${data.panels?.length || 0} inverters=${data.inverters?.length || 0} batteries=${data.batteries?.length || 0}`,
    );
    return sanitizePublicCatalog(data);
  } catch (err) {
    const error = friendlySupplyError(err, "network");
    return emptyFail(/bazasi topilmadi/i.test(error) ? "db" : "network", error, {
      debug: {
        ...debugBase,
        status: err?.status ?? 0,
        errorName: err?.name || err?.cause?.name || "Error",
        errorMessage: String(err?.message || "").slice(0, 120),
      },
    });
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

/** Admin: narxlar bilan to‘liq katalog */
export async function fetchAdminSupplyCatalog(session) {
  return api.get("/api/supply/catalog/admin", {
    headers: adminSupplyHeaders(session),
  });
}

export async function createAdminSupplyProduct(session, body) {
  return api.post("/api/supply/products", body, {
    headers: adminSupplyHeaders(session),
  });
}

export async function updateAdminSupplyProduct(session, id, body) {
  return api.put(`/api/supply/products/${encodeURIComponent(id)}`, body, {
    headers: adminSupplyHeaders(session),
  });
}

export async function deleteAdminSupplyProduct(session, id) {
  return api.delete(`/api/supply/products/${encodeURIComponent(id)}`, {
    headers: adminSupplyHeaders(session),
  });
}
