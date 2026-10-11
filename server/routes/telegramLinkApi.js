import { Router, json } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { getServerAdminDb } from '../firebaseAdminAuth.js';
import { handleTelegramLink } from '../telegram/linking.js';

export function createTelegramLinkRouter({ getDb = getServerAdminDb, env = process.env, handleUpdate = handleTelegramLink } = {}) {
  const router = Router();
  router.post('/', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const secret = String(env.TELEGRAM_WEBHOOK_SECRET || '');
    const provided = String(req.get('x-telegram-bot-api-secret-token') || '');
    if (!secret || Buffer.byteLength(secret) !== Buffer.byteLength(provided) ||
        !timingSafeEqual(Buffer.from(secret), Buffer.from(provided))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!req.is('application/json')) return res.status(400).json({ error: 'Invalid request' });
    next();
  }, json({ limit: '16kb' }), async (req, res) => {
    const message = req.body?.message;
    const chatId = message?.chat?.id;
    if (!Number.isSafeInteger(chatId) || chatId <= 0 || message?.chat?.type !== 'private' ||
        chatId !== message?.from?.id || message?.from?.is_bot) return res.json({ ok: true });
    try {
      const result = await handleUpdate(await getDb(), req.body);
      return res.json({ method: 'sendMessage', chat_id: chatId, text: result.text,
        ...(result.reply_markup ? { reply_markup: result.reply_markup } : {}) });
    } catch { return res.status(503).json({ error: 'Linking unavailable' }); }
  });
  router.use((error, _req, res, _next) => {
    if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Invalid request' });
    return res.status(400).json({ error: 'Invalid request' });
  });
  return router;
}
