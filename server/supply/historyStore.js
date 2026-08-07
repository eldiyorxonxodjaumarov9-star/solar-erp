/**
 * Taminot hisoblari tarixi — data/supply/history.json
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { resolveSupplyDir } from "./supplyDir.js";

function historyPath() {
  return path.join(resolveSupplyDir(), "history.json");
}

function readAll() {
  const file = historyPath();
  if (!fs.existsSync(file)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch (err) {
    console.error("[supply] history.json parse error:", err?.message || err);
    return [];
  }
}

function writeAll(rows) {
  const dir = resolveSupplyDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(historyPath(), JSON.stringify(rows, null, 2), "utf8");
}

export function listHistory() {
  return readAll().sort((a, b) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
  );
}

export function saveHistory(payload = {}, id) {
  const rows = readAll();
  const now = new Date().toISOString();
  if (id) {
    const idx = rows.findIndex((r) => r.id === id);
    if (idx >= 0) {
      rows[idx] = { ...rows[idx], ...payload, id, updatedAt: now };
      writeAll(rows);
      return rows[idx];
    }
  }
  const row = {
    ...payload,
    id: id || crypto.randomUUID(),
    createdAt: payload.createdAt || now,
    updatedAt: now,
  };
  rows.unshift(row);
  writeAll(rows);
  return row;
}

export function deleteHistory(id) {
  const rows = readAll();
  const next = rows.filter((r) => r.id !== id);
  writeAll(next);
  return { ok: true, deleted: rows.length - next.length };
}
