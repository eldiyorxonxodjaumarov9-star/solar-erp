/**
 * Kunlik attendance hisoboti — sof logika (server + admin UI).
 * APK contractiga bog‘liq emas.
 */

/** @param {unknown} w */
export function isActiveReportEmployee(w) {
  if (!w || typeof w !== "object") return false;
  const status = String(w.status || w.holat || "active")
    .trim()
    .toLowerCase();
  if (
    status &&
    status !== "active" &&
    status !== "faol" &&
    status !== "1" &&
    status !== "true"
  ) {
    return false;
  }

  const pos = String(w.position || "").trim().toLowerCase();
  const role = String(w.role || "").trim().toLowerCase();
  const blocked = new Set([
    "admin",
    "administrator",
    "assistant",
    "asisten",
    "developer",
    "dasturchi",
    "service",
    "bot",
  ]);
  if (blocked.has(pos) || blocked.has(role)) return false;
  return true;
}

export function workerReportName(w) {
  return String(
    w?.fullName || w?.name || w?.ustaName || w?.displayName || w?.login || "",
  ).trim();
}

function hasPhotoUrl(value) {
  const s = String(value || "").trim();
  return Boolean(s) && s !== "null" && s !== "undefined";
}

function photoHasImage(ph) {
  if (!ph || typeof ph !== "object") return false;
  return (
    hasPhotoUrl(ph.imageUrl) ||
    hasPhotoUrl(ph.storageUrl) ||
    hasPhotoUrl(ph.imageData) ||
    hasPhotoUrl(ph.downloadUrl)
  );
}

/**
 * Matching: userId → telegramUserId → telegramUsername → name (oxirgi fallback).
 * @returns {Map<string, object>} workerId → worker
 */
export function indexWorkersForReport(workers) {
  /** @type {Map<string, object>} */
  const byId = new Map();
  /** @type {Map<string, string>} */
  const byTelegramUserId = new Map();
  /** @type {Map<string, string>} */
  const byTelegramUsername = new Map();
  /** @type {Map<string, string>} */
  const byNameLower = new Map();

  for (const w of workers || []) {
    if (!isActiveReportEmployee(w)) continue;
    const id = String(w.id || "").trim();
    if (!id) continue;
    byId.set(id, w);

    const tgId = String(
      w.telegramUserId || w.telegramId || w.tgUserId || "",
    ).trim();
    if (tgId) byTelegramUserId.set(tgId, id);

    const tgUser = String(w.telegramUsername || w.telegramUser || "")
      .trim()
      .replace(/^@/, "")
      .toLowerCase();
    if (tgUser) byTelegramUsername.set(tgUser, id);

    const name = workerReportName(w).toLowerCase();
    if (name && !byNameLower.has(name)) byNameLower.set(name, id);
  }

  return { byId, byTelegramUserId, byTelegramUsername, byNameLower };
}

