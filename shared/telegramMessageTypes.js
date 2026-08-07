/** Firestore: bot va ERP orqali Telegram bilan almashilgan xabarlar. */
export const TELEGRAM_MESSAGES_COLLECTION = "telegram_messages";

export const TELEGRAM_MESSAGE_DIRECTION = {
  OUTBOUND: "outbound",
  INBOUND: "inbound",
};

export const TELEGRAM_MESSAGE_STATUS = {
  SENT: "sent",
  RECEIVED: "received",
  PENDING: "pending",
  FAILED: "failed",
  MIGRATED: "migrated",
};

export const TELEGRAM_MESSAGE_MODULES = {
  KELDI: "keldi",
  KETDI: "ketdi",
  RASM: "rasm",
  YORIJNOMA: "yorijnoma",
  XARAJAT: "xarajat",
  LOYIHA: "loyiha",
  DAY_OFF: "day_off",
  BOT_REMINDER: "bot_reminder",
  BOT_ERP_POLL: "bot_erp_poll",
  BOT_MONTHLY_REPORT: "bot_monthly_report",
  INBOUND: "inbound",
  MASTER_TRACKING: "master_tracking",
  UNKNOWN: "unknown",
};

export const TELEGRAM_MODULE_LABELS = {
  keldi: "Keldi",
  ketdi: "Ketdi",
  rasm: "Rasm",
  yorijnoma: "Yo‘riqnoma",
  xarajat: "Xarajat",
  loyiha: "Loyiha",
  day_off: "Dam olish",
  bot_reminder: "Bot eslatma",
  bot_erp_poll: "ERP rasm (bot)",
  bot_monthly_report: "Oylik hisobot",
  inbound: "Guruhdan kelgan",
  master_tracking: "Usta kuzatuv",
  unknown: "Noma’lum",
};

export const TELEGRAM_STATUS_LABELS = {
  sent: "Yuborildi",
  received: "Qabul qilindi",
  pending: "Kutilmoqda",
  failed: "Xato",
  migrated: "Migratsiya",
};
