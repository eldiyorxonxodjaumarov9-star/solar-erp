/**
 * Backend Telegram config.
 *
 * Priority: `process.env` (set via repo root `.env`) overrides file placeholders.
 * Replace placeholders below only for local testing — never commit real secrets.
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
  process.env.TELEGRAM_BOT_TOKEN?.trim() || "8692284207:AAG5D8Nd0F0kmQOkez6CFc2WC6xgm3UG-0k";

/** @type {string} */
export const TELEGRAM_GROUP_ID =
  process.env.TELEGRAM_GROUP_ID?.trim() || "-1003394729742";

const PLACEHOLDER_TOKEN = "8692284207:AAG5D8Nd0F0kmQOkez6CFc2WC6xgm3UG-0k";
const PLACEHOLDER_GROUP = "-1003394729742";

/**
 * @returns {{ token: string; chatId: string } | null}
 */
export function readTelegramConfig() {
  const token = TELEGRAM_BOT_TOKEN;
  const chatId = TELEGRAM_GROUP_ID;
  if (
    !token ||
    !chatId ||
    token === PLACEHOLDER_TOKEN ||
    chatId === PLACEHOLDER_GROUP
  ) {
    return null;
  }
  return { token, chatId };
}
