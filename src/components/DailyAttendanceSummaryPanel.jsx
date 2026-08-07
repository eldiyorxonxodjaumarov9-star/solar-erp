import { useCallback, useEffect, useState } from "react";
import { api } from "../api/http";
import { tashkentTodayYMD } from "../photos/tashkentTime";

function NameList({ names, empty }) {
  if (!names?.length) {
    return <p className="text-sm text-slate-500">{empty}</p>;
  }
  return (
    <ul className="mt-1 space-y-0.5 text-sm text-slate-800">
      {names.map((n) => (
        <li key={n}>• {n}</li>
      ))}
    </ul>
  );
}

/**
 * Admin: Bugungi yakun + Telegramga qo‘lda yuborish.
 * Server generator bilan bir xil (`/api/telegram/daily-attendance-report`).
 */
export default function DailyAttendanceSummaryPanel({ dateKey }) {
  const dk = String(dateKey || tashkentTodayYMD()).trim();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sendNote, setSendNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.get(
        `/api/telegram/daily-attendance-report?date=${encodeURIComponent(dk)}`,
      );
      if (data?.report) setReport(data.report);
      else if (data?.ok === false) setError(data.error || "Hisobot olinmadi");
    } catch (e) {
      setError(e?.message || "Serverga ulanish yo‘q");
    } finally {
      setLoading(false);
    }
  }, [dk]);

  useEffect(() => {
    void load();
  }, [load]);

  const sendTelegram = async () => {
    setSending(true);
    setSendNote("");
    setError("");
    try {
      const secret = String(import.meta.env.VITE_MONTHLY_REPORT_SECRET || "").trim();
      const headers = secret
        ? {
            "x-daily-attendance-secret": secret,
            "x-monthly-report-secret": secret,
          }
        : {};
      const data = await api.post(
        "/api/telegram/daily-attendance-report",
        { date: dk, force: true },
        { headers },
      );
      if (data?.skipped) {
        setSendNote("Bu kun uchun hisobot allaqachon yuborilgan (force bilan qayta urinildi).");
      } else if (data?.ok) {
        setSendNote("Telegram guruhiga yuborildi.");
        if (data.report) setReport(data.report);
      } else {
        setError(data?.error || "Yuborilmadi");
      }
      await load();
    } catch (e) {
      setError(e?.message || "Yuborishda xato");
    } finally {
      setSending(false);
    }
  };

  const c = report?.counts || {};

  return (
    <div className="mt-8 rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03] sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-slate-900">
            Bugungi yakun
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Sana: {report?.dateLabel || dk} · Toshkent 13:00 da avtomatik Telegramga
            yuboriladi
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 sm:text-sm"
          >
            Yangilash
          </button>
          <button
            type="button"
            onClick={() => void sendTelegram()}
            disabled={sending || loading}
            className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white shadow-soft-md transition hover:bg-slate-800 disabled:opacity-50 sm:text-sm"
          >
            {sending ? "Yuborilmoqda…" : "Telegramga yuborish"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-3 text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {sendNote ? (
        <p className="mt-3 text-sm font-medium text-emerald-700">{sendNote}</p>
      ) : null}

      {loading && !report ? (
        <p className="mt-4 text-sm text-slate-500">Yuklanmoqda…</p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Ishga chiqqanlar", c.arrived ?? "—"],
              ["Ishdan ketganlar", c.departed ?? "—"],
              ["Ishga chiqmaganlar", c.absent ?? "—"],
              ["Keldi, rasm yo‘q", c.arrivedWithoutPhoto ?? "—"],
              ["Ketdi, rasm yo‘q", c.departedWithoutPhoto ?? "—"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {label}
                </p>
                <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                ✅ Ishga chiqqanlar
              </p>
              <NameList
                names={report?.arrived}
                empty="Hozircha hech kim ishga chiqmagan"
              />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                🚪 Ishdan ketganlar
              </p>
              <NameList
                names={report?.departed}
                empty="Hozircha hech kim ishdan ketmagan"
              />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                ❌ Ishga chiqmaganlar
              </p>
              <NameList
                names={report?.absent}
                empty="Hamma xodimlar ishga chiqqan"
              />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                🏠 Bugun dam olganlar
              </p>
              <NameList
                names={report?.dayOff}
                empty="Bugun dam olgan xodim yo‘q"
              />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                📷 Keldi, lekin rasm yo‘q
              </p>
              <NameList
                names={report?.arrivedWithoutPhoto}
                empty="Hamma kelganlar rasm tashlagan"
              />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                📷 Ketdi, lekin rasm yo‘q
              </p>
              <NameList
                names={report?.departedWithoutPhoto}
                empty="Hamma ketganlar rasm tashlagan"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
