import { validFile } from './fileSafety.js';
import { createHash } from 'node:crypto';
import { getServerAdminDb } from './firebaseAdminAuth.js';
export function actorId(session) { return session.role === 'usta' ? session.workerId : session.role === 'asisten' ? `asst_${session.assistantId}` : 'admin'; }
export function projectAssigned(data, id) { return data && (data.ustaId === id || data.assignedWorkerId === id || (Array.isArray(data.assignedWorkerIds) && data.assignedWorkerIds.includes(id))); }
export async function assertProjectAccess(session, projectId, db) {
  if (typeof projectId !== 'string' || !projectId || projectId.includes('/')) throw new Error('Access denied');
  const snapshot = await db.collection('projects').doc(projectId).get();
  if (!snapshot.exists || (session.role === 'usta' && !projectAssigned(snapshot.data(),session.workerId))) throw new Error('Access denied');
}
export function requireOperationScope({ getDb = getServerAdminDb, project = false, allowAttendance = false, roles = ['admin','usta','asisten'] } = {}) {
 return async (req,res,next) => {
  try {
   const session=req.authSession;
   if (!session || !roles.includes(session.role)) throw new Error();
   const body=req.body || {}, id=actorId(session);
   if(req.file && (req.file.size > (req.file.mimetype?.startsWith('video/')?50:10)*1024*1024 || !validFile(req.file.buffer,req.file.mimetype)))throw new Error();
   if (session.role !== 'admin') {
    for (const key of ['workerId','ustaId','userId','ownerId']) if (body[key] && body[key] !== id) throw new Error();
    if (body.assistantId && body.assistantId !== session.assistantId) throw new Error();
    if (body.uid && body.uid !== req.authClaims.uid) throw new Error();
    if (body.role && body.role !== session.role) throw new Error();
    if (['payrollWorkerId','payrollMonth','payrollPaymentType','salary','salaryHistory'].some(key=>Object.hasOwn(body,key)) || body.type === 'Mexnat haqi') throw new Error();
    if (body.meta && ['workerId','ownerId','ustaId','userId'].some(key=>body.meta[key] && body.meta[key] !== id)) throw new Error();
    body.workerId=id;body.workerLogin=session.login;body.login=session.login;body.workerName=session.name;body.name=session.name;
    // Client retry IDs cannot select somebody else's server document namespace.
    if (body.eventId) {
      const db=await getDb(), existing=await db.collection('telegram_events').doc(String(body.eventId)).get();
      if (existing.exists && existing.data().workerId !== id) throw new Error();
      body.eventId=`client_${createHash('sha256').update(req.authClaims.uid+'\0'+String(body.eventId)).digest('hex')}`;
    }
   }
   if(body.meta?.projectId) await assertProjectAccess(session,body.meta.projectId,await getDb());
   for(const key of ['role','uid','assistantId','chatId','telegramUserId','ownerId']) delete body[key];
   if(req.path?.endsWith('/stage-photos') && !/^stage-[1-6]$/.test(String(body.stageId||'')))throw new Error();
   if((project || body.projectId) && !(allowAttendance && body.projectId==='attendance')) await assertProjectAccess(session,body.projectId,await getDb());
   for(const field of ['photos','images']) if(Array.isArray(body[field])) for(const url of body[field]) validateMediaReference(url,session,body.projectId);
   for(const field of ['imageUrl','videoUrl']) if(body[field])validateMediaReference(body[field],session,body.projectId);
   req.body=body;next();
  } catch { return res.status(403).json({ok:false,error:'Ruxsat yoq'}); }
 };
}
export function validateMediaReference(value, session, projectId) {
 const text=String(value||'');
 const data=text.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
 if(data){const bytes=Buffer.from(data[2],'base64');if(bytes.length>10*1024*1024 || !validFile(bytes,data[1]))throw new Error('Invalid media');return;}
 if(text.startsWith('private-storage:')) {
  const path=text.slice(16), prefix=`private/${actorId(session)}/projects/${projectId||'attendance'}/images/`;
  if(path.includes('..') || (session.role!=='admin' && !path.startsWith(prefix)))throw new Error('Access denied');return;
 }
 if(/^\/api\/media\/[\w.-]+$/.test(text))return; // metadata authorization happens at file read
 throw new Error('External media URLs are forbidden');
}
