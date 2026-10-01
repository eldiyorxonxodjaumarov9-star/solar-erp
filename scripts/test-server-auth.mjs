import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createServerTokenIssuer } from '../server/firebaseAdminAuth.js';
delete process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
assert.throws(()=>createServerTokenIssuer(null),{code:'SERVER_ACCOUNT_VERIFIER_REQUIRED'});
const issue=createServerTokenIssuer(async()=>({id:'test-worker',role:'usta'}));
process.env.FIREBASE_PROJECT_ID='solar-erp-51870';
await assert.rejects(issue({}),{code:'FIREBASE_ADMIN_CREDENTIALS_MISSING'});
delete process.env.FIREBASE_PROJECT_ID;
await assert.rejects(issue({role:'admin',workerId:'spoofed'}),{code:'FIREBASE_ADMIN_CREDENTIALS_MISSING'});
await assert.rejects(createServerTokenIssuer(async()=>null)({}),{code:'AUTH_INVALID_CREDENTIALS'});
await assert.rejects(createServerTokenIssuer(async()=>({id:'x',role:'owner'}))({}),{code:'AUTH_INVALID_ACCOUNT'});
process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON='{invalid';
await assert.rejects(issue({}),{code:'FIREBASE_ADMIN_CREDENTIALS_INVALID'});
const keys=generateKeyPairSync('rsa',{modulusLength:2048});
process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON=JSON.stringify({project_id:'test-solar-auth',client_email:'test@test-solar-auth.iam.gserviceaccount.com',private_key:keys.privateKey.export({type:'pkcs8',format:'pem'})});
process.env.FIREBASE_PROJECT_ID='solar-erp-51870';
await assert.rejects(issue({}),{code:'FIREBASE_ADMIN_PROJECT_MISMATCH'});
delete process.env.FIREBASE_PROJECT_ID;
for(const role of ['admin','usta','asisten']) {
  const issuer=createServerTokenIssuer(async()=>({id:'server-account',role}));
  const token=await issuer({uid:'evil',role:'admin',workerId:'evil'});
  const [header,payload,signature]=token.split('.');
  assert.equal(verify('RSA-SHA256',Buffer.from(`${header}.${payload}`),keys.publicKey,Buffer.from(signature,'base64url')),true);
  const claims=JSON.parse(Buffer.from(payload,'base64url'));
  assert.equal(claims.uid,`${role}:server-account`);
  assert.equal(claims.claims.role,role);
  assert.equal(claims.claims.workerId,role==='usta'?'server-account':'');
}
// Smoke-evaluate live server.js with mocked external services and filesystem.
// No real DB, Telegram, credential file, HTTP listener, or account is touched.
const routes=[];
let started=false;
const app={locals:{},disable(){},use(){},listen(_port,_host,callback){started=true;queueMicrotask(callback);return {close(){}};}};
for(const verb of ['get','post','put','delete','patch'])app[verb]=(route)=>routes.push({verb,route});
const express=()=>app;
for(const method of ['json','urlencoded','static'])express[method]=()=>()=>{};
const multer=()=>({single:()=>()=>{},array:()=>()=>{}});multer.memoryStorage=()=>({});
const context=vm.createContext({console:{log(){},warn(){},error(){}},process:{env:{},argv:[],on(){}},Buffer,URL,Map,Set,Date,String,Number,Math,JSON,queueMicrotask});
const synthetic=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value]of Object.entries(values))this.setExport(key,value);},{context});
const source=fs.readFileSync('server.js','utf8');
const modules=new Map();
for(const match of source.matchAll(/import\s+([\s\S]*?)\s+from\s+["']([^"']+)["'];/g)){
  const [,clause,name]=match;
  const values={};
  if(clause.trim().startsWith('{'))for(const item of clause.replace(/[{}]/g,'').split(',')){const key=item.trim();if(key)values[key]=()=>{};}
  else values.default={};
  if(name==='express')values.default=express;
  else if(name==='dotenv')values.default={config(){}};
  else if(name==='multer')values.default=multer;
  else if(name==='node:fs')values.default={mkdirSync(){},existsSync:()=>false};
  else if(name==='node:path')values.default=path;
  else if(name==='node:url')values.fileURLToPath=fileURLToPath;
  else if(name.includes('firebaseAdminAuth'))values.createServerTokenIssuer=createServerTokenIssuer;
  else if(name.includes('db/store'))values.initDb=async()=>{};
  else if(name.includes('routes/'))for(const key of Object.keys(values))if(key.startsWith('create'))values[key]=()=>()=>{};
  else if(name.includes('supplyDir'))values.resolveSupplyDir=()=>'/test-only';
  modules.set(name,synthetic(values));
}
const server=new vm.SourceTextModule(source,{context,initializeImportMeta:meta=>{meta.url=pathToFileURL(path.resolve('server.js')).href;}});
await server.link(name=>modules.get(name));await server.evaluate();
assert.equal(app.locals.createServerTokenIssuer,createServerTokenIssuer);
server.namespace.startServer({port:59999,host:'127.0.0.1'});assert.equal(started,true);server.namespace.stopServer();
assert.equal(routes.some(({route})=>/custom.?token|token.?issue/i.test(route)),false);
console.log('PASS: missing/invalid credentials, verifier required, claims ignore client IDs, all roles, real SDK JWT signing with generated test key, isolated live server startup, no token endpoint.');
