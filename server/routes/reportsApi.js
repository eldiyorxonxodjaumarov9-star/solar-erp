import express from "express";
import { buildMonthlyAttendanceReport } from "../reports/monthlyAttendance.js";
import {
  buildDailyAttendanceReportForDate,
} from "../reports/dailyAttendanceTelegram.js";
import { buildMonthTelegramFeed } from "../../src/activity/hisobotTelegramSources.js";
import { listCollection } from "../db/store.js";
import { tashkentTodayYMD } from "../../src/photos/tashkentTime.js";

export function createReportsRouter() {
  const router = express.Router();

  router.get("/telegram-feed", async (req, res) => {
    try {
      const month = String(req.query.month || "").trim();
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ ok: false, error: "month=YYYY-MM kerak" });
      }
      const [events, photos] = await Promise.all([
        listCollection("telegram_events"),
        listCollection("stage_photos"),
      ]);
      const items = buildMonthTelegramFeed({
        messages: [],
        events,
        photos,
        month,
      });
      return res.json({ ok: true, month, count: items.length, items });
    } catch (error) {
      console.error("GET /api/reports/telegram-feed", error);
      return res.status(500).json({ ok: false, error: error?.message || "Xato" });
    }
  });

  router.get("/monthly-attendance", async (req, res) => {
    try {
      const month = String(req.query.month || "").trim();
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ ok: false, error: "month=YYYY-MM kerak" });
      }
      const report = await buildMonthlyAttendanceReport(month);
      return res.json({ ok: true, ...report });
    } catch (error) {
      console.error("GET /api/reports/monthly-attendance", error);
      return res.status(500).json({ ok: false, error: error?.message || "Xato" });
    }
  });

  router.get("/daily-attendance", async (req, res) => {
    try {
      const dateKey = String(req.query.date || req.query.dateKey || tashkentTodayYMD()).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        return res.status(400).json({ ok: false, error: "date=YYYY-MM-DD kerak" });
      }
      const report = await buildDailyAttendanceReportForDate(dateKey);
      return res.json({ ok: true, dateKey, report });
    } catch (error) {
      console.error("GET /api/reports/daily-attendance", error);
      return res.status(500).json({ ok: false, error: error?.message || "Xato" });
    }
  });

  return router;
}
