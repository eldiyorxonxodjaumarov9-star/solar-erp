import { createTelegramLinkRouter } from './telegramLinkApi.js';
import { createTelegramAttendanceHandler } from '../telegram/attendance.js';
export function createTelegramAttendanceRouter(options = {}) {
  return createTelegramLinkRouter({ ...options, handleUpdate: options.handleUpdate || createTelegramAttendanceHandler(options) });
}
