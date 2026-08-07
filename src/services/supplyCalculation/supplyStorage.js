import { api } from "../../api/http.js";

export const SUPPLY_COLLECTION = "supplyCalculations";

export function quoteToStoragePayload(report, { createdBy } = {}) {
  const now = new Date().toISOString();
  return {
    clientName: report.clientName || "",
    phone: report.phone || "",
    requestedSystemKw: report.systemKw,
    systemKw: report.systemKw,

    panelId: report.panel?.id,
    panelName: report.panel?.name,
    panelPowerW: report.panel?.powerW,
    panelCount: report.panel?.count,
    panelTotalUsd: report.panel?.total,

    inverterType: report.inverter?.type,
    inverterId: report.inverter?.id,
    inverterName: report.inverter?.name,
    inverterPowerKw: report.inverter?.powerKw,
    inverterUsd: report.inverter?.total,

    metalConstructionRequired: Boolean(report.metal?.required),
    metalMeters: report.metal?.meters || 0,
    metalUsd: report.metal?.total || 0,

    breakers: report.breakers || [],
    accessories: report.accessories || [],

    batteryRequired: Boolean(report.battery),
    batteryConfig: report.battery || null,
    batteryCount: report.battery?.quantity || 0,
    batteryTotalUsd: report.battery?.total || 0,

    totalUsd: report.totalUsd,
    exchangeRate: report.exchangeRate,
    totalUzs: report.totalUzs,

    telegramText: report.telegramText || "",
    warranty: report.warranty || null,
    notes: report.notes || [],
    priceSnapshot: true,

    createdBy: createdBy || "",
    createdAt: report.createdAt || now,
    updatedAt: now,
  };
}

export function storageRowToQuote(row) {
  if (!row) return null;
  return {
    ok: true,
    systemKw: row.requestedSystemKw ?? row.systemKw,
    panel: {
      id: row.panelId,
      name: row.panelName,
      powerW: row.panelPowerW,
      count: row.panelCount,
      total: row.panelTotalUsd,
    },
    metal: {
      required: row.metalConstructionRequired,
      meters: row.metalMeters,
      total: row.metalUsd,
    },
    inverter: {
      id: row.inverterId,
      name: row.inverterName,
      type: row.inverterType,
      powerKw: row.inverterPowerKw,
      total: row.inverterUsd,
    },
    breakers: row.breakers || [],
    accessories: row.accessories || [],
    battery: row.batteryConfig,
    totalUsd: row.totalUsd,
    totalUzs: row.totalUzs,
    exchangeRate: row.exchangeRate,
    clientName: row.clientName,
    phone: row.phone,
    telegramText: row.telegramText,
    warranty: row.warranty,
    notes: row.notes,
    createdAt: row.createdAt,
    createdAtText: row.createdAt
      ? new Date(row.createdAt).toISOString().replace("T", " ").slice(0, 19)
      : "",
    priceSnapshot: true,
  };
}

export async function listSupplyCalculations() {
  try {
    const data = await api.get("/api/supply/history");
    if (data?.ok && Array.isArray(data.items)) return data.items;
  } catch (err) {
    console.warn("[supply] history API:", err?.message || err);
  }
  return [];
}

export async function saveSupplyCalculation(payload, id) {
  const data = await api.post("/api/supply/save", {
    ...payload,
    id: id || undefined,
  });
  if (!data?.ok) throw new Error(data?.error || "Saqlashda xato");
  return data.item || { id: data.id, ...payload };
}

export async function deleteSupplyCalculation(id) {
  await api.delete(`/api/supply/history/${encodeURIComponent(id)}`);
  return { ok: true };
}
