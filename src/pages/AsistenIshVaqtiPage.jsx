import { useMemo } from "react";
import { useAuth } from "../auth/AuthContext";
import { asistenAttendancePersonId } from "../assistants/asistenAttendanceIds";
import WorkAttendanceSelfPage from "../components/WorkAttendanceSelfPage";

export default function AsistenIshVaqtiPage() {
  const { session } = useAuth();
  const assistantId =
    session?.role === "asisten" ? String(session.assistantId || "") : "";
  const personId = asistenAttendancePersonId(assistantId);
  const assistantLogin =
    session?.role === "asisten" ? String(session.login || "").trim() : "";
  const assistantName =
    session?.role === "asisten" ? String(session.name || "Asisten") : "Asisten";
  const masterName =
    session?.role === "asisten"
      ? String(session.masterName || "Administrator").trim()
      : "";

  const storagePrefix = useMemo(
    () => `ish_vaqti_asst_${assistantId || "guest"}`,
    [assistantId],
  );

  return (
    <WorkAttendanceSelfPage
      personId={personId}
      personLogin={assistantLogin}
      personName={assistantName || "Asisten"}
      storagePrefix={storagePrefix}
      personKind="asisten"
      assistantId={assistantId}
      masterName={masterName}
      missingProfileMessage="Asisten profili topilmadi. Qayta kiring yoki administrator bilan bog‘laning."
    />
  );
}
