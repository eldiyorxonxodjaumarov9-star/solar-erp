import { queueSecurityReview } from './reviewRecovery.js';
import { isDeepStrictEqual } from 'node:util';
import { activeAccount } from '../accountSecurity.js';
import { workerIdentityBinding } from './workerIdentity.js';

const deny = () => ({ status: 'denied' });
const review = () => ({ status: 'security_review' });

// Internal server guard. Call before EVERY future protected Telegram action;
// never serialize the authorized identity or security reason to Telegram.
export async function authorizeExistingTelegramMapping(tx, db, snapshot, telegramId, chatId) {
  if (!snapshot.exists) return deny();
  const mapping = snapshot.data();
  const workerId = mapping.workerId;
  if (typeof workerId !== 'string' || !workerId || workerId.includes('/') ||
      mapping.telegramUserId !== telegramId || mapping.telegramChatId !== chatId ||
      mapping.firebaseUid !== `usta:${workerId}` || mapping.status !== 'linked' || !mapping.identityBinding) return review();
  const reverse = await tx.get(db.collection('telegramWorkerLinks').doc(workerId));
  if (!reverse.exists || !isDeepStrictEqual(reverse.data(), mapping)) return review();
  const worker = await tx.get(db.collection('workers').doc(workerId));
  const profile = worker.exists ? worker : await tx.get(db.collection('users').doc(workerId));
  if (!profile.exists) return deny();
  const binding = workerIdentityBinding(profile, worker.exists ? 'workers' : 'users');
  if (!isDeepStrictEqual(binding, mapping.identityBinding)) return review();
  if (!activeAccount(profile.data())) return deny();
  return { status: 'authorized', workerId, firebaseUid: mapping.firebaseUid };
}

export async function authorizeTelegramWorker(db, update) {
  const message = update?.message;
  const id = message?.from?.id;
  if (!Number.isSafeInteger(id) || id <= 0 || message?.from?.is_bot ||
      message?.chat?.type !== 'private' || message.chat.id !== id) return deny();
  try {
    return await db.runTransaction(async tx => {
      const snapshot = await tx.get(db.collection('telegramLinks').doc(String(id)));
      const result = await authorizeExistingTelegramMapping(tx, db, snapshot, String(id), String(message.chat.id));
      if (result.status === 'security_review') await queueSecurityReview(tx, db, snapshot);
      return result;
    });
  } catch { return deny(); }
}
