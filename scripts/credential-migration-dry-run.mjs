/** Read-only, offline credential inventory. No Firebase imports, network, writes or APPLY mode. */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export function credentialInventory(snapshot) {
 const result={source:'offline-export',collections:{},duplicateLogins:[],invalidAccounts:[],canonicalConflicts:[],hash:{algorithm:'scrypt',N:16384,r:8,p:1,keyBytes:64,saltBytes:16,maxmemBytes:67108864},applySupported:false};
 const logins=new Map(),ids=new Map();
 for(const name of ['workers','users','assistants']){
  const rows=Array.isArray(snapshot[name])?snapshot[name]:[];
  let plaintext=0,sensitive=0;
  for(const row of rows){
   const data=row.data||row, id=String(row.id||''), login=String(data.login||'').trim().toLowerCase(), role=name==='assistants'?'asisten':'usta';
   if(typeof data.password==='string'&&data.password.length)plaintext++;
   if(['password','pin','credential','credentials','adminPassword'].some(key=>Object.hasOwn(data,key)))sensitive++;
   if(!id||id.includes('/')||`${role}:${id}`.length>128||!login)result.invalidAccounts.push({collection:name,id,reason:'Missing/invalid ID or login'});
   const key=`${role}:${login}`,canonical=`${role}:${id}`;
   if(!logins.has(key))logins.set(key,new Set());logins.get(key).add(canonical);
   if(ids.has(canonical)&&ids.get(canonical).login!==login)result.canonicalConflicts.push({collection:name,id,reason:'Alias login conflict'});
   ids.set(canonical,{login});
  }
  result.collections[name]={documents:rows.length,plaintextPasswordDocuments:plaintext,sensitiveDocuments:sensitive};
 }
 for(const [key,accounts]of logins)if(accounts.size>1)result.duplicateLogins.push({role:key.split(':')[0],accountIds:[...accounts]});
 return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(args.length!==2||args[0]!=='--input')throw new Error('Read-only usage: node scripts/credential-migration-dry-run.mjs --input OFFLINE_EXPORT.json. APPLY/network access are unsupported.');
 const snapshot=JSON.parse(fs.readFileSync(args[1],'utf8'));
 console.log(JSON.stringify(credentialInventory(snapshot),null,2));
}
