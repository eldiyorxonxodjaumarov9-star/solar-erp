import { createPrivateStorageRouter } from '../server/routes/privateStorageApi.js';
import { transform } from 'esbuild';
import { createTelegramAttendanceHandler } from '../server/telegram/attendance.js';
import jpeg from 'jpeg-js';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createVpsStorage } from '../server/vpsStorage.js';
import { createTelegramAttendanceRouter } from '../server/routes/telegramAttendanceApi.js';
import { createTelegramPhotoDownloader, MAX_TELEGRAM_IMAGE } from '../server/telegram/photoDownload.js';
import { createTelegramReviewRouter } from '../server/routes/telegramReviewApi.js';
import { requireFirebaseSession } from '../server/authMiddleware.js';
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import express from 'express';
import { initializeApp, cert, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, setLogLevel } from 'firebase/firestore';
import { resolveWorkerIdentity, normalizePhone } from '../server/telegram/workerIdentity.js';
import { authorizeTelegramWorker } from '../server/telegram/workerAuthorization.js';
import { handleTelegramLink } from '../server/telegram/linking.js';
import { createTelegramLinkRouter } from '../server/routes/telegramLinkApi.js';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
const projectId = 'demo-solar-linking';
const phone = '+998901234567', otherPhone = '+998909999999';
const secret = randomBytes(24).toString('hex');
let app, db, environment, http, base, mediaDir;
let fakeFilePath='photos/file_1.jpg', photoBytes, declaredSize, downloadHook, downloadCount=0;
const validJpeg=jpeg.encode({width:1,height:1,data:Buffer.from([0,0,0,255])},80).data;
const photoDownloader=createTelegramPhotoDownloader({env:{TELEGRAM_BOT_TOKEN:'123:local_test_token'},fetchImpl:async(url)=>{
  downloadCount++;if(downloadHook)await downloadHook();
  return url.endsWith('/getFile') ? new Response(JSON.stringify({ok:true,result:{file_path:fakeFilePath,file_size:declaredSize??photoBytes.length}}))
    : new Response(photoBytes,{headers:{'content-type':'image/jpeg'}});
}});
let failureMode = null, loseNextResponse = false;
const tokenMarker = 'emulator-token-' + randomBytes(12).toString('hex');
const errorMarker = 'PRIVATE_FAULT_DETAILS';
const injectedError = code => Object.assign(new Error([errorMarker, phone, "123", "w1", "usta:w1", secret, tokenMarker].join(" ")), { code });
async function routeDb() {
  if (failureMode === 'admin-unavailable') throw injectedError(14);
  if (!failureMode) return db;
  return { collection: name => db.collection(name), runTransaction: callback => db.runTransaction(async tx => {
    const mode = failureMode;
    const proxy = {
      get: ref => mode === 'connection' ? Promise.reject(injectedError(14)) : tx.get(ref),
      set: (...args) => tx.set(...args),
      update: (...args) => tx.update(...args), delete: (...args) => tx.delete(...args),
      create: (ref, value) => { tx.create(ref, value); if (mode === 'transaction') throw injectedError(10); },
    };
    const result = await callback(proxy);
    if (mode === 'timeout') {
      await new Promise(resolve => setTimeout(resolve, 20));
      throw injectedError(4);
    }
    return result;
  }, { maxAttempts: 1 }) };
}
setLogLevel('silent');
before(async () => {
  environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8080,
    rules: await readFile('firestore.rules', 'utf8') } });
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  app = initializeApp({ projectId, credential: cert({ projectId, privateKey,
    clientEmail: 'emulator@demo-solar-linking.iam.gserviceaccount.com' }) }, 'telegram-link-tests');
  db = getFirestore(app);
  mediaDir=await mkdtemp(path.join(tmpdir(),'solar-telegram-media-'));
  const web = express();
  web.use('/api/private-storage',createPrivateStorageRouter({getDb:routeDb,getBucket:async()=>createVpsStorage(mediaDir),
    authorize:roles=>requireFirebaseSession(roles,async token=>{
      if(token==='admin')return {uid:'admin:primary',role:'admin',accountId:'primary',firebase:{sign_in_provider:'custom'}};
      if(!['worker-w1','worker-w2'].includes(token))throw new Error();const workerId=token.slice(7);
      return {uid:'usta:'+workerId,role:'usta',accountId:workerId,workerId,firebase:{sign_in_provider:'custom'}};
    },async()=>{})}));
  web.use('/api/telegram/attendance',createTelegramAttendanceRouter({getDb:routeDb,env:{TELEGRAM_WEBHOOK_SECRET:secret},
    now:()=>new Date('2026-10-12T03:55:00.000Z'),downloadPhoto:photoDownloader,getBucket:async()=>createVpsStorage(mediaDir)}));
  // Mirror the production rewrite and mount before the Firebase session gate.
  web.use((req, _res, next) => {
    if (req.url.startsWith('/api/supply/compat/')) req.url = '/api/' + req.url.slice('/api/supply/compat/'.length);
    next();
  });
  web.use('/api/telegram/link', (_req, res, next) => {
    const json = res.json.bind(res);
    res.json = body => {
      if (loseNextResponse) { loseNextResponse = false; res.destroy(); return res; }
      return json(body);
    };
    next();
  });
  web.use('/api/telegram/link', createTelegramLinkRouter({ getDb: routeDb, env: { TELEGRAM_WEBHOOK_SECRET: secret } }));
  // Test-only action: exercise the reusable guard over HTTP without adding a bot feature.
  web.post('/api/telegram/protected-test', (req, res, next) => {
    if (req.get('x-telegram-bot-api-secret-token') !== secret) return res.status(403).json({ error: 'Forbidden' });
    next();
  }, express.json({ limit: '16kb' }), async (req, res) => {
    const result = await authorizeTelegramWorker(await routeDb(), req.body);
    return result.status === 'authorized' ? res.json({ ok: true }) : res.status(403).json({ error: 'Action unavailable' });
  });
  web.use('/api/telegram/link-reviews', createTelegramReviewRouter({ getDb: routeDb, authorize: roles => requireFirebaseSession(roles, async token => {
    if (!['admin','usta','asisten'].includes(token)) throw new Error();
    return { uid: token + ':primary', role: token, accountId: 'primary', workerId: 'primary', assistantId: 'primary', firebase: { sign_in_provider: 'custom' } };
  }, async () => {}) }));
  web.use('/api', (_req, res) => res.status(401).json({ error: 'Session required' }));
  http = await new Promise(resolve => { const server = web.listen(0, '127.0.0.1', () => resolve(server)); });
  base = `http://127.0.0.1:${http.address().port}`;
});
after(async () => {
  if (http) await new Promise(resolve => http.close(resolve));
  if(mediaDir){assert.equal(path.dirname(mediaDir),tmpdir());assert.ok(path.basename(mediaDir).startsWith('solar-telegram-media-'));await rm(mediaDir,{recursive:true,force:true});}
  await environment?.cleanup(); if (app) await deleteApp(app);
});
beforeEach(async () => {
  failureMode = null; loseNextResponse = false;
  fakeFilePath='photos/file_1.jpg';photoBytes=validJpeg;declaredSize=undefined;downloadHook=null;downloadCount=0;
  await environment.clearFirestore();
  await db.doc('workers/w1').set({ fullName: 'Worker One', phone, status: 'active' });
});
const input = (id = 123, number = phone) => ({ update_id: 1, message: {
  from: { id }, chat: { id, type: 'private' }, contact: { user_id: id, phone_number: number },
} });
const resolveIdentity = number => db.runTransaction(tx => resolveWorkerIdentity(tx, db, number));
async function pairs(expected) {
  const forward = await db.collection('telegramLinks').get(), reverse = await db.collection('telegramWorkerLinks').get();
  assert.equal(forward.size, expected); assert.equal(reverse.size, expected);
  for (const ref of forward.docs) {
    const data = ref.data(); assert.equal(ref.id, data.telegramUserId);
    assert.equal(data.firebaseUid, `usta:${data.workerId}`); assert.equal(data.status, 'linked');
    assert.deepEqual((await db.doc('telegramWorkerLinks/' + data.workerId).get()).data(), data);
    assert.deepEqual(Object.keys(data).sort(), ['telegramUserId','telegramChatId','workerId','firebaseUid','linkedAt','status','identityBinding'].sort());
  }
}
async function noReview() { assert.equal((await db.collection('telegramLinkReviews').get()).size, 0); }
async function post(payload, provided = secret, path = '/api/telegram/link', raw = false) {
  const headers = { 'content-type': 'application/json' };
  if (provided !== null) headers['x-telegram-bot-api-secret-token'] = provided;
  const response = await fetch(base + path, { method: 'POST', headers, body: raw ? payload : JSON.stringify(payload), signal: AbortSignal.timeout(30000) });
  return { code: response.status, body: await response.json() };
}
const success = 'Hisobingiz bog‘landi.', denial = 'Bog‘lash amalga oshmadi. Administratorga murojaat qiling.';
function generic(result, id, text) {
  assert.equal(result.code, 200);
  assert.deepEqual(result.body, { method: 'sendMessage', chat_id: id, text,
    ...(text === success ? { reply_markup: { remove_keyboard: true } } : {}) });
}
test('workers phone -> canonical worker identity and exact Firebase UID', async () => {
  const { identityBinding, ...resolved } = await resolveIdentity('90 123-45-67');
  assert.equal(identityBinding.source, 'workers');
  assert.deepEqual(resolved, { status: 'resolved', identity: {
    workerId: 'w1', firebaseUid: 'usta:w1', name: 'Worker One', phone,
  } });
});
test('legacy users fallback', async () => {
  await db.doc('workers/w1').delete(); await db.doc('users/w1').set({ name: 'Legacy', phone });
  assert.equal((await resolveIdentity(phone)).identity.firebaseUid, 'usta:w1');
});
test('same ID in workers/users is one identity; workers profile wins', async () => {
  await db.doc('users/w1').set({ name: 'Legacy', phone });
  assert.equal((await resolveIdentity(phone)).identity.name, 'Worker One');
  assert.equal((await handleTelegramLink(db, input())).status, 'linked'); await pairs(1);
});
test('same phone different IDs -> private review, no mapping', async () => {
  await db.doc('users/w2').set({ phone, status: 'active' });
  assert.equal((await handleTelegramLink(db, input())).status, 'denied'); await pairs(0);
  const review = (await db.doc('telegramLinkReviews/123').get()).data();
  assert.equal(review.status, 'admin_review'); assert.deepEqual(review.candidateWorkerIds, ['w1','w2']);
});
for (const profile of [{ status: 'inactive' }, { disabled: true }, { status: 'noaktiv' }]) {
  test(`inactive/disabled worker ${JSON.stringify(profile)} -> DENY`, async () => {
    await db.doc('workers/w1').update(profile);
    await db.doc('users/w1').set({ phone, status: 'active' });
    assert.equal((await handleTelegramLink(db, input())).status, 'denied'); await pairs(0);
  });
}
test('stale legacy phone cannot override canonical worker phone', async () => {
  await db.doc('workers/w1').update({ phone: otherPhone }); await db.doc('users/w1').set({ phone });
  assert.equal((await resolveIdentity(phone)).status, 'denied');
});
test('phone missing/invalid -> DENY', async () => {
  assert.equal(normalizePhone('bad901234567'), null);
  assert.equal((await handleTelegramLink(db, input(123, '+998901111111'))).status, 'denied'); await pairs(0);
});
test('Telegram A -> worker A creates both private mappings', async () => {
  generic(await post(input()), 123, success); await pairs(1);
});
test('duplicate Telegram cannot switch workers', async () => {
  await db.doc('workers/w2').set({ phone: otherPhone }); await post(input());
  generic(await post(input(123, otherPhone)), 123, denial); await pairs(1);
  assert.equal((await db.doc('telegramLinks/123').get()).data().workerId, 'w1');
});
test('duplicate worker cannot link second Telegram', async () => {
  await post(input()); generic(await post(input(456)), 456, denial); await pairs(1);
  assert.equal((await db.doc('telegramLinks/456').get()).exists, false);
});
for (const owner of [456, undefined]) {
  test(`foreign/missing contact owner ${owner} -> DENY without review`, async () => {
    const payload = input(); payload.message.contact.user_id = owner;
    generic(await post(payload), 123, denial); await pairs(0); await noReview();
  });
}
for (const size of [2, 5]) {
  for (const variant of ['identical', 'different-phones', 'different-accounts']) {
    test(`parallel HTTP ${size} ${variant} -> one complete mapping`, async () => {
      await db.doc('workers/w2').set({ phone: otherPhone, status: 'active' });
      const payloads = Array.from({ length: size }, (_, index) => input(
        variant === 'different-accounts' ? 123 + index : 123,
        variant === 'different-phones' && index % 2 ? otherPhone : phone));
      const results = await Promise.all(payloads.map(payload => post(payload)));
      assert.equal(results.filter(r => r.body.text === success).length, 1);
      assert.equal(results.filter(r => r.body.text === denial).length, size - 1);
      results.forEach((r, index) => generic(r, payloads[index].message.from.id, r.body.text));
      await pairs(1); await noReview();
      const winner = (await db.collection('telegramLinks').get()).docs[0].data();
      for (const payload of payloads) if (String(payload.message.from.id) !== winner.telegramUserId)
        assert.equal((await db.doc('telegramLinks/' + payload.message.from.id).get()).exists, false);
      const loser = winner.workerId === 'w1' ? 'w2' : 'w1';
      assert.equal((await db.doc('telegramWorkerLinks/' + loser).get()).exists, false);
    });
  }
}
test('/start returns contact keyboard', async () => {
  const payload = input(); delete payload.message.contact; payload.message.text = '/start';
  const result = await post(payload); assert.equal(result.code, 200);
  assert.equal(result.body.reply_markup.keyboard[0][0].request_contact, true); await pairs(0);
});
for (const header of [null, 'bad', 'x'.repeat(secret.length)]) {
  test(`missing/invalid secret ${header === null ? 'missing' : header.length} -> generic 403`, async () => {
    assert.deepEqual(await post(input(), header), { code: 403, body: { error: 'Forbidden' } }); await pairs(0);
  });
}
test('malformed and oversized JSON are generic', async () => {
  assert.deepEqual(await post('{', secret, '/api/telegram/link', true), { code: 400, body: { error: 'Invalid request' } });
  assert.deepEqual(await post({ padding: 'x'.repeat(17000) }), { code: 413, body: { error: 'Invalid request' } }); await pairs(0);
});
test('missing message/from and group ignored', async () => {
  const group = input(); group.message.chat.type = 'group';
  for (const payload of [{}, { message: { chat: { type: 'private', id: 123 } } }, group])
    assert.deepEqual(await post(payload), { code: 200, body: { ok: true } });
  await pairs(0);
});
test('compat rewrite reaches webhook; unrelated API remains protected', async () => {
  generic(await post(input(), secret, '/api/supply/compat/telegram/link'), 123, success);
  assert.equal((await post({}, secret, '/api/telegram/work-log')).code, 401);
});
test('transaction failure after first create rolls back; recovery works', async () => {
  const faulty = { collection: name => db.collection(name), runTransaction: fn => db.runTransaction(tx => fn({
    get: ref => tx.get(ref), set: (...args) => tx.set(...args),
      update: (...args) => tx.update(...args), delete: (...args) => tx.delete(...args),
    create: (ref, value) => { tx.create(ref, value); throw new Error('injected'); },
  }), { maxAttempts: 1 }) };
  await assert.rejects(handleTelegramLink(faulty, input())); await pairs(0);
  assert.equal((await handleTelegramLink(db, input())).status, 'linked'); await pairs(1);
});
async function captureServerLogs(run) {
  const methods = ['log','error','warn','info','debug'];
  const original = Object.fromEntries(methods.map(method => [method, console[method]]));
  const captured = [];
  for (const method of methods) console[method] = (...args) => captured.push(args.map(arg =>
    arg instanceof Error ? `${arg.message} ${arg.stack}` : typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' '));
  try { await run(); } finally {
    for (const method of methods) console[method] = original[method];
  }
  // Do not print captured logs even when a confidentiality assertion fails.
  const output = captured.join('\n');
  for (const value of [phone, phone.slice(1), secret, tokenMarker, errorMarker,
    'usta:w1', 'workerId', 'firebaseUid', 'telegramUserId', 'telegramChatId']) {
    assert.equal(output.includes(value), false, 'Server must not log private details');
  }
  assert.equal(/\b(?:123|w1)\b/.test(output), false, 'Server must not log identity values');
}
for (const mode of ['connection','transaction','timeout','admin-unavailable']) {
  test(`HTTP resilience ${mode}: generic 503, no partial state, recovery`, async () => {
    await captureServerLogs(async () => {
      const payload = input(); failureMode = mode;
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          assert.deepEqual(await post(payload), { code: 503, body: { error: 'Linking unavailable' } });
          await pairs(0); await noReview();
          assert.equal(http.listening, true);
        }
      } finally { failureMode = null; }
      generic(await post(payload), 123, success);
      await pairs(1); await noReview();
      const mapping = (await db.doc('telegramLinks/123').get()).data();
      assert.equal(mapping.workerId, 'w1'); assert.equal(mapping.firebaseUid, 'usta:w1');
      generic(await post(payload), 123, denial);
      await pairs(1); assert.deepEqual((await db.doc('telegramLinks/123').get()).data(), mapping);
      assert.equal(http.listening, true);
    });
  });
}
test('HTTP commit succeeds but response connection lost: retry preserves one mapping', async () => {
  await captureServerLogs(async () => {
    const payload = input(); loseNextResponse = true;
    // The fixture destroys the socket at res.json(), after linking has committed.
    await assert.rejects(post(payload), error => error instanceof TypeError && error.message === 'fetch failed');
    assert.equal(loseNextResponse, false);
    await pairs(1); await noReview();
    const before = (await db.doc('telegramLinks/123').get()).data();
    assert.equal(before.firebaseUid, 'usta:w1');
    generic(await post(payload), 123, denial);
    await pairs(1); await noReview();
    assert.deepEqual((await db.doc('telegramLinks/123').get()).data(), before);
    assert.deepEqual((await db.doc('telegramWorkerLinks/w1').get()).data(), before);
    assert.equal(http.listening, true);
    const started = input(); started.message.text = '/start'; delete started.message.contact;
    assert.equal((await post(started)).code, 200);
  });
});
const action = () => post(input(), secret, '/api/telegram/protected-test');
async function mappingState() {
  return { forward: (await db.doc('telegramLinks/123').get()).data(),
    reverse: (await db.doc('telegramWorkerLinks/w1').get()).data() };
}
async function linkedProfile(source) {
  if (source === 'users') {
    await db.doc('workers/w1').delete(); await db.doc('users/w1').set({ phone, status: 'active' });
  }
  generic(await post(input()), 123, success);
  assert.deepEqual(await action(), { code: 200, body: { ok: true } });
  return db.doc(source + '/w1');
}
for (const source of ['workers','users']) {
  for (const change of [{ status: 'inactive' }, { disabled: true }]) {
    test(`guard ${source} ${Object.keys(change)[0]}: DENY, preserve mapping, reactivate without relink`, async () => {
      await captureServerLogs(async () => {
        const profile = await linkedProfile(source); const before = await mappingState();
        await profile.update(change);
        assert.deepEqual(await action(), { code: 403, body: { error: 'Action unavailable' } });
        assert.equal((await authorizeTelegramWorker(db, input())).status, 'denied');
        generic(await post(input()), 123, denial); await pairs(1); await noReview();
        assert.deepEqual(await mappingState(), before);
        await profile.update({ status: 'active', disabled: false });
        assert.deepEqual(await action(), { code: 200, body: { ok: true } });
        assert.equal((await authorizeTelegramWorker(db, input())).firebaseUid, 'usta:w1');
        assert.deepEqual(await mappingState(), before);
      });
    });
  }
  test(`guard ${source} missing profile: generic DENY, mapping retained`, async () => {
    const profile = await linkedProfile(source); const before = await mappingState();
    await profile.delete();
    assert.deepEqual(await action(), { code: 403, body: { error: 'Action unavailable' } });
    assert.equal((await authorizeTelegramWorker(db, input())).status, 'denied');
    assert.deepEqual(await mappingState(), before); await pairs(1); await noReview();
  });
  test(`guard ${source} reused document ID: security_review, no reassignment`, async () => {
    const profile = await linkedProfile(source); const before = await mappingState();
    await profile.delete(); await profile.set({ phone, status: 'active', fullName: 'Different person' });
    assert.equal((await authorizeTelegramWorker(db, input())).status, 'security_review');
    assert.deepEqual(await action(), { code: 403, body: { error: 'Action unavailable' } });
    generic(await post(input()), 123, denial);
    assert.deepEqual(await mappingState(), before); await pairs(1); assert.equal((await db.collection('telegramLinkReviews').get()).size, 1);
  });
}
test('guard Firebase UID mismatch -> security_review, generic DENY', async () => {
  await linkedProfile('workers');
  await db.doc('telegramLinks/123').update({ firebaseUid: 'usta:w2' });
  const before = await mappingState();
  assert.equal((await authorizeTelegramWorker(db, input())).status, 'security_review');
  assert.deepEqual(await action(), { code: 403, body: { error: 'Action unavailable' } });
  assert.deepEqual(await mappingState(), before);
});
test('guard mismatched reverse mapping -> security_review', async () => {
  await linkedProfile('workers'); await db.doc('telegramWorkerLinks/w1').update({ telegramUserId: '456' });
  const before = await mappingState();
  assert.equal((await authorizeTelegramWorker(db, input())).status, 'security_review');
  assert.deepEqual(await action(), { code: 403, body: { error: 'Action unavailable' } });
  assert.deepEqual(await mappingState(), before);
});
test('guard mapping without identity binding fails closed', async () => {
  await linkedProfile('workers'); const original = await mappingState();
  const { identityBinding, ...legacy } = original.forward;
  await db.doc('telegramLinks/123').set(legacy); await db.doc('telegramWorkerLinks/w1').set(legacy);
  assert.equal((await authorizeTelegramWorker(db, input())).status, 'security_review');
  assert.deepEqual(await action(), { code: 403, body: { error: 'Action unavailable' } });
  assert.deepEqual(await mappingState(), { forward: legacy, reverse: legacy });
});
test('guard phone identity change requires review, name correction allowed', async () => {
  const profile = await linkedProfile('workers'); const before = await mappingState();
  await profile.update({ fullName: 'Corrected name' });
  assert.deepEqual(await action(), { code: 200, body: { ok: true } });
  await profile.update({ phone: otherPhone });
  assert.equal((await authorizeTelegramWorker(db, input())).status, 'security_review');
  assert.deepEqual(await action(), { code: 403, body: { error: 'Action unavailable' } });
  assert.deepEqual(await mappingState(), before);
});
test('guard legacy identity shadowed by new workers document -> security_review', async () => {
  await linkedProfile('users'); const before = await mappingState();
  await db.doc('workers/w1').set({ phone, status: 'active' });
  assert.equal((await authorizeTelegramWorker(db, input())).status, 'security_review');
  assert.deepEqual(await action(), { code: 403, body: { error: 'Action unavailable' } });
  assert.deepEqual(await mappingState(), before);
});
for (const role of ['anonymous', 'admin', 'usta', 'asisten']) {
  for (const name of ['telegramLinks','telegramWorkerLinks','telegramLinkReviews','telegramLinkAudit','telegramAttendanceState','telegramAttendanceUpdates']) {
    test(`private rules ${role} ${name} deny six client operations`, async () => {
      await db.doc(name + '/existing').set({ status: 'admin_review' });
      const client = role === 'anonymous' ? environment.unauthenticatedContext().firestore()
        : environment.authenticatedContext(`${role}:${role === 'usta' ? 'w1' : 'primary'}`, {
          role, accountId: role === 'usta' ? 'w1' : 'primary', workerId: role === 'usta' ? 'w1' : '',
          firebase: { sign_in_provider: 'custom' },
        }).firestore();
      const ref = doc(client, name, 'existing');
      await assertFails(getDoc(ref)); await assertFails(getDocs(collection(client, name)));
      await assertFails(setDoc(doc(client, name, 'new'), { status: 'linked' }));
      await assertFails(setDoc(ref, { status: 'linked' }));
      await assertFails(updateDoc(ref, { status: 'linked' })); await assertFails(deleteDoc(ref));
    });
  }
}

