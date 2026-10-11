import { createHash } from 'node:crypto';
import { activeAccount } from '../accountSecurity.js';

export function normalizePhone(value) {
  if (typeof value !== 'string' || !/^[+\d\s().-]+$/.test(value)) return null;
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 9) digits = '998' + digits;
  return /^[1-9]\d{7,14}$/.test(digits) ? '+' + digits : null;
}

export function workerIdentityBinding(snapshot, source) {
  const phone = normalizePhone(snapshot.data()?.phone);
  if (!snapshot.createTime || !phone) return null;
  return { source, createdAt: `${snapshot.createTime.seconds}:${snapshot.createTime.nanoseconds}`,
    phoneHash: createHash('sha256').update(phone).digest('hex') };
}
// Read both namespaces in the linking transaction. Workers is authoritative;
// legacy users with the same document ID represent the same identity.
export async function resolveWorkerIdentity(tx, db, inputPhone) {
  const phone = normalizePhone(inputPhone);
  if (!phone) return { status: 'denied' };
  const workers = await tx.get(db.collection('workers'));
  const users = await tx.get(db.collection('users'));
  const canonical = new Map(workers.docs.map(doc => [doc.id, doc]));
  const candidates = new Set();
  for (const doc of [...workers.docs, ...users.docs]) {
    if (normalizePhone(doc.data().phone) === phone) candidates.add(doc.id);
  }
  if (candidates.size > 1) return { status: 'review', workerIds: [...candidates].sort() };
  if (candidates.size !== 1) return { status: 'denied' };
  const workerId = [...candidates][0];
  const snapshot = canonical.get(workerId) || users.docs.find(doc => doc.id === workerId);
  const profile = snapshot?.data();
  // A stale legacy phone cannot override a newer workers profile.
  if (!activeAccount(profile) || normalizePhone(profile.phone) !== phone ||
      !workerId || workerId.includes('/') || `usta:${workerId}`.length > 128) return { status: 'denied' };
  const identityBinding = workerIdentityBinding(snapshot, canonical.has(workerId) ? 'workers' : 'users');
  if (!identityBinding) return { status: 'denied' };
  return { status: 'resolved', identityBinding, identity: {
    workerId, firebaseUid: `usta:${workerId}`,
    name: String(profile.fullName || profile.name || '').slice(0, 128), phone,
  } };
}
