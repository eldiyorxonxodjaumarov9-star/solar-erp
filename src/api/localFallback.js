/** SQL server / Firebase ishlamasa localStorage zaxirasiga o‘tish. */
export function canUseLocalFallback(error) {
  const msg = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  return (
    code === "permission-denied" ||
    msg.includes("insufficient permissions") ||
    msg.includes("missing or insufficient permissions") ||
    msg.includes("mahalliy") ||
    msg.includes("serverga ulanish") ||
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("permission-denied") ||
    msg.includes("auth/configuration-not-found") ||
    (msg.includes("firebase") && msg.includes("mahalliy"))
  );
}

export function isFirebasePermissionError(error) {
  const msg = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  return (
    code === "permission-denied" ||
    msg.includes("insufficient permissions") ||
    msg.includes("missing or insufficient permissions")
  );
}
