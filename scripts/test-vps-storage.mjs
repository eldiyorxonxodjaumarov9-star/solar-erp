import assert from 'node:assert/strict';
import {mkdtemp,symlink,writeFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import express from 'express';
import {createVpsStorage} from '../server/vpsStorage.js';
import {createPrivateUploadRouter} from '../server/routes/privateMediaApi.js';
import {createPrivateStorageRouter} from '../server/routes/privateStorageApi.js';
const directory=await mkdtemp(path.join(os.tmpdir(),'solar-vps-test-'));
const bucket=createVpsStorage(directory),records=new Map();
const db={collection:name=>({doc:id=>({get:async()=>({exists:name==='projects',data:()=>({ustaId:id==='p1'?'w1':'w2'})}),create:async data=>{assert.equal(name,'mediaAssets');records.set(id,data);}})})};
const app=express();app.use((req,res,next)=>{const role=req.headers['x-test-role'];if(!role)return res.status(401).end();req.authSession=role==='admin'?{role}:{role:'usta',workerId:role};req.authClaims={uid:role};next();});
app.use('/api/upload',createPrivateUploadRouter({directory,getDb:async()=>db,getBucket:async()=>bucket}));
app.use('/api/private-storage',createPrivateStorageRouter({getDb:async()=>db,getBucket:async()=>bucket,authorize:()=> (_req,_res,next)=>next()}));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
const png=Buffer.from('89504e470d0a1a0a0000000049454e44ae426082','hex');
async function upload(role,project='p1',name='image.png',bytes=png,mime='image/png'){const form=new FormData();form.append('image',new Blob([bytes],{type:mime}),name);form.append('projectId',project);return fetch(base+'/api/upload/private-image',{method:'POST',headers:role?{'x-test-role':role}:{},body:form});}
let checks=0;function check(value,expected){assert.equal(value,expected);checks++;}
try{
 const response=await upload('w1');check(response.status,200);const saved=await response.json();check(records.size,1);check(records.values().next().value.ownerId,'w1');
 assert.match(saved.storagePath,/images\/[a-f0-9-]{36}\.png$/);checks++;
 const url=base+'/api/private-storage?path='+encodeURIComponent(saved.storagePath);
 const own=await fetch(url,{headers:{'x-test-role':'w1'}});check(own.status,200);assert.deepEqual(Buffer.from(await own.arrayBuffer()),png);checks++;
 check((await fetch(url,{headers:{'x-test-role':'w2'}})).status,403);check((await fetch(url)).status,401);
 check((await upload(null)).status,401);check((await upload('w2')).status,403);
 check((await upload('w1','p1','file.exe')).status,400);check((await upload('w1','p1','file.png',Buffer.from('MZ-executable'))).status,403);
 check((await upload('w1','p1','large.png',Buffer.alloc(10*1024*1024+1))).status,413);
 check((await fetch(base+'/uploads/'+saved.storagePath)).status,401);
 for(const invalid of ['../secret.png','private/w1/projects/p1/images/../../secret.png','private/w1/projects/p1/images/file.exe','/etc/passwd'])await assert.rejects(bucket.file(invalid).download());checks+=4;
 const link=path.join(directory,'private','w1','projects','p1','images','symlink.png');
 try{await symlink(path.join(directory,'secret'),link);await assert.rejects(bucket.file('private/w1/projects/p1/images/symlink.png').download());checks++;}catch(e){if(!['EPERM','EACCES'].includes(e.code))throw e;}
 await assert.rejects(bucket.file('private/w1/projects/p1/images/large.png').save(Buffer.alloc(10*1024*1024+1),{metadata:{contentType:'image/png'}}));checks++;
 console.log(`PASS ${checks} VPS storage assertions: actual routes, upload/download, owner/project isolation, no public URLs, MIME/executable/size/traversal/symlink protections; temporary data only.`);
}finally{await new Promise(r=>server.close(r));}
