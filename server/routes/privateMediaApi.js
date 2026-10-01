import { validFile } from '../fileSafety.js';
export { validFile } from '../fileSafety.js';
import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { getServerAdminDb, getServerAdminAuth } from '../firebaseAdminAuth.js';
import { requireFirebaseSession } from '../authMiddleware.js';
import { actorId, assertProjectAccess, requireOperationScope } from '../operationAuthorization.js';
import { serverStorageBucket, savePrivateImage } from '../privateStorage.js';
async function authorizeFile(name, session, db) {
 if(!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name) || name.includes('..'))throw new Error('Access denied');
 const entry=await db.collection('mediaAssets').doc(name).get();
 if(session.role==='admin')return entry.exists?entry.data():{};
 if(!entry.exists || entry.data().ownerId!==actorId(session))throw new Error('Access denied');
 const data=entry.data();if(data.projectId)await assertProjectAccess(session,data.projectId,db);return data;
}
export async function readPrivateMedia(reference, session, {directory, getDb=getServerAdminDb}={}) {
 const db=await getDb();
 if(reference.startsWith('private-storage:')) {
  const objectPath=reference.slice(16), pieces=objectPath.split('/');
  if(pieces.length!==6 || pieces[0]!=='private'||pieces[2]!=='projects'||pieces[4]!=='images' || objectPath.includes('..'))throw new Error('Access denied');
  if(session.role!=='admin' && pieces[1]!==actorId(session))throw new Error('Access denied');
  if(pieces[3]!=='attendance')await assertProjectAccess(session,pieces[3],db);
  const {getStorage}=await import('firebase-admin/storage');
  const bucket=String(process.env.FIREBASE_STORAGE_BUCKET || '').trim();
  if(!bucket)throw new Error('FIREBASE_STORAGE_BUCKET is required for private media.');
  const [buffer]=await getStorage((await getServerAdminAuth()).app).bucket(bucket).file(objectPath).download();return buffer;
 }
 const name=String(reference).replace(/^\/api\/media\//,'');await authorizeFile(name,session,db);
 return readFile(path.join(directory,name));
}
export function createPrivateMediaRouter({directory,getDb=getServerAdminDb,authorize=requireFirebaseSession}={}) {
 const router=Router();router.use(authorize());
 router.get('/:name',async(req,res)=>{
  try {const db=await getDb(), data=await authorizeFile(req.params.name,req.authSession,db);
   res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
   res.type(data.contentType||'application/octet-stream');
   if(!data.contentType)res.attachment(req.params.name);
   return res.sendFile(path.resolve(directory,req.params.name));
  }catch{return res.status(403).json({ok:false,error:'Ruxsat yoq'});}
 });return router;
}
export function createPrivateUploadRouter({directory,getDb=getServerAdminDb,getBucket=serverStorageBucket}={}) {
 const router=Router(), upload=multer({storage:multer.memoryStorage(),limits:{fileSize:50*1024*1024,files:1}});
 const images=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1}});
 router.post('/private-image',images.single('image'),(req,res,next)=>{
  if(!req.file && req.body?.imageBase64){const buffer=Buffer.from(String(req.body.imageBase64),'base64');req.file={buffer,size:buffer.length,mimetype:req.body.imageMime};}
  next();
 },requireOperationScope({getDb,project:true,allowAttendance:true}),async(req,res)=>{
  try {
   const file=req.file,mime=file?.mimetype,projectId=req.body.projectId;
   if(!file?.buffer?.length || file.buffer.length>10*1024*1024 || !['image/jpeg','image/png','image/webp'].includes(mime)||!validFile(file.buffer,mime)||!/^[A-Za-z0-9_-]+$/.test(projectId))return res.status(400).json({ok:false,error:'Rasm formati yoki scope notogri'});
   const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[mime];
   const objectPath=`private/${actorId(req.authSession)}/projects/${projectId}/images/${randomUUID()}.${extension}`;
   return res.json({ok:true,...await savePrivateImage(await getBucket(),objectPath,file.buffer,mime)});
  }catch{return res.status(503).json({ok:false,error:'Private rasm saqlanmadi'});}
 });
 router.post('/stage-video',upload.single('video'),requireOperationScope({getDb,project:true}),async(req,res)=>{
  let target;
  try {
   let buffer=req.file?.buffer,mime=req.file?.mimetype;
   if(!buffer && req.body.videoBase64){buffer=Buffer.from(String(req.body.videoBase64).replace(/^data:[^,]+,/,''),'base64');mime=req.body.videoMime||'video/mp4';}
   if(!buffer || buffer.length>50*1024*1024 || !['video/mp4','video/quicktime'].includes(mime) || !validFile(buffer,mime))return res.status(400).json({ok:false,error:'Video formati yoki hajmi notogri'});
   const name=`${randomUUID()}.${mime==='video/mp4'?'mp4':'mov'}`;
   await mkdir(directory,{recursive:true});target=path.join(directory,name);await writeFile(target,buffer,{flag:'wx'});
   await (await getDb()).collection('mediaAssets').doc(name).set({ownerId:actorId(req.authSession),projectId:req.body.projectId,contentType:mime,size:buffer.length,createdAt:new Date().toISOString()});
   return res.json({ok:true,videoUrl:`/api/media/${name}`,storagePath:`private-media/${name}`,fileName:name});
  }catch{if(target)await unlink(target).catch(()=>{});return res.status(400).json({ok:false,error:'Video saqlanmadi'});}
 });return router;
}
