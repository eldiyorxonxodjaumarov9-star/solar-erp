import fs from 'node:fs';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, or } from 'firebase/firestore';
const projectId = 'demo-solar-authorization';
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error('Local Firestore emulator is required; real Firebase is forbidden.');
const [hostname, port] = host.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host: hostname, port: Number(port), rules: fs.readFileSync('firestore.rules', 'utf8') } });
let count = 0;
const pass = async (name, operation, allowed) => { await (allowed ? assertSucceeds(operation) : assertFails(operation)); count++; console.log(`PASS ${name}`); };
const context = (role, id) => env.authenticatedContext(`${role}:${id}`, { role, accountId: id, workerId: role === 'usta' ? id : '', ...(role === 'asisten' ? { assistantId: id } : {}), firebase: { sign_in_provider: 'custom' } }).firestore();
const admin = context('admin', 'primary'), worker = context('usta', 'w1'), other = context('usta', 'w2'), assistant = context('asisten', 'a1');
const unauth = env.unauthenticatedContext().firestore();
const anonymous = env.authenticatedContext('admin:primary', { role:'admin', accountId:'primary', firebase:{sign_in_provider:'anonymous'} }).firestore();
try {
 await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  const fixtures = {
   'workers/w1': {fullName:'One', salary:3900000, salaryHistory:[], workerId:'w2'}, 'workers/w2':{fullName:'Two'},
   'workers/legacy-secret':{fullName:'Legacy',password:'TEST-ONLY'}, 'users/w1':{password:'TEST-ONLY'},
   'assistants/a1':{fullName:'Assistant'}, 'assistants/legacy':{password:'TEST-ONLY'},
   'accountCredentials/usta:w1':{passwordHash:'TEST-ONLY'},
   'expenses/p1':{payrollWorkerId:'w1', payrollMonth:'2026-10', payrollPaymentType:'advance',amount:'500000',ustaId:''},
   'expenses/p2':{payrollWorkerId:'w2', payrollMonth:'2026-10', payrollPaymentType:'salary',amount:'1000000'},
   'projects/p1':{ustaId:'w1', assignedWorkerIds:['w1']},'projects/p2':{ustaId:'w2'},
   'user_activity_logs/l1':{ustaId:'w1',loginTime:'test'}, 'user_activity_logs/l2':{ustaId:'w2'},
   'unknown/x':{foo:'bar'}, 'points/w1':{userId:'w1'},
  };
  for (const [path,data] of Object.entries(fixtures)) await setDoc(doc(db,path),data);
 });
 await pass('admin reads safe worker',getDoc(doc(admin,'workers/w1')),true);
 await pass('admin writes safe worker',updateDoc(doc(admin,'workers/w1'),{salary:4000000}),true);
 await pass('worker reads own safe profile',getDoc(doc(worker,'workers/w1')),true);
 await pass('worker cannot read other profile',getDoc(doc(worker,'workers/w2')),false);
 await pass('forged document workerId grants nothing',getDoc(doc(other,'workers/w1')),false);
 for (const field of ['salary','salaryHistory','password','role','pin','credential','adminPassword','workerId']) await pass(`worker cannot update ${field}`,updateDoc(doc(worker,'workers/w1'),{[field]:'forged'}),false);
 for (const db of [admin,worker,assistant]) {
  await pass('legacy users credentials hidden',getDoc(doc(db,'users/w1')),false);
  await pass('private credential store hidden',getDoc(doc(db,'accountCredentials/usta:w1')),false);
  await pass('raw worker credential document hidden',getDoc(doc(db,'workers/legacy-secret')),false);
 }
 await pass('admin cannot write plaintext credential profile',setDoc(doc(admin,'workers/secret'),{password:'test'}),false);
 await pass('worker reads own payroll',getDoc(doc(worker,'expenses/p1')),true);
 await pass('worker cannot read another payroll',getDoc(doc(worker,'expenses/p2')),false);
 await pass('worker payroll scoped query',getDocs(query(collection(worker,'expenses'),where('payrollWorkerId','==','w1'))),true);
 await pass('worker unscoped payroll query denied',getDocs(collection(worker,'expenses')),false);
 await pass('worker cannot create forged payroll',setDoc(doc(worker,'expenses/forged'),{payrollWorkerId:'w1',amount:'500',workerId:'w1'}),false);
 await pass('worker cannot modify payment',updateDoc(doc(worker,'expenses/p1'),{amount:'100'}),false);
 await pass('worker cannot delete payment',deleteDoc(doc(worker,'expenses/p1')),false);
 await pass('admin payroll write',updateDoc(doc(admin,'expenses/p1'),{amount:'600000'}),true);
 await pass('assistant own safe profile',getDoc(doc(assistant,'assistants/a1')),true);
 await pass('assistant cannot write payroll',updateDoc(doc(assistant,'expenses/p1'),{amount:'1'}),false);
 await pass('assistant cannot write workers',updateDoc(doc(assistant,'workers/w1'),{role:'admin'}),false);
 await pass('assistant project operation',setDoc(doc(assistant,'projects/assistant-project'),{name:'Project'}),true);
 await pass('assistant commercial offer operation',setDoc(doc(assistant,'commercialOffers/c1'),{name:'Offer'}),true);
 await pass('assistant cannot change salary log',setDoc(doc(assistant,'project_worker_days/x'),{workerId:'w1'}),false);
 await pass('worker assigned project',getDoc(doc(worker,'projects/p1')),true);
 await pass('worker cannot read unassigned project',getDoc(doc(worker,'projects/p2')),false);
 await pass('worker assignment scoped query',getDocs(query(collection(worker,'projects'),where('ustaId','==','w1'))),true);
 await pass('worker cannot self-assign',updateDoc(doc(worker,'projects/p1'),{assignedWorkerIds:['w2']}),false);
 await pass('worker own signed instruction',setDoc(doc(worker,'usta_yorijnoma/w1'),{workerId:'w1',signatureDataUrl:'TEST'}),true);
 await pass('other worker signed instruction hidden',getDoc(doc(other,'usta_yorijnoma/w1')),false);
 await pass('worker cannot forge signed instruction',setDoc(doc(worker,'usta_yorijnoma/w2'),{workerId:'w2'}),false);
 await pass('worker own arrival allowed',setDoc(doc(worker,'user_activity_logs/own'),{ustaId:'w1',loginTime:'test'}),true);
 await pass('worker forged arrival ID denied',setDoc(doc(worker,'user_activity_logs/forged'),{ustaId:'w2',workerId:'w1'}),false);
 await pass('assistant own arrival allowed',setDoc(doc(assistant,'user_activity_logs/asst'),{ustaId:'asst_a1',loginTime:'test'}),true);
 await pass('assistant cannot forge worker arrival',setDoc(doc(assistant,'user_activity_logs/asst-forged'),{ustaId:'w1'}),false);
 const businessExpense={ustaId:'w1',projectId:'p1',type:'Transport',amount:'100',date:'2026-10-01'};
 await pass('worker operational expense permitted',setDoc(doc(worker,'expenses/operational'),businessExpense),true);
 await pass('worker cannot smuggle payroll into expense',setDoc(doc(worker,'expenses/smuggle'),{...businessExpense,payrollWorkerId:'w1'}),false);
 await pass('worker cannot pay labour',setDoc(doc(worker,'expenses/labour'),{...businessExpense,type:'Mexnat haqi'}),false);
 await pass('worker combined expense scoped query',getDocs(query(collection(worker,'expenses'),or(where('payrollWorkerId','==','w1'),where('ustaId','==','w1')))),true);
 await pass('worker combined project scoped query',getDocs(query(collection(worker,'projects'),or(where('ustaId','==','w1'),where('assignedWorkerId','==','w1'),where('assignedWorkerIds','array-contains','w1')))),true);
 await pass('worker operational expense query',getDocs(query(collection(worker,'expenses'),where('ustaId','==','w1'))),true);
 for (const db of [unauth,anonymous]) for (const name of ['workers','users','expenses','projects','commercialOffers','accountCredentials']) {
  await pass(`${name} unauth/anonymous read denied`,getDoc(doc(db,name,'w1')),false);
  await pass(`${name} unauth/anonymous write denied`,setDoc(doc(db,name,'attempt'),{role:'admin',workerId:'w1'}),false);
 }
 await pass('catch-all denies admin unknown collection',getDoc(doc(admin,'unknown/x')),false);
 // Browser storage does not participate in emulator request auth.
 globalThis.localStorage={getItem:()=>JSON.stringify({role:'admin',workerId:'w2'})};
 await pass('forged localStorage does not change payroll access',getDoc(doc(worker,'expenses/p2')),false);
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'accountSecurity/usta:w1'),{sessionVersion:'new-version',disabled:false}));
 await pass('old worker session denied immediately',getDoc(doc(worker,'expenses/p1')),false);
 const fresh=env.authenticatedContext('usta:w1',{role:'usta',accountId:'w1',workerId:'w1',sessionVersion:'new-version',firebase:{sign_in_provider:'custom'}}).firestore();
 await pass('reauthenticated current worker version allowed',getDoc(doc(fresh,'expenses/p1')),true);
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'accountSecurity/usta:w1'),{sessionVersion:'new-version',disabled:true}));
 await pass('disabled worker current token denied',getDoc(doc(fresh,'expenses/p1')),false);
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'accountSecurity/admin:primary'),{sessionVersion:'admin-new',disabled:false}));
 await pass('old admin session denied after rotation',getDoc(doc(admin,'workers/w2')),false);
 assert.ok(count >= 60);
 console.log(`PASS ${count} Firestore authorization assertions (demo emulator only).`);
} finally { await env.cleanup(); }