async function adminRequest(path = '', method = 'GET', body, role = 'admin') {
  const response = await fetch(base + '/api/telegram/link-reviews' + path, { method,
    headers: { authorization: 'Bearer ' + role, 'content-type': 'application/json' },
    ...(body && method !== 'GET' ? { body: JSON.stringify(body) } : {}) });
  return { code: response.status, body: await response.json() };
}
async function pendingReview() {
  generic(await post(input()), 123, success);
  await db.doc('workers/w1').update({ phone: otherPhone });
  assert.equal((await authorizeTelegramWorker(db, input())).status, 'security_review');
  const list = await adminRequest(); assert.equal(list.code, 200); assert.equal(list.body.length, 1);
  const detail = await adminRequest('/' + list.body[0].id);
  return { id: detail.body.id, workerId: 'w1', version: detail.body.version, workerVersion: detail.body.workers[0].version };
}
async function audits(action) {
  const entries = await db.collection('telegramLinkAudit').get(); assert.equal(entries.size, 1);
  assert.deepEqual(Object.keys(entries.docs[0].data()).sort(), ['action','adminUid','workerId','reviewId','timestamp'].sort());
  assert.equal(entries.docs[0].data().action, action); assert.equal(entries.docs[0].data().adminUid, 'admin:primary');
}
test('admin list/detail expose safe projection and one durable review', async () => {
  const review = await pendingReview(); await authorizeTelegramWorker(db, input());
  const detail = await adminRequest('/' + review.id); assert.equal(detail.code, 200);
  assert.equal(detail.body.workers[0].name, 'Worker One'); assert.equal(detail.body.telegramId, '***123');
  const serialized = JSON.stringify(detail.body);
  for (const privateValue of [phone, otherPhone, secret, 'phoneHash', 'identityBinding']) assert.equal(serialized.includes(privateValue), false);
  assert.equal((await adminRequest()).body.length, 1);
});
test('admin approve atomically repairs binding and writes audit', async () => {
  const review = await pendingReview();
  assert.equal((await adminRequest('/' + review.id + '/approve', 'POST', review)).code, 200);
  await pairs(1); assert.equal((await authorizeTelegramWorker(db, input())).status, 'authorized');
  assert.equal((await adminRequest()).body.length, 0); await audits('approve_rebind');
});
test('admin reject atomically unlinks and writes audit', async () => {
  const review = await pendingReview(); assert.equal((await adminRequest('/' + review.id + '/reject', 'POST', review)).code, 200);
  await pairs(0); await audits('reject_unlink');
});
for (const role of ['usta','asisten','invalid']) test('review API denies ' + role + ' on every endpoint', async () => {
  const review = await pendingReview();
  for (const [path,method] of [['','GET'],['/'+review.id,'GET'],['/'+review.id+'/approve','POST'],['/'+review.id+'/reject','POST']])
    assert.equal((await adminRequest(path, method, review, role)).code, role === 'invalid' ? 401 : 403);
  await pairs(1); assert.equal((await db.collection('telegramLinkAudit').get()).size, 0);
});
for (const mode of ['stale-review','stale-mapping','stale-worker','inactive','duplicate-worker','duplicate-telegram','other-worker'])
  test('admin approve DENY ' + mode, async () => {
    const review = await pendingReview(); const before = await mappingState();
    if (mode === 'stale-review') await db.doc('telegramLinkReviews/' + review.id).update({ reason: 'changed' });
    if (mode === 'stale-mapping') await db.doc('telegramLinks/123').update({ status: 'security_review' });
    if (mode === 'stale-worker') await db.doc('workers/w1').update({ fullName: 'Changed' });
    if (mode === 'inactive') await db.doc('workers/w1').update({ disabled: true });
    if (mode === 'duplicate-worker') await db.doc('telegramLinks/456').set({ telegramUserId: '456', workerId: 'w1' });
    if (mode === 'duplicate-telegram') await db.doc('telegramWorkerLinks/w2').set({ telegramUserId: '123', workerId: 'w2' });
    if (mode === 'other-worker') review.workerId = 'w2';
    assert.equal((await adminRequest('/' + review.id + '/approve','POST',review)).code,409);
    assert.equal((await db.collection('telegramLinkAudit').get()).size,0);
    if (mode !== 'stale-mapping') assert.deepEqual(await mappingState(), before);
  });
