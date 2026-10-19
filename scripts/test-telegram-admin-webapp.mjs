import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import express from 'express';
import { createTelegramAdminWebAppRouter } from '../server/routes/telegramAdminWebAppApi.js';
import { verifyPasswordHash } from '../server/passwordHash.js';

const TOKEN = 'test-only-bot-token';
const NOW = Date.UTC(2026, 9, 19, 12, 0, 0);
const SECRET = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
const snapshot = (id, value) => ({ id, exists: value !== undefined, data: () => value });

function makeInitData(id = 111, { authDate = Math.floor(NOW / 1000), alterHash = false } = {}) {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: 'test-query',
    user: JSON.stringify({ id, first_name: 'Admin' }),
  });
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const hash = createHmac('sha256', SECRET).update(check).digest('hex');
  params.set('hash', alterHash ? `${hash.slice(0, -1)}${hash.endsWith('0') ? '1' : '0'}` : hash);
  return params.toString();
}

function makeDb(seed = {}) {
  const records = new Map(Object.entries(seed).map(([name, entries]) => [name, new Map(entries)]));
  let nextId = 0;
  let reads = 0;
  const collection = name => ({
    kind: 'collection', name,
    get: async () => ({ docs: [...(records.get(name) || new Map())].map(([id, value]) => snapshot(id, value)) }),
    doc(id) {
      const key = id ?? `generated-${++nextId}`;
      return {
        kind: 'document', name, id: key,
        get: async () => snapshot(key, records.get(name)?.get(key)),
      };
    },
  });
  return {
    collection,
    get reads() { return reads; },
    records,
    async runTransaction(callback) {
      const writes = [];
      const tx = {
        async get(ref) {
          reads++;
          if (ref.kind === 'collection') return { docs: [...(records.get(ref.name) || new Map())].map(([id, value]) => snapshot(id, value)) };
          return snapshot(ref.id, records.get(ref.name)?.get(ref.id));
        },
        create(ref, value) { writes.push(['create', ref, value]); },
        set(ref, value) { writes.push(['set', ref, value]); },
      };
      const result = await callback(tx);
      for (const [, ref, value] of writes) {
        if (!records.has(ref.name)) records.set(ref.name, new Map());
        if (records.get(ref.name).has(ref.id) && writes.some(([kind, candidate]) => kind === 'create' && candidate === ref)) throw new Error('ALREADY_EXISTS');
        records.get(ref.name).set(ref.id, value);
      }
      return result;
    },
  };
}

