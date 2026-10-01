import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import vm from 'node:vm';
import { generateKeyPairSync, verify } from 'node:crypto';
import { createAccountVerifier, sessionFromVerifiedClaims } from '../server/authAccounts.js';
import { createAuthRouter } from '../server/routes/authApi.js';
import { createServerTokenIssuer } from '../server/firebaseAdminAuth.js';
const key=generateKeyPairSync('rsa',{modulusLength:2048});
process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON=JSON.stringify({project_id:'test-auth',client_email:'test@test-auth.iam.gserviceaccount.com',private_key:key.privateKey.export({type:'pkcs8',format:'pem'})});
const accounts={workers:[{id:'worker-a',login:'Worker',password:'test-worker-password',role:'admin',workerId:'spoof'}],users:[{id:'legacy',login:'Legacy',password:'test-legacy-password'}],assistants:[{id:'assistant-a',login:'Manager',password:'test-assistant-password'},{id:'disabled',login:'Disabled',password:'test-disabled-password',disabled:true}]};
const getDb=async()=>({collection:name=>({doc:()=>({get:async()=>({exists:false})}),get:async()=>({docs:accounts[name].map(data=>({id:data.id,data:()=>data}))})})});
const verifyAccount=createAccountVerifier({getDb,env:{ADMIN_LOGIN:'test-admin',ADMIN_PASSWORD:'test-admin-password'}});
assert.equal((await verifyAccount({role:'worker',login:'WORKER',password:'test-worker-password',workerId:'evil',uid:'evil'})).id,'worker-a');
assert.equal((await verifyAccount({role:'worker',login:'WORKER',password:'test-worker-password'})).role,'usta');
assert.equal(await verifyAccount({role:'admin',login:'Worker',password:'test-worker-password'}),null);
assert.equal(await verifyAccount({role:'asisten',login:'Disabled',password:'test-disabled-password'}),null);
assert.equal((await verifyAccount({role:'usta',login:'legacy',password:'test-legacy-password'})).id,'legacy');
const noAdmin=createAccountVerifier({getDb,env:{}});assert.equal(await noAdmin({role:'admin',login:'admin',password:'admin123'}),null);
const validId={uid:'usta:worker-a',accountId:'worker-a',workerId:'worker-a',role:'usta',login:'Worker',name:'Worker',firebase:{sign_in_provider:'custom'}};
assert.equal(sessionFromVerifiedClaims({...validId,workerId:'evil'}),null);
assert.equal(sessionFromVerifiedClaims({...validId,role:'admin'}),null);
const app=express();app.use(express.json());
app.use('/api/auth',createAuthRouter({verifyAccount,issueToken:createServerTokenIssuer,validateAccount:async()=>{},verifyToken:async token=>{if(token==='verified-test-id')return validId;throw new Error('Invalid/expired/revoked');}}));
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const post=async body=>{const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
try {
 for(const [role,login,password,id] of [['admin','test-admin','test-admin-password','primary'],['usta','worker','test-worker-password','worker-a'],['manager','manager','test-assistant-password','assistant-a']]) {
  const result=await post({role,login,password,workerId:'evil',claims:{role:'admin'}});assert.equal(result.status,200);assert.deepEqual(Object.keys(result.data).sort(),['customToken','ok']);
  const [header,payload,signature]=result.data.customToken.split('.');assert.equal(verify('RSA-SHA256',Buffer.from(`${header}.${payload}`),key.publicKey,Buffer.from(signature,'base64url')),true);
  const decoded=JSON.parse(Buffer.from(payload,'base64url'));const canonical=role==='manager'?'asisten':role;
  assert.equal(decoded.uid,`${canonical}:${id}`);assert.equal(decoded.claims.role,canonical);assert.equal(decoded.claims.workerId,canonical==='usta'?id:'');assert.equal(JSON.stringify(decoded).includes(password),false);
 }
 const wrong=await post({role:'usta',login:'worker',password:'wrong'});const missing=await post({role:'usta',login:'absent',password:'wrong'});assert.deepEqual(wrong,missing);
 for(const token of ['', 'tampered','expired','revoked']){const response=await fetch(base+'/api/auth/session',{headers:{Authorization:`Bearer ${token}`}});assert.equal(response.status,401);}
 const response=await fetch(base+'/api/auth/session',{headers:{Authorization:'Bearer verified-test-id','X-Solar-Role':'admin'}});assert.equal(response.status,200);assert.equal((await response.json()).session.role,'usta');assert.equal(response.headers.get('cache-control'),'no-store');
 for(let i=0;i<16;i++)await post({});assert.equal((await post({})).status,429);
} finally {await new Promise(resolve=>server.close(resolve));}
console.log('PASS server auth: all roles/aliases, existing legacy passwords, no default admin, signed UID/claims, client-role spoofing, disabled accounts, generic failure, bearer verification, rate limit. No real accounts/users/network services.');

// Supply must not derive admin permission from client role headers.
const context=vm.createContext({process:{env:{}},String});
const synthetic=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value]of Object.entries(values))this.setExport(key,value);},{context});
const verifier=synthetic({verifyServerIdToken:async token=>{
 if(token==='worker-id')return validId;
 if(token==='admin-id')return {uid:'admin:primary',role:'admin',accountId:'primary',name:'Admin'};
 throw new Error('Invalid');
}});
const claimsModule=synthetic({sessionFromVerifiedClaims});
const supply=new vm.SourceTextModule(fs.readFileSync('server/supply/adminAuth.js','utf8'),{context});
await supply.link(name=>name.includes('firebaseAdminAuth')?verifier:claimsModule);await supply.evaluate();
for(const [token,allowed]of [['forged',false],['worker-id',false],['admin-id',true]]){
 const req={headers:{authorization:`Bearer ${token}`,'x-solar-role':'admin'},serverVerifiedAdmin:true,authSession:token==='admin-id'?{role:'admin'}:token==='worker-id'?{role:'usta'}:undefined};
 await supply.namespace.attachSupplyIdentity(req,{},()=>{});
 assert.equal(supply.namespace.isAdminRequest(req),allowed);
}
console.log('PASS supply auth: spoofed role/header rejected, worker bearer denied, verified admin bearer accepted.');
