import { instantToTashkentYMD } from '../../src/photos/tashkentTime.js';
import { FieldValue } from 'firebase-admin/firestore';
import { authorizeExistingTelegramMapping } from './workerAuthorization.js';
export const DAY_OFF_BUTTON = '🏠 Bugun dam olaman';
export const CANCEL = '❌ Bekor qilish';
export const CONFIRM = '✅ Tasdiqlash';
export const reasonValid = reason => typeof reason === 'string' && reason.trim().length > 0 && reason.trim().length <= 500 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(reason);
const cleanName = name => String(name || 'Usta').replace(/[\r\n]/g,' ').slice(0,128);
export function dayOffText({name,date,reason},kind='today') {
 const head=kind==='group'?'🏠 BUGUN DAM OLADI\n\n':kind==='confirmed'?'🏠 DAM OLISH QAYD ETILDI\n\n':kind==='preview'?'🏠 DAM OLISH\n\n':'';
 return head+'👤 '+cleanName(name)+'\n📅 Sana: '+date.split('-').reverse().join('.')+(kind==='today'?'\n🏠 Holat: Dam olish':'')+'\n📝 Sabab: '+reason+(kind==='group'?'\n\n🏢 SolarERP':kind==='preview'?'\n\nDam olish kunini tasdiqlaysizmi?':'');
}
// Called only inside the existing authorized attendance transaction; no client identity/date.
export async function handleDayOff({tx,db,action,message,state,stateRef,receiptRef,record,existing,logRef,workerId,telegramId,date,now,requestToken,answer}) {
 const pending=['day_off_reason','day_off_confirm'].includes(state.pendingAction)&&state.telegramUserId===telegramId&&state.expiresAt>=now().getTime();
 const isOff=record?.type==='day_off'||record?.dayOff===true;
 if(action==='today'&&isOff)return answer(dayOffText({name:record.ustaName,date,reason:record.reason||record.restMessage||'—'}));
 if(action==='day_off_cancel') {
  if(!pending)return answer('Amal bekor qilindi.');
  tx.set(stateRef,{...state,pendingAction:null,reason:null,awaitingPhoto:false,expiresAt:0});
  tx.create(receiptRef,{workerId,telegramUserId:telegramId,updateId:message.updateId,date,action,createdAt:FieldValue.serverTimestamp()});
  return answer('Amal bekor qilindi.');
 }
 if(!['day_off_start','day_off_confirm'].includes(action)&&!pending) return null;
 if(record?.loginTime||record?.workAttendance===true)return answer('⚠️ Bugun kelish allaqachon qayd etilgan.\nDam olish belgilab bo‘lmaydi.','denied');
 if(isOff)return answer('Bugungi dam olish qayd etilgan.','duplicate');
 const worker=await tx.get(db.collection('workers').doc(workerId));
 const profile=worker.exists?worker.data():(await tx.get(db.collection('users').doc(workerId))).data();
 const name=cleanName(profile?.fullName||profile?.name);
 const waitMarkup={keyboard:[[CANCEL]],resize_keyboard:true};
 if(action==='day_off_start') {
  tx.set(stateRef,{...state,workerId,date,telegramUserId:telegramId,pendingAction:'day_off_reason',reason:null,requestToken,awaitingPhoto:false,expiresAt:now().getTime()+15*60000});
  tx.create(receiptRef,{workerId,telegramUserId:telegramId,date,action,createdAt:FieldValue.serverTimestamp()});
  return {status:'pending',text:'🏠 Bugun dam olish\n\nBugun nima sababdan dam olishingizni yozing.\n\nMasalan:\n• Kasalman\n• Oilaviy sabab\n• Ruxsat oldim\n• Shaxsiy sabab\n\n✍️ Sababni xabar qilib yuboring.',reply_markup:waitMarkup};
 }
 if(pending&&(message.photo||message.document))return {status:'denied',text:'⚠️ Iltimos, sababni 1–500 belgili matn qilib yuboring.',reply_markup:waitMarkup};
 if(action==='day_off_confirm') {
  if(instantToTashkentYMD(now())!==date||!pending||state.pendingAction!=='day_off_confirm'||!reasonValid(state.reason))return answer('Amal bajarilmadi. Administratorga murojaat qiling.','denied');
  const committedRef=db.collection('telegramAttendanceUpdates').doc(telegramId+'_mini_'+state.requestToken);
  const committed=await tx.get(committedRef);if(committed.exists)return answer('Bugungi dam olish qayd etilgan.','duplicate');
  const value={id:logRef.id,ustaId:workerId,workerId,ustaName:name,dateKey:date,date,type:'day_off',dayOff:true,reason:state.reason,restMessage:state.reason,
   source:'telegram',createdAt:FieldValue.serverTimestamp(),loginTime:null,logoutTime:null,workAttendance:false,isOnline:false,totalWorkTime:null,
   brigadeId:'',brigadeName:'',deviceInfo:{platform:'Telegram',browser:'Telegram bot',userAgent:''}};
  if(existing)tx.update(logRef,value);else tx.create(logRef,value);
  tx.set(stateRef,{...state,pendingAction:null,reason:null,awaitingPhoto:false,expiresAt:0});
  tx.create(committedRef,{workerId,telegramUserId:telegramId,date,action:'day_off',attendanceId:logRef.id,createdAt:FieldValue.serverTimestamp(),groupDelivery:{status:'pending',attempts:0}});
  tx.create(receiptRef,{workerId,telegramUserId:telegramId,date,action:'day_off_confirm',createdAt:FieldValue.serverTimestamp()});
  return {...answer(dayOffText({name,date,reason:state.reason},'confirmed')),groupRequestToken:state.requestToken};
 }
 // Other menu actions must never become a reason or accidentally write attendance.
 if(action&&action!=='day_off_reason')return null;
 if(message.photo||message.document||!reasonValid(message.text))return {status:'denied',text:'⚠️ Iltimos, sababni 1–500 belgili matn qilib yuboring.',reply_markup:waitMarkup};
 const reason=message.text.trim();
 tx.set(stateRef,{...state,pendingAction:'day_off_confirm',reason,awaitingPhoto:false});
 tx.create(receiptRef,{workerId,telegramUserId:telegramId,date,action:'day_off_reason',createdAt:FieldValue.serverTimestamp()});
 return {status:'pending',text:dayOffText({name,date,reason},'preview'),reply_markup:{keyboard:[[CONFIRM],[CANCEL]],resize_keyboard:true}};
}
export async function committedDayOffResponse(db,telegramId,requestToken) {
 return db.runTransaction(async tx=>{
  const mapping=await tx.get(db.collection('telegramLinks').doc(telegramId));
  const guard=await authorizeExistingTelegramMapping(tx,db,mapping,telegramId,telegramId);
  if(guard.status!=='authorized')throw new Error('Response unavailable');
  const receipt=(await tx.get(db.collection('telegramAttendanceUpdates').doc(telegramId+'_mini_'+requestToken))).data();
  if(!receipt||receipt.action!=='day_off'||receipt.workerId!==guard.workerId||!/^\d{4}-\d{2}-\d{2}$/.test(receipt.date))throw new Error('Response unavailable');
  const record=(await tx.get(db.collection('user_activity_logs').doc(receipt.attendanceId))).data();
  if(!record||record.type!=='day_off'||record.ustaId!==guard.workerId||record.dateKey!==receipt.date||record.loginTime||record.workAttendance||!reasonValid(record.reason))throw new Error('Response unavailable');
  return {groupCaption:dayOffText({name:record.ustaName,date:record.dateKey,reason:record.reason},'group')};
 });
}
