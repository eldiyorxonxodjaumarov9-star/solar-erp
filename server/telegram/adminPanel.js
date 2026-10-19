const command = text => /^\/admin(?:@[A-Za-z0-9_]+)?(?:\s|$)/.test(String(text || '').trim());
const positiveTelegramId = value => /^\d{1,16}$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;

export function parseTelegramAdminIds(value) {
  return new Set(String(value || '').split(/[\s,;]+/).filter(positiveTelegramId));
}

function validWebAppUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash ? url.href : null;
  } catch {
    return null;
  }
}

// This handler intentionally keeps the bot interaction to one command and one Web App button.
export async function handleTelegramAdmin(_db, update, { env = process.env } = {}) {
  const message = update?.message;
  const id = message?.from?.id;
  if (!Number.isSafeInteger(id) || id <= 0 || message?.from?.is_bot ||
      message?.chat?.type !== 'private' || message.chat.id !== id || !command(message.text)) return null;

  if (!parseTelegramAdminIds(env.TELEGRAM_ADMIN_IDS).has(String(id))) {
    return { status: 'denied', text: 'Admin panelidan foydalanish uchun ruxsat yo‘q.', reply_markup: { remove_keyboard: true } };
  }

  const url = validWebAppUrl(env.TELEGRAM_ADMIN_WEBAPP_URL);
  if (!url) {
    return { status: 'unavailable', text: 'Admin panel hozircha sozlanmagan. Administrator server sozlamasini tekshirsin.' };
  }

  return {
    status: 'admin',
    text: 'Xodimlarni boshqarish uchun admin panelni oching.',
    reply_markup: { inline_keyboard: [[{ text: 'Admin panelni ochish', web_app: { url } }]] },
  };
}
