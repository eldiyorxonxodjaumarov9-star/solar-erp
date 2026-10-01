import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getBytes, getDownloadURL, updateMetadata } from 'firebase/storage';
import { doc, setDoc } from 'firebase/firestore';
const projectId='demo-solar-authorization';
for(const key of ['FIRESTORE_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST'])if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env[key]||''))throw new Error('Loopback emulators required; real services forbidden');
const [fh,fp]=process.env.FIRESTORE_EMULATOR_HOST.split(':'),[sh,sp]=process.env.FIREBASE_STORAGE_EMULATOR_HOST.split(':');
const env=await initializeTestEnvironment({projectId,firestore:{host:fh,port:Number(fp),rules:fs.readFileSync('firestore.rules','utf8')},storage:{host:sh,port:Number(sp),rules:fs.readFileSync('storage.rules','utf8')}});
let count=0;
const check=async(name,operation,allow)=>{await(allow?assertSucceeds(operation):assertFails(operation));count++;console.log(`PASS ${name}`);};
const claims=(role,id,version=0)=>({role,accountId:id,workerId:role==='usta'?id:'',...(role==='asisten'?{assistantId:id}:{}),sessionVersion:version,firebase:{sign_in_provider:'custom'}});
const context=(role,id,version=0)=>env.authenticatedContext(`${role}:${id}`,claims(role,id,version));
const admin=context('admin','primary'),a=context('usta','w1'),b=context('usta','w2'),assistant=context('asisten','a1');
const anonymous=env.authenticatedContext('admin:primary',{...claims('admin','primary'),firebase:{sign_in_provider:'anonymous'}});
const key='private/w1/projects/attendance/images/test.jpg', data=new Uint8Array([255,216,255,1]);
try{
 await env.withSecurityRulesDisabled(async c=>{
  await setDoc(doc(c.firestore(),'projects/p1'),{ustaId:'w1'});
  await setDoc(doc(c.firestore(),'projects/p2'),{ustaId:'w2'});
  await uploadBytes(ref(c.storage(),key),data,{contentType:'image/jpeg'});
  await uploadBytes(ref(c.storage(),'private/w1/projects/p1/images/project.jpg'),data,{contentType:'image/jpeg'});
  await uploadBytes(ref(c.storage(),'private/asst_a1/projects/attendance/images/asst.jpg'),data,{contentType:'image/jpeg'});
 });
 await check('own direct upload denied; server upload required',uploadBytes(ref(a.storage(),key),data,{contentType:'image/jpeg'}),false);
 await check('own image read via SDK denied; server-only',getBytes(ref(a.storage(),key)),false);
 await check('admin image read via SDK denied; server-only',getBytes(ref(admin.storage(),key)),false);
 await check('other worker read denied',getBytes(ref(b.storage(),key)),false);
 await check('assistant other worker read denied',getBytes(ref(assistant.storage(),key)),false);
 for(const c of [env.unauthenticatedContext(),anonymous]){
  await check('public/anonymous upload denied',uploadBytes(ref(c.storage(),key),data,{contentType:'image/jpeg'}),false);
  await check('public/anonymous read denied',getBytes(ref(c.storage(),key)),false);
 }
 await check('cross-owner write denied',uploadBytes(ref(b.storage(),key),data,{contentType:'image/jpeg'}),false);
 await check('script MIME denied',uploadBytes(ref(a.storage(),'private/w1/projects/attendance/images/script.jpg'),data,{contentType:'text/html'}),false);
 await check('executable extension denied',uploadBytes(ref(a.storage(),'private/w1/projects/attendance/images/script.exe'),data,{contentType:'image/jpeg'}),false);
 await check('oversize denied',uploadBytes(ref(a.storage(),'private/w1/projects/attendance/images/large.jpg'),new Uint8Array(10*1024*1024+1),{contentType:'image/jpeg'}),false);
 await check('assigned project image read via SDK denied; server-only',getBytes(ref(a.storage(),'private/w1/projects/p1/images/project.jpg')),false);
 await check('unassigned project image denied',uploadBytes(ref(a.storage(),'private/w1/projects/p2/images/project.jpg'),data,{contentType:'image/jpeg'}),false);
 await check('assistant own attendance read via SDK denied; server-only',getBytes(ref(assistant.storage(),'private/asst_a1/projects/attendance/images/asst.jpg')),false);
 await check('unknown public path denied',uploadBytes(ref(admin.storage(),'public/file.jpg'),data,{contentType:'image/jpeg'}),false);
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'accountSecurity/usta:w1'),{sessionVersion:'new',disabled:false}));
 await check('revoked session image read denied',getBytes(ref(a.storage(),key)),false);
 await check('new session version image read via SDK denied; server-only',getBytes(ref(context('usta','w1','new').storage(),key)),false);
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'accountSecurity/usta:w1'),{sessionVersion:'new',disabled:true}));
 await check('disabled account image read denied',getBytes(ref(context('usta','w1','new').storage(),key)),false);
 await check('owner cannot mint public token URL',getDownloadURL(ref(a.storage(),key)),false);
 await check('admin client cannot mint public token URL',getDownloadURL(ref(admin.storage(),key)),false);
 await check('owner metadata/token write denied',updateMetadata(ref(a.storage(),key),{customMetadata:{firebaseStorageDownloadTokens:'forged'}}),false);
 console.log(`PASS ${count} Storage emulator authorization assertions.`);
}finally{await env.cleanup();}
