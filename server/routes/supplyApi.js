import { Router } from "express";
import { isAdminRequest, requireAdmin } from "../supply/adminAuth.js";
import {
  getInternalCatalog,
  invalidateSupplyCatalogCache,
  loadInternalCatalog,
  reloadSupplyCatalog,
  toPublicCatalog,
} from "../supply/catalogStore.js";
import {
  afterMutation,
  createSupplyProduct,
  deleteSupplyProduct,
  updateSupplyProduct,
} from "../supply/adminProductCrud.js";
import { resolveSupplyDir } from "../supply/supplyDir.js";
import { SupplyCalculator } from "../supply/SupplyCalculator.js";
import { SupplyRepository } from "../supply/SupplyRepository.js";
import { toPricingBlock } from "../supply/catalogStore.js";
import {
  deleteHistory,
  listHistory,
  saveHistory,
} from "../supply/historyStore.js";

function publicCatalog() {
  return toPublicCatalog(loadInternalCatalog());
}

function reportToHistoryPayload(report, extra = {}) {
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
    createdAt: report.createdAt,
    ...extra,
  };
}

export function createSupplyRouter() {
  const router = Router();

  router.get("/health", (_req, res) => {
    const internal = getInternalCatalog();
    const raw = internal.raw || internal;
    return res.json({
      ok: true,
      route: "/api/supply",
      dataPath: resolveSupplyDir(),
      databaseLoaded: Boolean(raw.databaseLoaded ?? internal.databaseLoaded),
      catalogOk: Boolean(internal.ok),
      panels: internal.panels?.length || 0,
      inverters: internal.inverters?.length || 0,
      batteries: internal.batteries?.length || 0,
      accessories: internal.accessories?.length || 0,
      breakers: internal.breakers?.length || 0,
      cables: internal.cables?.length || 0,
      sources: internal.sources || [],
    });
  });

  router.get("/catalog", (_req, res) => {
    const catalog = publicCatalog();
    if (!catalog.ok) return res.status(503).json(catalog);
    return res.json(catalog);
  });

  router.get("/catalog/admin", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const internal = getInternalCatalog();
    if (!internal.ok) {
      return res.status(503).json({ ok: false, error: internal.error, path: internal.path });
    }
    return res.json({
      ok: true,
      path: internal.path,
      sources: internal.sources,
      panels: internal.panels,
      inverters: internal.inverters,
      batteries: internal.batteries,
      accessories: internal.accessories,
      breakers: internal.breakers,
      cables: internal.cables,
      metal: internal.metal,
      settings: internal.settings,
      rules: internal.rules,
      inverterTypes: internal.inverterTypes,
    });
  });

  router.get("/panels", (_req, res) => {
    const c = publicCatalog();
    if (!c.ok) return res.status(503).json({ ok: false, error: c.error, items: [] });
    return res.json({ ok: true, items: c.panels });
  });

  router.get("/inverters", (req, res) => {
    const c = publicCatalog();
    if (!c.ok) return res.status(503).json({ ok: false, error: c.error, items: [] });
    const type = String(req.query.type || "").trim();
    const items = type
      ? c.inverters.filter((i) => (i.type || i.subtype) === type)
      : c.inverters;
    return res.json({ ok: true, items });
  });

  router.get("/batteries", (_req, res) => {
    const c = publicCatalog();
    if (!c.ok) return res.status(503).json({ ok: false, error: c.error, items: [] });
    return res.json({ ok: true, items: c.batteries });
  });

  router.get("/accessories", (_req, res) => {
    const c = publicCatalog();
    if (!c.ok) return res.status(503).json({ ok: false, error: c.error, items: [] });
    return res.json({ ok: true, items: c.accessories });
  });

  router.get("/settings", (_req, res) => {
    const c = publicCatalog();
    if (!c.ok) return res.status(503).json({ ok: false, error: c.error, settings: {} });
    return res.json({ ok: true, settings: c.settings });
  });

  /**
   * Telegram-format tijoriy taklif hisobi (narxlar data/supply dan).
   */
  router.post("/calculate", (req, res) => {
    const repo = new SupplyRepository();
    const data = repo.load();
    if (!data.ok) {
      return res.status(503).json({
        ok: false,
        error: data.error || "Taminot ma’lumotlar bazasi topilmadi",
      });
    }

    const calc = new SupplyCalculator(data);
    const body = req.body || {};
    const report = calc.calculate({
      requestedSystemKw: body.requestedSystemKw,
      panelId: body.panelId,
      inverterId: body.inverterId,
      metalConstructionRequired: body.metalConstructionRequired,
      batteryRequired: body.batteryRequired,
      batteryId: body.batteryId,
      batteryCount: body.batteryCount,
      clientName: body.clientName,
      phone: body.phone,
    });

    if (!report.ok) return res.status(400).json(report);

    const adminView = isAdminRequest(req) || Boolean(body.includePrices);
    return res.json({
      ok: true,
      quote: report,
      report,
      telegramText: report.telegramText,
      pricing: adminView ? toPricingBlock(report) : undefined,
      fullQuote: report,
    });
  });

  router.get("/history", (_req, res) => {
    try {
      return res.json({ ok: true, items: listHistory() });
    } catch (err) {
      console.error("[supply] history list error:", err?.message || err);
      return res.status(500).json({ ok: false, error: "Tarix o‘qilmadi", items: [] });
    }
  });

  router.post("/save", (req, res) => {
    try {
      const body = req.body || {};
      const report = body.report || body.quote || null;
      let payload;
      if (report?.panel || report?.systemKw != null) {
        payload = reportToHistoryPayload(report, {
          createdBy: body.createdBy || "",
        });
      } else {
        payload = {
          ...body,
          report: undefined,
          quote: undefined,
          createdBy: body.createdBy || body.createdBy || "",
        };
        delete payload.report;
        delete payload.quote;
      }
      if (!payload.telegramText && payload.totalUsd == null && payload.systemKw == null && payload.requestedSystemKw == null) {
        return res.status(400).json({ ok: false, error: "Saqlash uchun hisob kerak" });
      }
      const saved = saveHistory(payload, body.id || payload.id);
      return res.json({ ok: true, item: saved, id: saved.id });
    } catch (err) {
      console.error("[supply] save error:", err?.message || err);
      return res.status(500).json({ ok: false, error: "Saqlashda xato" });
    }
  });

  router.delete("/history/:id", (req, res) => {
    try {
      const result = deleteHistory(req.params.id);
      return res.json(result);
    } catch (err) {
      console.error("[supply] delete error:", err?.message || err);
      return res.status(500).json({ ok: false, error: "O‘chirishda xato" });
    }
  });

  router.post("/reload", (req, res) => {
    if (!requireAdmin(req, res)) return;
    invalidateSupplyCatalogCache();
    const internal = reloadSupplyCatalog();
    if (!internal.ok) {
      return res.status(503).json({
        ok: false,
        error: internal.error,
        path: resolveSupplyDir(),
      });
    }
    return res.json({
      ok: true,
      reloaded: true,
      path: resolveSupplyDir(),
      sources: internal.sources,
      panelCount: internal.panels.length,
      inverterCount: internal.inverters.length,
      batteryCount: internal.batteries.length,
    });
  });

  router.post("/products", (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const created = createSupplyProduct(req.body || {});
      afterMutation();
      return res.json({ ok: true, ...created });
    } catch (e) {
      return res.status(400).json({ ok: false, error: e?.message || "Qo‘shishda xato" });
    }
  });

  router.put("/products/:id", (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const updated = updateSupplyProduct(req.params.id, req.body || {});
      afterMutation();
      return res.json({ ...updated, ok: true });
    } catch (e) {
      return res.status(400).json({ ok: false, error: e?.message || "Yangilashda xato" });
    }
  });

  router.delete("/products/:id", (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const deleted = deleteSupplyProduct(req.params.id);
      afterMutation();
      return res.json({ ...deleted, ok: true });
    } catch (e) {
      return res.status(400).json({ ok: false, error: e?.message || "O‘chirishda xato" });
    }
  });

  return router;
}
