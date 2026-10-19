import { tashkentTodayYMD } from '../../src/photos/tashkentTime.js';

const ADMIN_MENU = {
  keyboard: [['👥 Xodimlar'], ['🔗 Hisobni ulash'], ['📊 Davomat']],
  resize_keyboard: true,
};
const BACK_MENU = { keyboard: [['⬅️ Admin menyusi']], resize_keyboard: true };
const clean = value => String(value || '').replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80);
const reply = (text, reply_markup = ADMIN_MENU) => ({ status: 'admin', text, reply_markup });
const command = text => /^\/admin(?:@[A-Za-z0-9_]+)?(?:\s|$)/.test(String(text || ''));
const positiveTelegramId = value => /^\d{1,16}$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
const activeAccount = data => !!data && data.disabled !== true && !['inactive', 'noaktiv', 'off', 'disabled'].includes(String(data.status || 'active').toLowerCase());

export function parseTelegramAdminIds(value) {
  return new Set(String(value || '').split(/[\s,;]+/).filter(positiveTelegramId));
}

async function collectEmployees(db) {
  const [workers, users] = await Promise.all([
    db.collection('workers').get(), db.collection('users').get(),
  ]);
  const byId = new Map();
  for (const doc of workers.docs) byId.set(doc.id, { id: doc.id, data: doc.data(), source: 'workers' });
  for (const doc of users.docs) if (!byId.has(doc.id)) byId.set(doc.id, { id: doc.id, data: doc.data(), source: 'users' });
  return [...byId.values()].sort((a, b) => clean(a.data.fullName || a.data.name).localeCompare(clean(b.data.fullName || b.data.name), 'uz'));
}

async function listEmployees(db, page) {
  const all = await collectEmployees(db);
  const start = page * 25;
  const items = all.slice(start, start + 25);
  const linkedLines = [], unlinkedLines = [];
  const lines = await Promise.all(items.map(async item => {
    const reverse = await db.collection('telegramWorkerLinks').doc(item.id).get();
    let linked = false;
    if (reverse.exists && reverse.data()?.workerId === item.id && /^\d+$/.test(String(reverse.data()?.telegramUserId || ''))) {
      const forward = await db.collection('telegramLinks').doc(String(reverse.data().telegramUserId)).get();
      linked = forward.exists && forward.data()?.workerId === item.id && forward.data()?.status === 'linked';
    }
    const name = clean(item.data.fullName || item.data.name) || 'Nomsiz xodim';
    return { linked, line: `${activeAccount(item.data) ? 'Faol' : 'Faol emas'} · ${name}` };
  }));
  for (const item of lines) (item.linked ? linkedLines : unlinkedLines).push(item.line);
  const hasNext = start + items.length < all.length;
  const sections = `Ulangan (${linkedLines.length}):\n${linkedLines.join('\n') || '—'}\n\nUlanmagan (${unlinkedLines.length}):\n${unlinkedLines.join('\n') || '—'}`;
  return {
    text: all.length ? `Xodimlar: ${all.length} ta\n\n${sections}${hasNext ? '\n\nKeyingi sahifa uchun “➡️ Keyingi xodimlar”ni bosing.' : ''}` : 'Xodimlar topilmadi.',
    hasNext,
  };
}

