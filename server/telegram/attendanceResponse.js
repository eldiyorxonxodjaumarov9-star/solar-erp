import { authorizeExistingTelegramMapping } from './workerAuthorization.js';
import { serverStorageBucket } from '../privateStorage.js';
import { validateCameraImage, CAMERA_MAX_BYTES } from './cameraSecurity.js';
const instant = value => { const date=value?.toDate?.() || new Date(value); return value && Number.isFinite(date.getTime()) ? date : null; };
const time = value => { const date=instant(value); return date ? new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tashkent',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date) : '—'; };
export function workDuration(start,end) {
  const a=instant(start),b=instant(end);if(!a||!b||b<a)return '—';
  const minutes=Math.floor((b-a)/60000);return `${Math.floor(minutes/60)} soat ${minutes%60} daqiqa`;
}
export function attendanceCaption({record={},workerName,date,arrival=false,departure=false,action='today'}) {
  const entered=record.workAttendance===true ? record.loginTime || record.checkInAt : null;
  const exited=action==='check_in'||!entered ? null : record.logoutTime || record.checkOutAt;
  const heading=action==='check_in'?'✅ KELISH QAYD ETILDI\n\n':action==='check_out'?'✅ KETISH QAYD ETILDI\n\n':'';
  const name=String(workerName||record.ustaName||'Usta').replace(/[\r\n]/g,' ').slice(0,128);
  return `${heading}👤 ${name}\n📅 Sana: ${date.split('-').reverse().join('.')}\n🟢 Kelgan vaqt: ${time(entered)}\n🔴 Ketgan vaqt: ${time(exited)}\n⏱ Ish vaqti: ${workDuration(entered,exited)}\n\n📸 Kelish rasmi: ${arrival?'✅':'—'}${action==='check_in'?'':`\n📸 Ketish rasmi: ${departure?'✅':'—'}`}`;
}
export function groupAttendanceCaption({record,date,action}) {
  const name=String(record.ustaName||'Usta').replace(/[\r\n]/g,' ').slice(0,128);
  const start=record.loginTime||record.checkInAt,end=record.logoutTime||record.checkOutAt;
  const common=`👤 ${name}\n📅 Sana: ${date.split('-').reverse().join('.')}`;
  return action==='check_in' ? `🟢 KELDI\n\n${common}\n🕐 Kelgan vaqt: ${time(start)}\n\n📸 Kelish rasmi: ✅\n🏢 SolarERP`
    : `🔴 KETDI\n\n${common}\n🟢 Kelgan vaqt: ${time(start)}\n🔴 Ketgan vaqt: ${time(end)}\n⏱ Ishlagan vaqt: ${workDuration(start,end)}\n\n📸 Ketish rasmi: ✅\n🏢 SolarERP`;
}
// Only server-authenticated identity and committed private receipts reach this reader.
export async function committedPhotoResponse(db,telegramId,requestToken,action) {
  if(!/^\d+$/.test(telegramId)||!/^[-a-f0-9]{36}$/.test(requestToken)||!['check_in','check_out'].includes(action))throw new Error('Response unavailable');
  return db.runTransaction(async tx=>{
    const mapping=await tx.get(db.collection('telegramLinks').doc(telegramId));
    const guard=await authorizeExistingTelegramMapping(tx,db,mapping,telegramId,telegramId);
    if(guard.status!=='authorized'||!/^[-A-Za-z0-9_]+$/.test(guard.workerId))throw new Error('Response unavailable');
    const receipt=(await tx.get(db.collection('telegramAttendanceUpdates').doc(telegramId+'_mini_'+requestToken))).data();
    if(!receipt||receipt.workerId!==guard.workerId||receipt.action!==action+'_photo'||!/^\d{4}-\d{2}-\d{2}$/.test(receipt.date))throw new Error('Response unavailable');
    const logs=await tx.get(db.collection('user_activity_logs').where('ustaId','==',guard.workerId));
    const records=logs.docs.filter(d=>d.data().dateKey===receipt.date);if(records.length!==1)throw new Error('Response unavailable');
    const record=records[0].data();const prefix=guard.workerId+'_';
    const arrival=await tx.get(db.collection('stage_photos').doc(prefix+'keldi_'+receipt.date));
    const departure=await tx.get(db.collection('stage_photos').doc(prefix+'ketdi_'+receipt.date));
    const photo=(action==='check_in'?arrival:departure),data=photo.data(),field=action==='check_in'?'telegramPhoto':'telegramDeparturePhoto';
    if(!record.workAttendance||!record.loginTime||(action==='check_out'&&!record.logoutTime)||!data||record[field]!==photo.id||data.ustaId!==guard.workerId||data.dateKey!==receipt.date||data.type!==(action==='check_in'?'keldi':'ketdi')||data.channel!=='telegram'||data.storagePath!==receipt.storagePath||!data.storagePath.startsWith('private/'+guard.workerId+'/projects/attendance/images/')||data.imageUrl!=='private-storage:'+data.storagePath)throw new Error('Response unavailable');
    return {caption:attendanceCaption({record,date:receipt.date,arrival:arrival.exists,departure:departure.exists,action}),groupCaption:groupAttendanceCaption({record,date:receipt.date,action}),storagePath:data.storagePath,contentType:data.contentType};
  });
}
export async function readCommittedPrivatePhoto(response,getBucket=serverStorageBucket) {
  const bucket=await getBucket();if(bucket.adapter!=='vps')throw new Error('Response unavailable');
  const file=bucket.file(response.storagePath),[metadata]=await file.getMetadata();
  if(metadata.size>CAMERA_MAX_BYTES||metadata.contentType!==response.contentType||metadata.metadata?.firebaseStorageDownloadTokens)throw new Error('Response unavailable');
  const [buffer]=await file.download();validateCameraImage(buffer,response.contentType);return buffer;
}
export function createPhotoConfirmationNotifier({env=process.env,getBucket=serverStorageBucket,fetchImpl=fetch}={}) {
  return async(telegramId,_text,{db,requestToken,action})=>{
    if(!env.TELEGRAM_BOT_TOKEN)throw new Error('Response unavailable');
    const response=await committedPhotoResponse(db,String(telegramId),requestToken,action);
    const buffer=await readCommittedPrivatePhoto(response,getBucket);
    const form=new FormData();form.set('chat_id',String(telegramId));form.set('caption',response.caption);
    form.set('photo',new Blob([buffer],{type:response.contentType}),response.contentType==='image/png'?'attendance.png':'attendance.jpg');
    const sent=await fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`,{method:'POST',body:form,signal:AbortSignal.timeout(15000)});
    if(!sent.ok||!(await sent.json()).ok)throw new Error('Response unavailable');
  };
}
