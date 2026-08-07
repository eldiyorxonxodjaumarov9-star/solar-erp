/**
 * Oylik hisobot (matn/CSV) — brauzer va Node (server.js) ikkalasida ishlatiladi.
 * Sana: YYYY-MM-DD (Toshkent kalendariga mos `date` / `dateKey` maydonlari).
 */

/** @param {string} holat */
export function isCompletedHolat(holat) {
  const s = String(holat || "")
    .trim()
    .toLowerCase();
  return s === "tugallangan" || s === "tugallandi" || s === "yakunlangan";
}

/** @param {Record<string, unknown>} p */
export function projectCrewIds(p) {
  const raw = Array.isArray(p?.assignedWorkerIds) ? p.assignedWorkerIds : [];
  const ids = raw.map((x) => String(x).trim()).filter(Boolean);
  const one = String(p?.ustaId || p?.assignedWorkerId || "").trim();
  if (ids.length) return [...new Set(ids)];
  if (one) return [one];
  return [];
}

/**
 * @param {number} year
 * @param {number} month 1–12
 */
export function calendarMonthRangeYmd(year, month) {
  const y = Math.floor(year);
  const m = Math.min(12, Math.max(1, Math.floor(month)));
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end, y, m };
}

/** @param {string} ymd */
function ymdOk(ymd) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(ymd || "").trim());
}

/**
 * Loyiha tanlangan oy bilan kesishadimi (boshlanish/tugash sanalari bo‘yicha).
 * @param {Record<string, unknown>} p
 */
export function projectOverlapsMonth(p, year, month) {
  const { start: ms, end: me } = calendarMonthRangeYmd(year, month);
  const s = String(p?.startDate || "").slice(0, 10);
  const e = String(p?.endDate || "").slice(0, 10);
  if (!ymdOk(s)) return false;
  const endUse = ymdOk(e) ? e : me;
  return s <= me && endUse >= ms;
}

/** @param {string} ymd */
function inMonthRange(ymd, year, month) {
  const d = String(ymd || "").slice(0, 10);
  if (!ymdOk(d)) return false;
  const { start, end } = calendarMonthRangeYmd(year, month);
  return d >= start && d <= end;
}

/**
 * @param {{
 *   year: number;
 *   month: number;
 *   projects?: unknown[];
 *   expenses?: unknown[];
 *   workLogs?: unknown[];
 *   workers?: unknown[];
 *   activityLogs?: unknown[];
 * }} params
 * @returns {{ filename: string; caption: string; body: string; mime: string }[]}
 */
