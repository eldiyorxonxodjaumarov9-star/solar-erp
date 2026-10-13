import { createGroupAttendanceNotifier } from '../telegram/groupAttendanceDelivery.js';
import { createPhotoConfirmationNotifier } from '../telegram/attendanceResponse.js';
import { Router, json, raw } from 'express';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { getServerAdminDb } from '../firebaseAdminAuth.js';
import { createTelegramAttendanceHandler } from '../telegram/attendance.js';
import { authorizeExistingTelegramMapping } from '../telegram/workerAuthorization.js';
import { verifyMiniAppInitData, cameraTicket, verifyCameraTicket, CAMERA_MAX_BYTES } from '../telegram/cameraSecurity.js';
import { instantToTashkentYMD } from '../../src/photos/tashkentTime.js';
const tokenPattern = /^[a-f0-9-]{36}$/;
const allowedActions = new Set(['check_in','check_out']);
export function createTelegramCameraRouter({ getDb = getServerAdminDb, env = process.env, now = () => new Date(), rateLimit = 40, handler = createTelegramAttendanceHandler(), notify = createPhotoConfirmationNotifier({env}), notifyGroup = createGroupAttendanceNotifier({env}) } = {}) {
  const router = Router(), rates = new Map();
  router.use((_req,res,next) => { res.setHeader('Cache-Control','no-store'); res.setHeader('Referrer-Policy','no-referrer'); res.setHeader('X-Content-Type-Options','nosniff'); next(); });
  const webRoot = fileURLToPath(new URL('../web/telegram-camera/', import.meta.url));
  router.get('/', (_req,res) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' https://telegram.org; style-src 'self'; img-src 'self' blob: data:; media-src blob:; connect-src 'self'; frame-ancestors https://web.telegram.org https://*.telegram.org; base-uri 'none'; form-action 'none'");
    res.setHeader('Permissions-Policy','camera=(self), microphone=(), geolocation=()');
    res.sendFile(webRoot + 'index.html');
  });
  for (const file of ['app.js','style.css']) router.get('/'+file, (_req,res) => res.sendFile(webRoot + file));
  router.use((req,res,next) => {
    const key = req.ip || 'unknown', window = Math.floor(now().getTime()/60000);
    if(rates.size>1000)rates.clear();const entry=rates.get(key);const count=entry?.window===window?entry.count+1:1;rates.set(key,{window,count});
    if(count>rateLimit)return res.status(429).json({error:'Amal bajarilmadi'});next();
  });
  function authenticated(req,res,next) {
    try {
      const init = req.get('x-telegram-init-data');
      if(init) req.cameraIdentity={telegramUserId:verifyMiniAppInitData(init,env.TELEGRAM_BOT_TOKEN,now().getTime())};
      else req.cameraIdentity=verifyCameraTicket(String(req.get('authorization')||'').replace(/^Bearer /,''),env.TELEGRAM_BOT_TOKEN,now().getTime());
      next();
    } catch { res.status(403).json({error:'Amal bajarilmadi'}); }
  }
  async function preflight(db,identity,requestToken,action) {
    if (!tokenPattern.test(requestToken || '') || !allowedActions.has(action) ||
        (identity.requestToken && (identity.requestToken !== requestToken || identity.action !== action))) return false;
    return db.runTransaction(async tx => {
      const mapping = await tx.get(db.doc('telegramLinks/'+identity.telegramUserId));
      const guard = await authorizeExistingTelegramMapping(tx,db,mapping,identity.telegramUserId,identity.telegramUserId);
      if(guard.status!=='authorized')return false;
      const date=instantToTashkentYMD(now());
      const receipt=await tx.get(db.doc('telegramAttendanceUpdates/'+identity.telegramUserId+'_mini_'+requestToken));
      if(receipt.exists)return receipt.data().workerId===guard.workerId && receipt.data().date===date && receipt.data().action===action+'_photo';
      const key=createHash('sha256').update(guard.workerId+':'+date).digest('hex');
      const state=(await tx.get(db.doc('telegramAttendanceState/'+key))).data();
      return state?.awaitingPhoto===true && state.telegramUserId===identity.telegramUserId && state.requestToken===requestToken && state.pendingAction===action+'_photo' && state.expiresAt>=now().getTime();
    });
  }
  router.post('/authorize', authenticated, json({limit:'2kb'}), async(req,res) => {
    try {
      if(!req.get('x-telegram-init-data') || !req.is('application/json') || !req.body || Object.keys(req.body).some(k=>!['requestToken','action'].includes(k)))return res.status(403).json({error:'Amal bajarilmadi'});
      const {requestToken,action}=req.body;
      if(!await preflight(await getDb(),req.cameraIdentity,requestToken,action))return res.status(403).json({error:'Amal bajarilmadi'});
      res.json({ok:true,browserTicket:cameraTicket({...req.cameraIdentity,requestToken,action},env.TELEGRAM_BOT_TOKEN,now().getTime())});
    } catch { res.status(503).json({error:'Amal vaqtincha bajarilmadi'}); }
  });
  router.post('/photo', authenticated, async(req,res,next) => {
    try {
      if(!['image/jpeg','image/png'].includes(req.get('content-type')))return res.status(415).json({error:'JPEG yoki PNG rasm yuboring'});
      const requestToken=req.get('x-camera-request'),action=req.get('x-camera-action');
      req.cameraDb=await getDb();
      if(!await preflight(req.cameraDb,req.cameraIdentity,requestToken,action))return res.status(403).json({error:'Amal bajarilmadi'});
      req.cameraAction={...req.cameraIdentity,requestToken,action};next();
    } catch { res.status(503).json({error:'Amal vaqtincha bajarilmadi'}); }
  }, raw({type:['image/jpeg','image/png'],limit:CAMERA_MAX_BYTES}), async(req,res) => {
    try {
      if(req.query.workerId || req.query.firebaseUid || req.query.role)return res.status(403).json({error:'Amal bajarilmadi'});
      const result=await handler.submitCameraPhoto(req.cameraDb,{...req.cameraAction,buffer:req.body,contentType:req.get('content-type')});
      if(!['done','duplicate'].includes(result.status))return res.status(403).json({error:'Amal bajarilmadi'});
      let notificationSent=false;
      if(result.status==='done'){try{await notify(req.cameraIdentity.telegramUserId,result.text,{db:req.cameraDb,requestToken:req.cameraAction.requestToken,action:req.cameraAction.action});notificationSent=true;}catch{/* Safe retry: attendance is already durable, never create it again. */}}
      try {await notifyGroup(req.cameraIdentity.telegramUserId,result.text,{db:req.cameraDb,requestToken:req.cameraAction.requestToken,action:req.cameraAction.action});}catch{/* Group failure never rolls back committed attendance or private confirmation. */}
      res.json({ok:true,text:result.text,duplicate:result.status==='duplicate',notificationSent});
    } catch { res.status(503).json({error:'Amal vaqtincha bajarilmadi'}); }
  });
  router.use((error,_req,res,_next)=>res.status(error?.type==='entity.too.large'?413:400).json({error:'Amal bajarilmadi'}));
  return router;
}
