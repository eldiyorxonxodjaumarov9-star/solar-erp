/** Local source/config inventory only; no remote access or secret value output. */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parse } from 'dotenv';
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8'}).trim().split('\n');
const active=files.filter(file=>/^(src\/|server\/|backend\/|electron\/|server\.js$|bot\.js$|telegramService\.js$|erpService\.js$)/.test(file)&&/\.[cm]?[jt]sx?$/.test(file)&&fs.existsSync(file));
const telegram=[],publicHttp=[],literalSecrets=[];
for(const file of active){
 const source=fs.readFileSync(file,'utf8');
 const keys=[...new Set(source.match(/\b(?:TELEGRAM_[A-Z_]+|MASTER_[A-Z_]*(?:TOKEN|SECRET)|VITE_BOT_TOKEN)\b/g)||[])];
 if(keys.length)telegram.push({file,keys});
 if(/\b[0-9]{7,12}:[A-Za-z0-9_-]{30,}\b/.test(source))literalSecrets.push(file);
 const urls=source.match(/http:\/\/[^\s'"`<>]+/g)||[];
 const unsafe=urls.filter(url=>!/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?:[:/]|$)/.test(url)&&!url.startsWith('http://${')&&!/^http:\/\/(?:www\.w3\.org|schemas\.android\.com)/.test(url));
 if(unsafe.length)publicHttp.push({file,count:unsafe.length});
}
const env={...(['.env','.env.production'].filter(f=>fs.existsSync(f)).reduce((result,file)=>({...result,...parse(fs.readFileSync(file))}),{})),...process.env};
const keys=['VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_API_KEY','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_STORAGE_BUCKET','VITE_FIREBASE_APP_ID','FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON','GOOGLE_APPLICATION_CREDENTIALS','FIREBASE_STORAGE_BUCKET','VITE_API_BASE','VITE_ANDROID_API_BASE','CORS_ORIGINS','ADMIN_LOGIN','ADMIN_PASSWORD_HASH','ADMIN_PASSWORD','TELEGRAM_BOT_TOKEN','TELEGRAM_GROUP_ID','ALLOW_LEGACY_PLAINTEXT_LOGIN','ADMIN_SESSION_VERSION','CREDENTIAL_BACKUP_KEY_BASE64','ERP_API_URL','MONTHLY_REPORT_FETCH_SECRET'];
const envMatrix=keys.map(name=>({name,localStatus:env[name]?'PRESENT':'MISSING',productionStatus:'NOT VERIFIED'}));
for(const row of envMatrix)if(['VITE_API_BASE','VITE_ANDROID_API_BASE','ERP_API_URL'].includes(row.name)&&env[row.name]){
 try{const url=new URL(env[row.name]);if(url.protocol!=='https:'||url.username||url.password)row.localStatus='INVALID';}catch{row.localStatus='INVALID';}
}
const report={productionAccessUsed:false,telegramReferences:telegram,activeLiteralSecretFiles:literalSecrets,hardcodedProductionHttpReferences:publicHttp,envMatrix,sessionRevocation:'server/accountSecurity.js: current profile + accountSecurity sessionVersion; Firebase revoked-token verification. Production sidecars NOT VERIFIED.',rotation:'BLOCKED: no confirmed BotFather rotation authority',storage:'BLOCKED: no confirmed production project/IAM credentials',migration:'BLOCKED: no verified production encrypted backup/identity/counts/operator APPLY'};
fs.mkdirSync('.security-artifacts',{recursive:true});fs.writeFileSync('.security-artifacts/stage6-runtime-inventory.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({activeFiles:active.length,telegramFiles:telegram.length,activeLiteralSecrets:literalSecrets.length,hardcodedProductionHttp:publicHttp.reduce((n,r)=>n+r.count,0),productionEnv:'NOT VERIFIED',output:'.security-artifacts/stage6-runtime-inventory.json'}));
