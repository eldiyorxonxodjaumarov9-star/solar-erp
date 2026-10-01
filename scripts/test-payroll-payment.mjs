import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const store = new Map();
const drafts = new Map();
const memoryStorage = (map) => ({getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)});
const context = vm.createContext({console, Date, Map, Set, Number, Object, String, Array, JSON, Error, crypto:globalThis.crypto, localStorage:memoryStorage(store), sessionStorage:memoryStorage(drafts), window:{dispatchEvent(){}}, CustomEvent:class {}});
const docs = new Map();
let creates = 0, loseResponse = false, serial = Promise.resolve();
const firebase = {
  doc:(_db,col,id)=>`${col}/${id}`,
  runTransaction:(_db,fn)=>{
    const result = serial.then(async()=>{
      const result = await fn({get:async key=>({exists:()=>docs.has(key),data:()=>docs.get(key)}),set:(key,data)=>{docs.set(key,data);creates++;}});
      if (loseResponse) {loseResponse=false;throw new Error('Simulated lost response after commit');}
      return result;
    });
    serial=result.catch(()=>{}); return result;
  },
};
for (const name of ['addDoc','collection','deleteDoc','getCountFromServer','getDoc','getDocs','onSnapshot','or','query','setDoc','updateDoc','where']) firebase[name]=()=>{throw new Error(`Unexpected SDK call: ${name}`);};
const synthetic = (values) => new vm.SyntheticModule(Object.keys(values), function(){for(const [key,value] of Object.entries(values))this.setExport(key,value);}, {context});
const auth=synthetic({ensureFirebaseAuth:async()=>{},getFirebaseDb:async()=>({})});
const sdk=synthetic(firebase);
let state=[];
const react=synthetic({useCallback:fn=>fn,useEffect:()=>{},useState:initial=>{state=typeof initial==='function'?initial():initial;return [state,updater=>{state=typeof updater==='function'?updater(state):updater;}];}});
const api=synthetic({api:new Proxy({}, {get(){throw new Error('REST must not be used');}})});
const fallback=synthetic({canUseLocalFallback:()=>false});
const storage=new vm.SourceTextModule(fs.readFileSync('src/expenses/expenseStorage.js','utf8'),{context});
const crud=new vm.SourceTextModule(fs.readFileSync('src/firebase/firestoreCrud.js','utf8'),{context});
const hook=new vm.SourceTextModule(fs.readFileSync('src/hooks/useExpenses.js','utf8'),{context});
await storage.link(()=>{throw new Error('Unexpected import');});
await crud.link(name=>name==='firebase/firestore'?sdk:name.includes('http')?api:name.includes('queryAccess')?synthetic({collectionReadFilters:()=>[]}):auth);
await hook.link(name=>name==='react'?react:name.includes('firestoreCrud')?crud:name.includes('expenseStorage')?storage:name.includes('localFallback')?fallback:api);
await hook.evaluate();
const session={role:'admin',login:'test-admin',name:'Test admin'};
const input={id:'payroll-test-operation',amount:'150000',date:'2026-10-01',payrollWorkerId:'test-worker',payrollMonth:'2026-09',payrollPaymentType:'advance'};
const {addPayrollPayment}=hook.namespace.useExpenses();
await Promise.all([addPayrollPayment(input,session),addPayrollPayment(input,session)]);
assert.equal(creates,1); assert.equal(docs.size,1); assert.equal(state.length,1);
const saved=docs.get('expenses/payroll-test-operation');
assert.equal(saved.type,'Mexnat haqi');assert.equal(saved.amount,'150000');assert.equal(saved.ustaId,'');assert.equal(saved.payrollWorkerId,'test-worker');assert.equal(saved.payrollMonth,'2026-09');assert.equal(saved.date,'2026-10-01');assert.equal(saved.payrollPaymentType,'advance');
await addPayrollPayment({...input,amount:'999999'},session);
assert.equal(docs.get('expenses/payroll-test-operation').amount,'150000');assert.equal(creates,1);
loseResponse=true;
const salary={...input,id:'payroll-test-salary',payrollPaymentType:'salary'};
await assert.rejects(addPayrollPayment(salary,session));
await addPayrollPayment(salary,session);
assert.equal(creates,2);assert.equal(docs.size,2);assert.equal(state.length,2);
assert.equal(storage.namespace.loadExpenses().length,2);
assert.equal(storage.namespace.sumExpenseAmounts(storage.namespace.loadExpenses()),300000);
for (const bad of [{amount:'0'},{amount:'-1'},{date:'2026-02-30'},{payrollMonth:'2026-13'},{payrollWorkerId:''},{payrollPaymentType:'other'}]) await assert.rejects(addPayrollPayment({...input,...bad},session));
await assert.rejects(addPayrollPayment(input,{role:'usta',workerId:'test-worker'}));
assert.equal(creates,2);
storage.namespace.persistPayrollDraft({...salary,submitted:true});
assert.equal(storage.namespace.loadPayrollDraft().id,salary.id);
storage.namespace.persistPayrollDraft(null);assert.equal(storage.namespace.loadPayrollDraft(),null);
console.log('PASS: actual useExpenses + Firestore transaction code with in-memory SDK; saving, concurrent retries, lost response, validation, cache, author/recipient separation. No real data or network.');
