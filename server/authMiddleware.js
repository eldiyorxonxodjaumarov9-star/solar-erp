import { verifyServerIdToken } from "./firebaseAdminAuth.js";
import { sessionFromVerifiedClaims } from "./authAccounts.js";
import { assertAccountSession } from './accountSecurity.js';
export function requireFirebaseSession(roles = ['admin', 'usta', 'asisten'], verify = verifyServerIdToken, validateAccount = assertAccountSession) {
  return async (req, res, next) => {
    try {
      const header = String(req.headers.authorization || '');
      if (!header.startsWith('Bearer ')) throw new Error();
      const claims = await verify(header.slice(7));
      if (claims?.firebase?.sign_in_provider !== 'custom') throw new Error();
      const session = sessionFromVerifiedClaims(claims);
      if (!session) throw new Error();
      if (!roles.includes(session.role)) return res.status(403).json({ok:false,error:'Ruxsat yoq'});
      await validateAccount(claims);
      req.authSession = session;
      req.authClaims = claims;
      next();
    } catch { return res.status(401).json({ok:false,error:'Sessiya tasdiqlanmadi.'}); }
  };
}
