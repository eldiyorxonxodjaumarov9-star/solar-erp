import axios from "axios";
import {
  buildDailyAttendanceReport,
  formatDailyAttendanceTelegramText,
} from "../../shared/dailyAttendanceReport.js";
import { listCollection } from "../db/store.js";
import {
  fetchDailyAttendanceFirestoreData,
  getFirestoreDocument,
  upsertFirestoreDocument,
} from "../firebaseServer.js";
import { tashkentTodayYMD } from "../../src/photos/tashkentTime.js";
import { hasSentId, markSentId } from "../../storage.js";

export const DAILY_ATTENDANCE_REPORTS = "dailyAttendanceReports";

/**
 * @param {string} [dateKey]
 */
export async function gatherDailyAttendanceSources(dateKey) {
  const dk = String(dateKey || tashkentTodayYMD()).trim();
  const fsData = await fetchDailyAttendanceFirestoreData(dk);

  /** SQL zaxira (telegram_events / logs). */
  let sqlEvents = [];
  let sqlAttendanceLogs = [];
  try {
    sqlEvents = (await listCollection("telegram_events")).filter(
      (e) => String(e?.dateKey || "").trim() === dk,
    );
  } catch {
    sqlEvents = [];
  }
  try {
    sqlAttendanceLogs = (await listCollection("telegramAttendanceLogs")).filter(
      (e) => String(e?.date || e?.dateKey || "").trim().slice(0, 10) === dk,
    );
  } catch {
    sqlAttendanceLogs = [];
  }

  const mergeById = (a, b) => {
    const map = new Map();
    for (const row of [...(a || []), ...(b || [])]) {
      const id = String(row?.id || "").trim();
      if (id) map.set(id, row);
      else map.set(`anon_${map.size}`, row);
    }
    return [...map.values()];
  };

  return {
    dateKey: dk,
    workers: fsData.workers || [],
    activityLogs: fsData.activityLogs || [],
    stagePhotos: fsData.stagePhotos || [],
    telegramEvents: mergeById(fsData.telegramEvents, sqlEvents),
    telegramAttendanceLogs: mergeById(
      fsData.telegramAttendanceLogs,
      sqlAttendanceLogs,
    ),
  };
}

/**
 * @param {string} [dateKey]
 */
export async function buildDailyAttendanceReportForDate(dateKey) {
  const sources = await gatherDailyAttendanceSources(dateKey);
  return buildDailyAttendanceReport(sources);
}

async function sendTextToTelegramGroup(text) {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const groupId = (process.env.TELEGRAM_GROUP_ID || "").trim();
  if (!token || !groupId) {
    throw new Error("Telegram sozlanmagan (TELEGRAM_BOT_TOKEN / TELEGRAM_GROUP_ID)");
  }
  const endpoint = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = new URLSearchParams();
  body.append("chat_id", groupId);
  body.append("text", text);
  const response = await axios.post(endpoint, body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 45000,
    validateStatus: () => true,
  });
  if (response.status !== 200 || !response.data?.ok) {
    const msg = response.data?.description || `HTTP ${response.status}`;
    throw new Error(msg);
  }
  return {
    messageId: response.data?.result?.message_id,
    chatId: groupId,
  };
}

/**
 * @param {{ dateKey?: string, force?: boolean, source?: string }} [opts]
 */
export async function generateAndSendDailyAttendanceReport(opts = {}) {
  const dateKey = String(opts.dateKey || tashkentTodayYMD()).trim();
  const force = Boolean(opts.force);
  const source = String(opts.source || "cron").trim() || "cron";
  const dedupeId = `daily-attendance-${dateKey}`;

  if (!force) {
    const existing = await getFirestoreDocument(DAILY_ATTENDANCE_REPORTS, dateKey);
    if (
      existing &&
      (existing.status === "sent" || existing.telegramSentAt)
    ) {
      return {
        ok: true,
        skipped: true,
        reason: "already_sent",
        dateKey,
        report: existing.report || null,
      };
    }
    if (hasSentId(dedupeId)) {
      return {
        ok: true,
        skipped: true,
        reason: "already_sent_file",
        dateKey,
      };
    }
  }

  const report = await buildDailyAttendanceReportForDate(dateKey);
  const text = formatDailyAttendanceTelegramText(report);
  const generatedAt = new Date().toISOString();

  let telegramMessageId = "";
  let telegramSentAt = "";
  let status = "generated";
  let sendError = "";

  try {
    const sent = await sendTextToTelegramGroup(text);
    telegramMessageId = sent.messageId != null ? String(sent.messageId) : "";
    telegramSentAt = new Date().toISOString();
    status = "sent";
    markSentId(dedupeId);
  } catch (e) {
    sendError = String(e?.message || e);
    status = "send_failed";
    console.error("[daily-attendance] Telegram:", sendError);
  }

  const record = {
    date: dateKey,
    dateKey,
    generatedAt,
    telegramSentAt: telegramSentAt || null,
    telegramMessageId: telegramMessageId || null,
    arrivedCount: report.counts.arrived,
    departedCount: report.counts.departed,
    absentCount: report.counts.absent,
    dayOffCount: report.counts.dayOff,
    arrivedWithoutPhotoCount: report.counts.arrivedWithoutPhoto,
    departedWithoutPhotoCount: report.counts.departedWithoutPhoto,
    status,
    source,
    sendError: sendError || null,
    reportText: text,
    report,
  };

  try {
    await upsertFirestoreDocument(DAILY_ATTENDANCE_REPORTS, dateKey, record);
  } catch (e) {
    console.warn("[dailyAttendanceReports] Firestore:", e?.message || e);
  }

  try {
    const { addDocumentWithId } = await import("../db/store.js");
    await addDocumentWithId(DAILY_ATTENDANCE_REPORTS, dateKey, record);
  } catch (e) {
    console.warn("[dailyAttendanceReports] SQL:", e?.message || e);
  }

  if (status !== "sent") {
    return { ok: false, dateKey, error: sendError, report, text };
  }

  return {
    ok: true,
    skipped: false,
    dateKey,
    telegramMessageId,
    report,
    text,
  };
}