async function withApi({ db = makeDb(), env = { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_ADMIN_IDS: '111' }, now = () => NOW } = {}, run) {
  const app = express();
  app.use('/api/telegram/admin', createTelegramAdminWebAppRouter({ getDb: async () => db, env, now }));
  let server, lastError;
  for (let attempt = 0; attempt < 8 && !server; attempt++) {
    const port = 42000 + Math.floor(Math.random() * 12000);
    try {
      server = await new Promise((resolve, reject) => {
        const instance = app.listen(port, '127.0.0.1', () => resolve(instance));
        instance.once('error', reject);
      });
    } catch (error) { lastError = error; }
  }
  if (!server) throw lastError || new Error('Test HTTP server could not start.');
  const address = server.address();
  try { await run(`http://127.0.0.1:${address.port}`, db); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

async function post(base, path, body) {
  const response = await fetch(base + path, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test('Web App sahifasi Telegram ichida ochiladigan, keshdan saqlanadigan sarlavhalar bilan beriladi', async () => {
  await withApi({}, async base => {
    const response = await fetch(base + '/api/telegram/admin/app');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors https:\/\/web\.telegram\.org/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(await response.text(), /Xodimlar/);
  });
});

test('imzolangan admin initData har bir ro‘yxat so‘rovida tekshiriladi va faqat xavfsiz xodim maydonlari qaytadi', async () => {
  const db = makeDb({
    workers: [['w1', { fullName: 'Ali Valiyev', salary: 900000, phone: '+998901234567', status: 'active', password: 'do-not-return' }]],
    users: [['w1', { fullName: 'Legacy copy' }], ['w2', { name: 'Vali Aliyev', disabled: true }]],
    telegramWorkerLinks: [['w1', { workerId: 'w1', telegramUserId: '777', status: 'linked' }]],
    telegramLinks: [['777', { workerId: 'w1', status: 'linked' }]],
  });
  await withApi({ db }, async base => {
    const ok = await post(base, '/api/telegram/admin/employees/list', { initData: makeInitData() });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.employees, [
      { id: 'w1', name: 'Ali Valiyev', active: true, telegramLinked: true },
      { id: 'w2', name: 'Vali Aliyev', active: false, telegramLinked: false },
    ]);
    assert.doesNotMatch(JSON.stringify(ok.body), /900000|\+998|do-not-return|777|password/);
    const tampered = await post(base, '/api/telegram/admin/employees/list', { initData: makeInitData(111, { alterHash: true }) });
    assert.equal(tampered.status, 403);
    const nonAdmin = await post(base, '/api/telegram/admin/employees/list', { initData: makeInitData(222) });
    assert.equal(nonAdmin.status, 403);
  });
});

test('eski yoki imzosiz initData worker bazasiga murojaat qilmaydi', async () => {
  const db = makeDb();
  await withApi({ db }, async base => {
    assert.equal((await post(base, '/api/telegram/admin/employees/list', {})).status, 403);
    assert.equal((await post(base, '/api/telegram/admin/employees/list', { initData: makeInitData(111, { authDate: Math.floor(NOW / 1000) - 301 }) })).status, 403);
    assert.equal(db.reads, 0);
  });
});

test('admin Web App xodimni mavjud workers va credential modeliga yaratib, salary qoidasini ishlatadi', async () => {
  const db = makeDb();
  await withApi({ db }, async base => {
    const result = await post(base, '/api/telegram/admin/employees', {
      initData: makeInitData(), fullName: 'Dilshod Usta', phone: '90 123 45 67',
      position: 'Montajchi', login: 'dilshod', password: 'test-password',
      salary: 100000, workingDays: 25, salaryEffectiveDate: '2026-10-01', experienceYears: '2', rating: '4.5',
    });
    assert.equal(result.status, 201);
    const worker = [...db.records.get('workers').values()][0];
    const credential = [...db.records.get('accountCredentials').values()][0];
    assert.equal(worker.fullName, 'Dilshod Usta');
    assert.equal(worker.phone, '+998901234567');
    assert.equal(worker.dailySalary, 4000);
    assert.equal(worker.salaryHistory.length, 1);
    assert.equal(worker.telegramUserId, undefined);
    assert.equal(worker.telegramUsername, undefined);
    assert.equal(verifyPasswordHash('test-password', credential), true);
    assert.equal(JSON.stringify(result.body).includes('test-password'), false);
  });
});

test('xodim yaratishning majburiy maydonlari, dublikat login/telefon va bog‘lash maydonlari serverda rad etiladi', async () => {
  const db = makeDb({ workers: [['existing', { login: 'band', phone: '+998901234567' }]] });
  await withApi({ db }, async base => {
    const baseInput = {
      initData: makeInitData(), fullName: 'Yangi xodim', phone: '+998901234568',
      position: 'Usta', login: 'yangi', password: 'test-password',
      salary: 100000, workingDays: 26, salaryEffectiveDate: '2026-10-01',
    };
    assert.equal((await post(base, '/api/telegram/admin/employees', { ...baseInput, phone: '+998901234567' })).status, 400);
    assert.equal((await post(base, '/api/telegram/admin/employees', { ...baseInput, login: 'band' })).status, 400);
    assert.equal((await post(base, '/api/telegram/admin/employees', { ...baseInput, salaryEffectiveDate: '' })).status, 400);
    assert.equal((await post(base, '/api/telegram/admin/employees', { ...baseInput, telegramUserId: '777' })).status, 400);
    assert.equal(db.records.get('workers').size, 1);
    assert.equal(db.records.has('accountCredentials'), false);
  });
});
