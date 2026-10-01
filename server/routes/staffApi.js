import { Router } from 'express';
import { hashPassword } from '../passwordHash.js';
import { getServerAdminDb } from '../firebaseAdminAuth.js';
import { requireFirebaseSession } from '../authMiddleware.js';
import { prepareWorkerSalaryRate } from '../../src/workers/workerSalaryRate.js';

import { revokeAccountSessions, newSessionVersion } from '../accountSecurity.js';
const FIELDS = ['fullName','name','login','loginLower','phone','position','brigadeId','brigadeName','experienceYears','rating','salary','workingDays','dailySalary','salaryEffectiveDate','salaryHistory','telegramUserId','telegramUsername','status','disabled','points','createdAt','updatedAt'];
const DIRECTORY_FIELDS = ['fullName','name','login','position','brigadeId','brigadeName'];
function cleanPublicValue(value) {
  if (Array.isArray(value)) return value.map(cleanPublicValue);
  if (!value || typeof value !== 'object') return value;
  const blocked = new Set(['password','pin','credential','credentials','adminPassword','passwordHash','passwordSalt','privateKey','secret','token','role']);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !blocked.has(key)).map(([key, item]) => [key, cleanPublicValue(item)]));
}
export function publicStaffProfile(id, data, directory = false) {
  return { id, ...Object.fromEntries((directory ? DIRECTORY_FIELDS : FIELDS).filter(key => data[key] !== undefined).map(key => [key,cleanPublicValue(data[key])])) };
}
export function createStaffRouter({ getDb = getServerAdminDb, authorize = requireFirebaseSession, revokeSessions = revokeAccountSessions } = {}) {
  const router = Router();
  router.use(authorize());
  router.get('/:collection', async (req,res) => {
    const name=req.params.collection;
    if (!['workers','assistants'].includes(name)) return res.status(404).json({ok:false});
    res.setHeader('Cache-Control','no-store');
    try {
      const db=await getDb(), session=req.authSession;
      const ownId=name==='workers' ? session.workerId : session.assistantId;
      let records=[];
      if (session.role==='admin' || (session.role==='asisten' && name==='workers')) {
        const sources=name==='workers' ? ['workers','users'] : ['assistants'];
        const map=new Map();
        for(const source of sources) for(const entry of (await db.collection(source).get()).docs) {
          if(!map.has(entry.id)) map.set(entry.id,publicStaffProfile(entry.id,entry.data(),session.role==='asisten'));
        }
        records=[...map.values()];
      } else if(ownId) {
        const sources=name==='workers' ? ['workers','users'] : ['assistants'];
        for(const source of sources) {
          const snapshot=await db.collection(source).doc(ownId).get();
          if(snapshot.exists) { records=[publicStaffProfile(snapshot.id,snapshot.data())]; break; }
        }
      }
      return res.json({ok:true,items:records});
    } catch { return res.status(503).json({ok:false,error:'Profil malumotlari olinmadi.'}); }
  });
  const save = async (req,res) => {
    if(req.authSession.role!=='admin') return res.status(403).json({ok:false,error:'Ruxsat yoq'});
    const name=req.params.collection;
    if(!['workers','assistants'].includes(name)) return res.status(404).json({ok:false});
    try {
      const db=await getDb(), body=req.body || {};
      if (req.params.id && (req.params.id.includes('/') || req.params.id.length > 120)) return res.status(400).json({ok:false});
      if (body.password !== undefined && (typeof body.password !== 'string' || body.password.length > 1024)) return res.status(400).json({ok:false});
      let ref=req.params.id ? db.collection(name).doc(req.params.id) : db.collection(name).doc();
      let before=await ref.get();
      if(!before.exists && name==='workers' && req.params.id) {
        const legacy=db.collection('users').doc(req.params.id), snapshot=await legacy.get();
        if(snapshot.exists) {ref=legacy;before=snapshot;}
      }
      let payload=Object.fromEntries(FIELDS.filter(key=>Object.hasOwn(body,key)).map(key=>[key,body[key]]));
      if(name==='workers') payload=prepareWorkerSalaryRate(payload,before.exists?before.data():null);
      if(!before.exists && (typeof body.password!=='string' || !body.password)) return res.status(400).json({ok:false,error:'Parol kerak.'});
      const now=new Date().toISOString();
      payload={...payload,updatedAt:now,...(!before.exists?{createdAt:now}:{})};
      const batch=db.batch();batch.set(ref,payload,{merge:true});
      // Only explicitly supplied new passwords enter the server-only store. No bulk migration.
      if(typeof body.password==='string' && body.password) {
        batch.set(db.collection('accountCredentials').doc(`${name==='workers'?'usta':'asisten'}:${ref.id}`),{...hashPassword(body.password),updatedAt:now});
      }
      const uid = `${name === 'workers' ? 'usta' : 'asisten'}:${ref.id}`;
      const securityChanged = before.exists && (Boolean(body.password) || ['disabled','status','login'].some(key => Object.hasOwn(body,key) && body[key] !== before.data()[key]));
      if (securityChanged) {
        const securityRef = db.collection('accountSecurity').doc(uid);
        batch.set(securityRef, { sessionVersion: newSessionVersion(), disabled: payload.disabled ?? before.data().disabled ?? false, updatedAt: now }, {merge:true});
      }
      await batch.commit();
      if (securityChanged) await revokeSessions(uid);
      return res.json({ok:true,item:publicStaffProfile(ref.id,{...(before.exists?before.data():{}),...payload})});
    } catch { return res.status(400).json({ok:false,error:'Profil saqlanmadi.'}); }
  };
  router.post('/:collection',save);router.put('/:collection/:id',save);
  router.delete('/:collection/:id',async(req,res)=>{
    if(req.authSession.role!=='admin')return res.status(403).json({ok:false});
    const name=req.params.collection,id=req.params.id;
    if(!['workers','assistants'].includes(name)||id.includes('/'))return res.status(404).json({ok:false});
    try {
      const db=await getDb(),batch=db.batch(),uid=`${name==='workers'?'usta':'asisten'}:${id}`;
      batch.delete(db.collection(name).doc(id));
      if(name==='workers')batch.delete(db.collection('users').doc(id));
      batch.delete(db.collection('accountCredentials').doc(uid));
      batch.set(db.collection('accountSecurity').doc(uid),{sessionVersion:newSessionVersion(),disabled:true},{merge:true});
      await batch.commit();await revokeSessions(uid);return res.json({ok:true});
    }catch{return res.status(503).json({ok:false,error:'Profil ochirilmadi.'});}
  });
  return router;
}
