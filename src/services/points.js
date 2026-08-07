import { addCollectionDoc } from "../firebase/firestoreCrud";
import { awardPoint, deductPoint } from "../points/pointsAward";
import { COLLECTIONS } from "./schema.js";

/** Ball o‘zgarishini `points` ledger + workers.points ga yozadi. */
export async function recordPointChange({
  userId,
  type,
  point,
  reason,
  projectId = "",
}) {
  const uid = String(userId || "").trim();
  const n = Number(point) || 0;
  if (!uid || !n) return;

  if (n > 0) {
    await awardPoint(uid, type, n);
  } else {
    await deductPoint(uid, type, Math.abs(n));
  }

  try {
    await addCollectionDoc(COLLECTIONS.points, {
      userId: uid,
      type: String(type || ""),
      point: n,
      reason: String(reason || ""),
      projectId: String(projectId || ""),
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("[points] ledger yozilmadi:", e?.message || e);
  }
}
