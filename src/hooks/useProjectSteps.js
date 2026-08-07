import { useCallback, useEffect, useState } from "react";
import { listCollection, subscribeCollection } from "../firebase/firestoreCrud";
import { COLLECTIONS } from "../services/schema.js";

export function useProjectSteps(projectIdFilter = "") {
  const [steps, setSteps] = useState([]);

  const apply = useCallback(
    (list) => {
      let next = Array.isArray(list) ? list : [];
      const pid = String(projectIdFilter || "").trim();
      if (pid) next = next.filter((s) => String(s.projectId) === pid);
      next.sort(
        (a, b) =>
          String(a.projectId).localeCompare(String(b.projectId)) ||
          Number(a.stepNumber) - Number(b.stepNumber),
      );
      setSteps(next);
    },
    [projectIdFilter],
  );

  useEffect(() => {
    listCollection(COLLECTIONS.projectSteps)
      .then(apply)
      .catch(() => setSteps([]));
  }, [apply]);

  useEffect(() => {
    const unsub = subscribeCollection(COLLECTIONS.projectSteps, apply, () => {});
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [apply]);

  return { steps };
}