test('parallel admin approval has exactly one winner', async () => {
  const review = await pendingReview();
  const responses = await Promise.all(Array.from({length:5}, () => adminRequest('/'+review.id+'/approve','POST',review)));
  assert.equal(responses.filter(r=>r.code===200).length,1); assert.equal(responses.filter(r=>r.code===409).length,4);
  await pairs(1); await audits('approve_rebind');
});
test('replayed resolved review is denied', async () => {
  const review=await pendingReview(); await adminRequest('/'+review.id+'/reject','POST',review);
  assert.equal((await adminRequest('/'+review.id+'/approve','POST',review)).code,409); await pairs(0);
});
test('admin transaction failure leaves mapping/review/audit unchanged', async () => {
  const review=await pendingReview(), before=await mappingState(); failureMode='transaction';
  await captureServerLogs(async()=>assert.equal((await adminRequest('/'+review.id+'/approve','POST',review)).code,503));
  failureMode=null; assert.deepEqual(await mappingState(),before); await pairs(1);
  assert.equal((await db.collection('telegramLinkAudit').get()).size,0);
  assert.equal((await adminRequest('/'+review.id)).body.status,'admin_review');
});

test('admin approves legacy users recovery without changing worker ID', async () => {
  await linkedProfile('users'); await db.doc('users/w1').update({ phone: otherPhone });
  await authorizeTelegramWorker(db,input()); const detail=(await adminRequest()).body[0];
  const request={workerId:'w1',version:detail.version,workerVersion:detail.workers[0].version};
  assert.equal((await adminRequest('/'+detail.id+'/approve','POST',request)).code,200);
  await pairs(1); assert.equal((await authorizeTelegramWorker(db,input())).status,'authorized');
});
test('ambiguous phone review requires explicit eligible worker selection', async () => {
  await db.doc('workers/w2').set({phone,status:'active',fullName:'Worker Two'});
  generic(await post(input()),123,denial); const detail=(await adminRequest()).body[0];
  const request={workerId:'w2',version:detail.version,workerVersion:detail.workers.find(w=>w.workerId==='w2').version};
  assert.equal((await adminRequest('/'+detail.id+'/approve','POST',request)).code,200);
  await pairs(1); assert.equal((await db.doc('telegramLinks/123').get()).data().firebaseUid,'usta:w2');
});
test('reject transaction failure rolls back both deletes and audit', async () => {
  const review=await pendingReview(), before=await mappingState();failureMode='transaction';
  assert.equal((await adminRequest('/'+review.id+'/reject','POST',review)).code,503);
  failureMode=null;assert.deepEqual(await mappingState(),before);await pairs(1);
  assert.equal((await adminRequest('/'+review.id)).body.status,'admin_review');
  assert.equal((await db.collection('telegramLinkAudit').get()).size,0);
});
test('missing worker cannot be approved',async()=>{
  const review=await pendingReview();await db.doc('workers/w1').delete();
  assert.equal((await adminRequest('/'+review.id+'/approve','POST',review)).code,409);await pairs(1);
});
test('admin malformed/oversized bodies are generic and do not write',async()=>{
  const review=await pendingReview();
  for(const body of ['{',JSON.stringify({padding:'x'.repeat(17000)})]){
    const response=await fetch(base+'/api/telegram/link-reviews/'+review.id+'/approve',{method:'POST',headers:{authorization:'Bearer admin','content-type':'application/json'},body});
    assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:'Review unavailable'});
  }
  await pairs(1);assert.equal((await db.collection('telegramLinkAudit').get()).size,0);
});
test('approve generic success/error responses and no sensitive logs',async()=>{
  const review=await pendingReview();
  await captureServerLogs(async()=>{
    const result=await adminRequest('/'+review.id+'/approve','POST',review);assert.deepEqual(result,{code:200,body:{ok:true}});
    const retry=await adminRequest('/'+review.id+'/approve','POST',review);assert.deepEqual(retry,{code:409,body:{error:'Review unavailable'}});
  });
});

