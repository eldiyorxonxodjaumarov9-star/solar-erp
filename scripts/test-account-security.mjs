import assert from 'node:assert/strict';
import express from 'express';
import { assertAccountSession } from '../server/accountSecurity.js';
import { requireFirebaseSession } from '../server/authMiddleware.js';
import { createStaffRouter } from '../server/routes/staffApi.js';
import { createAccountVerifier } from '../server/authAccounts.js';
import { collectionReadFilters } from '../src/firebase/queryAccess.js';
import { assertSecureApiTransport } from '../src/api/secureTransport.js';
import { canUseLocalFallback } from '../src/api/localFallback.js';
const documents = new Map([
 ['workers/w1',{login:'one',fullName:'One',password:'legacy-password',salary:'3900000',salaryHistory:[{password:'nested-secret',salary:3900000}],role:'admin',pin:'1234'}],
 ['workers/w2',{login:'two',fullName:'Two',password:'second-password'}],
 ['assistants/a1',{login:'assistant',fullName:'Assistant',password:'assistant-password'}],
]);
let writes=0;
const ref = (name,id) => ({id,path:`${name}/${id}`,get:async()=>({id,exists:documents.has(`${name}/${id}`),data:()=>documents.get(`${name}/${id}`)})});
const db = {
 collection: name => ({
  doc: id => ref(name, id || 'test-new'),
  get: async () => ({ docs: [...documents].filter(([key]) => key.startsWith(name + '/')).map(([key,value]) => ({ id:key.split('/')[1], data:() => value })) })
 }),
 batch: () => {
  const operations=[];
  return {
   set:(reference,value,options)=>operations.push(()=>{documents.set(reference.path,{...(options?.merge?documents.get(reference.path):{}),...value});writes++;}),
   delete:reference=>operations.push(()=>{documents.delete(reference.path);writes++;}),
   commit:async()=>operations.forEach(fn=>fn())
  };
 }
};
const claim=(role,id)=>({uid:`${role}:${id}`,role,accountId:id,workerId:role==='usta'?id:'',...(role==='asisten'?{assistantId:id}:{}),firebase:{sign_in_provider:'custom'}});
const tokens={admin:claim('admin','primary'),worker:claim('usta','w1'),assistant:claim('asisten','a1'),anonymous:{...claim('admin','primary'),firebase:{sign_in_provider:'anonymous'}},forged:{...claim('usta','w1'),workerId:'w2'}};
const verify=async token=>{if(!tokens[token])throw new Error('Invalid');return tokens[token];};
const authorize=roles=>requireFirebaseSession(roles,verify,claims=>assertAccountSession(claims,{getDb:async()=>db,env:{}}));
const app=express();app.use(express.json());app.use('/api/staff',createStaffRouter({getDb:async()=>db,authorize,revokeSessions:async()=>{}}));app.get('/admin-only',authorize(['admin']),(_req,res)=>res.json({ok:true}));
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const request=async(path,token,method='GET',body)=>{const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};};
try {
 for(const token of ['', 'invalid','anonymous','forged'])assert.equal((await request('/api/staff/workers',token)).status,401);
 const own=await request('/api/staff/workers','worker');assert.equal(own.status,200);assert.deepEqual(own.data.items.map(row=>row.id),['w1']);assert.equal(own.data.items[0].salary,'3900000');assert.ok(!JSON.stringify(own.data).includes('secret'));assert.ok(!JSON.stringify(own.data).includes('password'));assert.ok(!Object.hasOwn(own.data.items[0],'role'));assert.ok(!Object.hasOwn(own.data.items[0],'pin'));
 const directory=await request('/api/staff/workers','assistant');assert.equal(directory.data.items.length,2);assert.ok(!JSON.stringify(directory.data).includes('salary'));assert.ok(!JSON.stringify(directory.data).includes('password'));
 assert.equal((await request('/api/staff/workers','admin')).data.items.length,2);
 assert.equal((await request('/api/staff/assistants','worker')).data.items.length,0);
 for(const token of ['worker','assistant']) {
  assert.equal((await request('/api/staff/workers/w1',token,'PUT',{password:'evil',role:'admin',salary:'1'})).status,403);
  assert.equal((await request('/api/staff/workers/w2',token,'DELETE')).status,403);
  assert.equal((await request('/admin-only',token)).status,403);
 }
 assert.equal(writes,0);assert.equal((await request('/admin-only','admin')).status,200);
 // Only in-memory test documents: changing a password atomically creates a private hash.
 const saved=await request('/api/staff/workers/w1','admin','PUT',{password:'new-test-password',role:'admin',credential:'evil',fullName:'Updated'});
 assert.equal(saved.status,200);assert.ok(!JSON.stringify(saved.data).includes('password'));
 const secret=documents.get('accountCredentials/usta:w1');assert.equal(secret.algorithm,'scrypt');assert.equal(secret.hash.length,128);assert.notEqual(secret.hash,'new-test-password');assert.equal(documents.get('workers/w1').password,'legacy-password');assert.ok(!Object.hasOwn(documents.get('workers/w1'),'credential'));
 const login=createAccountVerifier({getDb:async()=>db,env:{}});
 assert.equal((await login({role:'usta',login:'one',password:'new-test-password'})).id,'w1');
 assert.equal(await login({role:'usta',login:'one',password:'legacy-password'}),null);
 assert.equal((await login({role:'usta',login:'two',password:'second-password'})).id,'w2');
 documents.set('accountCredentials/usta:w1',{algorithm:'broken'});assert.equal(await login({role:'usta',login:'one',password:'legacy-password'}),null);
} finally { await new Promise(resolve=>server.close(resolve)); }
assert.deepEqual(collectionReadFilters('expenses',tokens.worker),[['payrollWorkerId','==','w1'],['ustaId','==','w1']]);
assert.deepEqual(collectionReadFilters('projectSteps',tokens.assistant),[]);
assert.throws(()=>collectionReadFilters('accountCredentials',tokens.worker));
for(const error of [{code:'permission-denied'},{code:'unauthenticated'},{status:403},{status:401},{message:'Missing or insufficient permissions'}])assert.equal(canUseLocalFallback(error),false);
for(const base of ['http://77.237.237.94','http://api.example.com','ftp://example.com'])assert.throws(()=>assertSecureApiTransport(base));
for(const base of ['https://api.example.com','http://localhost:5000','http://127.0.0.1:5000','http://[::1]:5000'])assert.doesNotThrow(()=>assertSecureApiTransport(base));
assert.throws(()=>assertSecureApiTransport('',{origin:'http://example.com'}));assert.doesNotThrow(()=>assertSecureApiTransport('',{origin:'https://example.com'}));
console.log('PASS account security: verified middleware, anonymous/forged claims denied, owner/profile sanitization, assistant directory, admin-only edits, private scrypt password precedence, scoped queries, fail-closed fallback and HTTPS. In-memory test data only.');
