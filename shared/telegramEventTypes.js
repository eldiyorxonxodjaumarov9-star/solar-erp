/** Botga muvaffaqiyatli yuborilgan harakat turlari. */
export const TELEGRAM_EVENT_TYPES = {
  KELDI: "keldi",
  KETDI: "ketdi",
  RASM: "rasm",
  YORIJNOMA: "yorijnoma",
  XARAJAT: "xarajat",
  LOYIHA: "loyiha",
  DAY_OFF: "day_off",
};

export const TELEGRAM_EVENTS_COLLECTION = "telegram_events";

/** DD.MM.YYYY yoki ISO → YYYY-MM-DD (Toshkent). */
export function telegramDateToDateKey(dateStr, fallbackIso) {
  const s = String(dateStr || "").trim();
  const dmY = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dmY) return `${dmY[3]}-${dmY[2]}-${dmY[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (fallbackIso) {
    try {
      const d = new Date(fallbackIso);
      if (!Number.isNaN(d.getTime())) {
        return new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Tashkent",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(d);
      }
    } catch {
      /* ignore */
    }
  }
  return "";
}
