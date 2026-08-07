import { useEffect, useState } from "react";
import { subscribeDocument } from "../firebase/firestoreCrud";
import { normalizePoints } from "../points/pointsAward";

export { POINT_CATEGORIES, normalizePoints } from "../points/pointsAward";

/** Bitta ustaning ballarini (workers/{id}.points) real vaqtda kuzatadi. */
export function useWorkerPoints(workerId) {
  const [points, setPoints] = useState(null);

  useEffect(() => {
    if (!workerId) {
      setPoints(null);
      return undefined;
    }
    const unsub = subscribeDocument(
      "workers",
      String(workerId),
      (docData) => setPoints(docData?.points || {}),
      () => {},
    );
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [workerId]);

  return normalizePoints(points);
}
