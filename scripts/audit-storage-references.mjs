/** Read-only local SQL reference inventory. No object fetch, token output or production connection. */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
const db=new Database('data/solar-erp.db',{readonly:true,fileMustExist:true}),references=[];
function inspect(value,collection){
 if(typeof value==='string'){
  if(!/^https?:\/\/(firebasestorage\.googleapis\.com|storage\.googleapis\.com)\//.test(value))return;
  try{const url=new URL(value),parts=url.pathname.split('/');const bucket=url.hostname==='firebasestorage.googleapis.com'?parts[3]:parts[1];const object=url.hostname==='firebasestorage.googleapis.com'?decodeURIComponent(parts.slice(5).join('/')):parts.slice(2).join('/');references.push({collection,objectRef:createHash('sha256').update(`${bucket}/${object}`).digest('hex').slice(0,16),tokenPresent:!!url.searchParams.get('token'),liveAccess:'UNKNOWN; not fetched'});}catch{}
 }else if(Array.isArray(value))for(const item of value)inspect(item,collection);
 else if(value&&typeof value==='object')for(const item of Object.values(value))inspect(item,collection);
}
let documents=0;try{for(const row of db.prepare('SELECT collection, data FROM documents').all()){documents++;try{inspect(JSON.parse(row.data),row.collection);}catch{}}}finally{db.close();}
const report={source:'read-only local SQL copy; not production Firestore/object inventory',documentsScanned:documents,references:references.length,tokenReferences:references.filter(r=>r.tokenPresent).length,uniqueObjects:new Set(references.map(r=>r.objectRef)).size,perObject:references,productionObjectAclIam:'UNKNOWN'};
fs.mkdirSync('.security-artifacts',{recursive:true});fs.writeFileSync('.security-artifacts/storage-reference-inventory.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,perObject:undefined}));
