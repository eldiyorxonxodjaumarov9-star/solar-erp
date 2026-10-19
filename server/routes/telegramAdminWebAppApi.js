import { Router, json } from 'express';
import { fileURLToPath } from 'node:url';
import { getServerAdminDb } from '../firebaseAdminAuth.js';
import { verifyMiniAppInitData } from '../telegram/cameraSecurity.js';
import { parseTelegramAdminIds } from '../telegram/adminPanel.js';
import { activeAccount } from '../accountSecurity.js';
import { createWorkerProfile } from '../workerService.js';

const webRoot = fileURLToPath(new URL('../web/telegram-admin/', import.meta.url));
const fail = (res, status = 403) => res.status(status).json({ ok: false, error: 'Amal bajarilmadi.' });
const allowedCreateFields = new Set([
  'fullName', 'phone', 'position', 'login', 'password', 'salary',
  'workingDays', 'salaryEffectiveDate', 'experienceYears', 'rating',
]);

function createRateLimiter({ now, max, windowMs }) {
  const requests = new Map();
  return (req, res, next) => {
    const key = String(req.telegramAdminId || 'unknown');
    const current = now();
    let record = requests.get(key);
    if (!record || record.until <= current) record = { until: current + windowMs, count: 0 };
    record.count++;
    requests.set(key, record);
    if (requests.size > 1000) {
      for (const [id, item] of requests) if (item.until <= current) requests.delete(id);
    }
    if (record.count > max) return fail(res, 429);
    next();
  };
}

export function createTelegramAdminWebAppRouter({ getDb = getServerAdminDb, env = process.env, now = () => Date.now() } = {}) {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  router.get('/app', (_req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' https://telegram.org; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors https://web.telegram.org https://*.telegram.org; base-uri 'none'; form-action 'none'");
    res.sendFile('index.html', { root: webRoot });
  });
  router.get('/assets/:file', (req, res) => {
    if (!['app.js', 'style.css'].includes(req.params.file)) return res.sendStatus(404);
    res.sendFile(req.params.file, { root: `${webRoot}/assets` });
  });

  const authenticateAdmin = (req, res, next) => {
    try {
      if (!req.is('application/json') || !req.body || typeof req.body.initData !== 'string') return fail(res);
      const identity = verifyMiniAppInitData(req.body.initData, env.TELEGRAM_BOT_TOKEN, now());
      if (!parseTelegramAdminIds(env.TELEGRAM_ADMIN_IDS).has(identity)) return fail(res);
      req.telegramAdminId = identity;
      next();
    } catch {
      return fail(res);
    }
  };
  const listRate = createRateLimiter({ now, max: 60, windowMs: 60_000 });
  const createRate = createRateLimiter({ now, max: 5, windowMs: 60_000 });

  router.post('/employees/list', json({ limit: '8kb' }), authenticateAdmin, listRate, async (req, res) => {
    if (Object.keys(req.body).some(key => key !== 'initData')) return fail(res, 400);
    try {
      const db = await getDb();
      const [workers, legacyUsers] = await Promise.all([
        db.collection('workers').get(), db.collection('users').get(),
      ]);
      const byId = new Map();
      for (const doc of workers.docs) byId.set(doc.id, { id: doc.id, data: doc.data() || {} });
      for (const doc of legacyUsers.docs) if (!byId.has(doc.id)) byId.set(doc.id, { id: doc.id, data: doc.data() || {} });
      const employees = await Promise.all([...byId.values()].map(async item => {
        let telegramLinked = false;
        const reverse = await db.collection('telegramWorkerLinks').doc(item.id).get();
        const mapping = reverse.exists ? reverse.data() || {} : {};
        if (mapping.workerId === item.id && mapping.status === 'linked' && /^\d+$/.test(String(mapping.telegramUserId || ''))) {
          const forward = await db.collection('telegramLinks').doc(String(mapping.telegramUserId)).get();
          const forwardData = forward.exists ? forward.data() || {} : {};
          telegramLinked = forwardData.workerId === item.id && forwardData.status === 'linked';
        }
        return {
          id: item.id,
          name: String(item.data.fullName || item.data.name || 'Nomsiz xodim').replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120),
          active: activeAccount(item.data),
          telegramLinked,
        };
      }));
      employees.sort((a, b) => a.name.localeCompare(b.name, 'uz'));
      return res.json({ ok: true, employees });
    } catch {
      return res.status(503).json({ ok: false, error: 'Xodimlar olinmadi.' });
    }
  });

  router.post('/employees', json({ limit: '12kb' }), authenticateAdmin, createRate, async (req, res) => {
    if (Object.keys(req.body).some(key => key !== 'initData' && !allowedCreateFields.has(key))) return fail(res, 400);
    try {
      const { initData: _initData, ...workerInput } = req.body;
      const worker = await createWorkerProfile(await getDb(), workerInput);
      return res.status(201).json({ ok: true, employee: {
        id: worker.id,
        name: worker.fullName,
        active: true,
        telegramLinked: false,
      } });
    } catch (error) {
      const known = new Set([
        'Ism familiya, telefon, lavozim va login majburiy.',
        'Xodim ma’lumotlari yoki telefon raqami noto‘g‘ri.',
        'Parol majburiy.',
        'Oylik ish haqi majburiy.',
        'Oylik 0 yoki undan katta son bo‘lishi kerak.',
        'Ish kunlari musbat butun son bo‘lishi kerak.',
        'Stavka amal qilish sanasi majburiy.',
        'Bu login band. Boshqa login tanlang.',
        'Bu telefon raqami bilan xodim mavjud.',
        'Oylik ish haqi 0 yoki undan katta son bo‘lishi kerak.',
        'Oydagi ish kunlari soni musbat butun son bo‘lishi kerak.',
        'Stavka amal qilish sanasini to‘g‘ri kiriting.',
      ]);
      return res.status(400).json({ ok: false, error: known.has(error?.message) ? error.message : 'Xodim saqlanmadi.' });
    }
  });

  router.use((error, _req, res, _next) => {
    if (error?.type === 'entity.too.large') return fail(res, 413);
    return fail(res, 400);
  });
  return router;
}
