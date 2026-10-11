import { Router, json } from 'express';
import { requireFirebaseSession } from '../authMiddleware.js';
import { getServerAdminDb } from '../firebaseAdminAuth.js';
import { reviewList, reviewDetail, recoverReview } from '../telegram/reviewRecovery.js';
export function createTelegramReviewRouter({ getDb = getServerAdminDb, authorize = requireFirebaseSession } = {}) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(authorize(['admin']));
  router.use(json({ limit: '16kb' }));
  const handle = handler => async (req, res) => {
    try { res.json(await handler(req, await getDb())); }
    catch (error) { res.status(error.status === 409 ? 409 : 503).json({ error: 'Review unavailable' }); }
  };
  router.get('/', handle((_req, db) => reviewList(db)));
  router.get('/:id', handle((req, db) => reviewDetail(db, req.params.id)));
  for (const action of ['approve', 'reject']) router.post('/:id/' + action,
    handle((req, db) => recoverReview(db, req.params.id, req.body, req.authClaims.uid, action)));
  router.use((_error, _req, res, _next) => res.status(400).json({ error: 'Review unavailable' }));
  return router;
}
