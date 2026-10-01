/**
 * Backend Telegram config.
 *
 * Priority: `process.env` (set via repo root `.env`) overrides file placeholders.
 * Server environment only. Rotation requires restarting every server/poller.
 *
 * Env keys: TELEGRAM_BOT_TOKEN, TELEGRAM_GROUP_ID
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

/** @type {string} */
export const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN?.trim() || "";

/** @type {string} */
export const TELEGRAM_GROUP_ID =
  process.env.TELEGRAM_GROUP_ID?.trim() || "";

/**
 * @returns {{ token: string; chatId: string } | null}
 */
export function readTelegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_GROUP_ID?.trim();
  if (!token || !chatId) {
    return null;
  }
  return { token, chatId };
}
