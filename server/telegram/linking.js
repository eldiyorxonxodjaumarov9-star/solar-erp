import { queueSecurityReview } from './reviewRecovery.js';
import { authorizeExistingTelegramMapping } from './workerAuthorization.js';
import { resolveWorkerIdentity } from './workerIdentity.js';

const denied = () => ({ status: 'denied', text: 'Bog‘lash amalga oshmadi. Administratorga murojaat qiling.' });
export async function handleTelegramLink(db, update) {
  const message = update?.message;
  const id = message?.from?.id;
  if (!Number.isSafeInteger(id) || id <= 0 || message?.from?.is_bot ||
      message?.chat?.type !== 'private' || message.chat.id !== id) return denied();
  if (/^\/start(?:\s|$)/.test(message.text || '')) return {
    status: 'contact_requested', text: 'Telefon raqamingizni yuboring.', reply_markup: {
      keyboard: [[{ text: 'Telefon raqamni yuborish', request_contact: true }]],
      resize_keyboard: true, one_time_keyboard: true,
    },
  };
  if (!message.contact || message.contact.user_id !== id) return denied();
  const telegramUserId = String(id);
  return db.runTransaction(async tx => {
    const forward = db.collection('telegramLinks').doc(telegramUserId);
    const existing = await tx.get(forward);
    if (existing.exists) {
      const authorization = await authorizeExistingTelegramMapping(tx, db, existing, telegramUserId, String(message.chat.id));
      if (authorization.status === 'security_review') await queueSecurityReview(tx, db, existing);
      return denied();
    }
    const resolved = await resolveWorkerIdentity(tx, db, message.contact.phone_number);
    if (resolved.status === 'review') {
      tx.set(db.collection('telegramLinkReviews').doc(telegramUserId), {
        telegramUserId, telegramChatId: String(message.chat.id),
        candidateWorkerIds: resolved.workerIds, status: 'admin_review', reason: 'ambiguous_phone', mappingVersion: null,
        requestedAt: new Date().toISOString(),
      });
      return denied();
    }
    if (resolved.status !== 'resolved') return denied();
    const { workerId, firebaseUid } = resolved.identity;
    const reverse = db.collection('telegramWorkerLinks').doc(workerId);
    if ((await tx.get(reverse)).exists) return denied();
    const mapping = { telegramUserId, telegramChatId: String(message.chat.id),
      workerId, firebaseUid, linkedAt: new Date().toISOString(), status: 'linked', identityBinding: resolved.identityBinding };
    tx.create(forward, mapping); tx.create(reverse, mapping);
    return { status: 'linked', text: 'Hisobingiz bog‘landi.', reply_markup: { remove_keyboard: true } };
  });
}
