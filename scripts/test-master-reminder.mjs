/**
 * Test: masterlar eslatmasini hozir Telegram guruhiga yuborish.
 * CMD: node scripts/test-master-reminder.mjs [morning|midday|evening]
 */
import dotenv from "dotenv";
import {
  getDailyMorningMessageText,
  getMasterEveningDailyReportReminderText,
  getMasterMiddayStagesReportText,
  sendTextToTelegram,
} from "../telegramService.js";
import { getPendingMasterNames } from "../server/masterReminderStatus.js";

dotenv.config();

const kind = String(process.argv[2] || "midday").trim().toLowerCase();
const valid = new Set(["morning", "midday", "evening"]);
const reminderKind = valid.has(kind) ? kind : "midday";

const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const groupId = (process.env.TELEGRAM_GROUP_ID || "").trim();

if (!token || !groupId) {
  console.error("[test] TELEGRAM_BOT_TOKEN va TELEGRAM_GROUP_ID .env da kerak.");
  process.exit(1);
}

const builders = {
  morning: getDailyMorningMessageText,
  midday: getMasterMiddayStagesReportText,
  evening: getMasterEveningDailyReportReminderText,
};

try {
  console.log(`[test] ${reminderKind} eslatmasi tayyorlanmoqda…`);
  const pendingNames = await getPendingMasterNames(reminderKind);
  console.log(`[test] Yuklamagan ustalar: ${pendingNames.length} ta`);
  if (pendingNames.length) {
    pendingNames.forEach((name) => console.log(`  • ${name}`));
  }

  const text = builders[reminderKind](pendingNames);
  console.log("\n[test] Xabar matni:\n---");
  console.log(text);
  console.log("---\n");

  await sendTextToTelegram({ token, groupId, text });
  console.log("[test] Telegram guruhiga yuborildi.");
} catch (error) {
  console.error("[test] Xato:", error?.message || error);
  process.exit(1);
}
