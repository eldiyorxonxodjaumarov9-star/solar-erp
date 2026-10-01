// Private supply routes first require the common verified Firebase session middleware.
export function attachSupplyIdentity(req, _res, next) { req.serverVerifiedAdmin = req.authSession?.role === 'admin'; next(); }
export function isAdminRequest(req) { return req.serverVerifiedAdmin === true && req.authSession?.role === 'admin'; }
export function requireAdmin(req, res) {
 if (isAdminRequest(req)) return true;
 res.status(403).json({ok:false,error:'Faqat admin uchun'});return false;
}
