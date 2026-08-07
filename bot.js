import cron from "node-cron";
import axios from "axios";
import { hasSentId, markSentId } from "./storage.js";
import { fetchLatestImage } from "./erpService.js";
import { buildMonthlyReportDocuments } from "./src/lib/monthlyReport.js";
import {
  getDailyMorningMessageText,
  getMasterEveningDailyReportReminderText,
  getMasterMiddayStagesReportText,
  sendDocumentToTelegram,
  sendPhotoToTelegram,
  sendTextToTelegram,
  TASHKENT_TZ,
} from "./telegramService.js";
import { getPendingMasterNames } from "./server/masterReminderStatus.js";
import { logTelegramMessageServer } from "./server/telegramMessageStore.js";
import { TELEGRAM_MESSAGE_MODULES } from "./shared/telegramMessageTypes.js";
import { generateAndSendDailyAttendanceReport } from "./server/reports/dailyAttendanceTelegram.js";

let erpCronTask = null;
let morningCronTask = null;
/** @type {import("node-cron").ScheduledTask | null} */
let monthlyReportCronTask = null;
/** @type {import("node-cron").ScheduledTask | null} */
let dailyAttendanceCronTask = null;
/** @type {import("node-cron").ScheduledTask[]} */
let masterReminderTasks = [];
let cycleRunning = false;
let missingConfigWarned = false;

function logBotOutbound(config, payload) {
  void logTelegramMessageServer({
    ...payload,
    chatId: String(config?.groupId || ""),
    source: "telegram_bot",
    direction: "outbound",
    status: "sent",
  });
}

/**
 * `.env` da jadval: to‘liq cron (`0 13 * * *`) yoki qisqa vaqt (`13:00`, `13`).
 * Vaqt: `Asia/Tashkent` (TASHKENT_TZ).
 */
