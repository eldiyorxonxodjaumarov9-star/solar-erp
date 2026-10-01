import { Router } from "express";
import { createServerTokenIssuer, verifyServerIdToken } from "../firebaseAdminAuth.js";
import { createAccountVerifier, LOGIN_ERROR, sessionFromVerifiedClaims } from "../authAccounts.js";

import { assertAccountSession } from "../accountSecurity.js";
export function createAuthRouter({ verifyAccount = createAccountVerifier(), issueToken = createServerTokenIssuer, verifyToken = verifyServerIdToken, validateAccount = assertAccountSession } = {}) {
  const router = Router();
  const attempts = new Map();
  router.post("/login", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const now = Date.now();
    for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
    const key = req.ip;
    const bucket = attempts.get(key) || { count: 0, until: now + 60000 };
    attempts.set(key, bucket);
    if (++bucket.count > 15) return res.status(429).json({ ok: false, error: LOGIN_ERROR });
    try {
      const issuer = issueToken(verifyAccount);
      const customToken = await issuer(req.body);
      return res.json({ ok: true, customToken });
    } catch {
      // Do not log requests, passwords, token responses, account existence, or raw SDK errors.
      return res.status(401).json({ ok: false, error: LOGIN_ERROR });
    }
  });
  router.get("/session", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const header = String(req.headers.authorization || "");
      if (!header.startsWith("Bearer ")) throw new Error();
      const claims = await verifyToken(header.slice(7));
      if (claims?.firebase?.sign_in_provider !== "custom") throw new Error();
      const session = sessionFromVerifiedClaims(claims);
      if (!session) throw new Error();
      await validateAccount(claims);
      return res.json({ ok: true, session });
    } catch { return res.status(401).json({ ok: false, error: "Sessiya tasdiqlanmadi." }); }
  });
  return router;
}
