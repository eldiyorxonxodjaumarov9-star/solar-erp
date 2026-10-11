import { createHash, randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { authorizeExistingTelegramMapping } from './workerAuthorization.js';
import { queueSecurityReview } from './reviewRecovery.js';
import { handleTelegramLink } from './linking.js';
import { createTelegramPhotoDownloader, validateTelegramImage } from './photoDownload.js';
import { serverStorageBucket, savePrivateImage } from '../privateStorage.js';
import { instantToTashkentYMD } from '../../src/photos/tashkentTime.js';
export const ATTENDANCE_MENU = { keyboard: [['🟢 Keldim', '🔴 Ketdim'], ['📷 Rasm yuborish', '📍 Bugungi holatim']], resize_keyboard: true };
const PHOTO_PROMPT = '📸 Ishga kelishni tasdiqlash uchun hozir kameradan yuzingiz tushgan rasm yuboring.';
const photoPrompt = () => ({ status: 'pending', text: PHOTO_PROMPT, reply_markup: { force_reply: true, selective: true, input_field_placeholder: '📎 → Kamera → yuzingiz tushgan rasm' } });
const denied = () => ({ status: 'denied', text: 'Amal bajarilmadi. Administratorga murojaat qiling.' });
const answer = (text, status = 'done') => ({ status, text, reply_markup: ATTENDANCE_MENU });
const actions = new Map([['🟢 Keldim','check_in'],['🔴 Ketdim','check_out'],['📷 Rasm yuborish','photo_wait'],['📍 Bugungi holatim','today']]);
const actionFor = text => actions.get(text);
const time = iso => iso ? new Intl.DateTimeFormat('uz-UZ', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—';
export function createTelegramAttendanceHandler({ now = () => new Date(), downloadPhoto = createTelegramPhotoDownloader(), getBucket = serverStorageBucket } = {}) {
  return async (db, update) => {
    const message = update?.message, id = message?.from?.id;
    if (!Number.isSafeInteger(id) || id <= 0 || message.from.is_bot || message.chat?.type !== 'private' || message.chat.id !== id ||
        !Number.isSafeInteger(update.update_id) || update.update_id < 0) return denied();
    const telegramId = String(id), date = instantToTashkentYMD(now());
    let media, ownedObject, bucket;
    const run = async attach => db.runTransaction(async tx => {
      const mapping = await tx.get(db.collection('telegramLinks').doc(telegramId));
      if (!mapping.exists) return { unlinked: true };
      const guard = await authorizeExistingTelegramMapping(tx, db, mapping, telegramId, String(message.chat.id));
      if (guard.status !== 'authorized') {
        if (guard.status === 'security_review') await queueSecurityReview(tx, db, mapping);
        return denied();
      }
      const workerId = guard.workerId;
      if (!/^[-A-Za-z0-9_]+$/.test(workerId)) return denied();
      const action = message.photo ? 'photo' : actionFor(message.text);
      if (/^\/start(?:\s|$)/.test(message.text || '')) return answer('Kerakli amalni tanlang.');
      const key = createHash('sha256').update(workerId + ':' + date).digest('hex');
      const stateRef = db.collection('telegramAttendanceState').doc(key), stateDoc = await tx.get(stateRef), state = stateDoc.data() || {};
      const pendingCheckIn = state.pendingAction === 'check_in_photo' && state.awaitingPhoto && state.telegramUserId === telegramId && state.expiresAt >= now().getTime();
      if (!action) return pendingCheckIn ? answer('⚠️ Iltimos, yuzingiz tushgan rasm yuboring.', 'denied') : denied();
      const receiptRef = db.collection('telegramAttendanceUpdates').doc(telegramId + '_' + update.update_id);
      if ((await tx.get(receiptRef)).exists) return answer('So‘rov qabul qilingan.', 'duplicate');
      const logs = await tx.get(db.collection('user_activity_logs').where('ustaId', '==', workerId));
      const today = logs.docs.filter(doc => (doc.data().dateKey || instantToTashkentYMD(doc.data().loginTime)) === date);
      // Never guess when old app data has multiple sessions for this worker/day.
      if (today.length > 1) return denied();
      const existing = today[0], record = existing?.data();
      const hasCheckIn = Boolean(record?.loginTime && record.workAttendance === true);
      const logRef = existing?.ref || db.collection('user_activity_logs').doc('telegram_' + key);
      const photoType = !pendingCheckIn && record?.logoutTime ? 'ketdi' : 'keldi';
      const photoRef = db.collection('stage_photos').doc(workerId + '_' + photoType + '_' + date);
      const existingPhoto = await tx.get(photoRef);
      if (action === 'today') return answer(`📅 ${date.split('-').reverse().join('.')}\n🟢 Keldi: ${time(hasCheckIn ? record.loginTime : null)}\n🔴 Ketdi: ${time(record?.logoutTime)}\n📷 Rasm: ${record?.telegramPhoto || existingPhoto.exists ? 'yuborilgan' : 'yuborilmagan'}`);
      if (action === 'check_in' && hasCheckIn) return answer('Bugungi kelish qayd etilgan.', 'duplicate');
      if (action !== 'check_in' && !hasCheckIn && !(action === 'photo' && pendingCheckIn)) return denied();
      if (action === 'photo' && pendingCheckIn && hasCheckIn) return answer('Bugungi kelish qayd etilgan.', 'duplicate');
      if (action === 'check_out' && record.logoutTime) return answer('Bugungi ketish qayd etilgan.', 'duplicate');
      if (action === 'photo' && (!state.awaitingPhoto || state.telegramUserId !== telegramId || state.expiresAt < now().getTime() || existingPhoto.exists)) return denied();
      if (action === 'photo' && !attach) return { download: true, workerId, stateVersion: state.requestId };
      if (action === 'photo' && (attach.workerId !== workerId || attach.stateVersion !== state.requestId)) return denied();
      if (attach && instantToTashkentYMD(now()) !== date) return denied();
      const worker = await tx.get(db.collection('workers').doc(workerId));
      const profile = worker.exists ? worker.data() : (await tx.get(db.collection('users').doc(workerId))).data();
      const name = String(profile.fullName || profile.name || 'Usta').slice(0,128), iso = now().toISOString();
      if (action === 'photo' && pendingCheckIn) {
        const checkIn = { id: logRef.id, ustaId: workerId, ustaName: name, workerId, dateKey: date,
        loginTime: iso, logoutTime: null, totalWorkTime: null, isOnline: true, workAttendance: true,
        brigadeId: '', brigadeName: '', deviceInfo: { platform: 'Telegram', browser: 'Telegram bot', userAgent: '' },
        source: 'telegram', type: 'check_in', checkInAt: FieldValue.serverTimestamp(), image: attach.saved.downloadUrl, telegramPhoto: photoRef.id };
        if (existing) tx.update(logRef, checkIn); else tx.create(logRef, checkIn);
      }
      if (action === 'check_out') tx.update(logRef, { logoutTime: iso, totalWorkTime: Math.max(0,Math.floor((Date.parse(iso)-Date.parse(record.loginTime))/1000)),
        isOnline: false, source: 'telegram', checkOutAt: FieldValue.serverTimestamp(), checkOutSource: 'telegram', type: 'check_out' });
      if (action === 'photo') {
        tx.create(photoRef, { id: photoRef.id, ustaId: workerId, ustaName: name, type: photoType, dateKey: date,
          uploadDate: iso, source: 'work_log', channel: 'telegram', projectId: '', projectName: '', brigadeId: '', brigadeName: '',
          imageData: '', imageUrl: attach.saved.downloadUrl, storagePath: attach.saved.storagePath, contentType: attach.contentType,
          createdAt: FieldValue.serverTimestamp(), comment: 'Ish joyidan rasm' });
        if (!pendingCheckIn) tx.update(logRef, { telegramPhoto: photoRef.id, image: attach.saved.downloadUrl });
      }
      tx.set(stateRef, { ...state, workerId, date, telegramUserId: telegramId, attendanceId: logRef.id,
        awaitingPhoto: action === 'photo_wait' || action === 'check_in',
        pendingAction: action === 'check_in' ? 'check_in_photo' : action === 'photo_wait' ? 'attendance_photo' : null,
        requestId: action === 'photo_wait' || action === 'check_in' ? update.update_id : state.requestId ?? null,
        expiresAt: action === 'photo_wait' || action === 'check_in' ? now().getTime() + 15*60*1000 : 0 });
      tx.create(receiptRef, { workerId, telegramUserId: telegramId, updateId: update.update_id, action: action === 'photo' && pendingCheckIn ? 'check_in_photo' : action, date, createdAt: FieldValue.serverTimestamp(),
        ...(action === 'photo' ? { fileId: message.photo.at(-1).file_id, storagePath: attach.saved.storagePath } : {}) });
      if (action === 'check_in') return photoPrompt();
      return answer(action === 'photo' && pendingCheckIn ? '🟢 Kelish qayd etildi.' : action === 'check_out' ? '🔴 Ketish qayd etildi.' : action === 'photo_wait' ? '📷 Iltimos, ish joyidan rasm yuboring.' : '📷 Rasm saqlandi.');
    });
    try {
      const result = await run();
      if (result.unlinked) return message.contact || /^\/start(?:\s|$)/.test(message.text || '') ? handleTelegramLink(db, update) : denied();
      if (!result.download) return result;
      if (!Array.isArray(message.photo) || !message.photo.length || message.document) return denied();
      media = validateTelegramImage((await downloadPhoto(message.photo.at(-1))).buffer);
      bucket = await getBucket(); if (bucket.adapter !== 'vps') throw new Error('VPS private storage required');
      ownedObject = `private/${result.workerId}/projects/attendance/images/${randomUUID()}.${media.extension}`;
      const saved = await savePrivateImage(bucket, ownedObject, media.buffer, media.contentType);
      const response = await run({ ...result, saved, contentType: media.contentType });
      if (response.status === 'done') ownedObject = null;
      return response;
    } finally {
      if (ownedObject && bucket) {
        // A lost commit acknowledgement must not delete an already attached file.
        try {
          const receipt = await db.collection('telegramAttendanceUpdates').doc(telegramId + '_' + update.update_id).get();
          if (receipt.data()?.storagePath !== ownedObject) await bucket.file(ownedObject).delete().catch(() => {});
        } catch { /* Keep an inaccessible private object when commit state is uncertain. */ }
      }
    }
  };
}
