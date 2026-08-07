import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../api/http";
import { addCollectionDocWithId } from "../firebase/firestoreCrud";
import { sendSignedYorijnomaPdf } from "../usta/sendSignedYorijnomaPdf";
import SignaturePad from "../components/SignaturePad";
import {
  USTA_YORIJNOMA_CONFIRM_TEXT,
  USTA_YORIJNOMA_SECTIONS,
  USTA_YORIJNOMA_SUBTITLE,
  USTA_YORIJNOMA_TITLE,
  USTA_YORIJNOMA_VIDEO_REQUIRED,
  USTA_YORIJNOMA_VIDEO_SRC,
} from "../usta/yorijnomaContent";
import {
  isUstaYorijnomaCompleted,
  loadUstaYorijnoma,
  saveUstaYorijnoma,
  USTA_YORIJNOMA_CHANGED_EVENT,
} from "../usta/ustaYorijnomaStorage";

const CARD =
  "rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03] sm:p-5";

function StepBadge({ n, done, active }) {
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
        done
          ? "bg-emerald-500 text-white"
          : active
            ? "bg-brand-600 text-white"
            : "bg-slate-200 text-slate-600"
      }`}
    >
      {done ? "✓" : n}
    </span>
  );
}

export default function UstaYorijnomaPage() {
  const { session } = useAuth();
  const workerId =
    session?.role === "usta" ? String(session.workerId || "").trim() : "";
  const ustaLogin =
    session?.role === "usta" ? (session.login || "").trim() || "Usta" : "";
  const ustaName =
    session?.role === "usta" ? (session.name || "").trim() : "";

  const videoRef = useRef(null);
  const [videoWatched, setVideoWatched] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [readConfirmed, setReadConfirmed] = useState(false);
  const [signature, setSignature] = useState("");
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendNote, setSendNote] = useState("");
  const [sentAt, setSentAt] = useState("");

  const hydrate = useCallback(() => {
    if (!workerId) return;
    const row = loadUstaYorijnoma(workerId);
    if (!row) return;
    if (row.videoWatchedAt) setVideoWatched(true);
    if (row.readConfirmedAt) setReadConfirmed(true);
    if (row.signatureDataUrl) setSignature(String(row.signatureDataUrl));
    if (row.completedAt) setSaved(true);
    if (row.telegramSentAt) setSentAt(String(row.telegramSentAt));
  }, [workerId]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const sync = () => hydrate();
    window.addEventListener(USTA_YORIJNOMA_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(USTA_YORIJNOMA_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [hydrate]);

  const videoBlocksChecklist =
    USTA_YORIJNOMA_VIDEO_REQUIRED && !videoWatched && !videoError;
  const canOpenInstructions = !videoBlocksChecklist;
  const canSign = canOpenInstructions && readConfirmed;
  const completed = saved || isUstaYorijnomaCompleted(workerId);

  const markVideoWatched = () => {
    if (!workerId || videoWatched) return;
    setVideoWatched(true);
    saveUstaYorijnoma(workerId, {
      videoWatchedAt: new Date().toISOString(),
    });
  };

  const onVideoEnded = () => markVideoWatched();

  const onVideoTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return;
    if (v.currentTime / v.duration >= 0.95) markVideoWatched();
  };

  const handleReadConfirm = (checked) => {
    if (!canOpenInstructions) return;
    setReadConfirmed(checked);
    if (workerId && checked) {
      saveUstaYorijnoma(workerId, {
        readConfirmedAt: new Date().toISOString(),
      });
    }
  };

  const handleSignature = (dataUrl) => {
    if (!canSign) return;
    setSignature(dataUrl);
    if (workerId && dataUrl) {
      saveUstaYorijnoma(workerId, { signatureDataUrl: dataUrl });
    }
  };

  const handleFinish = async () => {
    if (!workerId || !canSign || !signature) return;
    setSubmitting(true);
    setSendNote("");
    try {
      const prev = loadUstaYorijnoma(workerId);
      saveUstaYorijnoma(workerId, {
        ...(prev?.videoWatchedAt || videoWatched
          ? {
              videoWatchedAt:
                prev?.videoWatchedAt || new Date().toISOString(),
            }
          : {}),
        readConfirmedAt: new Date().toISOString(),
        signatureDataUrl: signature,
        completedAt: new Date().toISOString(),
        ustaLogin,
      });
      setSaved(true);

      const completedIso = new Date().toISOString();
      // Adminда ko‘rinishi uchun Firebase'ga saqlash (best-effort).
      try {
        await addCollectionDocWithId("usta_yorijnoma", workerId, {
          workerId,
          login: ustaLogin,
          name: ustaName || ustaLogin,
          signatureDataUrl: signature,
          completedAt: completedIso,
          documentTitle: USTA_YORIJNOMA_TITLE,
        });
      } catch (fbErr) {
        console.error("Yo‘riqnoma Firebase'ga saqlanmadi:", fbErr);
      }

      const ok = await sendToTelegram();
      if (!ok) {
        setSendNote(
          "Saqlandi, lekin botga yuborilmadi. «Botga yuborish» tugmasi bilan qayta urining.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  /** Avval server (VPS), u ishlamasa to'g'ridan-to'g'ri Telegram. */
  const sendToTelegram = async () => {
    try {
      await sendSignedYorijnomaPdf({
        workerId,
        workerLogin: ustaLogin,
        workerName: ustaName || ustaLogin,
        signature,
        completedAt: new Date().toISOString(),
      });
    } catch (directErr) {
      console.error("Telegramga yuborilmadi:", directErr);
      return false;
    }
    const now = new Date().toISOString();
    setSentAt(now);
    setSendNote("Botga PDF yuborildi ✓");
    if (workerId) saveUstaYorijnoma(workerId, { telegramSentAt: now });
    return true;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Yo‘riqnoma
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Qoidalarni o‘qing, bitta tasdiqlash katakchasini belgilang va imzo qo‘ying.
          {USTA_YORIJNOMA_VIDEO_REQUIRED
            ? " Avval videoni oxirigacha ko‘ring."
            : null}
        </p>
        {completed ? (
          <p className="mt-2 inline-flex rounded-lg bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
            Yo‘riqnoma tasdiqlangan
          </p>
        ) : null}
      </div>

      {USTA_YORIJNOMA_VIDEO_REQUIRED ? (
        <section className={CARD}>
          <div className="flex items-start gap-3">
            <StepBadge n={1} done={videoWatched} active={!videoWatched} />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-slate-900">Video yo‘riqnoma</h2>
              <p className="mt-1 text-sm text-slate-600">
                Videoni to‘liq ko‘ring. Oxirigacha tugagach keyingi qadam ochiladi.
              </p>
              <div className="mt-4 overflow-hidden rounded-xl bg-black">
                {videoError ? (
                  <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-slate-800 p-6 text-center text-sm text-slate-200">
                    <p>Video fayl topilmadi.</p>
                    <p className="text-xs text-slate-400">
                      `public/videos/usta-yorijnoma.mp4` qo‘ying yoki `.env` da{" "}
                      <code className="text-amber-200">VITE_USTA_YORIJNOMA_VIDEO_URL</code>{" "}
                      kiriting.
                    </p>
                  </div>
                ) : (
                  <video
                    ref={videoRef}
                    className="aspect-video w-full"
                    controls
                    playsInline
                    preload="metadata"
                    src={USTA_YORIJNOMA_VIDEO_SRC}
                    onEnded={onVideoEnded}
                    onTimeUpdate={onVideoTimeUpdate}
                    onError={() => setVideoError(true)}
                  >
                    Brauzeringiz video formatini qo‘llab-quvvatlamaydi.
                  </video>
                )}
              </div>
              {videoWatched ? (
                <p className="mt-3 text-sm font-medium text-emerald-700">
                  Video ko‘rildi — keyingi bo‘limga o‘ting.
                </p>
              ) : videoError ? (
                <p className="mt-3 text-sm text-slate-600">
                  Video yo‘q — quyidagi qoidalarni belgilashingiz mumkin.
                </p>
              ) : (
                <p className="mt-3 text-sm text-amber-700">
                  Video hali tugamagan. Oxirigacha ko‘ring.
                </p>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <section
        className={`${CARD} ${!canOpenInstructions ? "pointer-events-none opacity-50" : ""}`}
      >
        <div className="flex items-start gap-3">
          <StepBadge
            n={USTA_YORIJNOMA_VIDEO_REQUIRED ? 2 : 1}
            done={readConfirmed}
            active={canOpenInstructions}
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-900">Qoidalar bilan tanishish</h2>
            <p className="mt-1 text-sm text-slate-600">
              Quyidagilarni o‘qing, keyin pastdagi bitta katakchani belgilang.
            </p>

            <div className="mt-4 rounded-xl border border-slate-300 bg-white p-4 shadow-sm">
              <p className="text-base font-bold tracking-tight text-black">
                {USTA_YORIJNOMA_TITLE}
              </p>
              <p className="text-xs font-bold uppercase tracking-wide text-brand-700">
                {USTA_YORIJNOMA_SUBTITLE}
              </p>

              <div className="mt-4 space-y-5">
                {USTA_YORIJNOMA_SECTIONS.map((section) => (
                  <div key={section.id}>
                    <h3 className="text-[15px] font-bold text-black">{section.title}</h3>
                    {section.items.length > 0 ? (
                      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm font-medium leading-relaxed text-slate-900">
                        {section.items.map((text, i) => (
                          <li key={i}>{text}</li>
                        ))}
                      </ul>
                    ) : null}
                    {Array.isArray(section.warn) && section.warn.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {section.warn.map((text, i) => (
                          <li
                            key={i}
                            className="rounded-lg bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-900 ring-1 ring-amber-300"
                          >
                            ⚠️ {text}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>

              <p className="mt-5 border-t border-slate-300 pt-3 text-sm font-bold text-black">
                Sunnur Energy Tech — sifat va xavfsizlik bilan ishlaydi.
              </p>
            </div>
            <label
              className={`mt-4 flex cursor-pointer items-start gap-3 rounded-xl border-2 px-3 py-3 ${
                readConfirmed
                  ? "border-brand-300 bg-brand-50/80"
                  : "border-slate-200 bg-slate-50"
              }`}
            >
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                checked={readConfirmed}
                onChange={(e) => handleReadConfirm(e.target.checked)}
                disabled={!canOpenInstructions}
              />
              <span className="text-sm font-semibold text-slate-900">
                {USTA_YORIJNOMA_CONFIRM_TEXT}
              </span>
            </label>
          </div>
        </div>
      </section>

      <section className={`${CARD} ${!canSign ? "pointer-events-none opacity-50" : ""}`}>
        <div className="flex items-start gap-3">
          <StepBadge
            n={USTA_YORIJNOMA_VIDEO_REQUIRED ? 3 : 2}
            done={Boolean(signature && saved)}
            active={canSign}
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-900">Imzo</h2>
            <p className="mt-1 text-sm text-slate-600">
              Quyidagi maydonga qo‘l imzongizni qo‘ying (barmoq bilan chizing).
            </p>
            <div className="mt-4">
              <SignaturePad
                value={signature}
                onChange={handleSignature}
                disabled={!canSign}
                height={180}
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!canSign || !signature || submitting}
                onClick={handleFinish}
                className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-soft-md transition hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-50"
              >
                {submitting
                  ? "Yuborilmoqda…"
                  : sentAt
                    ? "Botga qayta yuborish"
                    : saved
                      ? "Botga yuborish"
                      : "Tasdiqlash va botga yuborish"}
              </button>
              {saved ? (
                <span className="inline-flex items-center rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                  Imzo saqlandi ✓
                </span>
              ) : null}
            </div>
            {sendNote ? (
              <p
                className={`mt-2 text-sm font-medium ${
                  sendNote.includes("yuborildi") ? "text-emerald-700" : "text-amber-700"
                }`}
              >
                {sendNote}
              </p>
            ) : !sendNote && sentAt ? (
              <p className="mt-2 text-sm font-medium text-emerald-700">
                Botga yuborilgan ✓
              </p>
            ) : !sendNote && saved ? (
              <p className="mt-2 text-sm font-medium text-amber-700">
                Imzo saqlandi. Hali botga yuborilmagan — «Botga yuborish» tugmasini bosing.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {saved ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Rahmat, {ustaLogin}! Yo‘riqnoma qabul qilindi. Endi{" "}
          <Link to="/usta-panel/loyihalar" className="font-semibold underline">
            Loyihalar
          </Link>{" "}
          bo‘limida ishlashingiz mumkin.
        </div>
      ) : null}
    </div>
  );
}
