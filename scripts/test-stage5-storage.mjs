import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID, generateKeyPairSync } from 'node:crypto';
import express from 'express';
import { initializeApp, cert, deleteApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { savePrivateImage } from '../server/privateStorage.js';
import { createPrivateStorageRouter } from '../server/routes/privateStorageApi.js';
import { createPrivateUploadRouter } from '../server/routes/privateMediaApi.js';
import { storageInventory } from './storage-access-audit.mjs';
import { createBackup, loadBackup } from './credential-migration.mjs';
const host=process.env.FIREBASE_STORAGE_EMULATOR_HOST;
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host||'')||!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw new Error('Loopback emulators required');
const projectId='demo-solar-authorization',bucketName=`${projectId}.appspot.com`,privateKey=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
const firebase=initializeApp({projectId,storageBucket:bucketName,credential:cert({projectId,clientEmail:`test@${projectId}.iam.gserviceaccount.com`,privateKey})},'storage-private-test'),bucket=getStorage(firebase).bucket();
const bytes=Buffer.from([255,216,255,1]),ownerPath='private/w1/projects/p1/images/server.jpg',legacyPath='private/w1/projects/p1/images/legacy.jpg',token=randomUUID();
const app=express();app.use(express.json());app.use((req,res,next)=>{if(req.headers.authorization!=='Bearer test-worker')return res.status(401).json({ok:false});req.authSession={role:'usta',workerId:'w1'};req.authClaims={uid:'usta:w1'};next();});
const db={collection:()=>({doc:id=>({get:async()=>({exists:true,data:()=>({ustaId:id==='p1'?'w1':'w2'})})})})};
app.use('/api/private-storage',createPrivateStorageRouter({getDb:async()=>db,getBucket:async()=>bucket,authorize:()=> (_req,_res,next)=>next()}));
app.use('/api/upload',createPrivateUploadRouter({getDb:async()=>db,getBucket:async()=>bucket}));
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;
let assertions=0;
const mediaUrl=(name,downloadToken)=>`http://${host}/v0/b/${bucketName}/o/${encodeURIComponent(name)}?alt=media${downloadToken?`&token=${downloadToken}`:''}`;
try{
 await bucket.file(legacyPath).save(bytes,{resumable:false,metadata:{contentType:'image/jpeg',metadata:{firebaseStorageDownloadTokens:token}}});
 let response=await fetch(mediaUrl(legacyPath,token));assert.equal(response.status,200);assertions++;
 const [legacyMetadata]=await bucket.file(legacyPath).getMetadata();
 const backupFile=`.security-artifacts/storage-test-${Date.now()}.backup.enc`,key=Buffer.alloc(32,7).toString('base64');fs.mkdirSync('.security-artifacts',{recursive:true});
 createBackup(backupFile,{objects:[{name:legacyPath,metadata:legacyMetadata,contentBase64:bytes.toString('base64')}]},{key,projectId});assert.equal(loadBackup(backupFile,{key,projectId}).snapshot.objects.length,1);assertions++;
 // Emulator keeps a separate token index; its admin token API is needed to model revocation accurately.
 const revokeResponse=await fetch(`http://${host}/v0/b/${bucketName}/o/${encodeURIComponent(legacyPath)}?delete_token=${token}`,{method:'POST',headers:{Authorization:'Bearer owner'}});assert.equal(revokeResponse.status,200);
 await bucket.file(legacyPath).setMetadata({metadata:{firebaseStorageDownloadTokens:''},cacheControl:'private, no-store'});
 const [revoked]=await bucket.file(legacyPath).getMetadata();assert.notEqual(revoked.metadata?.firebaseStorageDownloadTokens,token);assertions++;
 response=await fetch(mediaUrl(legacyPath,token));assert.notEqual(response.status,200);assertions++;
 await bucket.file(legacyPath).delete();response=await fetch(mediaUrl(legacyPath,token));assert.notEqual(response.status,200);assertions++;
 await savePrivateImage(bucket,ownerPath,bytes,'image/jpeg');const [created]=await bucket.file(ownerPath).getMetadata();assert.equal(!!created.metadata?.firebaseStorageDownloadTokens,false);assertions++;
 response=await fetch(mediaUrl(ownerPath));assert.notEqual(response.status,200);assertions++;
 async function upload(body,auth=true){return fetch(base+'/api/upload/private-image',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer test-worker'}:{})},body:JSON.stringify(body)});}
 const payload={projectId:'p1',ownerId:'w1',imageBase64:bytes.toString('base64'),imageMime:'image/jpeg'};
 for(const [body,auth,status]of [[payload,false,401],[{...payload,ownerId:'w2'},true,403],[{...payload,projectId:'p2'},true,403],[{...payload,imageBase64:Buffer.from('<script>').toString('base64')},true,403],[payload,true,200],[{...payload,projectId:'attendance'},true,200]]){const result=await upload(body,auth);assert.equal(result.status,status);if(status===200){const data=await result.json();assert.ok(data.downloadUrl.startsWith('private-storage:private/w1/'));const [metadata]=await bucket.file(data.storagePath).getMetadata();assert.equal(!!metadata.metadata?.firebaseStorageDownloadTokens,false);}assertions++;}
 for(const [objectPath,auth,status]of [[ownerPath,true,200],[ownerPath,false,401],['private/w2/projects/p1/images/server.jpg',true,403],['private/w1/projects/p2/images/server.jpg',true,403],['private/w1/projects/p1/images/script.exe',true,403]]){const response=await fetch(base+`/api/private-storage?path=${encodeURIComponent(objectPath)}`,{headers:auth?{Authorization:'Bearer test-worker'}:{}});assert.equal(response.status,status);assertions++;}
 const inventory=storageInventory({objects:[{name:'private',metadata:{firebaseStorageDownloadTokens:token},acl:[{entity:'allUsers'}]}],iam:{bindings:[{members:['allUsers']}]}});assert.equal(inventory.tokenObjects,1);assert.equal(inventory.publicAclObjects,1);assert.equal(JSON.stringify(inventory).includes(token),false);assertions++;
 const summary={assertions,oldTokenBeforeRemoval:'public 200 (bypasses rules)',oldTokenAfterRotation:'DENY',emulatorRemovalLimitation:'emulator rotates its final token; production token removal not verified',deletedUrl:'DENY',newUploadTokenPresent:false,unauthenticatedRead:'DENY',ownProjectApiUpload:'ALLOW',foreignOwnerProject:'DENY',environment:'demo emulator, synthetic media only'};
 fs.writeFileSync('.security-artifacts/stage5-storage-results.json',JSON.stringify(summary,null,2));console.log(`PASS Stage 5 private Storage: ${JSON.stringify(summary)}`);
}finally{await new Promise(resolve=>server.close(resolve));await deleteApp(firebase);}
