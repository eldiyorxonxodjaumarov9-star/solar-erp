/** Current frontend + real public Firebase config, fail-closed read-only preview. */
import {mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import express from 'express';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {FIREBASE_PUBLIC_CONFIG} from '../shared/firebasePublicConfig.js';
import {createAuthRouter} from '../server/routes/authApi.js';
for(const key of ['FIREBASE_AUTH_EMULATOR_HOST','FIRESTORE_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST','STORAGE_EMULATOR_HOST'])delete process.env[key];
const config=FIREBASE_PUBLIC_CONFIG;
if(config.projectId.startsWith('demo-'))throw new Error('Real project required');
const envDir=await mkdtemp(path.join(tmpdir(),'solar-real-readonly-'));
const env={VITE_FIREBASE_API_KEY:config.apiKey,VITE_FIREBASE_AUTH_DOMAIN:config.authDomain,VITE_FIREBASE_PROJECT_ID:config.projectId,VITE_FIREBASE_STORAGE_BUCKET:config.storageBucket,VITE_FIREBASE_MESSAGING_SENDER_ID:config.messagingSenderId,VITE_FIREBASE_APP_ID:config.appId,VITE_FIREBASE_EMULATORS:'false',VITE_API_BASE:'',VITE_API_BASE_HTTP:'',VITE_ANDROID_API_BASE:''};
await writeFile(path.join(envDir,'.env'),Object.entries(env).map(([key,value])=>`${key}=${value}`).join('\n'));
const api=express();api.use(express.json({limit:'16kb'}));
// No SQL/test adapter, account import, anonymous login or background cron.
// The actual server auth module fails closed when real credentials are absent.
api.use('/api/auth',createAuthRouter());
api.use('/api',(_req,res)=>res.status(403).json({ok:false,error:'Read-only verification: real authenticated API unavailable.'}));
const vite=await createServer({configFile:false,envDir,plugins:[react(),{name:'real-readonly-api',configureServer(server){server.middlewares.use(api);}}],server:{host:'127.0.0.1',port:5180,strictPort:true}});
await vite.listen();console.log(JSON.stringify({url:'http://127.0.0.1:5180/login',projectId:config.projectId,emulators:false,mocks:false,seeds:false,productionWrites:false,adminCredentialConfigured:!!process.env.ADMIN_LOGIN,serverAdminCredentialConfigured:!!(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON||process.env.GOOGLE_APPLICATION_CREDENTIALS)}));
await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});await vite.close();
