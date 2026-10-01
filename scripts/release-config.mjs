/** Offline checks only. Never initializes SDKs or outputs environment values. */
export function releaseChecks(env) {
 const checks=[];const check=(name,valid)=>checks.push({name,status:valid?'PASS':'BLOCKED'});
 const https=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!['localhost','127.0.0.1','api.example.invalid','YOUR_API_HOST'].includes(url.hostname);}catch{return false;}};
 for(const key of ['VITE_API_BASE','VITE_ANDROID_API_BASE'])check(key,https(env[key]));
 for(const key of ['VITE_FIREBASE_API_KEY','VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_STORAGE_BUCKET','VITE_FIREBASE_APP_ID'])check(key,!!env[key]&&!String(env[key]).includes('demo-'));
 let adminHash;try{adminHash=JSON.parse(env.ADMIN_PASSWORD_HASH||'');}catch{}
 check('ADMIN_LOGIN',!!env.ADMIN_LOGIN);check('ADMIN_PASSWORD_HASH',adminHash?.algorithm==='scrypt'&&/^[a-f0-9]{128}$/.test(adminHash.hash||'')&&/^[a-f0-9]{32}$/.test(adminHash.salt||''));
 check('FIREBASE_ADMIN_CREDENTIAL_SOURCE',!!(env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON||env.GOOGLE_APPLICATION_CREDENTIALS));
 check('STORAGE_BUCKET_MATCH',!!env.FIREBASE_STORAGE_BUCKET&&env.FIREBASE_STORAGE_BUCKET===env.VITE_FIREBASE_STORAGE_BUCKET);
 check('HASH_ONLY_LOGIN',env.ALLOW_LEGACY_PLAINTEXT_LOGIN==='false');
 check('CLIENT_SECRET_ABSENCE',!Object.keys(env).some(key=>key.startsWith('VITE_')&&/TOKEN|SECRET|PASSWORD|PRIVATE_KEY|SERVICE_ACCOUNT/.test(key)&&env[key]));
 check('TELEGRAM_SERVER_CONFIG',!!env.TELEGRAM_BOT_TOKEN&&!!env.TELEGRAM_GROUP_ID);
 check('CORS_ORIGINS',!!env.CORS_ORIGINS&&env.CORS_ORIGINS.split(',').every(origin=>https(origin.trim())));
 check('BACKUP_KEY',Buffer.from(env.CREDENTIAL_BACKUP_KEY_BASE64||'','base64').length===32);
 check('PRODUCTION_EMULATOR_ABSENCE',!['FIREBASE_AUTH_EMULATOR_HOST','FIRESTORE_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST','STORAGE_EMULATOR_HOST','VITE_FIREBASE_EMULATORS'].some(key=>env[key]&&env[key]!=='false'));
 return {checks,configured:checks.every(c=>c.status==='PASS'),productionHttpsConfirmed:false,rotationConfirmed:false,liveStoragePolicyConfirmed:false,nativeAndroidConfirmed:false};
}
