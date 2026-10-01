/** Existing local accounts copied read-only into demo Firestore; no real Auth users are created. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, generateKeyPairSync } from 'node:crypto';
import Database from 'better-sqlite3';
import { initializeApp, deleteApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createAccountVerifier } from '../server/authAccounts.js';
import { hashPassword, verifyPasswordHash } from '../server/passwordHash.js';
import { requireMigrationEmulator, readSnapshot, migrationPlan, createBackup, loadBackup, applyMigration, rollbackMigration, fingerprint } from './credential-migration.mjs';
const projectId='demo-solar-credential-migration';requireMigrationEmulator(process.env,projectId);
const fakeKey=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
const app=initializeApp({projectId,credential:cert({projectId,clientEmail:`emulator@${projectId}.iam.gserviceaccount.com`,privateKey:fakeKey})},'credential-migration-test'),db=getFirestore(app);
const local=new Database('data/solar-erp.db',{readonly:true,fileMustExist:true});
const fixture={workers:[],users:[],assistants:[],accountCredentials:[],accountSecurity:[]};
try{
 for(const collection of ['workers','users','assistants'])fixture[collection]=local.prepare('SELECT id, data FROM documents WHERE collection = ?').all(collection).map(row=>({id:row.id,data:JSON.parse(row.data)}));
}finally{local.close();}
assert.equal(migrationPlan(fixture).report.plaintextDocuments,14,'Expected existing local inventory; never substitute invented production counts');
fs.mkdirSync('.security-artifacts',{recursive:true});
const backupFile=path.resolve(`.security-artifacts/credential-test-${Date.now()}.backup.enc`),key=randomBytes(32).toString('base64'),options={backupFile,key,projectId};
let assertions=0;
async function expectDeny(action){await assert.rejects(action);assertions++;}
try{
 for(const [collection,rows]of Object.entries(fixture))for(const row of rows)await db.collection(collection).doc(row.id).set(row.data);
 const before=await readSnapshot(db),plan=migrationPlan(before);assert.equal(plan.report.accounts,14);assertions++;
 const output=JSON.stringify(plan.report);for(const row of [...fixture.workers,...fixture.assistants])assert.equal(output.includes(row.data.password),false);
 await expectDeny(()=>applyMigration(db,options));
 assert.equal(fingerprint(await readSnapshot(db)),fingerprint(before));assertions++;
 createBackup(backupFile,before,{key,projectId});assert.equal(loadBackup(backupFile,{key,projectId}).digest,fingerprint(before));assertions++;
 await expectDeny(()=>applyMigration(db,{...options,key:randomBytes(32).toString('base64')}));
 const result=await applyMigration(db,options);assert.equal(result.changedAccounts,14);assert.equal(result.applied,true);assertions++;
 const after=await readSnapshot(db);assert.equal(migrationPlan(after).report.plaintextDocuments,0);assert.equal(after.accountCredentials.length,14);assertions++;
 const verify=createAccountVerifier({getDb:async()=>db,env:{ALLOW_LEGACY_PLAINTEXT_LOGIN:'false'}});
 let loginPass=0,wrongDeny=0;
 for(const [collection,rows]of Object.entries(fixture).filter(([name])=>['workers','users','assistants'].includes(name)))for(const row of rows){
  const role=collection==='assistants'?'asisten':'usta';
  const account=await verify({role,login:row.data.login,password:row.data.password});assert.equal(account?.id,row.id);loginPass++;
  assert.equal(await verify({role,login:row.data.login,password:'definitely-wrong-test-password'}),null);wrongDeny++;
 }
 assertions+=loginPass+wrongDeny;
 const second=await applyMigration(db,options);assert.equal(second.noOp,true);assert.equal(fingerprint(await readSnapshot(db)),fingerprint(after));assertions++;
 const rollback=await rollbackMigration(db,options);assert.equal(rollback.publicPlaintextRestored,0);assert.equal(rollback.restoredPrivateCredentials,14);assertions++;
 let rollbackLogin=0;for(const [collection,rows]of Object.entries(fixture).filter(([name])=>['workers','users','assistants'].includes(name)))for(const row of rows){assert.ok(await verify({role:collection==='assistants'?'asisten':'usta',login:row.data.login,password:row.data.password}));rollbackLogin++;}
 const worker=fixture.workers[0];await db.collection('workers').doc(worker.id).update({disabled:true});
 assert.equal(await verify({role:'usta',login:worker.data.login,password:worker.data.password}),null);assertions++;
 await expectDeny(()=>rollbackMigration(db,options));
 const duplicateLogin=structuredClone(fixture);duplicateLogin.workers.push({id:'duplicate-test',data:{...worker.data}});assert.throws(()=>migrationPlan(duplicateLogin));assertions++;
 const duplicateId=structuredClone(fixture);duplicateId.workers.push(structuredClone(worker));assert.throws(()=>migrationPlan(duplicateId));assertions++;
 const conflict=structuredClone(fixture);conflict.users.push({id:worker.id,data:{...worker.data,password:'conflicting-test'}});assert.throws(()=>migrationPlan(conflict));assertions++;
 const saltA=hashPassword('fixture-password'),saltB=hashPassword('fixture-password');assert.notEqual(saltA.salt,saltB.salt);assert.ok(verifyPasswordHash('fixture-password',saltA));assert.equal(verifyPasswordHash('wrong',saltA),false);assertions++;
 const adminVerify=createAccountVerifier({getDb:async()=>db,env:{ADMIN_LOGIN:'test-admin',ADMIN_PASSWORD_HASH:JSON.stringify(saltA),ADMIN_PASSWORD:'old-password'}});
 assert.ok(await adminVerify({role:'admin',login:'test-admin',password:'fixture-password'}));assert.equal(await adminVerify({role:'admin',login:'test-admin',password:'old-password'}),null);assertions++;
 assert.throws(()=>requireMigrationEmulator({FIRESTORE_EMULATOR_HOST:'production.example:8080'},'real-project'));assertions++;
 const summary={source:'read-only-local-SQL-copy/emulator',accounts:14,plaintextBefore:14,plaintextAfter:0,loginPass,wrongPasswordDeny:wrongDeny,secondRun:'no-op',rollbackLoginPass:rollbackLogin,rollbackPublicPlaintextRestored:0,disabledDeny:true,duplicateIdLoginAliasDeny:true,missingWrongBackupDeny:true,assertions};
 fs.writeFileSync('.security-artifacts/credential-migration-results.json',JSON.stringify(summary,null,2));console.log(`PASS credential migration: ${JSON.stringify(summary)}`);
}finally{await db.terminate();await deleteApp(app);/* encrypted artifact retained for review; test key is intentionally not persisted */}
