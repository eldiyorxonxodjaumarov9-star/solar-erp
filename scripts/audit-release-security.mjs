/** Read-only, offline inventory. Reports keys/locations/booleans, never secret values. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse } from 'dotenv';
const root=process.cwd(),exclude=new Set(['.git','node_modules','.security-artifacts','.gradle','build','vps-deploy','desktop-dist']);
const files=[];
function walk(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){if(entry.isSymbolicLink())continue;const file=path.join(folder,entry.name);if(entry.isDirectory()){if(!exclude.has(entry.name))walk(file);}else if(fs.statSync(file).size<8*1024*1024&&/\.(?:[cm]?js|jsx|ts|tsx|json|env|md|txt|ya?ml|xml|properties|conf)$|(?:^|[\\/])\.env[^\\/]*$/.test(file))files.push(file);}}
walk(root);
const configFiles=files.filter(file=>/^(?:\.env(?:\.[\w-]+)?|desktop-build\.env)$/.test(path.basename(file))&&!file.endsWith('.env.example'));
const configs=configFiles.map(file=>({source:path.relative(root,file).replaceAll('\\','/'),values:parse(fs.readFileSync(file))}));
const required=[
 ['VITE_FIREBASE_API_KEY','frontend','required'],['VITE_FIREBASE_PROJECT_ID','frontend','required'],['VITE_FIREBASE_AUTH_DOMAIN','frontend','required'],['VITE_FIREBASE_STORAGE_BUCKET','frontend','required'],['VITE_FIREBASE_APP_ID','frontend','required'],
 ['VITE_API_BASE','frontend','required HTTPS'],['VITE_ANDROID_API_BASE','frontend','required Android HTTPS'],
 ['FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON','server','required OR credential file'],['GOOGLE_APPLICATION_CREDENTIALS','server','required OR JSON'],['FIREBASE_STORAGE_BUCKET','server','required'],
 ['ADMIN_LOGIN','server','required'],['ADMIN_PASSWORD_HASH','server','recommended; OR ADMIN_PASSWORD transition'],['ADMIN_PASSWORD','server','transition-only'],['ALLOW_LEGACY_PLAINTEXT_LOGIN','server','false after migration'],
 ['ADMIN_SESSION_VERSION','server','optional rotation epoch'],['TELEGRAM_BOT_TOKEN','server','required Telegram'],['TELEGRAM_GROUP_ID','server','required Telegram'],['CORS_ORIGINS','server','required browser production allowlist'],['CREDENTIAL_BACKUP_KEY_BASE64','server/maintenance','required migration backup'],
 ['DATABASE_URL','server','optional; SQLite fallback'],['MONTHLY_REPORT_FETCH_SECRET','server','optional external report source'],['SUPPLY_ADMIN_TOKEN','obsolete','unused; remove'],['VITE_BOT_TOKEN','frontend forbidden','must remove/rotate'],['VITE_MONTHLY_REPORT_SECRET','frontend forbidden','must remove/rotate'],
 ];
const envReadiness=required.map(([name,scope,requirement])=>({name,scope,requirement,localStatus:configs.some(c=>String(c.values[name]||'').trim())||!!process.env[name]?'present':'missing',sources:configs.filter(c=>String(c.values[name]||'').trim()).map(c=>c.source),productionStatus:'unverified'}));
const secretName=/PASSWORD|PRIVATE_KEY|SERVICE_ACCOUNT|(?:^|_)SECRET|(?:^|_)TOKEN|DATABASE_URL|SMTP|CREDENTIAL/i;
const secrets=new Map();
for(const config of configs)for(const [name,value]of Object.entries(config.values))if(secretName.test(name)&&value&&!/^optional|YOUR_|example|change[-_]?me/i.test(value)){
 if(!secrets.has(name))secrets.set(name,{values:new Set(),locations:new Set()});secrets.get(name).values.add(value);secrets.get(name).locations.add(config.source);
}
const inventory=[...secrets].map(([name,item])=>({name,configLocations:[...item.locations],frontendForbidden:name.startsWith('VITE_'),weakOrPlaceholder:[...item.values].some(v=>v.length<12||/^(admin123|password|secret|test-password)$/i.test(v)),worktreeMatches:[],historyMatches:[],bundleMatches:[]}));
const tokenCandidates=[],storageUrls=[];
function inspect(text,location,history=false){
 for(const [index,[name,item]]of [...secrets].entries())if([...item.values].some(value=>value.length>=8&&text.includes(value))){const list=inventory[index][history?'historyMatches':/(?:^|\/)(?:dist|desktop-dist[^/]*|win-unpacked|assets\/public)\//.test(location)?'bundleMatches':'worktreeMatches'];if(!list.includes(location))list.push(location);}
 if(/\b[0-9]{7,12}:[A-Za-z0-9_-]{30,}\b/.test(text)||/-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\\nr]+[A-Za-z0-9+/=]{80}/.test(text))tokenCandidates.push({location,source:history?'git-history':'worktree',risk:'HIGH',kind:'literal credential candidate; no value captured'});
 if(!history)for(const match of text.matchAll(/https:\/\/(?:firebasestorage\.googleapis\.com\/v0\/b\/([^/\s"']+)\/o\/([^\s"']+)|storage\.googleapis\.com\/([^/\s"']+)\/([^\s"']+))/g)){
  const object=String(match[2]||match[4]).split('?')[0].split('#')[0];
  storageUrls.push({location,bucket:match[1]||match[3],objectRef:object,tokenParameterPresent:/[?&]token=/.test(match[0]),liveAccess:'not queried'});
 }
}
for(const file of files){const location=path.relative(root,file).replaceAll('\\','/');inspect(fs.readFileSync(file,'utf8'),location);}
// Every reachable history blob is scanned inside this process. cat-file data is never printed.
const objects=execFileSync('git',['rev-list','--objects','--all'],{encoding:'utf8',maxBuffer:64*1024*1024}).trim().split('\n').filter(Boolean).map(line=>{const split=line.indexOf(' ');return {id:split<0?line:line.slice(0,split),file:split<0?'(tree/commit)':line.slice(split+1)};});
let historyBlobs=0,skippedLarge=0;
for(let offset=0;offset<objects.length;offset+=100){
 const batch=objects.slice(offset,offset+100),output=execFileSync('git',['cat-file','--batch'],{input:batch.map(o=>o.id).join('\n')+'\n',maxBuffer:128*1024*1024});let cursor=0;
 for(const item of batch){const end=output.indexOf(10,cursor),header=output.subarray(cursor,end).toString('utf8').split(' '),size=Number(header[2]);cursor=end+1;
  if(header[1]==='blob'){historyBlobs++;if(size<=8*1024*1024)inspect(output.subarray(cursor,cursor+size).toString('utf8'),`${item.file} @ ${item.id.slice(0,12)}`,true);else skippedLarge++;}cursor+=size+1;
 }
}
for(const entry of inventory){entry.risk=entry.historyMatches.length||entry.bundleMatches.length||entry.frontendForbidden?'HIGH':'server credential; rotation pending verification';entry.serverOnly=!entry.frontendForbidden&&!entry.bundleMatches.length&&!entry.historyMatches.length;}
const report={productionAccessUsed:false,valuesReported:false,configSources:configs.map(c=>c.source),envReadiness,secrets:inventory,literalCredentialCandidates:tokenCandidates,storageUrls,history:{reachableObjects:objects.length,scannedBlobs:historyBlobs,skippedLargeBlobs:skippedLarge,coverage:'all reachable refs; unreachable/deleted remote history and remote build artifacts unknown'},storageLiveIamAclTokenAudit:'UNKNOWN; production access not used'};
fs.mkdirSync('.security-artifacts',{recursive:true});fs.writeFileSync('.security-artifacts/release-security-inventory.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({envKeys:envReadiness.length,localPresent:envReadiness.filter(e=>e.localStatus==='present').length,productionStatus:'unverified',secretNames:inventory.map(e=>({name:e.name,risk:e.risk,historyLocations:e.historyMatches.length,bundleLocations:e.bundleMatches.length})),literalCredentialCandidates:tokenCandidates.length,historyBlobs,skippedLarge,storageReferences:storageUrls.length,output:'.security-artifacts/release-security-inventory.json',valuesReported:false}));