let botSequence=1000;
const botInput=(text,id=123,extras={})=>({update_id:++botSequence,message:{from:{id},chat:{id,type:'private'},text,...extras}});
const bot=payload=>post(payload,secret,'/api/telegram/attendance');
const botText=(text,id=123)=>bot(botInput(text,id));
const photoInput=()=>botInput(undefined,123,{photo:[{file_id:'test-photo-id',file_size:validJpeg.length}]});
async function linkBot(){generic(await post(input()),123,success);}
async function logOne(){const logs=await db.collection('user_activity_logs').get();assert.equal(logs.size,1);return logs.docs[0];}
async function completeCheckIn(id=123){await botText('🟢 Keldim',id);const payload=photoInput();payload.message.from.id=id;payload.message.chat.id=id;return bot(payload);}
async function photoWait(){await linkBot();await db.doc('user_activity_logs/app-photo-day').set({ustaId:'w1',ustaName:'Worker One',dateKey:'2026-10-12',loginTime:'2026-10-12T03:55:00.000Z',workAttendance:true,logoutTime:null,image:null});return botText('📷 Rasm yuborish');}
const botDenied=result=>{assert.equal(result.code,200);assert.equal(result.body.text,'Amal bajarilmadi. Administratorga murojaat qiling.');};
test('bot active linked /start returns four-action reply keyboard',async()=>{
  await linkBot();const result=await botText('/start');assert.equal(result.code,200);
  assert.deepEqual(result.body.reply_markup.keyboard,[['🟢 Keldim','🔴 Ketdim'],['📷 Rasm yuborish','📍 Bugungi holatim']]);
});
test('bot unlinked start/contact retains secure linking flow',async()=>{
  assert.equal((await botText('/start')).body.reply_markup.keyboard[0][0].request_contact,true);
  generic(await bot({...input(),update_id:++botSequence}),123,success);await pairs(1);
});
test('bot check-in writes existing admin attendance schema with server timestamp',async()=>{
  await linkBot();assert.equal((await completeCheckIn()).body.text,'🟢 Kelish qayd etildi.');
  const data=(await logOne()).data();assert.equal(data.ustaId,'w1');assert.equal(data.workAttendance,true);
  assert.equal(data.loginTime,'2026-10-12T03:55:00.000Z');assert.equal(data.dateKey,'2026-10-12');
  assert.equal(data.source,'telegram');assert.equal(data.type,'check_in');assert.equal(typeof data.checkInAt.toMillis(),'number');
  assert.equal(data.logoutTime,null);assert.ok(data.image.startsWith('private-storage:'));assert.equal(data.telegramUserId,undefined);
});
test('bot duplicate check-in and repeated update preserve one record',async()=>{
  await linkBot();await completeCheckIn();const update=botInput('🟢 Keldim');await bot(update);const before=(await logOne()).data();
  await bot(update);await completeCheckIn();assert.deepEqual((await logOne()).data(),before);
});
test('bot checkout without check-in DENY',async()=>{await linkBot();botDenied(await botText('🔴 Ketdim'));assert.equal((await db.collection('user_activity_logs').get()).size,0);});
test('bot checkout and duplicate checkout update same attendance row once',async()=>{
  await linkBot();await completeCheckIn();const first=await logOne();assert.equal((await botText('🔴 Ketdim')).body.text,'🔴 Ketish qayd etildi.');
  const before=(await logOne()).data();assert.equal((await logOne()).id,first.id);assert.equal(before.type,'check_out');assert.equal(typeof before.checkOutAt.toMillis(),'number');
  await botText('🔴 Ketdim');assert.deepEqual((await logOne()).data(),before);
});
for(const kind of ['unlinked','disabled','inactive','foreign','spoofed-body'])test('bot identity security DENY '+kind,async()=>{
  if(kind!=='unlinked')await linkBot();
  if(kind==='disabled')await db.doc('workers/w1').update({disabled:true});
  if(kind==='inactive')await db.doc('workers/w1').update({status:'inactive'});
  const id=['foreign','spoofed-body'].includes(kind)?456:123;
  const payload=botInput('🟢 Keldim',id);if(kind==='spoofed-body'){payload.workerId='w1';payload.message.workerId='w1';}
  botDenied(await bot(payload));assert.equal((await db.collection('user_activity_logs').get()).size,0);
});
test('bot photo state requires check-in and stores private waiting state',async()=>{
  await linkBot();botDenied(await botText('📷 Rasm yuborish'));await completeCheckIn();
  assert.equal((await botText('📷 Rasm yuborish')).body.text,'📷 Iltimos, ish joyidan rasm yuboring.');
  const states=await db.collection('telegramAttendanceState').get();assert.equal(states.size,1);assert.equal(states.docs[0].data().awaitingPhoto,true);
});
test('bot valid photo downloaded through file API and saved privately for admin attendance',async()=>{
  await photoWait();const payload=photoInput();assert.equal((await bot(payload)).body.text,'📷 Rasm saqlandi.');assert.equal(downloadCount,2);
  const photos=await db.collection('stage_photos').get();assert.equal(photos.size,1);const data=photos.docs[0].data();
  assert.equal(data.type,'keldi');assert.equal(data.ustaId,'w1');assert.equal(data.dateKey,'2026-10-12');assert.equal(data.source,'work_log');
  assert.ok(data.imageUrl.startsWith('private-storage:'));assert.equal(data.imageData,'');assert.equal(data.telegramUserId,undefined);
  const [bytes]=await createVpsStorage(mediaDir).file(data.storagePath).download();assert.deepEqual(bytes,validJpeg);
  assert.equal((await logOne()).data().telegramPhoto,photos.docs[0].id);
  await bot(payload);assert.equal(downloadCount,2);assert.equal((await db.collection('stage_photos').get()).size,1);
});
test('bot document/non-image DENY without download',async()=>{
  await photoWait();botDenied(await bot(botInput(undefined,123,{document:{file_id:'executable',mime_type:'image/jpeg'}})));assert.equal(downloadCount,0);
  assert.equal((await db.collection('stage_photos').get()).size,0);
});
for(const mode of ['spoofed-jpeg','unsafe-path','oversize'])test('bot photo safety DENY '+mode,async()=>{
  await photoWait();if(mode==='spoofed-jpeg')photoBytes=Buffer.from([255,216,255,0,255,217]);
  if(mode==='unsafe-path')fakeFilePath='../secret.jpg';if(mode==='oversize')declaredSize=MAX_TELEGRAM_IMAGE+1;
  await captureServerLogs(async()=>{const result=await bot(photoInput());assert.equal(result.code,503);assert.deepEqual(result.body,{error:'Linking unavailable'});});
  assert.equal((await db.collection('stage_photos').get()).size,0);assert.equal((await logOne()).data().image,null);
});
test('bot photo without waiting state DENY',async()=>{await linkBot();await completeCheckIn();const before=downloadCount;botDenied(await bot(photoInput()));assert.equal(downloadCount,before);});
test('bot expiry rejects old photo state',async()=>{
  await photoWait();const state=(await db.collection('telegramAttendanceState').get()).docs[0];await state.ref.update({expiresAt:0});
  botDenied(await bot(photoInput()));assert.equal(downloadCount,0);
});
test('bot disable during download DENY; no attachment is committed',async()=>{
  await photoWait();downloadHook=async()=>db.doc('workers/w1').update({disabled:true});
  botDenied(await bot(photoInput()));assert.equal((await db.collection('stage_photos').get()).size,0);assert.equal((await logOne()).data().image,null);
});
test('bot foreign account cannot use another worker photo state',async()=>{
  await photoWait();const payload=photoInput();payload.message.from.id=456;payload.message.chat.id=456;botDenied(await bot(payload));assert.equal(downloadCount,0);
});
for(const action of ['🟢 Keldim','🔴 Ketdim'])test('bot parallel five '+action+' -> one attendance row',async()=>{
  await linkBot();if(action==='🔴 Ketdim')await completeCheckIn();
  const results=await Promise.all(Array.from({length:5},()=>botText(action)));
  assert.ok(results.every(r=>r.code===200));if(action==='🟢 Keldim'){assert.equal((await db.collection('user_activity_logs').get()).size,0);const photos=await Promise.all(Array.from({length:5},()=>bot(photoInput())));assert.ok(photos.every(r=>r.code===200));assert.equal(photos.filter(r=>r.body.text==='🟢 Kelish qayd etildi.').length,1);}else assert.equal(results.filter(r=>r.body.text==='🔴 Ketish qayd etildi.').length,1);
  await logOne();
});
test('bot app attendance is reused, no parallel attendance system',async()=>{
  await linkBot();await db.doc('user_activity_logs/app-day').set({id:'app-day',ustaId:'w1',ustaName:'Worker One',dateKey:'2026-10-12',loginTime:'2026-10-12T03:00:00.000Z',logoutTime:null,workAttendance:true});
  await completeCheckIn();assert.equal((await logOne()).id,'app-day');await botText('🔴 Ketdim');assert.equal((await logOne()).id,'app-day');
});
test('bot login-only app row is upgraded to work attendance, not duplicated',async()=>{
  await linkBot();await db.doc('user_activity_logs/login-day').set({ustaId:'w1',dateKey:'2026-10-12',loginTime:'2026-10-12T02:00:00.000Z',logoutTime:null});
  assert.equal((await completeCheckIn()).body.text,'🟢 Kelish qayd etildi.');assert.equal((await logOne()).id,'login-day');assert.equal((await logOne()).data().workAttendance,true);
});
test('bot today reports Tashkent times/photo status without location',async()=>{
  await linkBot();assert.equal((await botText('📍 Bugungi holatim')).body.text,'📅 12.10.2026\n🟢 Keldi: —\n🔴 Ketdi: —\n📷 Rasm: yuborilmagan');
  await completeCheckIn();assert.ok((await botText('📍 Bugungi holatim')).body.text.includes('Keldi: 08:55'));
});
test('bot missing/invalid secret DENY before attendance writes',async()=>{
  for(const value of [null,'wrong'])assert.equal((await post(botInput('🟢 Keldim'),value,'/api/telegram/attendance')).code,403);
  assert.equal((await db.collection('user_activity_logs').get()).size,0);
});
test('admin attendance thumbnail uses existing authenticated PrivateMedia renderer',async()=>{
  const page=await readFile('src/pages/IshVaqtalariPage.jsx','utf8');assert.ok(page.includes('<PrivateMedia'));assert.ok(!page.includes('<a href={src}'));
});

