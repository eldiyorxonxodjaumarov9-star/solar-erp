import { useMemo } from "react";
import { useAuth } from "../auth/AuthContext";
import WorkAttendanceSelfPage from "../components/WorkAttendanceSelfPage";

export default function UstaIshVaqtlariPage() {
  const { session } = useAuth();
  const workerId = session?.role === "usta" ? String(session.workerId || "") : "";
  const workerLogin =
    session?.role === "usta" ? String(session.login || "").trim() : "";
  const workerName = session?.role === "usta" ? String(session.name || "Usta") : "Usta";

  const storagePrefix = useMemo(
    () => `ish_vaqti_${workerId || "guest"}`,
    [workerId],
  );

  return (
    <WorkAttendanceSelfPage
      personId={workerId}
      personLogin={workerLogin}
      personName={workerName || "Usta"}
      storagePrefix={storagePrefix}
      personKind="usta"
      awardPoints
      pointsWorkerId={workerId}
      missingProfileMessage="Usta profili topilmadi. Administrator bilan bog‘laning."
    />
  );
}
