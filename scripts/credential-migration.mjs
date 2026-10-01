/** Backup-gated emulator migration. No production connection is supported by this CLI. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, createCipheriv, createDecipheriv, generateKeyPairSync } from 'node:crypto';
import { hashPassword, verifyPasswordHash } from '../server/passwordHash.js';
import { newSessionVersion } from '../server/accountSecurity.js';
const COLLECTIONS=['workers','users','assistants','accountCredentials','accountSecurity'];
const SENSITIVE=new Set(['password','pin','credential','credentials','adminPassword','passwordHash','passwordSalt','privateKey','secret','token']);
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k])])):value;
export const fingerprint=value=>createHash('sha256').update(JSON.stringify(ordered(JSON.parse(JSON.stringify(value))))).digest('hex');
export function removePublicSecrets(value) {
 if(Array.isArray(value))return value.map(removePublicSecrets);
 if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype)return value;
 return Object.fromEntries(Object.entries(value).filter(([key])=>!SENSITIVE.has(key)).map(([key,item])=>[key,removePublicSecrets(item)]));
}
export async function readSnapshot(db) {
 const result={};
 for(const name of COLLECTIONS)result[name]=(await db.collection(name).get()).docs.map(doc=>({id:doc.id,data:doc.data()})).sort((a,b)=>a.id.localeCompare(b.id));
 return result;
}
export function migrationPlan(snapshot) {
 const identities=new Map(),logins=new Map(),seen=new Set(),accounts=[];
 for(const collection of COLLECTIONS.slice(0,3))for(const row of snapshot[collection]||[]) {
  const {id,data}=row,role=collection==='assistants'?'asisten':'usta',uid=`${role}:${id}`,login=String(data?.login||'').trim().toLowerCase();
  if(typeof id!=='string'||!id||id.includes('/')||uid.length>128||!login||login.length>128||!data||seen.has(`${collection}/${id}`))throw new Error('Invalid or duplicate account identity');
  seen.add(`${collection}/${id}`);
  if(logins.has(`${role}:${login}`)&&logins.get(`${role}:${login}`)!==uid)throw new Error('Duplicate account login');
  logins.set(`${role}:${login}`,uid);
  const previous=identities.get(uid);
  if(previous&&(previous.login!==login||fingerprint(previous.data)!==fingerprint(data)))throw new Error('Conflicting canonical account aliases');
  identities.set(uid,{login,data});
  let account=accounts.find(a=>a.uid===uid);
  if(!account){
   const credential=(snapshot.accountCredentials||[]).find(r=>r.id===uid)?.data;
   if(credential&&(credential.algorithm!=='scrypt'||!/^[a-f0-9]{128}$/.test(credential.hash||'')||!/^[a-f0-9]{32}$/.test(credential.salt||'')))throw new Error('Invalid private credential');
   if(!credential&&(typeof data.password!=='string'||!data.password||data.password.length>1024))throw new Error('Missing usable credential; manual mapping required');
   account={uid,credential,profiles:[]};accounts.push(account);
  }
  const clean=removePublicSecrets(data);
  account.profiles.push({collection,id,data,clean,changed:fingerprint(clean)!==fingerprint(data)});
 }
 if(accounts.length>100)throw new Error('Migration size exceeds reviewed atomic transaction limit');
 return {accounts,report:{accounts:accounts.length,changedAccounts:accounts.filter(a=>!a.credential||a.profiles.some(p=>p.changed)).length,
  plaintextDocuments:accounts.reduce((n,a)=>n+a.profiles.filter(p=>typeof p.data.password==='string'&&p.data.password.length).length,0),
  perAccount:accounts.map(a=>({accountRef:fingerprint(a.uid).slice(0,16),oldState:a.credential?'private-hash': 'plaintext',newState:'private-scrypt/public-clean',action:!a.credential||a.profiles.some(p=>p.changed)?'migrate':'no-op'}))}};
}
function backupKey(key) {const bytes=Buffer.from(key||'','base64');if(bytes.length!==32)throw new Error('32-byte CREDENTIAL_BACKUP_KEY_BASE64 required');return bytes;}
export function createBackup(file,snapshot,{key,projectId}) {
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',backupKey(key),iv);
 const payload=Buffer.from(JSON.stringify({version:1,projectId,snapshot,digest:fingerprint(snapshot)}));
 const encrypted=Buffer.concat([cipher.update(payload),cipher.final()]);
 fs.writeFileSync(file,JSON.stringify({version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:encrypted.toString('base64')}),{flag:'wx',mode:0o600});
 return loadBackup(file,{key,projectId});
}
export function loadBackup(file,{key,projectId}) {
 try {
  if(!fs.statSync(file).isFile())throw new Error();
  const envelope=JSON.parse(fs.readFileSync(file,'utf8'));
  if(envelope.version!==1)throw new Error();
  const decipher=createDecipheriv('aes-256-gcm',backupKey(key),Buffer.from(envelope.iv,'base64'));decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
  const content=JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]).toString('utf8'));
  if(content.version!==1||content.projectId!==projectId||fingerprint(content.snapshot)!==content.digest)throw new Error();
  return content;
 }catch{throw new Error('Verified encrypted backup required; invalid/missing backup or key');}
}
export async function applyMigration(db,{backupFile,key,projectId}) {
 const backup=loadBackup(backupFile,{key,projectId}),current=await readSnapshot(db),plan=migrationPlan(current);
 // A clean second run is a no-op, but must still have the original valid backup.
 if(plan.report.changedAccounts===0)return {...plan.report,applied:false,noOp:true};
 if(fingerprint(current)!==backup.digest)throw new Error('Snapshot changed since backup; rerun dry-run and create a new backup');
 const updates=plan.accounts.filter(a=>!a.credential||a.profiles.some(p=>p.changed));
 await db.runTransaction(async tx=>{
  const transactional={};
  for(const name of COLLECTIONS)transactional[name]=(await tx.get(db.collection(name))).docs.map(doc=>({id:doc.id,data:doc.data()})).sort((a,b)=>a.id.localeCompare(b.id));
  if(fingerprint(transactional)!==fingerprint(current))throw new Error('Concurrent account update; migration aborted');
  for(const account of updates)for(const name of ['accountCredentials','accountSecurity'])if(!current[name].some(row=>row.id===account.uid)){
   const doc=await tx.get(db.collection(name).doc(account.uid));if(doc.exists)throw new Error('Concurrent sidecar creation');
  }
  for(const account of updates){
   if(!account.credential)tx.set(db.collection('accountCredentials').doc(account.uid),{...hashPassword(account.profiles[0].data.password),migrationVersion:1});
   for(const profile of account.profiles)if(profile.changed)tx.set(db.collection(profile.collection).doc(profile.id),profile.clean);
   const prior=(current.accountSecurity||[]).find(r=>r.id===account.uid)?.data||{};
   tx.set(db.collection('accountSecurity').doc(account.uid),{...prior,sessionVersion:newSessionVersion(),migrationVersion:1});
  }
 });
 return {...plan.report,applied:true,noOp:false};
}
/** Safe rollback restores usable credentials only into private storage; public plaintext is never restored. */
export async function rollbackMigration(db,{backupFile,key,projectId}) {
 const backup=loadBackup(backupFile,{key,projectId}),original=migrationPlan(backup.snapshot),current=await readSnapshot(db),now=migrationPlan(current);
 if(now.report.changedAccounts!==0)throw new Error('Rollback expects a migrated snapshot');
 // Never overwrite newer profiles, reset changed passwords, or undo a disable operation.
 for(const account of original.accounts){
  const live=now.accounts.find(a=>a.uid===account.uid);
  if(!live||live.profiles.length!==account.profiles.length||account.profiles.some(p=>!live.profiles.some(l=>l.collection===p.collection&&fingerprint(l.clean)===fingerprint(p.clean))))throw new Error('Post-migration account edit; manual rollback required');
  if(account.credential?fingerprint(account.credential)!==fingerprint(live.credential):!verifyPasswordHash(account.profiles[0].data.password,live.credential))throw new Error('Credential changed; rollback refused');
 }
 await db.runTransaction(async tx=>{
  const transactional={};
  for(const name of COLLECTIONS)transactional[name]=(await tx.get(db.collection(name))).docs.map(doc=>({id:doc.id,data:doc.data()})).sort((a,b)=>a.id.localeCompare(b.id));
  if(fingerprint(transactional)!==fingerprint(current))throw new Error('Concurrent rollback update');
  for(const account of original.accounts){
   tx.set(db.collection('accountCredentials').doc(account.uid),{...(account.credential||hashPassword(account.profiles[0].data.password)),rollbackVersion:1});
   const prior=(current.accountSecurity||[]).find(r=>r.id===account.uid)?.data||{};
   tx.set(db.collection('accountSecurity').doc(account.uid),{...prior,sessionVersion:newSessionVersion(),rollbackVersion:1});
  }
 });
 return {accounts:original.accounts.length,restoredPrivateCredentials:original.accounts.length,publicPlaintextRestored:0};
}
export function requireMigrationEmulator(env,projectId) {
 if(!/^demo-[a-z0-9-]+$/.test(projectId)||!/^(127\.0\.0\.1|localhost):\d+$/.test(env.FIRESTORE_EMULATOR_HOST||''))throw new Error('Demo project and loopback Firestore emulator required; production access unsupported');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 try{
  const args=process.argv.slice(2),allowed=['--project','--backup','--create-backup','--apply','--rollback'];
  const values={};for(let i=0;i<args.length;i++){if(!allowed.includes(args[i])||Object.hasOwn(values,args[i]))throw new Error('Invalid flags');const flag=args[i];values[flag]=['--project','--backup'].includes(flag)?args[++i]:true;if(!values[flag])throw new Error('Missing flag value');}
  if(values['--apply']&&values['--rollback'])throw new Error('Choose one explicit action');
  if(values['--create-backup']&&(values['--apply']||values['--rollback']))throw new Error('Backup creation and apply/rollback are separate operations');
  const projectId=values['--project'];requireMigrationEmulator(process.env,projectId);
  const {initializeApp,cert}=await import('firebase-admin/app'),{getFirestore}=await import('firebase-admin/firestore');
  const fakeKey=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
  const db=getFirestore(initializeApp({projectId,credential:cert({projectId,clientEmail:`emulator@${projectId}.iam.gserviceaccount.com`,privateKey:fakeKey})})),snapshot=await readSnapshot(db),options={backupFile:values['--backup'],key:process.env.CREDENTIAL_BACKUP_KEY_BASE64,projectId};
  if(values['--create-backup']){createBackup(options.backupFile,snapshot,options);console.log(JSON.stringify({backupVerified:true,...migrationPlan(snapshot).report}));}
  else if(values['--apply'])console.log(JSON.stringify(await applyMigration(db,options)));
  else if(values['--rollback'])console.log(JSON.stringify(await rollbackMigration(db,options)));
  else console.log(JSON.stringify({dryRun:true,...migrationPlan(snapshot).report}));
 }catch{console.error('Credential migration failed safely; verify flags, identities, emulator and encrypted backup. No sensitive diagnostics are logged.');process.exitCode=1;}
}
