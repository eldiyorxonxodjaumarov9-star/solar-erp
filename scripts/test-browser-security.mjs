/** Actual React UI + Firebase SDK against demo emulators; no production endpoints. */
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import express from 'express';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from '@playwright/test';
import { getServerAdminDb, getServerAdminAuth } from '../server/firebaseAdminAuth.js';
import { getStorage } from 'firebase-admin/storage';
import { createPrivateUploadRouter } from '../server/routes/privateMediaApi.js';
import { createPrivateStorageRouter } from '../server/routes/privateStorageApi.js';
import { createAuthRouter } from '../server/routes/authApi.js';
import { createStaffRouter } from '../server/routes/staffApi.js';
import { requireFirebaseSession } from '../server/authMiddleware.js';
import { requireOperationScope } from '../server/operationAuthorization.js';
import { hashPassword } from '../server/passwordHash.js';
for(const key of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST'])if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env[key]||''))throw new Error('Loopback emulator required');
const projectId='demo-solar-authorization',key=generateKeyPairSync('rsa',{modulusLength:2048});
process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON=JSON.stringify({project_id:projectId,client_email:`test@${projectId}.iam.gserviceaccount.com`,private_key:key.privateKey.export({type:'pkcs8',format:'pem'})});
process.env.ADMIN_LOGIN='test-admin';process.env.ADMIN_PASSWORD='test-password';delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
delete process.env.ADMIN_PASSWORD_HASH;process.env.ALLOW_LEGACY_PLAINTEXT_LOGIN='false';
const db=await getServerAdminDb();
const rate={salary:3900000,workingDays:26,dailySalary:150000,salaryEffectiveDate:'2026-10-01',salaryHistory:[{salary:3900000,workingDays:26,effectiveDate:'2026-10-01'}]};
const seed={
 'workers/w1':{login:'test-worker',fullName:'Test Worker One',password:'test-password',...rate,status:'active'},
 'workers/w2':{login:'other-worker',fullName:'Other Worker Private',password:'test-password',...rate,status:'active'},
 'assistants/a1':{login:'test-assistant',fullName:'Test Assistant',password:'test-password',status:'active'},
 'projects/p1':{clientName:'Assigned Demo Project',ustaId:'w1',assignedWorkerId:'w1',assignedWorkerIds:['w1'],status:'jarayonda'},
 'projects/p2':{clientName:'Other Worker Project',ustaId:'w2',assignedWorkerId:'w2',assignedWorkerIds:['w2'],status:'jarayonda'},
 'expenses/pay1':{type:'Mexnat haqi',amount:'500000',date:'2026-10-01',payrollWorkerId:'w1',payrollMonth:'2026-10',payrollPaymentType:'advance',ustaId:''},
 'expenses/pay2':{type:'Mexnat haqi',amount:'1000000',date:'2026-10-01',payrollWorkerId:'w2',payrollMonth:'2026-10',payrollPaymentType:'salary',ustaId:''},
 'expenses/op1':{type:'Transport',amount:'100',date:'2026-10-01',ustaId:'w1',ustaName:'Test Worker One',projectId:'p1',projectName:'Assigned Demo Project',comment:'Demo'},
 'user_activity_logs/l1':{ustaId:'w1',ustaName:'Test Worker One',dateKey:'2026-10-01',loginTime:'2026-10-01T03:00:00Z'},
 'user_activity_logs/l2':{ustaId:'w2',ustaName:'Other Worker Private',dateKey:'2026-10-01',loginTime:'2026-10-01T03:00:00Z'},
 'points/w1':{userId:'w1',total:0},
};
for(const [profile,credential]of [['workers/w1','accountCredentials/usta:w1'],['workers/w2','accountCredentials/usta:w2'],['assistants/a1','accountCredentials/asisten:a1']]){seed[credential]=hashPassword(seed[profile].password);delete seed[profile].password;}
await Promise.all(Object.entries(seed).map(([doc,data])=>db.doc(doc).set(data)));
const api=express();api.use(express.json());api.use('/api/auth',createAuthRouter());api.use('/api/staff',createStaffRouter());
const privateBucket=getStorage((await getServerAdminAuth()).app).bucket(`${projectId}.appspot.com`);
api.use('/api/upload',requireFirebaseSession(),createPrivateUploadRouter({getBucket:async()=>privateBucket}));
api.use('/api/private-storage',createPrivateStorageRouter({getBucket:async()=>privateBucket}));
api.post('/api/master/mark-login',requireFirebaseSession(),requireOperationScope(),(_req,res)=>res.json({ok:true}));
api.use('/api/reports',requireFirebaseSession(['admin']),(_req,res)=>res.json({ok:true,items:[],rows:[]}));
api.use('/api/db',requireFirebaseSession(['admin']),(_req,res)=>res.json({ok:true,items:[]}));
api.use('/api/supply',requireFirebaseSession(['admin','asisten']),(_req,res)=>res.json({ok:true,panels:[],inverters:[],batteries:[],accessories:[],settings:{},items:[]}));
api.use('/api',requireFirebaseSession(),(_req,res)=>res.json([]));
const envDir=await mkdtemp(path.join(tmpdir(),'solar-vite-security-'));
const env={VITE_FIREBASE_API_KEY:'demo-key',VITE_FIREBASE_PROJECT_ID:projectId,VITE_FIREBASE_AUTH_DOMAIN:`${projectId}.firebaseapp.com`,VITE_FIREBASE_STORAGE_BUCKET:`${projectId}.appspot.com`,VITE_FIREBASE_APP_ID:'1:123:web:demo',VITE_FIREBASE_EMULATORS:'true',VITE_API_BASE:'',VITE_API_BASE_HTTP:'',VITE_ANDROID_API_BASE:''};
await writeFile(path.join(envDir,'.env'),Object.entries(env).map(([k,v])=>`${k}=${v}`).join('\n'));
const vite=await createServer({configFile:false,envDir,plugins:[react(),{name:'local-security-api',configureServer(server){server.middlewares.use(api);}}],server:{host:'127.0.0.1',port:5179,strictPort:true}});
await vite.listen();const base='http://127.0.0.1:5179';
await mkdir('.security-artifacts',{recursive:true});
let browser;
try{
 // Skill verification uses an independent headless local browser; no credentials supplied.
 if(process.env.SECURITY_AGENT_BROWSER !== 'false')try{
  const cli=['/c','npx','--yes','agent-browser','--session','solar-security','--executable-path','"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"'];
  execFileSync('cmd.exe',[...cli,'open',base+'/login'],{timeout:45000,stdio:'pipe'});
  const snapshot=execFileSync('cmd.exe',[...cli,'snapshot','-i'],{timeout:20000,encoding:'utf8'});
  await writeFile('.security-artifacts/agent-browser-login.txt',snapshot);
  execFileSync('cmd.exe',[...cli,'close'],{timeout:20000,stdio:'pipe'});
  console.log('PASS agent-browser local login page snapshot');
 }catch(error){console.log('Agent-browser CLI verification unavailable:',error.code||'CLI failure');}
 browser=await chromium.launch({channel:'chrome',headless:true});
 const results=[];
 const run=async(role,tab,login,landing,routes,mobile=false)=>{
  const context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{});
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(['127.0.0.1','localhost'].includes(u.hostname)||['data:','blob:'].includes(u.protocol))return route.continue();return route.abort();});
  const page=await context.newPage(),errors=[],consoleErrors=[],networkErrors=[];let phase='navigation';
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push({phase,message:message.text().slice(0,500)});});
  page.on('response',response=>{if([401,403,500].includes(response.status())){const url=new URL(response.url());networkErrors.push({phase,status:response.status(),path:url.pathname});}});
  await page.goto(base+'/login');await page.getByRole('button',{name:tab,exact:true}).click();
  await page.locator('#auth-login').fill(login);await page.locator('#auth-password').fill('test-password');await page.getByRole('button',{name:'Kirish',exact:true}).click();
  await page.waitForURL(base+landing,{timeout:20000});
  for(const route of routes){await page.goto(base+route);await page.waitForURL(base+route);await page.locator('main').waitFor();assert.ok((await page.locator('body').innerText()).length>50);assert.equal(await page.getByText('Unexpected Application Error!').count(),0);
   if(route==='/ustalar')await page.locator('main').getByText('Test Worker One',{exact:true}).first().waitFor();
   if(route.includes('monthly-salary')){await page.locator('main').getByText('Test Worker One',{exact:true}).first().waitFor();if(role==='usta')assert.equal(await page.getByText('Other Worker Private',{exact:true}).count(),0);}}
  phase='intentional-deny';
  if(role==='usta'){
   await page.goto(base+'/usta-panel/loyihalar');await page.getByText('Assigned Demo Project',{exact:false}).first().waitFor();assert.equal(await page.getByText('Other Worker Project',{exact:false}).count(),0);
   const status=await page.evaluate(async()=>{
    const {getClientAuth}=await import('/src/firebase.js');const token=await getClientAuth().currentUser.getIdToken();return(await fetch('/api/reports/monthly-attendance',{headers:{Authorization:`Bearer ${token}`}})).status;
   });assert.equal(status,403);
   const idor=await page.evaluate(async()=>{const {getCollectionDoc}=await import('/src/firebase/firestoreCrud.js');const profile=await getCollectionDoc('workers','w2');let payment;try{await getCollectionDoc('expenses','pay2');payment='allowed';}catch(error){payment=error.code;}return{profile,payment};});
   assert.equal(idor.profile,null);assert.equal(idor.payment,'permission-denied');
   await page.evaluate(()=>{localStorage.setItem('currentSession',JSON.stringify({role:'admin',workerId:'w2'}));localStorage.setItem('users',JSON.stringify([{id:'w2',password:'forged'}]));});
   await page.reload();await page.waitForURL(base+'/usta-panel/loyihalar');await page.getByText('Assigned Demo Project',{exact:false}).first().waitFor();
   for(const path of ['/ustalar','/sozlamalar','/admin/monthly-salary','/xarajatlar']){await page.goto(base+path);await page.waitForURL(base+'/usta-panel');}
  }
  if(role==='asisten')for(const path of ['/admin/monthly-salary','/sozlamalar','/ustalar','/xarajatlar']){await page.goto(base+path);await page.waitForURL(base+'/asisten-panel');}
  phase='private-media';
  // Actual frontend upload client + PrivateMedia renderer through verified server routes and demo GCS.
  await page.evaluate(async role=>{
   const {uploadImageToStorage,buildPhotoStoragePath}=await import('/src/services/storageUpload.js');
   const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;canvas.getContext('2d').fillRect(0,0,1,1);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
   const userId=role==='usta'?'w1':role==='asisten'?'asst_a1':'admin';
   const result=await uploadImageToStorage(blob,buildPhotoStoragePath({projectId:'p1',userId,suffix:'png'}));
   const React=(await import('/node_modules/.vite/deps/react.js')).default;
   const dom=await import('/node_modules/.vite/deps/react-dom_client.js');const createRoot=dom.createRoot||dom.default.createRoot;
   const PrivateMedia=(await import('/src/components/PrivateMedia.jsx')).default;
   const host=document.createElement('div');document.body.appendChild(host);createRoot(host).render(React.createElement(PrivateMedia,{src:result.downloadUrl,alt:'Private upload test'}));
  },role);
  await page.waitForFunction(()=>{const image=document.querySelector('img[alt="Private upload test"]');return image?.naturalWidth===1&&image.src.startsWith('blob:');});
  // Cold-start reload exercises persisted Firebase Auth plus server session revalidation.
  await page.reload();await page.waitForURL(url=>!url.pathname.startsWith('/login'));
  if(!mobile)await page.getByRole('button',{name:'Chiqish',exact:true}).first().click();
  else await page.evaluate(async()=>{const {signOutFirebase}=await import('/src/firebase.js');await signOutFirebase();});
  await page.waitForURL(base+'/login');
  assert.equal(await page.evaluate(()=>localStorage.getItem('currentSession')),null);
  phase='relogin';
  await page.getByRole('button',{name:tab,exact:true}).click();
  await page.locator('#auth-login').fill(login);await page.locator('#auth-password').fill('test-password');await page.getByRole('button',{name:'Kirish',exact:true}).click();
  await page.waitForURL(base+landing,{timeout:20000});await page.reload();await page.waitForURL(base+landing);
  await page.evaluate(async()=>{const {signOutFirebase}=await import('/src/firebase.js');await signOutFirebase();});await page.waitForURL(base+'/login');
  assert.equal(errors.length,0,errors.join('\n'));
  await page.screenshot({path:`.security-artifacts/${role}${mobile?'-mobile':''}-logout.png`});
  results.push({role,mobile,login:true,routes,privateUploadRender:true,coldStart:true,logout:true,relogin:true,uncaughtErrors:errors,consoleErrors,networkErrors});await context.close();
 };
 await run('admin','Admin','test-admin','/',['/','/ustalar','/asistenlar','/loyihalar','/xarajatlar','/admin/monthly-salary','/sozlamalar','/admin/monthly-reports','/admin/supply','/rasmlar','/ish-vaqtlari']);
 await run('usta','Master','test-worker','/usta-panel',['/usta-panel','/usta-panel/loyihalar','/usta-panel/xarajatlar','/usta-panel/monthly-salary','/usta-panel/ish-vaqti','/usta-panel/jalba','/usta-panel/rasmlar']);
 await run('asisten','Asisten','test-assistant','/asisten-panel',['/asisten-panel','/asisten-panel/loyihalar','/asisten-panel/tijoriy-taklif','/asisten-panel/ish-vaqti','/asisten-panel/monthly-reports','/asisten-panel/taminot','/asisten-panel/rasmlar']);
 await run('usta','Master','test-worker','/usta-panel',['/usta-panel/monthly-salary'],true);
 await writeFile('.security-artifacts/browser-results.json',JSON.stringify(results,null,2));console.log('PASS browser role regressions:',JSON.stringify(results));
 if(process.env.SECURITY_KEEP_LOCAL==='true'){
  console.log(`LOCAL READY ${base}/login — demo emulators only; server/frontend remain running.`);
  await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
 }
}finally{if(browser)await browser.close();await vite.close();}
