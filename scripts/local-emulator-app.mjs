/** Local-only app: read-only SQL copy -> demo Firestore, server-side credentials. */
import fs from 'node:fs';
import path from 'node:path';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import Database from 'better-sqlite3';
import express from 'express';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {getStorage} from 'firebase-admin/storage';
import {getServerAdminDb,getServerAdminAuth} from '../server/firebaseAdminAuth.js';
import {hashPassword} from '../server/passwordHash.js';
import {createAccountVerifier} from '../server/authAccounts.js';
import {migrationPlan,removePublicSecrets,requireMigrationEmulator} from './credential-migration.mjs';
import {createAuthRouter} from '../server/routes/authApi.js';
import {createStaffRouter} from '../server/routes/staffApi.js';
import {requireFirebaseSession} from '../server/authMiddleware.js';
import {requireOperationScope} from '../server/operationAuthorization.js';
import {createPrivateUploadRouter} from '../server/routes/privateMediaApi.js';
import {createPrivateStorageRouter} from '../server/routes/privateStorageApi.js';
const projectId='demo-solar-authorization';
if(process.env.NODE_ENV==='production')throw new Error('Local development only');
requireMigrationEmulator(process.env,projectId);
for(const key of ['FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST'])if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env[key]||''))throw new Error('Loopback emulators required');
const signingKey=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON=JSON.stringify({project_id:projectId,client_email:`local@${projectId}.iam.gserviceaccount.com`,private_key:signingKey});
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;delete process.env.ADMIN_PASSWORD;delete process.env.ADMIN_PASSWORD_HASH;delete process.env.ADMIN_LOGIN;
process.env.ALLOW_LEGACY_PLAINTEXT_LOGIN='false';
const configFile=path.resolve('.security-artifacts/local-admin.json');
let adminConfigured=false;
if(fs.existsSync(configFile)){const config=JSON.parse(fs.readFileSync(configFile,'utf8'));if(!config.login||config.hash?.algorithm!=='scrypt')throw new Error('Invalid local admin configuration');process.env.ADMIN_LOGIN=config.login;process.env.ADMIN_PASSWORD_HASH=JSON.stringify(config.hash);adminConfigured=true;}
const db=await getServerAdminDb(),sql=new Database('data/solar-erp.db',{readonly:true,fileMustExist:true});
let rows;try{rows=sql.prepare('SELECT collection,id,data FROM documents').all().map(row=>({...row,data:JSON.parse(row.data)}));}finally{sql.close();}
const snapshot={workers:[],users:[],assistants:[],accountCredentials:[],accountSecurity:[]};
for(const row of rows)if(Object.hasOwn(snapshot,row.collection))snapshot[row.collection].push({id:row.id,data:row.data});
const plan=migrationPlan(snapshot);
// Emulator is freshly started by the dedicated command; no real database writes.
for(let offset=0;offset<rows.length;offset+=400){const batch=db.batch();for(const row of rows.slice(offset,offset+400)){
 if(['accountCredentials','accountSecurity'].includes(row.collection))continue;
 batch.set(db.collection(row.collection).doc(row.id),removePublicSecrets(row.data));
}await batch.commit();}
for(const account of plan.accounts){await db.doc(`accountCredentials/${account.uid}`).set(account.credential||hashPassword(account.profiles[0].data.password));await db.doc(`accountSecurity/${account.uid}`).set({sessionVersion:randomUUID()});}
const verifier=createAccountVerifier();let preserved=0;
for(const account of plan.accounts)if(account.profiles[0].data.password){const verified=await verifier({role:account.uid.split(':')[0],login:account.profiles[0].data.login,password:account.profiles[0].data.password});if(!verified||verified.id!==account.profiles[0].id)throw new Error('Local account preservation verification failed');preserved++;}
const api=express();api.use(express.json({limit:'16kb'}));
const base='http://127.0.0.1:5179',setupNonce=randomUUID();
api.get('/local-account-setup',(_req,res)=>{if(adminConfigured)return res.redirect('/login');res.set('Cache-Control','no-store').type('html').send(`<!doctype html><html lang="uz"><meta charset="utf-8"><title>Lokal admin sozlash</title><style>body{font:16px system-ui;max-width:440px;margin:70px auto;padding:20px}input,button{box-sizing:border-box;width:100%;padding:12px;margin:8px 0}p{line-height:1.5}</style><h1>Avvalgi lokal admin hisobi</h1><p>Avvalgi admin login va parolingizni kiriting. Parol faqat lokal serverga yuboriladi va hash saqlanadi. Production bilan aloqa yo‘q.</p><form id="form"><label>Login<input id="login" value="admin" autocomplete="username" required></label><label>Avvalgi parol<input id="password" type="password" autocomplete="current-password" required></label><label>Parolni takrorlang<input id="confirm" type="password" autocomplete="off" required></label><button>Hisobni lokalga ulash</button></form><p id="message"></p><script>document.querySelector('#form').onsubmit=async e=>{e.preventDefault();const password=document.querySelector('#password').value;if(password!==document.querySelector('#confirm').value){document.querySelector('#message').textContent='Parollar mos emas';return;}const response=await fetch('/api/local-admin-setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:document.querySelector('#login').value,password,nonce:'${setupNonce}'})});document.querySelector('#password').value='';document.querySelector('#confirm').value='';if(response.ok)location.href='/login';else document.querySelector('#message').textContent='Sozlash bajarilmadi';};</script></html>`);});
api.post('/api/local-admin-setup',async(req,res)=>{
 if(adminConfigured||req.headers.origin!==base||req.body?.nonce!==setupNonce||!req.is('application/json'))return res.status(403).json({ok:false});
 const login=String(req.body.login||'').trim(),password=req.body.password;
 if(!login||login.length>128||typeof password!=='string'||!password||password.length>1024)return res.status(400).json({ok:false});
 const hash=hashPassword(password);try{
  fs.mkdirSync(path.dirname(configFile),{recursive:true});fs.writeFileSync(configFile,JSON.stringify({login,hash}),{flag:'wx',mode:0o600});
  process.env.ADMIN_LOGIN=login;process.env.ADMIN_PASSWORD_HASH=JSON.stringify(hash);adminConfigured=true;
  await db.doc('accountSecurity/admin:primary').set({sessionVersion:randomUUID()});res.json({ok:true});
 }catch{res.status(500).json({ok:false});}
});
api.use('/api/auth',createAuthRouter());api.use('/api/staff',createStaffRouter());
const bucket=getStorage((await getServerAdminAuth()).app).bucket(`${projectId}.appspot.com`);
api.use('/api/upload',requireFirebaseSession(),createPrivateUploadRouter({getBucket:async()=>bucket}));
api.use('/api/private-storage',createPrivateStorageRouter({getBucket:async()=>bucket}));
api.post('/api/master/mark-login',requireFirebaseSession(),requireOperationScope(),(_req,res)=>res.json({ok:true}));
api.use('/api/reports',requireFirebaseSession(['admin']),(_req,res)=>res.json({ok:true,items:[],rows:[]}));
api.use('/api/db',requireFirebaseSession(['admin']),(_req,res)=>res.json({ok:true,items:[]}));
api.use('/api/supply',requireFirebaseSession(['admin','asisten']),(_req,res)=>res.json({ok:true,panels:[],inverters:[],batteries:[],accessories:[],settings:{},items:[]}));
api.use('/api',requireFirebaseSession(),(_req,res)=>res.json([]));
const envDir=await mkdtemp(path.join(tmpdir(),'solar-local-accounts-'));
await writeFile(path.join(envDir,'.env'),Object.entries({VITE_FIREBASE_API_KEY:'demo-key',VITE_FIREBASE_PROJECT_ID:projectId,VITE_FIREBASE_AUTH_DOMAIN:`${projectId}.firebaseapp.com`,VITE_FIREBASE_STORAGE_BUCKET:`${projectId}.appspot.com`,VITE_FIREBASE_APP_ID:'1:123:web:demo',VITE_FIREBASE_EMULATORS:'true',VITE_API_BASE:'',VITE_API_BASE_HTTP:'',VITE_ANDROID_API_BASE:''}).map(([key,value])=>`${key}=${value}`).join('\n'));
const vite=await createServer({configFile:false,envDir,plugins:[react(),{name:'local-accounts-api',configureServer(server){server.middlewares.use(api);}}],server:{host:'127.0.0.1',port:5179,strictPort:true}});
await vite.listen();console.log(JSON.stringify({url:base+'/login',adminSetup:adminConfigured?'configured':base+'/local-account-setup',preservedLocalAccounts:preserved,localDocuments:rows.length,sourceReadOnly:true,productionAccess:false,fixtureIntegrations:['reports','supply','sql-api']}));
await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});await vite.close();
