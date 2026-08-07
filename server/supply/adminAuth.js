/**
 * Admin so‘rovini tekshirish.
 * Headers: X-Solar-Role: admin, X-Solar-Login, X-Solar-Password
 * yoki X-Supply-Admin-Token / Authorization: Bearer <SUPPLY_ADMIN_TOKEN>
 */
export function isAdminRequest(req) {
  const envToken = String(process.env.SUPPLY_ADMIN_TOKEN || "").trim();
  const headerToken = String(req.headers["x-supply-admin-token"] || "").trim();
  const bearer = String(req.headers.authorization || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (envToken && (headerToken === envToken || bearer === envToken)) {
    return true;
  }

  const role = String(req.headers["x-solar-role"] || "").toLowerCase();
  if (role !== "admin") return false;

  const login = String(req.headers["x-solar-login"] || "").trim();
  const password = String(req.headers["x-solar-password"] || "");

  const envLogin = String(process.env.ADMIN_LOGIN || "admin").trim();
  const envPassword = String(process.env.ADMIN_PASSWORD || "admin123");

  return login === envLogin && password === envPassword;
}

export function requireAdmin(req, res) {
  if (!isAdminRequest(req)) {
    res.status(403).json({ ok: false, error: "Faqat admin uchun" });
    return false;
  }
  return true;
}