function normalizeScheduleExpr(raw, defaultCron) {
  const s = String(raw ?? "").trim();
  if (!s) return defaultCron;
  const hm = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (hm) {
    const h = Number(hm[1]);
    const m = Number(hm[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return `${m} ${h} * * *`;
  }
  const hOnly = /^(\d{1,2})$/.exec(s);
  if (hOnly) {
    const h = Number(hOnly[1]);
    if (h >= 0 && h <= 23) return `0 ${h} * * *`;
  }
  return s;
}

function scheduleFromEnv(envKey, defaultCron) {
  const candidate = normalizeScheduleExpr(process.env[envKey], defaultCron);
  if (!cron.validate(candidate)) {
    console.warn(
      `[telegram] ${envKey}="${candidate}" — noto'g'ri jadval, default: ${defaultCron}`,
    );
    return defaultCron;
  }
  return candidate;
}

export async function runCycle(config) {
  if (cycleRunning) {
    return;
  }
  cycleRunning = true;

  try {
    const { token, groupId, erpApiUrl } = config;

    if (!token || !groupId) {
      if (!missingConfigWarned) {
        console.warn(
          "CONFIG WARNING: TELEGRAM_BOT_TOKEN va TELEGRAM_GROUP_ID talab qilinadi.",
        );
        missingConfigWarned = true;
      }
      return;
    }

    missingConfigWarned = false;

    let latest;
    try {
      latest = await fetchLatestImage(erpApiUrl);
    } catch (error) {
      console.error("ERP FAILED");
      console.error(error);
      return;
    }

    if (!latest) {
      console.log("ERP EMPTY: no valid image payload");
      return;
    }

    console.log(`FETCHED ID: ${latest.id}`);

    if (hasSentId(latest.id)) {
      console.log(`SKIPPED DUPLICATE: ${latest.id}`);
      return;
    }

    const caption = `Solar ERP\nID: ${latest.id}\nTime: ${new Date().toISOString()}`;

    try {
      await sendPhotoToTelegram({
        token,
        groupId,
        imageUrl: latest.image,
        caption,
      });
      markSentId(latest.id);
      logBotOutbound(config, {
        module: TELEGRAM_MESSAGE_MODULES.BOT_ERP_POLL,
        messageText: caption,
        fileUrl: latest.image,
        meta: { erpImageId: latest.id },
      });
      console.log(`SENT SUCCESS: ${latest.id}`);
    } catch (error) {
      console.error("TELEGRAM FAILED");
      console.error(error);
    }
  } finally {
    cycleRunning = false;
  }
}

async function sendMorningGreeting(config) {
  const { token, groupId } = config;
  if (!token || !groupId) return;
  try {
    const pendingNames = await getPendingMasterNames("morning");
    console.log(
      `[telegram] Ertalab: ${pendingNames.length} ta usta yuklamagan`,
      pendingNames.length ? `(${pendingNames.join(", ")})` : "",
    );
    const text = getDailyMorningMessageText(pendingNames);
    await sendTextToTelegram({
      token,
      groupId,
      text,
    });
    logBotOutbound(config, {
      module: TELEGRAM_MESSAGE_MODULES.BOT_REMINDER,
      messageText: text,
      meta: { kind: "morning", pendingCount: pendingNames.length },
    });
    console.log(`[telegram] ${TASHKENT_TZ}: kunlik salom xabari yuborildi`);
  } catch (e) {
    console.error("[telegram] Kunlik salom xabari yuborilmadi:", e?.message || e);
  }
}

/**
 * Eski «Xurmatli masterlar / Keldi-Ketdi» eslatmalari (13:00, 18:00).
 * Default O‘CHIQ. Faqat TELEGRAM_MASTER_REMINDERS_AUTO=true bo‘lsa yoqiladi.
 */
function shouldSendMasterReminders() {
  const v = String(process.env.TELEGRAM_MASTER_REMINDERS_AUTO || "false").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

async function sendMasterMiddayReportReminder(config) {
  const { token, groupId } = config;
  if (!token || !groupId) return;
  try {
    const pendingNames = await getPendingMasterNames("midday");
    console.log(
      `[telegram] Tushlik: ${pendingNames.length} ta usta yuklamagan`,
      pendingNames.length ? `(${pendingNames.join(", ")})` : "",
    );
    const text = getMasterMiddayStagesReportText(pendingNames);
    await sendTextToTelegram({
      token,
      groupId,
      text,
    });
    logBotOutbound(config, {
      module: TELEGRAM_MESSAGE_MODULES.BOT_REMINDER,
      messageText: text,
      meta: { kind: "midday", pendingCount: pendingNames.length },
    });
    console.log(`[telegram] ${TASHKENT_TZ}: masterlar tushlik eslatmasi yuborildi`);
  } catch (e) {
    console.error("[telegram] Tushlik eslatmasi yuborilmadi:", e?.message || e);
  }
}

async function sendMasterEveningReminder(config) {
  const { token, groupId } = config;
  if (!token || !groupId) return;
  try {
    const pendingNames = await getPendingMasterNames("evening");
    console.log(
      `[telegram] Kech: ${pendingNames.length} ta usta yuklamagan`,
      pendingNames.length ? `(${pendingNames.join(", ")})` : "",
    );
    const text = getMasterEveningDailyReportReminderText(pendingNames);
    await sendTextToTelegram({
      token,
      groupId,
      text,
    });
    logBotOutbound(config, {
      module: TELEGRAM_MESSAGE_MODULES.BOT_REMINDER,
      messageText: text,
      meta: { kind: "evening", pendingCount: pendingNames.length },
    });
    console.log(`[telegram] ${TASHKENT_TZ}: kechki hisobot eslatmasi yuborildi`);
  } catch (e) {
    console.error("[telegram] Kechki eslatma yuborilmadi:", e?.message || e);
  }
}

/**
 * ERP rasm pollingi: faqat TELEGRAM_ERP_POLL=true bo‘lsa (standartda o‘chiq).
 */
function shouldPollErp() {
  const v = String(process.env.TELEGRAM_ERP_POLL || "").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function isLastDayOfMonthInTashkent(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TASHKENT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = fmt.format(now);
  const parts = today.split("-");
  const y = Number(parts[0]);
  const mo = Number(parts[1]);
  const da = Number(parts[2]);
  if (!y || !mo || !da) return false;
  const last = new Date(y, mo, 0).getDate();
  return da === last;
}

function tashkentCalendarYearMonth(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TASHKENT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [ys, ms] = fmt.format(now).split("-");
  return { year: Number(ys), month: Number(ms) };
}

function shouldSendMonthlyAutoReport() {
  const v = String(process.env.TELEGRAM_MONTHLY_AUTO || "true").toLowerCase();
  return v !== "false" && v !== "0" && v !== "no";
}

async function sendMonthlyReportBundleTelegram(config, dataset) {
  const { year, month } = tashkentCalendarYearMonth();
  const label = `${year}-${String(month).padStart(2, "0")}`;
  const dedupeId = `monthly-auto-${label}`;
  if (hasSentId(dedupeId)) {
    console.log(`[telegram] Oylik avto-hisobot allaqachon yuborilgan: ${label}`);
    return;
  }
  const docs = buildMonthlyReportDocuments({
    year,
    month,
    projects: dataset.projects || [],
    expenses: dataset.expenses || [],
    workLogs: dataset.work_logs || dataset.workLogs || [],
    workers: dataset.workers || [],
    activityLogs: dataset.activity_logs || dataset.activityLogs || [],
  });
  const { token, groupId } = config;
  for (const doc of docs) {
    await sendDocumentToTelegram({
      token,
      groupId,
      buffer: doc.body,
      filename: doc.filename,
      caption: doc.caption,
      mimeType: doc.mime,
    });
    logBotOutbound(config, {
      module: TELEGRAM_MESSAGE_MODULES.BOT_MONTHLY_REPORT,
      messageText: doc.caption || doc.filename,
      fileUrl: doc.filename,
      meta: { label, filename: doc.filename },
    });
  }
  markSentId(dedupeId);
  console.log(`[telegram] Oylik avto-hisobot yuborildi (${label}): ${docs.length} fayl`);
}

async function runMonthlyAutoReportJob(config) {
  if (!isLastDayOfMonthInTashkent()) return;
  const { token, groupId, getMonthlyDataset } = config;
  if (!token || !groupId) return;

  let dataset = null;
  const url = String(process.env.MONTHLY_REPORT_DATA_URL || "").trim();
  if (url) {
    try {
      const fetchSecret = String(process.env.MONTHLY_REPORT_FETCH_SECRET || "").trim();
      const headers = fetchSecret ? { Authorization: `Bearer ${fetchSecret}` } : {};
      const r = await axios.get(url, {
        headers,
        timeout: 120000,
        validateStatus: () => true,
      });
      if (r.status >= 200 && r.status < 300 && r.data && typeof r.data === "object") {
        dataset = r.data;
      }
    } catch (e) {
      console.error("[telegram] MONTHLY_REPORT_DATA_URL:", e?.message || e);
    }
  }
  if (!dataset && typeof getMonthlyDataset === "function") {
    dataset = await Promise.resolve(getMonthlyDataset());
  }
  if (!dataset) {
    console.warn(
      "[telegram] Oylik avto-hisobot: JSON manbai yo‘q. MONTHLY_REPORT_DATA_URL yoki server xotirasida maʼlumot kerak.",
    );
    return;
  }
  try {
    await sendMonthlyReportBundleTelegram(config, dataset);
  } catch (e) {
    console.error("[telegram] Oylik avto-hisobot yuborilmadi:", e?.message || e);
  }
}

function shouldSendDailyAttendanceReport() {
  const v = String(process.env.TELEGRAM_DAILY_ATTENDANCE_AUTO || "true").toLowerCase();
  return v !== "false" && v !== "0" && v !== "no";
}

async function runDailyAttendanceReportJob(config) {
  const { token, groupId } = config;
  if (!token || !groupId) return;
  try {
    const result = await generateAndSendDailyAttendanceReport({
      source: "cron",
      force: false,
    });
    if (result.skipped) {
      console.log(
        `[telegram] Kunlik attendance hisobot allaqachon yuborilgan: ${result.dateKey}`,
      );
      return;
    }
    if (result.ok) {
      console.log(
        `[telegram] ${TASHKENT_TZ}: kunlik attendance hisobot yuborildi (${result.dateKey})`,
      );
      logBotOutbound(config, {
        module: TELEGRAM_MESSAGE_MODULES.BOT_REMINDER,
        messageText: result.text || "Kunlik attendance hisobot",
        meta: {
          kind: "daily_attendance",
          dateKey: result.dateKey,
          counts: result.report?.counts,
        },
      });
    } else {
      console.error(
        "[telegram] Kunlik attendance hisobot yuborilmadi:",
        result.error || "unknown",
      );
    }
  } catch (e) {
    console.error("[telegram] Kunlik attendance hisobot xato:", e?.message || e);
  }
}

export function startBot(config) {
  if (erpCronTask) {
    erpCronTask.stop();
    erpCronTask = null;
  }
  if (morningCronTask) {
    morningCronTask.stop();
    morningCronTask = null;
  }
  if (monthlyReportCronTask) {
    try {
      monthlyReportCronTask.stop();
    } catch {
      /* ignore */
    }
    monthlyReportCronTask = null;
  }
  if (dailyAttendanceCronTask) {
    try {
      dailyAttendanceCronTask.stop();
    } catch {
      /* ignore */
    }
    dailyAttendanceCronTask = null;
  }
  for (const t of masterReminderTasks) {
    try {
      t.stop();
    } catch {
      /* ignore */
    }
  }
  masterReminderTasks = [];

  const morningCron = scheduleFromEnv("TELEGRAM_MORNING_SCHEDULE", "0 7 * * *");
  const middayCron = scheduleFromEnv("TELEGRAM_MASTER_MIDDAY_SCHEDULE", "0 13 * * *");
  const eveningCron = scheduleFromEnv("TELEGRAM_MASTER_EVENING_SCHEDULE", "0 18 * * *");
  const monthlyCron = scheduleFromEnv("TELEGRAM_MONTHLY_SCHEDULE", "5 21 * * *");
  const dailyAttendanceCron = scheduleFromEnv(
    "TELEGRAM_DAILY_ATTENDANCE_SCHEDULE",
    "0 13 * * *",
  );

  morningCronTask = cron.schedule(
    morningCron,
    () => {
      void sendMorningGreeting(config);
    },
    { timezone: TASHKENT_TZ },
  );

  if (shouldSendMasterReminders()) {
    masterReminderTasks.push(
      cron.schedule(
        middayCron,
        () => {
          void sendMasterMiddayReportReminder(config);
        },
        { timezone: TASHKENT_TZ },
      ),
    );
    masterReminderTasks.push(
      cron.schedule(
        eveningCron,
        () => {
          void sendMasterEveningReminder(config);
        },
        { timezone: TASHKENT_TZ },
      ),
    );
    console.log(
      `[telegram] Master reminder opt-in (${TASHKENT_TZ}): cron ${middayCron}, ${eveningCron}`,
    );
  } else {
    console.log("[telegram] Master reminder o‘chiq");
  }

  if (shouldPollErp()) {
    erpCronTask = cron.schedule("*/30 * * * * *", () => {
      void runCycle(config);
    });
    console.log("[telegram] TELEGRAM_ERP_POLL=on — ERP rasmlarini har 30 s tekshirish yoqildi");
    void runCycle(config);
  } else {
    console.log(
      `[telegram] Kunlik salom cron (${TASHKENT_TZ}): ${morningCron}. ERP polling o‘chiq (TELEGRAM_ERP_POLL=true qo‘shing kerak bo‘lsa).`,
    );
  }

  if (shouldSendMonthlyAutoReport()) {
    monthlyReportCronTask = cron.schedule(
      monthlyCron,
      () => {
        void runMonthlyAutoReportJob(config);
      },
      { timezone: TASHKENT_TZ },
    );
    console.log(
      `[telegram] Oylik hisobot cron (${TASHKENT_TZ}): ${monthlyCron} — oyning oxirgi kunida ishlaydi (3 ta fayl). O‘chirish: TELEGRAM_MONTHLY_AUTO=false`,
    );
  } else {
    console.log("[telegram] Oylik avto-hisobot o‘chiq (TELEGRAM_MONTHLY_AUTO=false)");
  }

  if (shouldSendDailyAttendanceReport()) {
    dailyAttendanceCronTask = cron.schedule(
      dailyAttendanceCron,
      () => {
        void runDailyAttendanceReportJob(config);
      },
      { timezone: TASHKENT_TZ },
    );
    console.log(
      `[telegram] Kunlik attendance hisobot cron (${TASHKENT_TZ}): ${dailyAttendanceCron}. TELEGRAM_DAILY_ATTENDANCE_AUTO=${process.env.TELEGRAM_DAILY_ATTENDANCE_AUTO ?? "true"}`,
    );
  } else {
    console.log(
      `[telegram] Kunlik attendance hisobot o'chirilgan (TELEGRAM_DAILY_ATTENDANCE_AUTO=${process.env.TELEGRAM_DAILY_ATTENDANCE_AUTO ?? "false"})`,
    );
  }
}

export function stopBot() {
  if (erpCronTask) {
    erpCronTask.stop();
    erpCronTask = null;
  }
  if (morningCronTask) {
    morningCronTask.stop();
    morningCronTask = null;
  }
  for (const t of masterReminderTasks) {
    try {
      t.stop();
    } catch {
      /* ignore */
    }
  }
  masterReminderTasks = [];
  if (monthlyReportCronTask) {
    try {
      monthlyReportCronTask.stop();
    } catch {
      /* ignore */
    }
    monthlyReportCronTask = null;
  }
  if (dailyAttendanceCronTask) {
    try {
      dailyAttendanceCronTask.stop();
    } catch {
      /* ignore */
    }
    dailyAttendanceCronTask = null;
  }
}