for(const action of ['🟢 Keldim','🔴 Ketdim'])test('bot database rollback/recovery '+action,async()=>{
  await linkBot();if(action==='🔴 Ketdim')await completeCheckIn();const before=(await db.collection('user_activity_logs').get()).docs.map(doc=>doc.data());
  failureMode='transaction';await captureServerLogs(async()=>assert.equal((await botText(action)).code,503));failureMode=null;
  assert.deepEqual((await db.collection('user_activity_logs').get()).docs.map(doc=>doc.data()),before);
  assert.equal((await botText(action)).code,200);if(action==='🟢 Keldim')await bot(photoInput());await logOne();
});
test('bot parallel photo requests commit one attachment and clean losing private copy',async()=>{
  await photoWait();const before=(await readdir(mediaDir,{recursive:true})).filter(name=>name.endsWith('.jpg')).length;
  const payload=photoInput();const results=await Promise.all([bot(payload),bot(payload)]);assert.ok(results.every(r=>r.code===200));
  assert.equal((await db.collection('stage_photos').get()).size,1);
  const after=(await readdir(mediaDir,{recursive:true})).filter(name=>name.endsWith('.jpg')).length;assert.equal(after-before,1);
});
test('bot committed photo survives lost Firestore commit acknowledgement and retry',async()=>{
  await photoWait();const handler=createTelegramAttendanceHandler({now:()=>new Date('2026-10-12T03:55:00Z'),downloadPhoto:photoDownloader,getBucket:async()=>createVpsStorage(mediaDir)});
  let lose=true;const adapter={collection:name=>db.collection(name),runTransaction:async callback=>{
    const result=await db.runTransaction(callback);if(lose&&result.text==='📷 Rasm saqlandi.'){lose=false;throw new Error('Temporary unavailable');}return result;
  }};
  const payload=photoInput();await assert.rejects(handler(adapter,payload));
  const photos=await db.collection('stage_photos').get();assert.equal(photos.size,1);
  const [buffer]=await createVpsStorage(mediaDir).file(photos.docs[0].data().storagePath).download();assert.deepEqual(buffer,validJpeg);
  assert.equal((await handler(db,payload)).status,'duplicate');assert.equal((await db.collection('stage_photos').get()).size,1);
});
test('bot multiple legacy day records fail closed without choosing another session',async()=>{
  await linkBot();for(const id of ['one','two'])await db.doc('user_activity_logs/'+id).set({ustaId:'w1',dateKey:'2026-10-12',workAttendance:true,loginTime:'2026-10-12T03:00:00Z'});
  botDenied(await botText('🟢 Keldim'));botDenied(await botText('🔴 Ketdim'));assert.equal((await db.collection('user_activity_logs').get()).size,2);
});

