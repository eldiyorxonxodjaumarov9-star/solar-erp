import { committedDayOffResponse } from './dayOff.js';
import { createHash, randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getServerAdminDb } from '../firebaseAdminAuth.js';
import { committedPhotoResponse, readCommittedPrivatePhoto } from './attendanceResponse.js';
const configured=env=>!!env.TELEGRAM_BOT_TOKEN && /^-\d{1,20}$/.test(String(env.TELEGRAM_GROUP_ID||'').trim());
export function createGroupAttendanceNotifier({env=process.env,getBucket,fetchImpl=fetch,now=Date.now}={}) {
  return async(telegramId,_text,{db,requestToken,action})=>{
    if(!configured(env))return {status:'not_configured'};
    if(!/^\d+$/.test(String(telegramId))||!/^[-a-f0-9]{36}$/.test(requestToken)||!['check_in','check_out','day_off'].includes(action))return {status:'denied'};
    const ref=db.collection('telegramAttendanceUpdates').doc(telegramId+'_mini_'+requestToken);
    const initial=(await ref.get()).data()?.groupDelivery;
    if(!initial)return {status:'not_queued'}; // Never backfill historical attendance.
    if(['sent','uncertain','blocked'].includes(initial.status))return {status:initial.status};
    const isDayOff=action==='day_off';
    const report=isDayOff?await committedDayOffResponse(db,String(telegramId),requestToken):await committedPhotoResponse(db,String(telegramId),requestToken,action);
    const target=String(env.TELEGRAM_GROUP_ID).trim(),fingerprint=createHash('sha256').update(target).digest('hex'),attemptId=randomUUID();
    const claim=await db.runTransaction(async tx=>{
      const snapshot=await tx.get(ref),receipt=snapshot.data(),d=receipt?.groupDelivery;
      if(!d||receipt.action!==(isDayOff?'day_off':action+'_photo')||(!isDayOff&&receipt.storagePath!==report.storagePath))return null;
      if(d.status==='sending') {
        if(d.attemptedAt?.toMillis?.()<now()-120000)tx.update(ref,{groupDelivery:{...d,status:'uncertain',lastError:'unknown_outcome'}});
        return null;
      }
      if(!['pending','retryable'].includes(d.status)||d.retryAt>now())return null;
      if(d.targetFingerprint&&d.targetFingerprint!==fingerprint){tx.update(ref,{groupDelivery:{...d,status:'blocked',lastError:'target_changed'}});return null;}
      const delivery={...d,status:'sending',attempts:(d.attempts||0)+1,attemptId,targetFingerprint:fingerprint,attemptedAt:FieldValue.serverTimestamp()};
      tx.update(ref,{groupDelivery:delivery});return {attempts:delivery.attempts};
    });
    if(!claim)return {status:'skipped'};
    async function finish(status,extra={}) {
      try {await db.runTransaction(async tx=>{const d=(await tx.get(ref)).data()?.groupDelivery;if(d?.status==='sending'&&d.attemptId===attemptId)tx.update(ref,{groupDelivery:{...d,status,...extra,updatedAt:FieldValue.serverTimestamp()}});});}
      catch {return {status:'uncertain'}; /* Never resend after an uncertain acknowledgement. */}
      return {status};
    }
    const retryDelay=Math.min(3600000,60000*2**Math.min(claim.attempts-1,6));
    let started=false;
    try {
      const buffer=isDayOff?null:await readCommittedPrivatePhoto(report,getBucket);
      const form=new FormData();form.set('chat_id',target);form.set(isDayOff?'text':'caption',report.groupCaption);
      if(!isDayOff)form.set('photo',new Blob([buffer],{type:report.contentType}),report.contentType==='image/png'?'attendance.png':'attendance.jpg');
      started=true;
      const response=await fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${isDayOff?'sendMessage':'sendPhoto'}`,{method:'POST',body:form,signal:AbortSignal.timeout(15000)});
      const body=await response.json();
      if(response.ok&&body.ok===true&&Number.isSafeInteger(body.result?.message_id)&&body.result.message_id>0)return finish('sent',{messageId:body.result.message_id,sentAt:FieldValue.serverTimestamp()});
      if(body.ok===false&&Number.isInteger(body.error_code)) {
        const delay=Number.isFinite(body.parameters?.retry_after)?Math.min(86400000,Math.max(0,body.parameters.retry_after*1000)):0;
        return finish('retryable',{retryAt:now()+Math.max(retryDelay,delay),lastError:'telegram_rejected'});
      }
      return finish('uncertain',{lastError:'unknown_outcome'});
    } catch {return finish(started?'uncertain':'retryable',{lastError:started?'unknown_outcome':'pre_send_failure',...(!started?{retryAt:now()+retryDelay}:{})});}
  };
}
export async function retryPendingGroupDeliveries({getDb=getServerAdminDb,env=process.env,notify=createGroupAttendanceNotifier({env})}={}) {
  if(!configured(env))return;
  const db=await getDb();const queue=await db.collection('telegramAttendanceUpdates').where('groupDelivery.status','in',['pending','retryable','sending']).limit(20).get();
  for(const doc of queue.docs){const receipt=doc.data(),parts=doc.id.split('_mini_');if(parts.length!==2||receipt.telegramUserId!==parts[0])continue;try{await notify(parts[0],'',{db,requestToken:parts[1],action:receipt.action?.replace('_photo','')});}catch{/* Fail closed; no sensitive error logs. */}}
}
export function startGroupDeliveryRetries(options={}) {
  if(!configured(options.env||process.env))return ()=>{};
  let running=false,stopped=false;
  const tick=async()=>{if(running||stopped)return;running=true;try{await retryPendingGroupDeliveries(options);}catch{/* Next tick safely retries only queued receipts. */}finally{running=false;}};
  const timer=setInterval(tick,60000);timer.unref();void tick();return ()=>{stopped=true;clearInterval(timer);};
}
