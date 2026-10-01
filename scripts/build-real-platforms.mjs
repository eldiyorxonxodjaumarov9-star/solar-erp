/** Build only. Real public config, no emulators or server credentials in bundles. */
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {parse} from 'dotenv';
import {FIREBASE_PUBLIC_CONFIG as cfg} from '../shared/firebasePublicConfig.js';
import {checkHttpsApi} from './check-https-api.mjs';
const values={...parse(fs.readFileSync('.env')),...parse(fs.readFileSync('.env.production'))};
const api=process.env.SOLARERP_HTTPS_API_ORIGIN||values.VITE_API_BASE;
if(!api||cfg.projectId.startsWith('demo-'))throw new Error('Real configuration missing');
const readiness=await checkHttpsApi(api);
if(!readiness.publicPreflightPass)throw new Error('HTTPS/auth API not ready; refusing to produce a misleading release');
// An unauthorized route preflight cannot prove real account/data readiness.
const receiptPath=process.env.SOLARERP_AUTHORIZED_SMOKE_RECEIPT;
if(!receiptPath)throw new Error('Authorized production smoke receipt required before final platform builds');
const receipt=JSON.parse(fs.readFileSync(receiptPath,'utf8'));
if(receipt.projectId!==cfg.projectId||receipt.apiOrigin!==api||receipt.realAdminLoginVerified!==true||receipt.productionDataVerified!==true||receipt.privateMediaVerified!==true||!Number.isFinite(Date.parse(receipt.checkedAt))||Date.now()-Date.parse(receipt.checkedAt)>86400000||Date.parse(receipt.checkedAt)>Date.now())throw new Error('Production authenticated/data/media smoke is incomplete or stale');
const env={...process.env,VITE_API_BASE:api,VITE_ANDROID_API_BASE:api,VITE_API_BASE_HTTP:'',VITE_NATIVE_API_BASE:'',VITE_FIREBASE_EMULATORS:'false',VITE_FIREBASE_API_KEY:cfg.apiKey,VITE_FIREBASE_AUTH_DOMAIN:cfg.authDomain,VITE_FIREBASE_PROJECT_ID:cfg.projectId,VITE_FIREBASE_STORAGE_BUCKET:cfg.storageBucket,VITE_FIREBASE_MESSAGING_SENDER_ID:cfg.messagingSenderId,VITE_FIREBASE_APP_ID:cfg.appId,CSC_IDENTITY_AUTO_DISCOVERY:'false'};
const version=JSON.parse(fs.readFileSync('package.json')).version.split('.').map(Number);
if(fs.existsSync('release-artifacts/windows-client'))for(const name of fs.readdirSync('release-artifacts/windows-client')){const found=name.match(/^SolarERP-(\d+)\.(\d+)\.(\d+)-(?:portable|setup)\.exe$/);if(found&&Number(found[1])===version[0]&&Number(found[2])===version[1])version[2]=Math.max(version[2],Number(found[3]));}
version[2]++;
env.SOLARERP_DESKTOP_VERSION=version.join('.');
const sdkTools=pathForAapt();
function pathForAapt(){const root=`${process.env.LOCALAPPDATA}/Android/Sdk/build-tools`;return fs.readdirSync(root).sort().reverse().map(version=>`${root}/${version}/aapt.exe`).find(file=>fs.existsSync(file));}
const apkSources=['SolarERP-last.apk'];
if(fs.existsSync('release-artifacts/android'))for(const name of fs.readdirSync('release-artifacts/android'))if(name.endsWith('.apk'))apkSources.push(`release-artifacts/android/${name}`);
const codes=apkSources.map(file=>{const match=spawnSync(sdkTools,['dump','badging',file],{encoding:'utf8'}).stdout.match(/versionCode='(\d+)'/);if(!match)throw new Error('Previous Android version unavailable; avoid accidental downgrade');return Number(match[1]);});
env.SOLARERP_VERSION_CODE=String(Math.max(...codes)+1);env.SOLARERP_VERSION_NAME=`1.0.${env.SOLARERP_VERSION_CODE}`;
for(const key of ['FIREBASE_AUTH_EMULATOR_HOST','FIRESTORE_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST','STORAGE_EMULATOR_HOST'])delete env[key];
fs.mkdirSync('.security-artifacts',{recursive:true});
function run(command,log){const fd=fs.openSync(`.security-artifacts/${log}`,'w');try{const result=spawnSync('cmd.exe',['/d','/s','/c',command],{env,stdio:['ignore',fd,fd]});console.log(`${log}: exit ${result.status}`);if(result.status!==0)throw new Error(`Build failed: ${log}`);}finally{fs.closeSync(fd);}}
run('npm run build','real-platform-web.log');
run('npx cap sync android','real-platform-capacitor.log');
run('android\\gradlew.bat -p android assembleDebug --offline --console=plain','real-platform-android.log');
fs.mkdirSync('release-artifacts/android',{recursive:true});
fs.copyFileSync('android/app/build/outputs/apk/debug/app-debug.apk',`release-artifacts/android/SolarERP-${env.SOLARERP_VERSION_NAME}-debug.apk`);
const config={asar:true,npmRebuild:false,nodeGypRebuild:false,buildDependenciesFromSource:false,directories:{output:'release-artifacts/windows'},files:['package.json','dist/**/*','electron/**/*','!**/.env*','!backend/**/*','!server/**/*','!data/**/*','!**/*.map'],extraFiles:[],win:{sign:null,signDlls:false,signAndEditExecutable:false,target:['portable','nsis'],verifyUpdateCodeSignature:false},portable:{artifactName:'SolarERP-${version}-portable.exe'},nsis:{oneClick:false,allowToChangeInstallationDirectory:true,artifactName:'SolarERP-${version}-setup.exe'}};
fs.writeFileSync('.security-artifacts/windows-build.json',JSON.stringify(config,null,2));
run('node scripts/package-desktop-client.mjs','real-platform-windows.log');
console.log('Artifacts built with verified production HTTPS/auth/data/media; device and release-signing checks remain separate.');