async function linkOverview(db) {
  const [employees, mappings, reviews] = await Promise.all([
    collectEmployees(db), db.collection('telegramWorkerLinks').get(),
    db.collection('telegramLinkReviews').where('status', '==', 'admin_review').limit(100).get(),
  ]);
  const byWorker = new Map(employees.map(item => [item.id, item]));
  const linked = new Set();
  for (const reverse of mappings.docs) {
    const data = reverse.data() || {}, workerId = data.workerId;
    if (!byWorker.has(workerId) || data.status !== 'linked' || reverse.id !== workerId || !/^\d+$/.test(String(data.telegramUserId || ''))) continue;
    const forward = await db.collection('telegramLinks').doc(String(data.telegramUserId)).get();
    if (forward.exists && forward.data()?.workerId === workerId && forward.data()?.status === 'linked') linked.add(workerId);
  }
  const reviewsCount = reviews.size ?? reviews.docs.length;
  return reply(`Hisobni ulash\nUlangan xodimlar: ${linked.size}\nUlanmagan xodimlar: ${Math.max(0, employees.length - linked.size)}\nKo‘rib chiqilishi kerak bo‘lgan so‘rovlar: ${reviewsCount}\n\nXodim o‘z Telegram hisobidan /start yuborib, shaxsiy telefon kontaktini tasdiqlasin. Admin boshqa shaxs nomidan hisobni ulay olmaydi.`, BACK_MENU);
}

async function attendanceOverview(db) {
  const today = tashkentTodayYMD();
  const records = await db.collection('user_activity_logs').where('dateKey', '==', today).get();
  const byWorker = new Map();
  for (const doc of records.docs) {
    const record = doc.data() || {}, workerId = String(record.ustaId || record.workerId || doc.id);
    const entries = byWorker.get(workerId) || [];
    entries.push(record);
    byWorker.set(workerId, entries);
  }
  let arrived = 0, left = 0, dayOff = 0, review = 0;
  for (const entries of byWorker.values()) {
    if (entries.length !== 1) { review++; continue; }
    const record = entries[0];
    if (record.type === 'day_off' || record.dayOff === true) dayOff++;
    else if (record.loginTime && record.workAttendance === true) {
      arrived++;
      if (record.logoutTime) left++;
    }
  }
  return reply(`Bugungi davomat · ${today}\nKelgan: ${arrived}\nKetgan: ${left}\nDam olish: ${dayOff}${review ? `\nTekshirish kerak: ${review}` : ''}`, BACK_MENU);
}

// Returns null for ordinary employee updates so the existing linking/attendance handler remains authoritative.
export async function handleTelegramAdmin(db, update, { env = process.env } = {}) {
  const message = update?.message;
  const id = message?.from?.id;
  const text = String(message?.text || '').trim();
  if (!Number.isSafeInteger(id) || id <= 0 || message?.from?.is_bot ||
      message?.chat?.type !== 'private' || message.chat.id !== id) return null;
  const isCommand = command(text);
  if (!isCommand && !['👥 Xodimlar', '🔗 Hisobni ulash', '📊 Davomat', '⬅️ Admin menyusi', '➡️ Keyingi xodimlar'].includes(text)) return null;
  const admins = parseTelegramAdminIds(env.TELEGRAM_ADMIN_IDS);
  if (!admins.has(String(id))) return isCommand ? reply('Admin panelidan foydalanish uchun ruxsat yo‘q.', { remove_keyboard: true }) : null;
  if (isCommand || text === '⬅️ Admin menyusi') return reply('Admin menyusi. Kerakli bo‘limni tanlang.');
  if (text === '👥 Xodimlar' || text === '➡️ Keyingi xodimlar') {
    const sessionRef = db.collection('telegramAdminSessions').doc(String(id));
    const state = (await sessionRef.get()).data() || {};
    const page = text === '➡️ Keyingi xodimlar' && state.expiresAt > Date.now() ? Math.min(1000, Math.max(0, Number(state.employeePage) || 0) + 1) : 0;
    const result = await listEmployees(db, page);
    await sessionRef.set({ employeePage: result.hasNext ? page : 0, expiresAt: Date.now() + 15 * 60_000, updatedAt: new Date().toISOString() }, { merge: true });
    return reply(result.text, result.hasNext ? { keyboard: [['➡️ Keyingi xodimlar'], ['⬅️ Admin menyusi']], resize_keyboard: true } : BACK_MENU);
  }
  if (text === '🔗 Hisobni ulash') return linkOverview(db);
  if (text === '📊 Davomat') return attendanceOverview(db);
  return null;
}
