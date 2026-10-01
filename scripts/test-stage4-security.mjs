import { recordConfirmedStage } from '../server/confirmedStage.js';
import { createSupplyRouter } from '../server/routes/supplyApi.js';
import { credentialInventory } from './credential-migration-dry-run.mjs';
import assert from 'node:assert/strict';
import express from 'express';
import path from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { requireFirebaseSession } from '../server/authMiddleware.js';
import { requireOperationScope } from '../server/operationAuthorization.js';
import { createPrivateMediaRouter, createPrivateUploadRouter } from '../server/routes/privateMediaApi.js';
import { assertAccountSession } from '../server/accountSecurity.js';
import { createStaffRouter } from '../server/routes/staffApi.js';
import { clearPrivateCaches } from '../src/auth/privateCache.js';
const inventory=credentialInventory({workers:[{id:'a',login:'same',password:'TEST-SECRET'},{id:'b',login:'same',password:'TEST-OTHER'}],users:[{id:'',password:'TEST'}],assistants:[]});
assert.equal(inventory.collections.workers.plaintextPasswordDocuments,2);assert.equal(inventory.duplicateLogins.length,1);assert.equal(inventory.invalidAccounts.length,1);assert.ok(!JSON.stringify(inventory).includes('TEST-SECRET'));assert.equal(inventory.applySupported,false);
const records=new Map([
 ['workers/a',{login:'A',fullName:'A'}],['workers/b',{login:'B',fullName:'B'}],['assistants/x',{login:'X'}],
 ['projects/pa',{ustaId:'a'}],['projects/pb',{ustaId:'b'}],
 ['telegram_events/other',{workerId:'b'}],['mediaAssets/a.mp4',{ownerId:'a',projectId:'pa',contentType:'video/mp4'}],['mediaAssets/b.mp4',{ownerId:'b',projectId:'pb',contentType:'video/mp4'}],
]);
const reference=(col,id)=>({id,path:`${col}/${id}`,get:async()=>({exists:records.has(`${col}/${id}`),data:()=>records.get(`${col}/${id}`),id}),set:async data=>records.set(`${col}/${id}`,data)});
const db = {
 collection: col => ({
  doc: id => reference(col,id||'new'),
  get: async () => ({docs:[...records].filter(([key])=>key.startsWith(col+'/')).map(([key,data])=>({id:key.split('/')[1],data:()=>data}))})
 }),
 batch:()=>{const ops=[];return {set:(ref,data,opt)=>ops.push(()=>records.set(ref.path,{...(opt?.merge?records.get(ref.path):{}),...data})),delete:ref=>ops.push(()=>records.delete(ref.path)),commit:async()=>ops.forEach(op=>op())};}
};
const claim=(role,id)=>({uid:`${role}:${id}`,role,accountId:id,workerId:role==='usta'?id:'',...(role==='asisten'?{assistantId:id}:{}),firebase:{sign_in_provider:'custom'},login:id,name:id});
const tokens={admin:claim('admin','primary'),a:claim('usta','a'),b:claim('usta','b'),assistant:claim('asisten','x'),anonymous:{...claim('admin','primary'),firebase:{sign_in_provider:'anonymous'}}};
const verify=async token=>{if(!tokens[token])throw new Error();return tokens[token];};
const authorize=roles=>requireFirebaseSession(roles,verify,claims=>assertAccountSession(claims,{getDb:async()=>db,env:{ADMIN_SESSION_VERSION:process.env.TEST_ADMIN_VERSION||'0'}}));
const directory=await mkdtemp(path.join(tmpdir(),'solar-security-'));
await writeFile(path.join(directory,'a.mp4'),Buffer.from('private A'));await writeFile(path.join(directory,'b.mp4'),Buffer.from('private B'));
db.runTransaction=async fn=>fn({get:ref=>ref.get(),set:(ref,data,opt)=>records.set(ref.path,{...(opt?.merge?records.get(ref.path):{}),...data})});
const stageReq={authSession:{role:'usta',workerId:'a',name:'A'},authClaims:claim('usta','a'),body:{projectId:'pa',stageId:'stage-1',ustaId:'b'}};
const confirmed=await recordConfirmedStage(stageReq,{getDb:async()=>db});assert.equal(confirmed.ustaId,'a');
assert.deepEqual(await recordConfirmedStage(stageReq,{getDb:async()=>db}),confirmed);
await assert.rejects(recordConfirmedStage({...stageReq,body:{projectId:'pb',stageId:'stage-1'}},{getDb:async()=>db}));
let effects=0,revoked=[];
const app=express();app.use(express.json());
for(const route of ['/api/telegram/work-log','/api/telegram/log-event','/api/master/mark-login'])app.post(route,authorize(),requireOperationScope({getDb:async()=>db}), (req,res)=>{effects++;res.json({ok:true,body:req.body});});
app.post('/api/telegram/stage-photos',authorize(),requireOperationScope({getDb:async()=>db,project:true}),(req,res)=>{effects++;res.json({ok:true,body:req.body});});
app.get('/api/reports/monthly-attendance',authorize(['admin']),(_req,res)=>res.json({ok:true}));
app.get('/api/telegram-export/secret.json',authorize(['admin']),(_req,res)=>res.json({ok:true}));
app.use('/api/media',createPrivateMediaRouter({directory,getDb:async()=>db,authorize}));
app.use('/api/upload',authorize(),createPrivateUploadRouter({directory,getDb:async()=>db}));
app.use('/api/staff',createStaffRouter({getDb:async()=>db,authorize,revokeSessions:async uid=>revoked.push(uid)}));
const quotes=new Map([['other',{id:'other',createdByUid:'asisten:other'}],['legacy',{id:'legacy'}]]);
app.use('/api/supply',createSupplyRouter({authorize,historyStore:{list:()=>[...quotes.values()],save:(payload,id)=>{const result={...payload,id:id||'own'};quotes.set(result.id,result);return result;},remove:id=>{quotes.delete(id);return {ok:true};}}}));
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;
let count=0;
const check=async(path,token,status,body,method=body?'POST':'GET')=>{
 const result=await fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} :{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});assert.equal(result.status,status,`${token} ${path}`);count++;return result;
};
try{
 for(const token of ['', 'invalid','expired','revoked','anonymous'])for(const route of ['/api/telegram/work-log','/api/master/mark-login'])await check(route,token,401,{});
 for(const body of [{workerId:'b'},{ownerId:'b'},{ustaId:'b'},{uid:'usta:b'},{role:'admin'},{assistantId:'x'},{meta:{workerId:'b'}},{eventId:'other'},{payrollWorkerId:'a'}])await check('/api/telegram/log-event','a',403,body);
 assert.equal(effects,0);
 await check('/api/telegram/stage-photos','a',403,{projectId:'pb',stageId:'stage-1'});
 await check('/api/telegram/stage-photos','a',403,{projectId:'pa',stageId:'stage-1',photos:['http://127.0.0.1/private']});
 await check('/api/telegram/stage-photos','a',403,{projectId:'pa',stageId:'stage-1',photos:['private-storage:private/b/projects/pa/images/x.jpg']});
 await check('/api/telegram/stage-photos','a',200,{projectId:'pa',stageId:'stage-1'});
 const own=await (await check('/api/master/mark-login','a',200,{})).json();assert.equal(own.body.workerId,'a');
 for(const route of ['/api/reports/monthly-attendance','/api/telegram-export/secret.json']){await check(route,'assistant',403);await check(route,'a',403);await check(route,'',401);await check(route,'admin',200);}
 await check('/api/media/a.mp4','',401);await check('/api/media/b.mp4','a',403);await check('/api/media/a.mp4','assistant',403);await check('/api/media/a.mp4','a',200);await check('/api/media/b.mp4','admin',200);await check('/api/media/guess.mp4','a',403);
 const upload=async(workerId,projectId,mime,data,status)=>{const form=new FormData();form.set('ustaId',workerId);form.set('projectId',projectId);form.set('video',new Blob([data],{type:mime}),'test.mp4');const result=await fetch(base+'/api/upload/stage-video',{method:'POST',headers:{Authorization:'Bearer a'},body:form});assert.equal(result.status,status);count++;return result;};
 await upload('b','pa','video/mp4',Buffer.from('xxxxftyp'),403);
 await upload('a','pb','video/mp4',Buffer.from('xxxxftyp'),403);
 await upload('a','pa','video/mp4',Buffer.from('<script>'),403);
 const video=await (await upload('a','pa','video/mp4',Buffer.from('xxxxftyp'),200)).json();await check(video.videoUrl,'a',200);await check(video.videoUrl,'b',403);
 await check('/api/staff/workers/a','admin',200,{disabled:true},'PUT');assert.deepEqual(revoked,['usta:a']);await check('/api/master/mark-login','a',401,{});
 await check('/api/staff/workers/a','admin',200,{disabled:false,password:'test-password'},'PUT');await check('/api/master/mark-login','a',401,{});
 tokens.a={...tokens.a,sessionVersion:records.get('accountSecurity/usta:a').sessionVersion};await check('/api/master/mark-login','a',200,{});
 await check('/api/staff/workers/b','admin',200,undefined,'DELETE');await check('/api/master/mark-login','b',401,{});
 process.env.TEST_ADMIN_VERSION='1';await check('/api/reports/monthly-attendance','admin',401);tokens.admin.adminSessionVersion=1;await check('/api/reports/monthly-attendance','admin',200);
 await check('/api/supply/history','',401);await check('/api/supply/history','a',403);await check('/api/supply/products','assistant',403,{});
 await check('/api/supply/history/other','assistant',403,undefined,'DELETE');await check('/api/supply/history/legacy','assistant',403,undefined,'DELETE');
 await check('/api/supply/save','assistant',403,{id:'other',systemKw:3});
 const quote=await (await check('/api/supply/save','assistant',200,{systemKw:3,createdByUid:'admin:primary'})).json();assert.equal(quote.item.createdByUid,'asisten:x');
 const history=await (await check('/api/supply/history','assistant',200)).json();assert.deepEqual(history.items.map(item=>item.id),['own']);
 const cache=new Map([['currentSession','forged'],['users','secret'],['expenses','payroll'],['theme','dark']]);const storage={get length(){return cache.size;},key:i=>[...cache.keys()][i],removeItem:key=>cache.delete(key)};clearPrivateCaches(storage,storage);assert.deepEqual([...cache.keys()],['theme']);count++;
 console.log(`PASS ${count} Stage 4 API/session/media/cache assertions; mocked tokens/data, localhost and temporary files only.`);
}finally{
 await new Promise(resolve=>server.close(resolve));
 const target=path.resolve(directory);if(!target.startsWith(path.resolve(tmpdir())+path.sep)||!path.basename(target).startsWith('solar-security-'))throw new Error('Unsafe cleanup');await rm(target,{recursive:true,force:true});
}
