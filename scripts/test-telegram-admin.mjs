import test from 'node:test';
import assert from 'node:assert/strict';
import { handleTelegramAdmin, parseTelegramAdminIds } from '../server/telegram/adminPanel.js';

const adminUpdate = (text, id = 111) => ({ message: { from: { id }, chat: { id, type: 'private' }, text } });

test('admin Telegram IDlari qat’iy tekshiriladi', () => {
  assert.deepEqual([...parseTelegramAdminIds('111, 222;0 -5 abc 9007199254740992')], ['111', '222']);
});

test('ruxsatli /admin faqat Web App tugmasini chiqaradi', async () => {
  const result = await handleTelegramAdmin(null, adminUpdate('/admin'), { env: {
    TELEGRAM_ADMIN_IDS: '111,222', TELEGRAM_ADMIN_WEBAPP_URL: 'https://api.example.uz/api/telegram/admin/app',
  } });
  assert.equal(result.reply_markup.inline_keyboard[0][0].text, 'Admin panelni ochish');
  assert.deepEqual(result.reply_markup.inline_keyboard[0][0].web_app, { url: 'https://api.example.uz/api/telegram/admin/app' });
  assert.equal(result.reply_markup.keyboard, undefined);
  const denied = await handleTelegramAdmin(null, adminUpdate('/admin', 333), { env: {
    TELEGRAM_ADMIN_IDS: '111,222', TELEGRAM_ADMIN_WEBAPP_URL: 'https://api.example.uz/api/telegram/admin/app',
  } });
  assert.match(denied.text, /ruxsat yo‘q/i);
  const unconfigured = await handleTelegramAdmin(null, adminUpdate('/admin', 111), { env: { TELEGRAM_ADMIN_IDS: '111' } });
  assert.equal(unconfigured.status, 'unavailable');
  assert.equal(unconfigured.reply_markup, undefined);
});

test('Web App manzili HTTPS bo‘lmasa admin tugmasi berilmaydi', async () => {
  const invalid = await handleTelegramAdmin(null, adminUpdate('/admin'), { env: {
    TELEGRAM_ADMIN_IDS: '111', TELEGRAM_ADMIN_WEBAPP_URL: 'http://api.example.uz/api/telegram/admin/app',
  } });
  assert.equal(invalid.status, 'unavailable');
  assert.equal(invalid.reply_markup, undefined);
  const withQuery = await handleTelegramAdmin(null, adminUpdate('/admin'), { env: {
    TELEGRAM_ADMIN_IDS: '111', TELEGRAM_ADMIN_WEBAPP_URL: 'https://api.example.uz/api/telegram/admin/app?token=secret',
  } });
  assert.equal(withQuery.status, 'unavailable');
  assert.equal(withQuery.reply_markup, undefined);
});

test('boshqa xabarlar, botlar va guruhdagi buyruqlar admin Web Appni ochmaydi', async () => {
  const env = { TELEGRAM_ADMIN_IDS: '111', TELEGRAM_ADMIN_WEBAPP_URL: 'https://api.example.uz/api/telegram/admin/app' };
  assert.equal(await handleTelegramAdmin(null, adminUpdate('salom'), { env }), null);
  assert.equal(await handleTelegramAdmin(null, { message: { ...adminUpdate('/admin').message, from: { id: 111, is_bot: true } } }, { env }), null);
  assert.equal(await handleTelegramAdmin(null, { message: { ...adminUpdate('/admin').message, chat: { id: -1, type: 'group' } } }, { env }), null);
});
