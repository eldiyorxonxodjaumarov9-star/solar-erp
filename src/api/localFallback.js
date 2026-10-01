/** SQL server / Firebase ishlamasa localStorage zaxirasiga o‘tish. */
export function canUseLocalFallback(error) {
  const msg = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  if (isFirebasePermissionError(error) || code === "unauthenticated") return false;
  return (
    msg.includes("mahalliy") ||
    msg.includes("serverga ulanish") ||
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("auth/configuration-not-found") ||
    (msg.includes("firebase") && msg.includes("mahalliy"))
  );
}

export function isFirebasePermissionError(error) {
  const msg = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  return code.includes('permission-denied') || error?.status === 401 || error?.status === 403
    || msg.includes('insufficient permissions') || msg.includes('missing or insufficient permissions');
}