test('admin/owner read Telegram photo through existing verified private media endpoint',async()=>{
  await photoWait();await bot(photoInput());const photo=(await db.collection('stage_photos').get()).docs[0].data();
  const endpoint=base+'/api/private-storage?path='+encodeURIComponent(photo.storagePath);
  for(const token of ['admin','worker-w1']){
    const response=await fetch(endpoint,{headers:{Authorization:'Bearer '+token}});assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'image/jpeg');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
    assert.equal(response.headers.get('cache-control'),'private, no-store');assert.deepEqual(Buffer.from(await response.arrayBuffer()),validJpeg);
  }
  assert.equal((await fetch(endpoint)).status,401);
  assert.equal((await fetch(endpoint,{headers:{Authorization:'Bearer worker-w2','x-role':'admin'}})).status,403);
});
test('existing admin attendance page JSX remains valid',async()=>{
  const page=await readFile('src/pages/IshVaqtalariPage.jsx','utf8');await transform(page,{loader:'jsx',jsx:'automatic'});
});

test('bot linked foreign account spoofed-target cannot write another worker attendance',async()=>{
  await linkBot();await db.doc('workers/w2').set({phone:otherPhone,status:'active',fullName:'Worker Two'});
  generic(await post(input(456,otherPhone)),456,success);
  const payload=botInput('🟢 Keldim',456);payload.workerId='w1';payload.firebaseUid='usta:w1';payload.message.workerId='w1';
  assert.equal((await bot(payload)).body.reply_markup.force_reply,true);const image=photoInput();image.message.from.id=456;image.message.chat.id=456;assert.equal((await bot(image)).body.text,'🟢 Kelish qayd etildi.');assert.equal((await logOne()).data().ustaId,'w2');
  assert.equal((await db.collection('user_activity_logs').where('ustaId','==','w1').get()).size,0);
});


