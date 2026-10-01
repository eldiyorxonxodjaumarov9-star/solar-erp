import assert from 'node:assert/strict';
import {checkHttpsApi} from './check-https-api.mjs';
let checks=0;
for(const value of ['http://public.invalid','https://localhost','https://api.example.invalid','https://user:pass@public.invalid','https://public.invalid/path','https://public.invalid?token=hidden']){await assert.rejects(checkHttpsApi(value));checks++;}
const original=globalThis.fetch;
try {
 globalThis.fetch=async url=>new Response('{}',{status:new URL(url).pathname==='/status'?200:401,headers:{'Content-Type':'application/json'}});
 const pass=await checkHttpsApi('https://fixture.invalid');assert.equal(pass.publicPreflightPass,true);assert.equal(pass.realAdminLoginVerified,false);checks+=2;
 globalThis.fetch=async()=>new Response('{}',{status:404,headers:{'Content-Type':'application/json'}});
 assert.equal((await checkHttpsApi('https://fixture.invalid')).publicPreflightPass,false);checks++;
 globalThis.fetch=async()=>{throw new Error('TLS verification failed');};
 assert.equal((await checkHttpsApi('https://fixture.invalid')).publicPreflightPass,false);checks++;
}finally{globalThis.fetch=original;}
console.log(`PASS ${checks} HTTPS readiness assertions. Isolated unit responses only; no emulators, credentials or production writes.`);
