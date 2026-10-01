// Only call with the /api/auth/session response obtained using a Firebase ID token.
export function verifiedSessionForUser(session, user) {
  if (!user || user.isAnonymous || !session || !["admin", "usta", "asisten"].includes(session.role)) return null;
  const role = session.role;
  const id = role === "admin" ? "primary" : role === "usta" ? session.workerId : session.assistantId;
  if (typeof id !== "string" || !id || user.uid !== `${role}:${id}`) return null;
  return Object.freeze({ role, login: String(session.login || ""), name: String(session.name || ""),
    ...(role === "usta" ? { workerId: id } : {}), ...(role === "asisten" ? { assistantId: id } : {}) });
}
