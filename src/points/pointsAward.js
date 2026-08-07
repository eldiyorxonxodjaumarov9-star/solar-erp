import {
  getCollectionDoc,
  updateCollectionDoc,
} from "../firebase/firestoreCrud";
import { isGhostWorkerProfile } from "../workers/workerStorage";

/** Ball turlari va ko‘rsatish nomlari (barcha UI bir xil). */
export const POINT_CATEGORIES = [
  { key: "keldi", label: "Keldi", sign: 1 },
  { key: "ketdi", label: "Ketdi", sign: 1 },
  { key: "rasm", label: "Rasm yuborildi", sign: 1 },
  { key: "loyiha", label: "Loyiha yakunlandi", sign: 1 },
  { key: "xarajat", label: "Xarajat kiritildi", sign: 1 },
  { key: "etiroz", label: "Etiroz (jalba)", sign: -1 },
];

export const POINTS_RULES_TEXT =
  "Keldi va ketdi — har biri 1 ball. Rasm, loyiha, xarajat — 1 ball. Admin jalba qo‘shsa — −1 ball.";

const AWARD_TYPES = new Set(
  POINT_CATEGORIES.filter((c) => c.sign > 0).map((c) => c.key),
);
const DEDUCT_TYPES = new Set(
  POINT_CATEGORIES.filter((c) => c.sign < 0).map((c) => c.key),
);

async function incrementWorkerPoints(workerId, field, amount, totalDelta) {
  const wid = String(workerId || "").trim();
  if (!wid) return;
  const doc = await getCollectionDoc("workers", wid);
  if (!doc) {
    console.warn(`Ball saqlanmadi: worker profili topilmadi (${wid})`);
    return;
  }
  if (isGhostWorkerProfile(doc)) {
    console.warn(`Ball saqlanmadi: worker profili to‘liq emas (${wid})`);
    return;
  }
  const points = { ...(doc.points || {}) };
  const n = Number(amount) || 0;
  const td = Number(totalDelta);
  points[field] = Math.max(0, (Number(points[field]) || 0) + n);
  if (Number.isFinite(td)) {
    points.total = Math.max(0, (Number(points.total) || 0) + td);
  }
  points.updatedAt = new Date().toISOString();
  await updateCollectionDoc("workers", wid, { points });
}

export async function awardPoint(workerId, type, amount = 1) {
  const wid = String(workerId || "").trim();
  const n = Number(amount);
  if (!wid || !AWARD_TYPES.has(type) || !n || n < 0) return;
  try {
    await incrementWorkerPoints(wid, type, n, n);
  } catch (e) {
    console.warn("Ball qo‘shilmadi:", e?.message || e);
  }
}

export async function deductPoint(workerId, type, amount = 1) {
  const wid = String(workerId || "").trim();
  const n = Number(amount);
  if (!wid || !DEDUCT_TYPES.has(type) || !n || n < 0) return;
  try {
    await incrementWorkerPoints(wid, type, n, -n);
  } catch (e) {
    console.warn("Ball ayirilmadi:", e?.message || e);
  }
}

export function buildPointsForSave(p) {
  return normalizePoints(p);
}

export async function saveWorkerPoints(workerId, points) {
  const wid = String(workerId || "").trim();
  if (!wid) return;
  const payload = buildPointsForSave(points);
  try {
    await updateCollectionDoc("workers", wid, {
      points: { ...payload, updatedAt: new Date().toISOString() },
    });
  } catch (e) {
    console.warn("Ball saqlanmadi:", e?.message || e);
    throw e;
  }
}

export function normalizePoints(p) {
  const g = (k) => Math.max(0, Number(p?.[k] || 0) || 0);
  const keldi = g("keldi");
  const ketdi = g("ketdi") + g("vaqt");
  const rasm = g("rasm");
  const loyiha = g("loyiha");
  const xarajat = g("xarajat");
  const etiroz = g("etiroz");
  const earned = keldi + ketdi + rasm + loyiha + xarajat;
  const total = earned - etiroz;
  return { keldi, ketdi, rasm, loyiha, xarajat, etiroz, earned, total };
}

export function formatPointsCompact(p) {
  const n = normalizePoints(p);
  const parts = [
    `keldi ${n.keldi}`,
    `ketdi ${n.ketdi}`,
    `rasm ${n.rasm}`,
    `loyiha ${n.loyiha}`,
    `xarajat ${n.xarajat}`,
  ];
  if (n.etiroz > 0) parts.push(`etiroz −${n.etiroz}`);
  return parts.join(" · ");
}

export function formatCategoryValue(key, value) {
  const n = Math.max(0, Number(value) || 0);
  if (key === "etiroz") return n > 0 ? `−${n}` : "0";
  return String(n);
}
