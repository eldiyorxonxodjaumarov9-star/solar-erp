import { activeAccount } from '../accountSecurity.js';
import { workerIdentityBinding } from './workerIdentity.js';
export const revision = doc => doc.exists ? `${doc.updateTime.seconds}:${doc.updateTime.nanoseconds}` : null;
const conflict = () => { throw Object.assign(new Error('Review unavailable'), { status: 409 }); };
const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 128 && !id.includes('/');
async function profile(reader, db, id) {
  const read = ref => reader === db ? ref.get() : reader.get(ref);
  const worker = await read(db.doc('workers/' + id));
  return { doc: worker.exists ? worker : await read(db.doc('users/' + id)), source: worker.exists ? 'workers' : 'users' };
}
// A review is bound to a specific mapping revision; resolved reviews are never reopened.
export async function queueSecurityReview(tx, db, snapshot) {
  const mapping = snapshot.data();
  if (!validId(mapping.workerId)) return;
  const ref = db.doc('telegramLinkReviews/security_' + snapshot.id + '_' + revision(snapshot).replace(':', '_'));
  if ((await tx.get(ref)).exists) return;
  tx.create(ref, { telegramUserId: snapshot.id, telegramChatId: mapping.telegramChatId,
    workerId: mapping.workerId, candidateWorkerIds: [mapping.workerId], reason: 'identity_mismatch',
    status: 'admin_review', createdAt: new Date().toISOString(), mappingVersion: revision(snapshot) });
}
export async function reviewDetail(db, id) {
  if (!validId(id)) conflict();
  const review = await db.doc('telegramLinkReviews/' + id).get();
  if (!review.exists) conflict();
  const data = review.data();
  const candidates = data.candidateWorkerIds || [data.workerId];
  const workers = [];
  for (const workerId of candidates.filter(validId)) {
    const { doc } = await profile(db, db, workerId);
    workers.push({ workerId, name: String(doc.data()?.fullName || doc.data()?.name || '').slice(0,128),
      active: activeAccount(doc.data()), version: revision(doc) });
  }
  const mapping = await db.doc('telegramLinks/' + data.telegramUserId).get();
  return { id, version: revision(review), status: data.status, reason: data.reason || 'ambiguous_phone',
    createdAt: data.createdAt || data.requestedAt, telegramId: '***' + String(data.telegramUserId).slice(-3),
    workers, currentMapping: mapping.exists ? { workerId: mapping.data().workerId, status: mapping.data().status } : null };
}
export async function reviewList(db) {
  const reviews = await db.collection('telegramLinkReviews').where('status', '==', 'admin_review').limit(100).get();
  return Promise.all(reviews.docs.map(doc => reviewDetail(db, doc.id)));
}
export async function recoverReview(db, id, input, adminUid, action) {
  if (!validId(id) || !validId(input?.workerId) || input.workerId.length > 123 || typeof input?.version !== 'string' || !adminUid) conflict();
  const audit = db.collection('telegramLinkAudit').doc();
  return db.runTransaction(async tx => {
    const reviewRef = db.doc('telegramLinkReviews/' + id), review = await tx.get(reviewRef);
    if (!review.exists || review.data().status !== 'admin_review' || revision(review) !== input.version) conflict();
    const data = review.data(), workerId = input.workerId;
    if (!(data.candidateWorkerIds || [data.workerId]).includes(workerId) ||
        (data.workerId && data.workerId !== workerId) || !/^\d+$/.test(data.telegramUserId) || data.telegramChatId !== data.telegramUserId) conflict();
    const forward = db.doc('telegramLinks/' + data.telegramUserId), current = await tx.get(forward);
    if (revision(current) !== (data.mappingVersion ?? null) || (current.exists && current.data().workerId !== workerId)) conflict();
    const reverse = db.doc('telegramWorkerLinks/' + workerId), existingReverse = await tx.get(reverse);
    if (existingReverse.exists && (existingReverse.data().telegramUserId !== data.telegramUserId || existingReverse.data().workerId !== workerId)) conflict();
    const forwards = await tx.get(db.collection('telegramLinks').where('workerId', '==', workerId));
    const reverses = await tx.get(db.collection('telegramWorkerLinks').where('telegramUserId', '==', data.telegramUserId));
    if (forwards.docs.some(doc => doc.id !== data.telegramUserId) || reverses.docs.some(doc => doc.id !== workerId)) conflict();
    let mapping;
    if (action === 'approve') {
      const { doc, source } = await profile(tx, db, workerId);
      const binding = workerIdentityBinding(doc, source);
      if (!activeAccount(doc.data()) || !binding || revision(doc) !== input.workerVersion) conflict();
      mapping = { telegramUserId: data.telegramUserId, telegramChatId: data.telegramChatId, workerId,
        firebaseUid: `usta:${workerId}`, linkedAt: new Date().toISOString(), status: 'linked', identityBinding: binding };
    } else if (action !== 'reject') conflict();
    const timestamp = new Date().toISOString();
    if (mapping) { tx.set(forward, mapping); tx.set(reverse, mapping); }
    else { tx.delete(forward); tx.delete(reverse); }
    tx.update(reviewRef, { status: mapping ? 'approved' : 'rejected', resolvedAt: timestamp });
    tx.create(audit, { action: mapping ? 'approve_rebind' : 'reject_unlink', adminUid, workerId, reviewId: id, timestamp });
    return { ok: true };
  });
}
