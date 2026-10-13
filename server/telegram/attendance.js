import { handleDayOff, DAY_OFF_BUTTON, CANCEL, CONFIRM } from './dayOff.js';
import { attendanceCaption } from './attendanceResponse.js';
import { validateCameraImage } from './cameraSecurity.js';
import { createHash, randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { authorizeExistingTelegramMapping } from './workerAuthorization.js';
import { queueSecurityReview } from './reviewRecovery.js';
import { handleTelegramLink } from './linking.js';
import { createTelegramPhotoDownloader, validateTelegramImage } from './photoDownload.js';
import { serverStorageBucket, savePrivateImage } from '../privateStorage.js';
import { instantToTashkentYMD } from '../../src/photos/tashkentTime.js';
export const ATTENDANCE_MENU = { keyboard: [['🟢 Keldim', '🔴 Ketdim'], [DAY_OFF_BUTTON, '📍 Bugungi holatim']], resize_keyboard: true };
const cameraPrompt = (action, token, url) => ({ status: 'pending', text: action === 'check_in' ? '📸 Ishga kelishni tasdiqlash uchun kamera orqali yuzingizni rasmga oling.' : '📸 Ishdan ketishni tasdiqlash uchun kamera orqali yuzingizni rasmga oling.', reply_markup: { inline_keyboard: [[{ text: '📸 Kamerani ochish', web_app: { url: `${url}#action=${action}&request=${token}` } }]] } });
const denied = () => ({ status: 'denied', text: 'Amal bajarilmadi. Administratorga murojaat qiling.' });
const answer = (text, status = 'done') => ({ status, text, reply_markup: ATTENDANCE_MENU });
const actions = new Map([['🟢 Keldim','check_in'],['🔴 Ketdim','check_out'],['📷 Rasm yuborish','photo_wait'],['📍 Bugungi holatim','today'],[DAY_OFF_BUTTON,'day_off_start'],[CANCEL,'day_off_cancel'],[CONFIRM,'day_off_confirm']]);
const actionFor = text => actions.get(text);
export function createTelegramAttendanceHandler({ now = () => new Date(), downloadPhoto = createTelegramPhotoDownloader(), getBucket = serverStorageBucket, miniAppUrl = process.env.TELEGRAM_CAMERA_URL || 'https://77.237.237.94/api/telegram/camera' } = {}) {
  const handler = async (db, update, camera) => {
    const message = update?.message, id = message?.from?.id;
    if (!Number.isSafeInteger(id) || id <= 0 || message.from.is_bot || message.chat?.type !== 'private' || message.chat.id !== id ||
        !Number.isSafeInteger(update.update_id) || update.update_id < 0) return denied();
    const telegramId = String(id), date = instantToTashkentYMD(now());
    const requestToken = randomUUID();
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
      const pendingCheckOut = state.pendingAction === 'check_out_photo' && state.awaitingPhoto && state.telegramUserId === telegramId && state.expiresAt >= now().getTime();
      if (!action && !['day_off_reason','day_off_confirm'].includes(state.pendingAction)) return (pendingCheckIn || pendingCheckOut) ? answer('⚠️ Iltimos, yuzingiz tushgan rasm yuboring.', 'denied') : denied();
      const receiptRef = db.collection('telegramAttendanceUpdates').doc(camera ? telegramId + '_mini_' + camera.requestToken : telegramId + '_' + update.update_id);
      const receipt = await tx.get(receiptRef);
      if (receipt.exists) {
        if (camera && (receipt.data().workerId !== workerId || receipt.data().date !== date || receipt.data().action !== camera.action + '_photo')) return denied();
        return answer(camera ? (camera.action === 'check_in' ? '✅ Kelish qayd etildi' : '✅ Ketish qayd etildi') : 'So‘rov qabul qilingan.', 'duplicate');
      }
      const logs = await tx.get(db.collection('user_activity_logs').where('ustaId', '==', workerId));
      const today = logs.docs.filter(doc => (doc.data().dateKey || instantToTashkentYMD(doc.data().loginTime)) === date);
      // Never guess when old app data has multiple sessions for this worker/day.
      if (today.length > 1) return denied();
      const existing = today[0], record = existing?.data();
      const hasCheckIn = Boolean(record?.loginTime && record.workAttendance === true);
      const logRef = existing?.ref || db.collection('user_activity_logs').doc('telegram_' + key);
      const offResult = await handleDayOff({tx,db,action,message:{...message,updateId:update.update_id},state,stateRef,receiptRef,record,existing,logRef,workerId,telegramId,date,now,requestToken,answer});
      if(offResult)return offResult;
      if(record?.type==='day_off'||record?.dayOff===true)return answer('Bugungi dam olish qayd etilgan.','denied');
      const photoType = pendingCheckOut || (!pendingCheckIn && record?.logoutTime) ? 'ketdi' : 'keldi';
      const photoRef = db.collection('stage_photos').doc(workerId + '_' + photoType + '_' + date);
      const existingPhoto = await tx.get(photoRef);
      const arrivalPhoto = await tx.get(db.collection('stage_photos').doc(workerId + '_keldi_' + date));
      const departurePhoto = await tx.get(db.collection('stage_photos').doc(workerId + '_ketdi_' + date));
      if (action === 'today') {
        const worker=await tx.get(db.collection('workers').doc(workerId));
        const profile=worker.exists?worker.data():(await tx.get(db.collection('users').doc(workerId))).data();
        return answer(attendanceCaption({record:record||{},workerName:record?.ustaName||profile?.fullName||profile?.name,date,arrival:arrivalPhoto.exists,departure:departurePhoto.exists}));
      }
      if (action === 'check_in' && hasCheckIn) return answer('Bugungi kelish qayd etilgan.', 'duplicate');
      if (action !== 'check_in' && !hasCheckIn && !(action === 'photo' && pendingCheckIn)) return denied();
      if (action === 'photo' && pendingCheckIn && hasCheckIn) return answer('Bugungi kelish qayd etilgan.', 'duplicate');
      if (action === 'check_out' && record.logoutTime) return answer('Bugungi ketish qayd etilgan.', 'duplicate');
      if (action === 'photo' && pendingCheckOut && record?.logoutTime) return answer('Bugungi ketish qayd etilgan.', 'duplicate');
      if (action === 'photo' && (pendingCheckIn || pendingCheckOut) && !camera) return answer('📸 Tasdiqlash uchun Kamerani ochish tugmasidan foydalaning.', 'denied');
      if (camera && (!(pendingCheckIn || pendingCheckOut) || state.requestToken !== camera.requestToken || camera.action !== (pendingCheckIn ? 'check_in' : 'check_out'))) return denied();
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
      if (action === 'photo' && pendingCheckOut) tx.update(logRef, { logoutTime: iso, totalWorkTime: Math.max(0,Math.floor((Date.parse(iso)-Date.parse(record.loginTime))/1000)),
        isOnline: false, source: 'telegram', checkOutAt: FieldValue.serverTimestamp(), checkOutSource: 'telegram', type: 'check_out' });
      if (action === 'photo') {
        tx.create(photoRef, { id: photoRef.id, ustaId: workerId, ustaName: name, type: photoType, dateKey: date,
          uploadDate: iso, source: 'work_log', channel: 'telegram', projectId: '', projectName: '', brigadeId: '', brigadeName: '',
          imageData: '', imageUrl: attach.saved.downloadUrl, storagePath: attach.saved.storagePath, contentType: attach.contentType,
          createdAt: FieldValue.serverTimestamp(), comment: 'Ish joyidan rasm' });
        if (pendingCheckOut) tx.update(logRef, { telegramDeparturePhoto: photoRef.id, departureImage: attach.saved.downloadUrl });
        else if (!pendingCheckIn) tx.update(logRef, { telegramPhoto: photoRef.id, image: attach.saved.downloadUrl });
      }
      tx.set(stateRef, { ...state, workerId, date, telegramUserId: telegramId, attendanceId: logRef.id,
        awaitingPhoto: ['photo_wait','check_in','check_out'].includes(action),
        pendingAction: action === 'check_in' ? 'check_in_photo' : action === 'check_out' ? 'check_out_photo' : action === 'photo_wait' ? 'attendance_photo' : null,
        requestToken: ['check_in','check_out'].includes(action) ? requestToken : state.requestToken ?? null,
        requestId: ['photo_wait','check_in','check_out'].includes(action) ? update.update_id : state.requestId ?? null,
        expiresAt: ['photo_wait','check_in','check_out'].includes(action) ? now().getTime() + 15*60*1000 : 0 });
      tx.create(receiptRef, { workerId, telegramUserId: telegramId, updateId: update.update_id, action: action === 'photo' && pendingCheckIn ? 'check_in_photo' : action === 'photo' && pendingCheckOut ? 'check_out_photo' : action, date, createdAt: FieldValue.serverTimestamp(),
        ...(camera && action === 'photo' && (pendingCheckIn || pendingCheckOut) ? {groupDelivery:{status:'pending',attempts:0}} : {}),
        ...(action === 'photo' ? { fileId: message.photo.at(-1).file_id, storagePath: attach.saved.storagePath } : {}) });
      if (['check_in','check_out'].includes(action)) return cameraPrompt(action, requestToken, miniAppUrl);
      return answer(action === 'photo' && pendingCheckIn ? '✅ Kelish qayd etildi' : action === 'photo' && pendingCheckOut ? '✅ Ketish qayd etildi' : action === 'photo_wait' ? '📷 Iltimos, ish joyidan rasm yuboring.' : '📷 Rasm saqlandi.');
    }, message.text === CONFIRM ? { maxAttempts: 10 } : undefined);
    try {
      const result = await run();
      if (result.unlinked) return message.contact || /^\/start(?:\s|$)/.test(message.text || '') ? handleTelegramLink(db, update) : denied();
      if (!result.download) return result;
      if (!Array.isArray(message.photo) || !message.photo.length || message.document) return denied();
      media = camera ? validateCameraImage(camera.buffer, camera.contentType) : validateTelegramImage((await downloadPhoto(message.photo.at(-1))).buffer);
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
          const receipt = await db.collection('telegramAttendanceUpdates').doc(camera ? telegramId + '_mini_' + camera.requestToken : telegramId + '_' + update.update_id).get();
          if (receipt.data()?.storagePath !== ownedObject) await bucket.file(ownedObject).delete().catch(() => {});
        } catch { /* Keep an inaccessible private object when commit state is uncertain. */ }
      }
    }
  };
  handler.submitCameraPhoto = (db, camera) => handler(db, { update_id: 0, message: { from: { id: Number(camera.telegramUserId) }, chat: { id: Number(camera.telegramUserId), type: 'private' }, photo: [{ file_id: 'mini_app_camera' }] } }, camera);
  return handler;
}