export function resolveWorkerId(indexes, hint) {
  if (!hint || typeof hint !== "object") return "";
  const id = String(hint.userId || hint.workerId || hint.ustaId || "").trim();
  if (id && indexes.byId.has(id)) return id;

  const tgId = String(
    hint.telegramUserId || hint.telegramId || hint.tgUserId || "",
  ).trim();
  if (tgId && indexes.byTelegramUserId.has(tgId)) {
    return indexes.byTelegramUserId.get(tgId) || "";
  }

  const tgUser = String(hint.telegramUsername || hint.workerLogin || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
  if (tgUser && indexes.byTelegramUsername.has(tgUser)) {
    return indexes.byTelegramUsername.get(tgUser) || "";
  }

  const name = String(hint.workerName || hint.ustaName || hint.name || "")
    .trim()
    .toLowerCase();
  if (name && indexes.byNameLower.has(name)) {
    return indexes.byNameLower.get(name) || "";
  }
  return id || "";
}

function bulletList(names, emptyText) {
  if (!names.length) return emptyText;
  return names.map((n) => `• ${n}`).join("\n");
}

function formatDisplayDate(dateKey) {
  const m = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(dateKey || "");
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/**
 * @param {{
 *   dateKey: string,
 *   workers?: unknown[],
 *   activityLogs?: unknown[],
 *   stagePhotos?: unknown[],
 *   telegramEvents?: unknown[],
 *   telegramAttendanceLogs?: unknown[],
 * }} input
 */
export function buildDailyAttendanceReport(input) {
  const dateKey = String(input.dateKey || "").trim();
  const indexes = indexWorkersForReport(input.workers || []);
  const employees = [...indexes.byId.values()].sort((a, b) =>
    workerReportName(a).localeCompare(workerReportName(b), "uz"),
  );

  /** @type {Map<string, { arrived: boolean, departed: boolean, dayOff: boolean, arrivalPhoto: boolean, departurePhoto: boolean, telegramArrivalFailed: boolean, telegramDepartureFailed: boolean }>} */
  const state = new Map();
  for (const w of employees) {
    state.set(String(w.id), {
      arrived: false,
      departed: false,
      dayOff: false,
      arrivalPhoto: false,
      departurePhoto: false,
      telegramArrivalFailed: false,
      telegramDepartureFailed: false,
    });
  }

  const ensure = (workerId) => {
    const id = String(workerId || "").trim();
    if (!id || !state.has(id)) return null;
    return state.get(id);
  };

  for (const log of input.activityLogs || []) {
    const dk =
      String(log?.dateKey || "").trim() ||
      String(log?.date || "").slice(0, 10);
    if (dk !== dateKey) continue;
    const wid = resolveWorkerId(indexes, {
      userId: log.ustaId || log.userId || log.workerId,
      workerName: log.ustaName || log.workerName,
    });
    const st = ensure(wid);
    if (!st) continue;
    if (log.loginTime || log.workAttendance === true || log.loginLocation) {
      st.arrived = true;
    }
    if (log.logoutTime || log.logoutLocation) {
      st.departed = true;
      st.arrived = true;
    }
  }

  for (const ph of input.stagePhotos || []) {
    const dk =
      String(ph?.dateKey || "").trim() ||
      String(ph?.date || "").slice(0, 10);
    if (dk && dk !== dateKey) continue;
    const type = String(ph?.type || "").trim().toLowerCase();
    if (type !== "keldi" && type !== "ketdi") continue;
    const wid = resolveWorkerId(indexes, {
      userId: ph.ustaId || ph.userId || ph.workerId,
      workerName: ph.ustaName || ph.workerName,
      workerLogin: ph.ustaLogin,
    });
    const st = ensure(wid);
    if (!st) continue;
    const ok = photoHasImage(ph);
    if (type === "keldi") {
      st.arrived = true;
      if (ok) st.arrivalPhoto = true;
    }
    if (type === "ketdi") {
      st.departed = true;
      st.arrived = true;
      if (ok) st.departurePhoto = true;
    }
  }

  for (const ev of input.telegramEvents || []) {
    const dk = String(ev?.dateKey || "").trim();
    if (dk !== dateKey) continue;
    const type = String(ev?.eventType || ev?.type || "").trim().toLowerCase();
    const wid = resolveWorkerId(indexes, {
      userId: ev.workerId || ev.userId,
      telegramUserId: ev.telegramUserId,
      telegramUsername: ev.telegramUsername || ev.workerLogin,
      workerName: ev.workerName,
      workerLogin: ev.workerLogin,
    });
    const st = ensure(wid);
    if (!st) continue;
    if (type === "day_off") {
      st.dayOff = true;
      continue;
    }
    if (type === "keldi" || type === "check_in" || type === "arrival") {
      st.arrived = true;
      if (hasPhotoUrl(ev?.meta?.imageUrl) || ev?.meta?.photoSaved) {
        st.arrivalPhoto = true;
      }
    }
    if (type === "ketdi" || type === "check_out" || type === "departure") {
      st.departed = true;
      st.arrived = true;
      if (hasPhotoUrl(ev?.meta?.imageUrl) || ev?.meta?.photoSaved) {
        st.departurePhoto = true;
      }
    }
  }

  for (const row of input.telegramAttendanceLogs || []) {
    const dk = String(row?.date || row?.dateKey || "").trim().slice(0, 10);
    if (dk !== dateKey) continue;
    const type = String(row?.type || row?.mode || "").trim().toLowerCase();
    const wid = resolveWorkerId(indexes, {
      userId: row.userId || row.workerId,
      telegramUserId: row.telegramUserId,
      telegramUsername: row.telegramUsername,
      workerName: row.workerName,
      workerLogin: row.workerLogin,
    });
    const st = ensure(wid);
    if (!st) continue;
    const success = row.success !== false;
    if (type === "day_off") {
      st.dayOff = true;
      continue;
    }
    if (type === "check_in" || type === "keldi" || type === "arrival") {
      st.arrived = true;
      if (!success) st.telegramArrivalFailed = true;
      if (hasPhotoUrl(row.imageUrl)) st.arrivalPhoto = true;
    }
    if (type === "check_out" || type === "ketdi" || type === "departure") {
      st.departed = true;
      st.arrived = true;
      if (!success) st.telegramDepartureFailed = true;
      if (hasPhotoUrl(row.imageUrl)) st.departurePhoto = true;
    }
  }

  const arrived = [];
  const departed = [];
  const absent = [];
  const dayOff = [];
  const arrivedWithoutPhoto = [];
  const departedWithoutPhoto = [];
  const telegramFailed = [];

  for (const w of employees) {
    const id = String(w.id);
    const st = state.get(id);
    const name = workerReportName(w) || id;
    if (!st) continue;

    if (st.dayOff) {
      dayOff.push(name);
      continue;
    }
    if (st.arrived) {
      arrived.push(name);
      if (!st.arrivalPhoto) arrivedWithoutPhoto.push(name);
    } else {
      absent.push(name);
    }
    if (st.departed) {
      departed.push(name);
      if (!st.departurePhoto) departedWithoutPhoto.push(name);
    }
    if (st.telegramArrivalFailed || st.telegramDepartureFailed) {
      telegramFailed.push(name);
    }
  }

  return {
    dateKey,
    dateLabel: formatDisplayDate(dateKey),
    total: employees.length,
    arrived,
    departed,
    absent,
    dayOff,
    arrivedWithoutPhoto,
    departedWithoutPhoto,
    telegramFailed,
    counts: {
      arrived: arrived.length,
      departed: departed.length,
      absent: absent.length,
      dayOff: dayOff.length,
      arrivedWithoutPhoto: arrivedWithoutPhoto.length,
      departedWithoutPhoto: departedWithoutPhoto.length,
      total: employees.length,
    },
  };
}

/** @param {ReturnType<typeof buildDailyAttendanceReport>} report */
export function formatDailyAttendanceTelegramText(report) {
  const c = report.counts;
  return [
    "📊 SOLAR ERP — KUNLIK ISH HISOBOTI",
    `📅 ${report.dateLabel}`,
    "",
    "✅ Ishga chiqqanlar:",
    bulletList(report.arrived, "Hozircha hech kim ishga chiqmagan"),
    "",
    "🚪 Ishdan ketganlar:",
    bulletList(report.departed, "Hozircha hech kim ishdan ketmagan"),
    "",
    "❌ Ishga chiqmaganlar:",
    bulletList(report.absent, "Hamma xodimlar ishga chiqqan"),
    "",
    "🏠 Bugun dam olganlar:",
    bulletList(report.dayOff, "Bugun dam olgan xodim yo‘q"),
    "",
    "📷 Keldi, lekin rasm yo‘q:",
    bulletList(report.arrivedWithoutPhoto, "Hamma kelganlar rasm tashlagan"),
    "",
    "📷 Ketdi, lekin rasm yo‘q:",
    bulletList(report.departedWithoutPhoto, "Hamma ketganlar rasm tashlagan"),
    "",
    "━━━━━━━━━━━━━━",
    `Jami xodimlar: ${c.total}`,
    `Ishga chiqdi: ${c.arrived}`,
    `Ishga chiqmadi: ${c.absent}`,
    `Dam oldi: ${c.dayOff}`,
    "",
    "Solar ERP",
  ].join("\n");
}
