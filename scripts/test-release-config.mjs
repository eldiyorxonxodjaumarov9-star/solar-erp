import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parse } from 'dotenv';
import { desktopPublicEnv } from './desktop-public-env.mjs';
import { releaseChecks } from './release-config.mjs';
import { hashPassword } from '../server/passwordHash.js';
import { assertProductionFirebaseEnvironment } from '../server/firebaseAdminAuth.js';
const source='VITE_API_BASE=https://staging.example.com\nADMIN_PASSWORD=test-private-password\nTELEGRAM_BOT_TOKEN=test-private-token\nFIREBASE_ADMIN_SERVICE_ACCOUNT_JSON=test-private-credential\nVITE_BOT_TOKEN=test-private-token\nDATABASE_URL=test-private-database\n';
const sanitized=desktopPublicEnv(source),publicEnv=parse(sanitized);
for(const key of ['ADMIN_PASSWORD','TELEGRAM_BOT_TOKEN','FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON','VITE_BOT_TOKEN','DATABASE_URL'])assert.equal(publicEnv[key],undefined);
assert.equal(publicEnv.ELECTRON_SKIP_EMBEDDED_SERVER,'1');assert.equal(sanitized.includes('test-private'),false);
assert.throws(()=>desktopPublicEnv('VITE_API_BASE=http://staging.example.com'));assert.throws(()=>desktopPublicEnv('VITE_API_BASE=https://localhost'));
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));assert.equal(pkg.build.extraFiles.some(item=>item.from==='data'),false);
const config={VITE_API_BASE:'https://staging.example.com',VITE_ANDROID_API_BASE:'https://staging.example.com',VITE_FIREBASE_API_KEY:'fixture-public-key',VITE_FIREBASE_PROJECT_ID:'fixture-release',VITE_FIREBASE_AUTH_DOMAIN:'fixture-release.firebaseapp.com',VITE_FIREBASE_STORAGE_BUCKET:'fixture-release.appspot.com',VITE_FIREBASE_APP_ID:'fixture-release-app',FIREBASE_STORAGE_BUCKET:'fixture-release.appspot.com',ADMIN_LOGIN:'fixture-admin',ADMIN_PASSWORD_HASH:JSON.stringify(hashPassword('fixture-password')),GOOGLE_APPLICATION_CREDENTIALS:'server-only-key.json',ALLOW_LEGACY_PLAINTEXT_LOGIN:'false',TELEGRAM_BOT_TOKEN:'fixture-server-token',TELEGRAM_GROUP_ID:'fixture-server-group',CORS_ORIGINS:'https://app.example.com',CREDENTIAL_BACKUP_KEY_BASE64:randomBytes(32).toString('base64')};
assert.equal(releaseChecks(config).configured,true);
for(const change of [{VITE_API_BASE:'http://public.example'},{VITE_BOT_TOKEN:'forbidden'},{ALLOW_LEGACY_PLAINTEXT_LOGIN:'true'},{ADMIN_PASSWORD_HASH:'invalid'},{FIREBASE_STORAGE_BUCKET:'other'},{CORS_ORIGINS:'http://public.example'},{CREDENTIAL_BACKUP_KEY_BASE64:''}])assert.equal(releaseChecks({...config,...change}).configured,false);
assert.equal(JSON.stringify(releaseChecks(config)).includes('fixture-password'),false);
for(const key of ['FIREBASE_AUTH_EMULATOR_HOST','FIRESTORE_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST','STORAGE_EMULATOR_HOST']){
 assert.throws(()=>assertProductionFirebaseEnvironment({NODE_ENV:'production',[key]:'127.0.0.1:9099'}),{code:'FIREBASE_PRODUCTION_EMULATOR_FORBIDDEN'});
 assert.equal(releaseChecks({...config,[key]:'127.0.0.1:9099'}).configured,false);
}
assert.doesNotThrow(()=>assertProductionFirebaseEnvironment({NODE_ENV:'test',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099'}));
const manifest=fs.readFileSync('android/app/src/main/AndroidManifest.xml','utf8'),network=fs.readFileSync('android/app/src/main/res/xml/network_security_config.xml','utf8'),capacitor=JSON.parse(fs.readFileSync('capacitor.config.json','utf8'));
assert.ok(manifest.includes('android:usesCleartextTraffic="false"'));assert.ok(manifest.includes('android:allowBackup="false"'));assert.ok(!network.includes('cleartextTrafficPermitted="true"'));assert.equal(capacitor.server.cleartext,false);assert.equal(capacitor.android.allowMixedContent,false);
console.log('PASS release configuration: no client/desktop secrets or packaged private data, HTTPS/hash-only gates, Android cleartext/mixed content/backup disabled. Offline fixtures only.');