const pendingArrival = async () => { await linkBot(); return botText('🟢 Keldim'); };
const attendanceCount = async () => (await db.collection('user_activity_logs').get()).size;
test('Keldim waits for check_in_photo; no photo means zero attendance',async()=>{
 const result=await pendingArrival();assert.equal(result.body.text,'📸 Ishga kelishni tasdiqlash uchun hozir kameradan yuzingiz tushgan rasm yuboring.');assert.equal(result.body.reply_markup.force_reply,true);
 const state=(await db.collection('telegramAttendanceState').get()).docs[0].data();assert.equal(state.pendingAction,'check_in_photo');assert.equal(state.awaitingPhoto,true);assert.equal(await attendanceCount(),0);
 botDenied(await botText('🔴 Ketdim'));assert.equal(await attendanceCount(),0);
 assert.ok((await botText('📍 Bugungi holatim')).body.text.includes('Keldi: —'));
});
test('pending Keldim non-image asks for face photo without attendance',async()=>{
 await pendingArrival();for(const extras of [{text:'hello'},{document:{file_id:'spoof',mime_type:'image/jpeg'}}]){
 const result=await bot(botInput(undefined,123,extras));assert.equal(result.body.text,'⚠️ Iltimos, yuzingiz tushgan rasm yuboring.');}
 assert.equal(await attendanceCount(),0);assert.equal(downloadCount,0);assert.equal((await bot(photoInput())).body.text,'🟢 Kelish qayd etildi.');await logOne();
});
test('pending Keldim valid private photo commits attendance and admin keldi schema together',async()=>{
 await pendingArrival();const payload=photoInput();assert.equal((await bot(payload)).body.text,'🟢 Kelish qayd etildi.');
 const log=(await logOne()).data(), photos=await db.collection('stage_photos').get();assert.equal(photos.size,1);const photo=photos.docs[0].data();assert.equal(photo.type,'keldi');assert.equal(photo.source,'work_log');assert.equal(log.image,photo.imageUrl);assert.equal(log.telegramPhoto,photo.id);assert.ok(photo.imageUrl.startsWith('private-storage:'));assert.ok(photo.storagePath.startsWith('private/w1/'));assert.equal(log.workerId,'w1');assert.equal(log.source,'telegram');assert.equal(typeof log.checkInAt.toMillis(),'number');
 const receipt=(await db.doc('telegramAttendanceUpdates/123_'+payload.update_id).get()).data();assert.equal(receipt.action,'check_in_photo');assert.equal(receipt.fileId,'test-photo-id');assert.equal(receipt.storagePath,photo.storagePath);
 await bot(payload);await bot(photoInput());assert.equal(await attendanceCount(),1);assert.equal((await db.collection('stage_photos').get()).size,1);
});
for(const kind of ['foreign','disabled','inactive'])test('pending Keldim photo security DENY '+kind,async()=>{
 await pendingArrival();const payload=photoInput();if(kind==='foreign'){payload.message.from.id=456;payload.message.chat.id=456;}else await db.doc('workers/w1').update(kind==='disabled'?{disabled:true}:{status:'inactive'});
 botDenied(await bot(payload));assert.equal(await attendanceCount(),0);assert.equal((await db.collection('stage_photos').get()).size,0);assert.equal(downloadCount,0);
});
test('pending Keldim disable during download leaves no attendance or private copy',async()=>{
 await pendingArrival();const before=(await readdir(mediaDir,{recursive:true})).filter(p=>p.endsWith('.jpg')).length;downloadHook=async()=>db.doc('workers/w1').update({disabled:true});botDenied(await bot(photoInput()));assert.equal(await attendanceCount(),0);assert.equal((await db.collection('stage_photos').get()).size,0);assert.equal((await readdir(mediaDir,{recursive:true})).filter(p=>p.endsWith('.jpg')).length,before);
});
test('pending Keldim spoofed image cannot create attendance',async()=>{
 await pendingArrival();photoBytes=Buffer.from([255,216,255,0,255,217]);await captureServerLogs(async()=>assert.equal((await bot(photoInput())).code,503));assert.equal(await attendanceCount(),0);assert.equal((await db.collection('stage_photos').get()).size,0);
});
test('pending Keldim expired state cannot create attendance',async()=>{
 await pendingArrival();const state=(await db.collection('telegramAttendanceState').get()).docs[0];await state.ref.update({expiresAt:0});botDenied(await bot(photoInput()));assert.equal(await attendanceCount(),0);assert.equal(downloadCount,0);
});
test('pending Keldim failed private save leaves zero attendance and retry succeeds',async()=>{
 await pendingArrival();const handler=createTelegramAttendanceHandler({now:()=>new Date('2026-10-12T03:55:00Z'),downloadPhoto:photoDownloader,getBucket:async()=>({adapter:'vps',file:()=>({save:async()=>{throw new Error('Storage unavailable');},delete:async()=>{}})})});
 await assert.rejects(handler(db,photoInput()));assert.equal(await attendanceCount(),0);assert.equal((await db.collection('stage_photos').get()).size,0);assert.equal((await bot(photoInput())).body.text,'🟢 Kelish qayd etildi.');await logOne();
});
test('pending Keldim transaction rollback cleans media and recovery commits once',async()=>{
 await pendingArrival();const before=(await readdir(mediaDir,{recursive:true})).filter(p=>p.endsWith('.jpg')).length;let fail=true;const handler=createTelegramAttendanceHandler({now:()=>new Date('2026-10-12T03:55:00Z'),downloadPhoto:photoDownloader,getBucket:async()=>createVpsStorage(mediaDir)});const adapter={collection:name=>db.collection(name),runTransaction:cb=>db.runTransaction(async tx=>{const result=await cb(tx);if(fail&&result.text==='🟢 Kelish qayd etildi.')throw new Error('Transaction unavailable');return result;})};await assert.rejects(handler(adapter,photoInput()));assert.equal(await attendanceCount(),0);assert.equal((await db.collection('stage_photos').get()).size,0);assert.equal((await readdir(mediaDir,{recursive:true})).filter(p=>p.endsWith('.jpg')).length,before);fail=false;assert.equal((await handler(adapter,photoInput())).text,'🟢 Kelish qayd etildi.');await logOne();
});

