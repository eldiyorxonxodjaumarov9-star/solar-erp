/**
 * Dinamik katalog: database.db + formulalar
 */
import assert from "node:assert/strict";
import { SupplyRepository } from "../server/supply/SupplyRepository.js";
import { SupplyCalculator } from "../server/supply/SupplyCalculator.js";
import { buildSupplyPdfDoc } from "../src/services/supplyCalculation/PdfGenerator.js";

const repo = new SupplyRepository();
repo.invalidate();
const data = repo.load({ force: true });
assert.equal(data.ok, true, data.error);
assert.equal(data.databaseLoaded, true, "database.db yuklanishi kerak");
assert.ok(data.panels.length >= 1);
assert.ok(data.inverters.length >= 90, `inverters=${data.inverters.length}`);
assert.ok(data.batteries.length >= 1);
assert.ok(
  data.sources.includes("database.db"),
  `sources=${JSON.stringify(data.sources)}`,
);
assert.ok(!data.sources.includes("inverters.csv"), "CSV DB ustidan yozmasin");

const types = data.inverterTypes.map((t) => t.id);
assert.ok(types.includes("hybrid"));
assert.ok(types.includes("ongrid") || types.includes("chastotnik"));

const hybrids = data.inverters.filter((i) => i.type === "hybrid");
assert.ok(hybrids.some((h) => h.name === "DEYE hybrid 5 kW P1"));
assert.ok(hybrids.some((h) => /Restar hybrid 6\.2/i.test(h.name)));

const panel = data.panels.find((p) => /Restar 500W/i.test(p.name));
assert.ok(panel);
assert.equal(panel.source, "database.db");
const inv = data.inverters.find((i) => /M900-0220G3/i.test(i.name));
assert.ok(inv);

const calc = new SupplyCalculator(data);
const report = calc.calculate({
  requestedSystemKw: 20,
  panelId: panel.id,
  inverterId: inv.id,
  metalConstructionRequired: true,
  clientName: "Test",
  phone: "+998 90 123 45 67",
});
assert.equal(report.ok, true, report.error);
assert.equal(report.panel.count, 40);
assert.equal(report.metal.meters, 320);
assert.equal(report.panel.total, Math.round(40 * Number(panel.price) * 100) / 100);
assert.equal(report.inverter.total, Number(inv.price));
assert.ok(buildSupplyPdfDoc(report).getNumberOfPages() >= 1);

console.log("OK dynamic supply catalog");
console.log({
  databaseLoaded: data.databaseLoaded,
  panels: data.panels.length,
  inverters: data.inverters.length,
  batteries: data.batteries.length,
  breakers: data.breakers.length,
  accessories: data.accessories.length,
  inverterTypes: types,
  totalUsd: report.totalUsd,
  sources: data.sources,
});
