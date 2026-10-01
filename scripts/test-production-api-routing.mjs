import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('src/api/apiBase.js','utf8');
async function load({dev=false,native=false,platform='web',host='127.0.0.1',base='https://77.237.237.94'}={}) {
 const context=vm.createContext({console:{log(){},error(){}},URL,navigator:{userAgent:''},window:{location:{hostname:host}}});
 const env={DEV:dev,VITE_API_BASE:base,VITE_ANDROID_API_BASE:base,VITE_API_BASE_HTTP:'',VITE_NATIVE_API_BASE:''};
 const module=new vm.SourceTextModule(source.replaceAll('import.meta.env',JSON.stringify(env)),{context});
 await module.link(()=>new vm.SyntheticModule(['Capacitor'],function(){this.setExport('Capacitor',{isNativePlatform:()=>native,getPlatform:()=>platform});},{context}));
 await module.evaluate();return module.namespace;
}
for(const args of [{},{host:'localhost'},{host:'77.237.237.94'},{native:true,platform:'android'},{native:true,platform:'ios'}]) {
 const api=await load(args);
 assert.equal(api.getApiBaseUrl(),'https://77.237.237.94');
 assert.deepEqual(Array.from(api.getApiBaseCandidates()),['https://77.237.237.94']);
 for(const path of ['/api/auth/login','/api/auth/session','/api/staff/workers','/api/private-storage','/api/upload/private-image','/api/supply/catalog'])assert.equal(api.androidPublicApiPath(path),path);
}
const dev=await load({dev:true,base:''});assert.deepEqual(Array.from(dev.getApiBaseCandidates()),['']);
const missing=await load({base:''});assert.deepEqual(Array.from(missing.getApiBaseCandidates()),[]);
console.log('PASS production API routing: desktop/preview/native use dedicated HTTPS; auth/media/staff paths preserved; no loopback/legacy compat fallback; dev proxy retained.');
