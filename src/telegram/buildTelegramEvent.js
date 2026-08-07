import { TELEGRAM_EVENT_TYPES } from "../../shared/telegramEventTypes.js";

export function workLogTelegramEvent(payload) {
  const mode = String(payload.mode || "").trim();
  let eventType = "";
  if (mode === "arrival") eventType = TELEGRAM_EVENT_TYPES.KELDI;
  else if (mode === "departure") eventType = TELEGRAM_EVENT_TYPES.KETDI;
  else if (mode === "day_off") eventType = TELEGRAM_EVENT_TYPES.DAY_OFF;

  return {
    workerId: payload.workerId,
    workerName: payload.workerName,
    workerLogin: payload.workerLogin || payload.login,
    eventType,
    date: payload.date,
    time: payload.time,
    meta: {
      duration: String(payload.duration || "").trim(),
      reason: String(payload.reason || "").trim(),
    },
  };
}

export function yorijnomaTelegramEvent(payload) {
  return {
    workerId: payload.workerId,
    workerName: payload.workerName || payload.name,
    workerLogin: payload.workerLogin || payload.login,
    eventType: TELEGRAM_EVENT_TYPES.YORIJNOMA,
    sentAt: new Date().toISOString(),
    meta: {},
  };
}

export function stagePhotosTelegramEvent(payload) {
  return {
    workerId: payload.workerId,
    workerName: payload.workerName,
    workerLogin: payload.workerLogin || payload.login,
    eventType: TELEGRAM_EVENT_TYPES.RASM,
    meta: {
      projectName: String(payload.projectName || "").trim(),
      stageName: String(payload.stageName || "").trim(),
    },
  };
}

export function projectPhotosTelegramEvent(payload) {
  return {
    workerId: payload.workerId,
    workerName: payload.workerName,
    workerLogin: payload.workerLogin || payload.login,
    eventType: TELEGRAM_EVENT_TYPES.LOYIHA,
    meta: {
      projectName: String(payload.projectName || "").trim(),
      photoCount: Array.isArray(payload.photos) ? payload.photos.length : 0,
    },
  };
}

export function expenseTelegramEvent(payload) {
  return {
    workerId: payload.workerId,
    workerName: payload.workerName,
    workerLogin: payload.workerLogin || payload.login,
    eventType: TELEGRAM_EVENT_TYPES.XARAJAT,
    date: payload.date,
    meta: {
      projectName: String(payload.projectName || "").trim(),
      amount: String(payload.amount || "").trim(),
      type: String(payload.type || "").trim(),
    },
  };
}