test('pending Keldim lost commit acknowledgement preserves photo and idempotent retry',async()=>{
 await pendingArrival();const handler=createTelegramAttendanceHandler({now:()=>new Date('2026-10-12T03:55:00Z'),downloadPhoto:photoDownloader,getBucket:async()=>createVpsStorage(mediaDir)});let lose=true;
 const adapter={collection:name=>db.collection(name),runTransaction:async cb=>{const result=await db.runTransaction(cb);if(lose&&result.text==='🟢 Kelish qayd etildi.'){lose=false;throw new Error('Temporary unavailable');}return result;}};
 const payload=photoInput();await assert.rejects(handler(adapter,payload));await logOne();const photos=await db.collection('stage_photos').get();assert.equal(photos.size,1);const [bytes]=await createVpsStorage(mediaDir).file(photos.docs[0].data().storagePath).download();assert.deepEqual(bytes,validJpeg);assert.equal((await handler(db,payload)).status,'duplicate');assert.equal(await attendanceCount(),1);
});
test('pending Keldim records photo completion time rather than button time',async()=>{
 await linkBot();let instant=new Date('2026-10-12T03:55:00Z');const handler=createTelegramAttendanceHandler({now:()=>instant,downloadPhoto:photoDownloader,getBucket:async()=>createVpsStorage(mediaDir)});
 assert.equal((await handler(db,botInput('🟢 Keldim'))).status,'pending');assert.equal(await attendanceCount(),0);instant=new Date('2026-10-12T04:00:00Z');await handler(db,photoInput());assert.equal((await logOne()).data().loginTime,'2026-10-12T04:00:00.000Z');
});
test('pending Keldim day rollover during download DENY and removes private photo',async()=>{
 await linkBot();const before=(await readdir(mediaDir,{recursive:true})).filter(p=>p.endsWith('.jpg')).length;let instant=new Date('2026-10-12T18:59:00Z');const handler=createTelegramAttendanceHandler({now:()=>instant,downloadPhoto:photoDownloader,getBucket:async()=>createVpsStorage(mediaDir)});await handler(db,botInput('🟢 Keldim'));downloadHook=async()=>{instant=new Date('2026-10-12T19:01:00Z');};assert.equal((await handler(db,photoInput())).status,'denied');assert.equal(await attendanceCount(),0);assert.equal((await readdir(mediaDir,{recursive:true})).filter(p=>p.endsWith('.jpg')).length,before);
});