export function buildMonthlyReportDocuments(params) {
  const year = Number(params.year);
  const month = Number(params.month);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error("Yil yoki oy noto‘g‘ri");
  }

  const { start, end, y, m } = calendarMonthRangeYmd(year, month);
  const label = `${y}-${String(m).padStart(2, "0")}`;

  const projects = Array.isArray(params.projects) ? params.projects : [];
  const expenses = Array.isArray(params.expenses) ? params.expenses : [];
  const workLogs = Array.isArray(params.workLogs) ? params.workLogs : [];
  const workers = Array.isArray(params.workers) ? params.workers : [];
  const activityLogs = Array.isArray(params.activityLogs) ? params.activityLogs : [];

  const workerNameById = new Map(
    workers
      .filter((w) => w && typeof w === "object")
      .map((w) => [String(w.id || "").trim(), String(w.fullName || w.name || "").trim() || "—"]),
  );

  const monthProjects = projects.filter((p) =>
    projectOverlapsMonth(p, year, month),
  );

  const completed = monthProjects.filter((p) => isCompletedHolat(p.holat));
  const partial = monthProjects.filter((p) => !isCompletedHolat(p.holat));

  const linesProjects = [
    `Solar ERP — loyihalar (${label}, Toshkent oyi)`,
    `Davr: ${start} … ${end}`,
    "",
    `=== To'liq yakunlangan (${completed.length}) ===`,
    ...completed.map((p) => {
      const crew = projectCrewIds(p)
        .map((id) => workerNameById.get(id) || id)
        .join(", ");
      return `#${String(p.projectNumber || "").trim()} ${String(p.clientName || "").trim()} | holat: ${String(p.holat || "")} | usta: ${crew || "—"}`;
    }),
    "",
    `=== Yarim / jarayonda (${partial.length}) ===`,
    ...partial.map((p) => {
      const crew = projectCrewIds(p)
        .map((id) => workerNameById.get(id) || id)
        .join(", ");
      return `#${String(p.projectNumber || "").trim()} ${String(p.clientName || "").trim()} | holat: ${String(p.holat || "")} | usta: ${crew || "—"}`;
    }),
    "",
    "=== Loyiha bo‘yicha usta o‘zgarishlari (crewChangeLog) ===",
  ];

  for (const p of monthProjects) {
    const logs = Array.isArray(p.crewChangeLog) ? p.crewChangeLog : [];
    for (const ev of logs) {
      if (!ev || typeof ev !== "object") continue;
      const at = String(ev.at || "").slice(0, 19);
      if (!at) continue;
      const day = at.slice(0, 10);
      if (!inMonthRange(day, year, month)) continue;
      const nm = String(ev.workerName || workerNameById.get(String(ev.workerId)) || ev.workerId || "");
      linesProjects.push(
        `#${String(p.projectNumber || "")} ${String(p.clientName || "")} | ${String(ev.action || "")} | ${nm} | ${at}`,
      );
    }
  }

  const monthExpenses = expenses.filter((e) => {
    if (!e || typeof e !== "object") return false;
    return inMonthRange(String(e.date || ""), year, month);
  });

  const expenseRows = [
    ["sana", "summa", "turi", "izoh", "loyihaId", "usta", "brigada"].join(";"),
    ...monthExpenses.map((e) =>
      [
        String(e.date || "").slice(0, 10),
        String(e.amount || "").replace(/\s/g, ""),
        String(e.type || "").replace(/;/g, ","),
        String(e.comment || e.description || "")
          .replace(/;/g, ",")
          .replace(/\r?\n/g, " "),
        String(e.projectId || ""),
        String(e.ustaName || "").replace(/;/g, ","),
        String(e.brigadeName || "").replace(/;/g, ","),
      ].join(";"),
    ),
  ];

  const monthActivity = activityLogs.filter((log) => {
    if (!log || typeof log !== "object") return false;
    const dk = String(log.dateKey || "").trim().slice(0, 10);
    const fromLogin = String(log.loginTime || "").slice(0, 10);
    const key = ymdOk(dk) ? dk : fromLogin;
    return inMonthRange(key, year, month);
  });

  const activityRows = [
    ["sana", "usta", "brigada", "kirgan", "chiqqan", "sekund"].join(";"),
    ...monthActivity.map((log) => {
      const dk = String(log.dateKey || "").trim().slice(0, 10);
      const fromLogin = String(log.loginTime || "").slice(0, 10);
      const day = ymdOk(dk) ? dk : fromLogin;
      return [
        day,
        String(log.ustaName || "").replace(/;/g, ","),
        String(log.brigadeName || "").replace(/;/g, ","),
        String(log.loginTime || "").replace(/;/g, ","),
        log.logoutTime ? String(log.logoutTime).replace(/;/g, ",") : "",
        log.totalWorkTime != null ? String(log.totalWorkTime) : "",
      ].join(";");
    }),
  ];

  const workLogRows = [
    ["loyiha", "usta", "sana", "izoh"].join(";"),
    ...workLogs
      .filter((w) => {
        if (!w || typeof w !== "object") return false;
        const d = String(w.date || w.workDate || w.createdAt || "").slice(0, 10);
        return inMonthRange(d, year, month);
      })
      .map((w) =>
        [
          String(w.projectName || w.projectId || "").replace(/;/g, ","),
          String(w.workerName || w.ustaName || "").replace(/;/g, ","),
          String(w.date || w.workDate || "").slice(0, 10),
          String(w.notes || w.comment || "")
            .replace(/;/g, ",")
            .replace(/\r?\n/g, " "),
        ].join(";"),
      ),
  ];

  const keldiKetdiBlock = [...activityRows, "", "=== work_logs (agar kiritilgan bo‘lsa) ===", ...workLogRows].join(
    "\r\n",
  );

  const projectCountByWorker = new Map();
  for (const p of monthProjects) {
    for (const id of projectCrewIds(p)) {
      projectCountByWorker.set(id, (projectCountByWorker.get(id) || 0) + 1);
    }
  }

  const workerLines = [
    `Solar ERP — ustalar va loyihalar (${label})`,
    `Oy davomida loyiha bilan kesishgan (joriy biriktirish) loyihalar soni.`,
    "",
    ...[...projectCountByWorker.entries()]
      .sort((a, b) => (workerNameById.get(a[0]) || a[0]).localeCompare(workerNameById.get(b[0]) || b[0], "uz"))
      .map(([id, n]) => `${workerNameById.get(id) || id}: ${n} ta loyiha`),
  ];

  const bom = "\ufeff";

  return [
    {
      filename: `solar-erp-xarajatlar-${label}.csv`,
      caption: `Oylik xarajatlar (${label})`,
      body: bom + expenseRows.join("\r\n"),
      mime: "text/csv;charset=utf-8",
    },
    {
      filename: `solar-erp-keldi-ketdi-${label}.csv`,
      caption: `Keldi–ketdi va ish vaqti (${label})`,
      body: bom + keldiKetdiBlock,
      mime: "text/csv;charset=utf-8",
    },
    {
      filename: `solar-erp-loyihalar-tahlil-${label}.txt`,
      caption: `Loyihalar: to‘liq / yarim, usta o‘zgarishlari, usta–loyiha (${label})`,
      body: linesProjects.concat(["", ...workerLines]).join("\r\n"),
      mime: "text/plain;charset=utf-8",
    },
  ];
}
