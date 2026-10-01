import { Router } from 'express';
import { getServerAdminDb } from '../firebaseAdminAuth.js';
import { requireFirebaseSession } from '../authMiddleware.js';
import { actorId, assertProjectAccess } from '../operationAuthorization.js';
import { serverStorageBucket } from '../privateStorage.js';
export function createPrivateStorageRouter({getDb=getServerAdminDb,getBucket=serverStorageBucket,authorize=requireFirebaseSession}={}) {
 const router=Router();router.use(authorize());
 router.get('/',async(req,res)=>{
  try{
   const objectPath=String(req.query.path||''),parts=objectPath.split('/'),session=req.authSession;
   if(parts.length!==6||parts[0]!=='private'||parts[2]!=='projects'||parts[4]!=='images'||objectPath.includes('..')||!/^[-A-Za-z0-9_]+\.(jpg|jpeg|png|webp)$/.test(parts[5]))throw new Error();
   if(session.role!=='admin'&&parts[1]!==actorId(session))throw new Error();
   if(parts[3]!=='attendance')await assertProjectAccess(session,parts[3],await getDb());
   const file=(await getBucket()).file(objectPath),[metadata]=await file.getMetadata();
   if(!['image/jpeg','image/png','image/webp'].includes(metadata.contentType)||Number(metadata.size)>10*1024*1024)throw new Error();
   const [buffer]=await file.download();res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.type(metadata.contentType);return res.send(buffer);
  }catch{return res.status(403).json({ok:false,error:'Private media access denied'});}
 });return router;
}
