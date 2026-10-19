import test from 'node:test';
import assert from 'node:assert/strict';
import { handleTelegramAdmin, parseTelegramAdminIds } from '../server/telegram/adminPanel.js';

const adminUpdate = (text, id = 111) => ({ message: { from: { id }, chat: { id, type: 'private' }, text } });
const snap = (id, value) => ({ id, exists: value !== undefined, data: () => value });

function fakeDb({ workers = [], users = [], telegramWorkerLinks = [], telegramLinks = [], activity = [] } = {}) {
  const collections = { workers, users, telegramWorkerLinks, telegramLinks, user_activity_logs: activity };
  return {
    collection(name) {
      const docs = (collections[name] || []).map(([id, value]) => snap(id, value));
      return {
        get: async () => ({ docs, size: docs.length }),
        doc(id) {
          const value = (collections[name] || []).find(([key]) => key === id)?.[1];
          return { get: async () => snap(id, value), set: async () => {} };
        },
        where() { return { limit() { return { get: async () => ({ docs: [], size: 0 }) }; }, get: async () => ({ docs, size: docs.length }) }; },
      };
    },
  };
}

test('admin Telegram IDlari qat’iy tekshiriladi', () => {
  assert.deepEqual([...parseTelegramAdminIds('111, 222;0 -5 abc 9007199254740992')], ['111', '222']);
});

test('faqat ruxsat ro‘yxatidagi shaxs /admin menyusini ochadi', async () => {
  const db = fakeDb();
  const result = await handleTelegramAdmin(db, adminUpdate('/admin'), { env: { TELEGRAM_ADMIN_IDS: '111,222' } });
  assert.match(result.text, /Admin menyusi/);
  assert.deepEqual(result.reply_markup.keyboard, [['👥 Xodimlar'], ['🔗 Hisobni ulash'], ['📊 Davomat']]);
  const denied = await handleTelegramAdmin(db, adminUpdate('/admin', 333), { env: { TELEGRAM_ADMIN_IDS: '111,222' } });
  assert.match(denied.text, /ruxsat yo‘q/i);
  const unconfigured = await handleTelegramAdmin(db, adminUpdate('/admin', 111), { env: {} });
  assert.match(unconfigured.text, /ruxsat yo‘q/i);
});

test('xodimlar bo‘limi workers profilini ustun qo‘yib users dublikatini chiqarib tashlaydi, maxfiy ma’lumotlar berilmaydi', async () => {
  const db = fakeDb({
    workers: [['w1', { fullName: 'Ali Valiyev', phone: '+998901234567', salary: 999999, status: 'active' }]],
    users: [['w1', { fullName: 'Eski nusxa', phone: '+998901234567', salary: 999999 }], ['w2', { name: 'Vali Aliyev', status: 'active' }]],
    telegramWorkerLinks: [['w1', { workerId: 'w1', telegramUserId: '777', status: 'linked' }]],
    telegramLinks: [['777', { workerId: 'w1', status: 'linked' }]],
  });
  const result = await handleTelegramAdmin(db, adminUpdate('👥 Xodimlar'), { env: { TELEGRAM_ADMIN_IDS: '111' } });
  assert.match(result.text, /Xodimlar: 2 ta/);
  assert.match(result.text, /Ulangan \(1\):[\s\S]*Faol · Ali Valiyev/);
  assert.match(result.text, /Ulanmagan \(1\):[\s\S]*Faol · Vali Aliyev/);
  assert.doesNotMatch(result.text, /999999|\+998|Eski nusxa|777/);
});

test('Hisobni ulash va Davomat bo‘limlari faqat ruxsatli admin uchun javob qaytaradi', async () => {
  const db = fakeDb({ workers: [['w1', { fullName: 'Ali' }]] });
  const env = { TELEGRAM_ADMIN_IDS: '111' };
  const linking = await handleTelegramAdmin(db, adminUpdate('🔗 Hisobni ulash'), { env });
  assert.match(linking.text, /Ulangan xodimlar: 0/);
  assert.match(linking.text, /Xodim o‘z Telegram hisobidan \/start/);
  const attendance = await handleTelegramAdmin(db, adminUpdate('📊 Davomat'), { env });
  assert.match(attendance.text, /Bugungi davomat/);
  assert.match(attendance.text, /Kelgan: 0/);
  assert.equal(await handleTelegramAdmin(db, adminUpdate('📊 Davomat', 999), { env }), null);
});

test('Davomat bo‘limi ziddiyatli ko‘p yozuvni taxmin bilan hisoblamaydi', async () => {
  const db = fakeDb({ activity: [
    ['a', { ustaId: 'w1', dateKey: '2026-10-19', loginTime: '08:00', workAttendance: true }],
    ['b', { ustaId: 'w1', dateKey: '2026-10-19', type: 'day_off', dayOff: true }],
  ] });
  const result = await handleTelegramAdmin(db, adminUpdate('📊 Davomat'), { env: { TELEGRAM_ADMIN_IDS: '111' } });
  assert.match(result.text, /Kelgan: 0/);
  assert.match(result.text, /Dam olish: 0/);
  assert.match(result.text, /Tekshirish kerak: 1/);
});

test('admin handler oddiy xabar va shaxsiy kontakt orqali linking oqimiga tegmaydi', async () => {
  const db = fakeDb();
  assert.equal(await handleTelegramAdmin(db, adminUpdate('👥 Xodimlar', 333), { env: { TELEGRAM_ADMIN_IDS: '111' } }), null);
  const contact = await handleTelegramAdmin(db, { message: { from: { id: 111 }, chat: { id: 111, type: 'private' }, contact: { user_id: 111, phone_number: '+998901234567' } } }, { env: { TELEGRAM_ADMIN_IDS: '111' } });
  assert.equal(contact, null);
});
