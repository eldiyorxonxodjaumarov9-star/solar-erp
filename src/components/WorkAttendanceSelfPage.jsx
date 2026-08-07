import { useEffect, useRef, useState } from "react";
import { api } from "../api/http";
import { sendMessageDirect } from "../telegram/clientTelegram";
import { logTelegramEventClient } from "../telegram/telegramEventLog";
import { workLogTelegramEvent } from "../telegram/buildTelegramEvent";
import { computeTotalWorkSeconds } from "../activity/userActivityLogsStorage";
import { instantToTashkentYMD } from "../photos/tashkentTime";
import {
  addCollectionDocWithId,
  listCollection,
  updateCollectionDoc,
} from "../firebase/firestoreCrud";
import { awardPoint } from "../points/pointsAward";
import SignaturePad from "./SignaturePad";
import FaceCaptureModal from "./FaceCaptureModal";
import { APP_PHOTO_TYPES, saveAppPhoto } from "../photos/appPhotoSave";
import { sendSignedYorijnomaPdf } from "../usta/sendSignedYorijnomaPdf";
import WorkLocationDisplay from "./WorkLocationDisplay";
import { getTelegramShareLocation } from "../lib/workLocation";
import { sendWorkPhotoAndGeoToTelegram } from "../lib/telegramWorkLogSend";
import { withTimeout, attendanceLog, errorMessage } from "../lib/asyncTimeout";
import {
  USTA_YORIJNOMA_CONFIRM_TEXT,
  USTA_YORIJNOMA_SECTIONS,
  USTA_YORIJNOMA_SUBTITLE,
  USTA_YORIJNOMA_TITLE,
} from "../usta/yorijnomaContent";

const TASHKENT_TIMEZONE = "Asia/Tashkent";
const MAX_SIGNATURE_CLEARS = 2;

function getPartFromTashkent(type) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TASHKENT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  return parts.find((p) => p.type === type)?.value || "";
}

function getTashkentDateKey() {
  const y = getPartFromTashkent("year");
  const m = getPartFromTashkent("month");
  const d = getPartFromTashkent("day");
  return `${y}-${m}-${d}`;
}

function getTashkentClockLabel() {
  const hh = getPartFromTashkent("hour");
  const mm = getPartFromTashkent("minute");
  const ss = getPartFromTashkent("second");
  const dd = getPartFromTashkent("day");
  const mo = getPartFromTashkent("month");
  const yy = getPartFromTashkent("year");
  return `${hh}:${mm}:${ss} — ${dd}.${mo}.${yy}`;
}

function formatTashkentDateFromMs(ms) {
  const date = new Date(ms);
  return date.toLocaleDateString("uz-UZ", {
    timeZone: TASHKENT_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTashkentTimeFromMs(ms) {
  const date = new Date(ms);
  return date.toLocaleTimeString("uz-UZ", {
    timeZone: TASHKENT_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

async function dataUrlToFile(dataUrl, fileName = "keldi.jpg") {
  const res = await fetch(String(dataUrl));
  const blob = await res.blob();
  return new File([blob], fileName, { type: blob.type || "image/jpeg" });
}

function formatDuration(msStart, msEnd) {
  if (!msStart || !msEnd || msEnd <= msStart) return "—";
  const diffMs = msEnd - msStart;
  const diffMin = Math.max(1, Math.ceil(diffMs / 60000));
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return `${h} soat ${m} daqiqa`;
}

function emptyDayLog(day = getTashkentDateKey()) {
  return {
    date: day,
    arrivalTimeMs: 0,
    departureTimeMs: 0,
    arrivalImage: "",
    departureImage: "",
    arrivalLocation: null,
    departureLocation: null,
    totalWorkDuration: "",
    dayOff: false,
    restMessage: "",
    arrivalComplete: false,
    arrivalSignature: "",
    arrivalReadConfirmed: false,
    signatureClearCount: 0,
  };
}

function getDeviceInfo() {
  return {
    userAgent: String(navigator.userAgent || ""),
    platform: String(navigator.platform || ""),
    browser: "web",
  };
}

async function notifyYorijnomaSignature(payload) {
  await sendSignedYorijnomaPdf(payload);
}

async function notifyArrivalWithSignature(workPayload, file, yorPayload) {
  const location = await sendWorkPhotoAndGeoToTelegram({ payload: workPayload, file });
  await notifyYorijnomaSignature(yorPayload);
  return location;
}

function buildWorkLogCaption(payload, roleLabel) {
  const mode = String(payload.mode || "").trim();
  const workerName = String(payload.workerName || roleLabel).trim() || roleLabel;
  const date = String(payload.date || "").trim();
  const time = String(payload.time || "").trim();
  const duration = String(payload.duration || "").trim();
  const reason = String(payload.reason || "").trim();
  const masterName = String(payload.masterName || "").trim();
  const masterLine = masterName ? `\nMaster: ${masterName}` : "";
  if (mode === "arrival") {
    return `✅ Ishga keldi\n${roleLabel}: ${workerName}${masterLine}\nVaqt: ${time}\nSana: ${date}`;
  }
  if (mode === "departure") {
    return `🏁 Ishdan ketdi\n${roleLabel}: ${workerName}${masterLine}\nVaqt: ${time}\nSana: ${date}\nIshlagan: ${duration || "—"}`;
  }
  if (mode === "day_off") {
    return `🌴 Dam olish kuni\n${roleLabel}: ${workerName}${masterLine}\nSana: ${date}\nSabab: ${reason || "—"}`;
  }
  return "";
}

async function notifyTelegramWorkLog(payload, roleLabel) {
  try {
    await api.post("/api/telegram/work-log", payload);
  } catch (serverErr) {
    console.error("work-log server orqali yuborilmadi, to‘g‘ridan urinilmoqda:", serverErr);
    const text = buildWorkLogCaption(payload, roleLabel);
    if (!text) throw serverErr;
    await sendMessageDirect(text);
    await logTelegramEventClient(workLogTelegramEvent(payload));
  }
}

/**
 * @param {{
 *   personId: string;
 *   personLogin: string;
 *   personName: string;
 *   storagePrefix: string;
 *   personKind?: 'usta' | 'asisten';
 *   assistantId?: string;
 *   masterName?: string;
 *   awardPoints?: boolean;
 *   pointsWorkerId?: string;
 *   missingProfileMessage?: string;
 * }} props
 */
export default function WorkAttendanceSelfPage({
  personId,
  personLogin,
  personName,
  storagePrefix,
  personKind = "usta",
  assistantId = "",
  masterName = "",
  awardPoints = false,
  pointsWorkerId = "",
  missingProfileMessage = "Profil topilmadi. Qayta kiring yoki administrator bilan bog‘laning.",
}) {
  const roleLabel = personKind === "asisten" ? "Asisten" : "Usta";
  const displayName = personName || roleLabel;

  const dateKey = getTashkentDateKey();
  const dayStorageKey = `${storagePrefix}_${dateKey}`;
  const lastDateKey = `${storagePrefix}_last_date`;

  const [clockText, setClockText] = useState(getTashkentClockLabel());
  const [log, setLog] = useState(() => emptyDayLog(dateKey));
  const [faceCaptureOpen, setFaceCaptureOpen] = useState(false);
  const [photoTarget, setPhotoTarget] = useState(null);
  const [dayOffModalOpen, setDayOffModalOpen] = useState(false);
  const [restMessage, setRestMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [processingKind, setProcessingKind] = useState(null);
  const [processStatus, setProcessStatus] = useState("");
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [pendingArrivalFile, setPendingArrivalFile] = useState(null);
  const [arrivalSubmitBusy, setArrivalSubmitBusy] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState("");

  const allowLocalPersistRef = useRef(false);

  const findTodayLogIndex = (logs, today) => {
    const logDateKey = (x) =>
      String(x?.dateKey || "").trim() || instantToTashkentYMD(x?.loginTime);
    if (personKind === "asisten") {
      return logs.findIndex(
        (x) =>
          (String(x.assistantId) === assistantId ||
            String(x.ustaId) === personId) &&
          logDateKey(x) === today,
      );
    }
    return logs.findIndex(
      (x) => String(x.ustaId) === String(personId) && logDateKey(x) === today,
    );
  };

  const buildActivityBaseFields = (today) => {
    if (personKind === "asisten") {
      return {
        personType: "asisten",
        assistantId,
        ustaId: personId,
        ustaName: displayName,
        brigadeId: "",
        brigadeName: masterName || "Asisten",
        dateKey: today,
        deviceInfo: getDeviceInfo(),
        workAttendance: true,
      };
    }
    return {
      ustaId: personId,
      ustaName: displayName,
      brigadeId: "",
      brigadeName: "",
      dateKey: today,
      deviceInfo: getDeviceInfo(),
      workAttendance: true,
    };
  };

  const upsertAdminWorkLog = async (mode, nowIso, location) => {
    if (!personId) return;
    const today = getTashkentDateKey();
    const logs = await listCollection("user_activity_logs");
    const todayIdx = findTodayLogIndex(logs, today);
    const newId = () =>
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `al-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    if (mode === "arrival") {
      const arrivalPatch = {
        loginTime: nowIso,
        dateKey: today,
        isOnline: true,
        workAttendance: true,
      };
      if (location) arrivalPatch.loginLocation = location;
      if (todayIdx >= 0) {
        await updateCollectionDoc("user_activity_logs", logs[todayIdx].id, {
          ...arrivalPatch,
          ...(personKind === "asisten"
            ? { personType: "asisten", assistantId, workAttendance: true }
            : { workAttendance: true }),
        });
      } else {
        const id = newId();
        await addCollectionDocWithId("user_activity_logs", id, {
          id,
          ...buildActivityBaseFields(today),
          loginTime: nowIso,
          logoutTime: null,
          totalWorkTime: null,
          loginLocation: location || null,
          isOnline: true,
        });
      }
      return;
    }

    if (mode === "departure") {
      const departurePatch = { isOnline: false, workAttendance: true };
      if (location) departurePatch.logoutLocation = location;
      if (todayIdx >= 0) {
        const loginIso = String(logs[todayIdx].loginTime || nowIso);
        const total = computeTotalWorkSeconds(loginIso, nowIso);
        await updateCollectionDoc("user_activity_logs", logs[todayIdx].id, {
          ...departurePatch,
          logoutTime: nowIso,
          totalWorkTime: total,
        });
      } else {
        const id = newId();
        await addCollectionDocWithId("user_activity_logs", id, {
          id,
          ...buildActivityBaseFields(today),
          loginTime: nowIso,
          logoutTime: nowIso,
          totalWorkTime: 0,
          logoutLocation: location || null,
          isOnline: false,
        });
      }
    }
  };

  useEffect(() => {
    allowLocalPersistRef.current = false;

    const storedLast = localStorage.getItem(lastDateKey);
    if (storedLast && storedLast !== dateKey) {
      localStorage.removeItem(`${storagePrefix}_${storedLast}`);
    }
    localStorage.setItem(lastDateKey, dateKey);

    const raw = localStorage.getItem(dayStorageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const loadedDate = String(parsed.date || "") || dateKey;
        if (loadedDate !== dateKey) {
          setLog(emptyDayLog(dateKey));
        } else {
          setLog({
            ...emptyDayLog(dateKey),
            ...parsed,
            date: dateKey,
            arrivalTimeMs: Number(parsed.arrivalTimeMs || 0),
            departureTimeMs: Number(parsed.departureTimeMs || 0),
            arrivalImage: String(parsed.arrivalImage || ""),
            departureImage: String(parsed.departureImage || ""),
            arrivalLocation: parsed.arrivalLocation || null,
            departureLocation: parsed.departureLocation || null,
            totalWorkDuration: String(parsed.totalWorkDuration || ""),
            dayOff: Boolean(parsed.dayOff),
            restMessage: String(parsed.restMessage || ""),
            arrivalComplete: Boolean(parsed.arrivalComplete),
            arrivalSignature: String(parsed.arrivalSignature || ""),
            arrivalReadConfirmed: Boolean(parsed.arrivalReadConfirmed),
            signatureClearCount: Number(parsed.signatureClearCount || 0),
          });
        }
      } catch {
        localStorage.removeItem(dayStorageKey);
        setLog(emptyDayLog(dateKey));
      }
    } else {
      setLog(emptyDayLog(dateKey));
    }

    queueMicrotask(() => {
      allowLocalPersistRef.current = true;
    });
  }, [dateKey, dayStorageKey, lastDateKey, storagePrefix]);

  useEffect(() => {
    try {
      if (allowLocalPersistRef.current && log.date === dateKey) {
        localStorage.setItem(dayStorageKey, JSON.stringify(log));
        localStorage.setItem(lastDateKey, dateKey);
      }
    } catch (error) {
      console.error("Ish vaqti holatini saqlashda xatolik:", error);
    }
    setOverlayVisible(Boolean(log.dayOff));
  }, [dateKey, dayStorageKey, lastDateKey, log]);

  useEffect(() => {
    const t = setInterval(() => {
      setClockText(getTashkentClockLabel());

      const nowDateKey = getTashkentDateKey();
      if (nowDateKey === dateKey) return;

      const prevDayKey = `${storagePrefix}_${dateKey}`;
      localStorage.removeItem(prevDayKey);
      localStorage.setItem(lastDateKey, nowDateKey);

      setDayOffModalOpen(false);
      setRestMessage("");
      setPhotoTarget(null);
      setFaceCaptureOpen(false);
      setOverlayVisible(false);
      setPendingArrivalFile(null);
      setTelegramStatus("");
      setLog(emptyDayLog(nowDateKey));
    }, 1000);

    return () => clearInterval(t);
  }, [dateKey, lastDateKey, storagePrefix]);

  if (!personId) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
        <p className="font-semibold">{missingProfileMessage}</p>
      </section>
    );
  }

  const openPhotoModal = (target) => {
    if (busy || log.dayOff) return;
    setPhotoTarget(target);
    setFaceCaptureOpen(true);
  };

  const handleFaceCapture = async ({ file, imageData }) => {
    if (!file || !photoTarget) return;

    const kind = photoTarget;
    setFaceCaptureOpen(false);
    setBusy(true);
    setProcessingKind(kind);
    setProcessStatus("Rasm saqlanmoqda…");
    attendanceLog("start save", kind);

    try {
      const nowMs = Date.now();
      const hhmm = formatTashkentTimeFromMs(nowMs);
      const sana = formatTashkentDateFromMs(nowMs);

      const todayKey = getTashkentDateKey();
      const photoType =
        kind === "arrival" ? APP_PHOTO_TYPES.KELDI : APP_PHOTO_TYPES.KETDI;

      if (kind === "departure" && !log.arrivalComplete) {
        throw new Error(
          "Avval ishga kelishni to‘liq yakunlang (rasm + yo‘riqnoma imzosi).",
        );
      }

      setProcessStatus("Rasm yuklanmoqda…");
      const saved = await withTimeout(
        saveAppPhoto({
          ustaId: personId,
          ustaName: displayName,
          type: photoType,
          dateKey: todayKey,
          file,
          imageData,
          comment:
            kind === "arrival"
              ? `${roleLabel} — kelish yuz surati`
              : `${roleLabel} — ketish yuz surati`,
        }),
        45_000,
        "Rasm saqlash vaqti tugadi. Qayta urinib ko‘ring.",
      );
      attendanceLog("upload/firestore complete");

      if (kind === "arrival") {
        setPendingArrivalFile(saved.file);
        setTelegramStatus("");
        setProcessStatus("Tayyor — imzo qo‘ying");
        setLog((prev) => ({
          ...prev,
          date: todayKey,
          arrivalTimeMs: nowMs,
          arrivalImage: saved.imageData || saved.imageUrl || "",
          arrivalLocation: null,
          dayOff: false,
          restMessage: "",
          departureTimeMs: 0,
          departureImage: "",
          departureLocation: null,
          totalWorkDuration: "",
          arrivalComplete: false,
          arrivalSignature: "",
          arrivalReadConfirmed: false,
          signatureClearCount: 0,
        }));
        attendanceLog("completed arrival draft");
      } else {
        const worked = formatDuration(log.arrivalTimeMs, nowMs);
        const nowIso = new Date(nowMs).toISOString();

        setLog((prev) => ({
          ...prev,
          departureTimeMs: nowMs,
          departureImage: saved.imageData || saved.imageUrl || "",
          totalWorkDuration: worked,
        }));

        setProcessStatus("Lokatsiya olinmoqda…");
        setTelegramStatus("GPS yoqilmoqda, aniq manzil aniqlanmoqda…");

        const payload = {
          mode: "departure",
          workerId: personId,
          workerLogin: personLogin,
          workerName: displayName,
          masterName,
          date: sana,
          time: hhmm,
          duration: worked,
        };

        setProcessStatus("Telegramga yuborilmoqda…");
        setTelegramStatus("Botga yuborilmoqda…");
        const departureLocation = await withTimeout(
          sendWorkPhotoAndGeoToTelegram({
            payload,
            file: saved.file,
          }),
          45_000,
          "Telegram yuborish vaqti tugadi",
        );
        attendanceLog("telegram sent");
        if (departureLocation) {
          setLog((prev) => ({ ...prev, departureLocation }));
        }
        if (awardPoints && pointsWorkerId) {
          void awardPoint(pointsWorkerId, "ketdi");
        }
        setProcessStatus("Ma’lumot saqlanmoqda…");
        await withTimeout(
          upsertAdminWorkLog("departure", nowIso, departureLocation),
          25_000,
          "Hisobot saqlash vaqti tugadi",
        );
        void logTelegramEventClient({
          ...workLogTelegramEvent({
            mode: "departure",
            workerId: personId,
            workerLogin: personLogin,
            workerName: displayName,
            date: sana,
            time: hhmm,
            duration: worked,
          }),
          sentAt: nowIso,
        });
        setTelegramStatus("Ketish rasmi va manzil botga yuborildi.");
        setProcessStatus("Tayyor");
        attendanceLog("completed departure");
      }
    } catch (e) {
      console.error(e);
      const msg = errorMessage(e, "Saqlashda xatolik");
      alert(msg);
      setTelegramStatus("Jarayon to‘xtadi. Qayta urinib ko‘ring.");
      attendanceLog("error", msg);
    } finally {
      setBusy(false);
      setProcessingKind(null);
      setProcessStatus("");
      setPhotoTarget(null);
    }
  };

  const cancelBusy = () => {
    setBusy(false);
    setProcessingKind(null);
    setProcessStatus("");
    setTelegramStatus("Jarayon bekor qilindi.");
  };

  const submitDayOff = async () => {
    const reason = restMessage.trim();
    if (reason.length < 10) {
      alert("Sabab kamida 10 ta belgidan iborat bo‘lsin");
      return;
    }

    try {
      const sana = formatTashkentDateFromMs(Date.now());
      setTelegramStatus("");
      setLog((prev) => ({
        ...prev,
        date: getTashkentDateKey(),
        dayOff: true,
        restMessage: reason,
        arrivalTimeMs: 0,
        departureTimeMs: 0,
        arrivalImage: "",
        departureImage: "",
        totalWorkDuration: "",
      }));
      setRestMessage("");
      setDayOffModalOpen(false);
      setOverlayVisible(true);

      try {
        await notifyTelegramWorkLog(
          {
            mode: "day_off",
            workerId: personId,
            workerLogin: personLogin,
            workerName: displayName,
            masterName,
            date: sana,
            reason,
          },
          roleLabel,
        );
        setTelegramStatus("Dam olish xabari botga yuborildi.");
      } catch (error) {
        console.error("Day-off bot send error:", error);
        setTelegramStatus("Dam olish xabari botga yuborilmadi.");
      }
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Telegramga yuborilmadi");
    }
  };

  const arrivalMs = log.arrivalTimeMs;
  const departureMs = log.departureTimeMs;
  const durationText =
    log.totalWorkDuration ||
    (arrivalMs && departureMs ? formatDuration(arrivalMs, departureMs) : "—");

  const hasArrival = Boolean(log.arrivalComplete);
  const hasDeparture = Boolean(log.departureTimeMs);
  const arrivalDraft = Boolean(log.arrivalImage) && !log.arrivalComplete;
  const departurePhotoOk = Boolean(log.departureImage);

  const canStartKeldi = !log.dayOff && !log.arrivalComplete && !arrivalDraft;
  const canEnd = !log.dayOff && log.arrivalComplete && !hasDeparture;
  const canDayOff =
    !log.arrivalComplete && !arrivalDraft && !hasDeparture && !log.dayOff;

  const arrivalPreview = log.arrivalImage;
  const departurePreview = log.departureImage;

  const handleArrivalComplete = async () => {
    if (!personId || !log.arrivalImage) {
      alert("Avval kelish rasmini yuklang.");
      return;
    }
    let file = pendingArrivalFile;
    if (!file && String(log.arrivalImage).startsWith("data:")) {
      file = await dataUrlToFile(log.arrivalImage);
    }
    if (!file) {
      alert("Kelish rasmi topilmadi. Qayta rasm yuklang.");
      return;
    }
    if (!log.arrivalReadConfirmed) {
      alert("Yo‘riqnoma bilan tanishganingizni tasdiqlang.");
      return;
    }
    if (!log.arrivalSignature) {
      alert("Imzo qo‘ying.");
      return;
    }
    setArrivalSubmitBusy(true);
    setTelegramStatus("GPS yoqilmoqda, aniq manzil aniqlanmoqda…");
    try {
      const nowMs = log.arrivalTimeMs || Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const hhmm = formatTashkentTimeFromMs(nowMs);
      const sana = formatTashkentDateFromMs(nowMs);
      const today = getTashkentDateKey();

      const location = await withTimeout(
        getTelegramShareLocation(),
        18_000,
        "Lokatsiyaga ruxsat berilmadi yoki GPS javob bermadi.",
      ).catch((e) => {
        console.warn("Joylashuv olinmadi:", e);
        alert(
          e instanceof Error
            ? e.message
            : "GPS joylashuv olinmadi. Sozlamalar → SolarERP → Joylashuv ruxsatini bering.",
        );
        return null;
      });

      if (location) {
        setLog((prev) => ({ ...prev, arrivalLocation: location }));
        await new Promise((r) => setTimeout(r, 600));
      }

      setTelegramStatus(
        location
          ? "Aniq manzil topildi — botga yuborilmoqda…"
          : "Manzil olinmadi — rasm va imzo yuborilmoqda…",
      );

      const sentLocation = await withTimeout(
        notifyArrivalWithSignature(
          {
            mode: "arrival",
            workerId: personId,
            workerLogin: personLogin,
            workerName: displayName,
            masterName,
            date: sana,
            time: hhmm,
            location,
          },
          pendingArrivalFile || file,
          {
            workerId: personId,
            workerLogin: personLogin,
            workerName: displayName,
            signature: log.arrivalSignature,
          },
        ),
        60_000,
        "Telegram / imzo yuborish vaqti tugadi",
      );

      const arrivalLocation = sentLocation || log.arrivalLocation;
      if (arrivalLocation) {
        setLog((prev) => ({ ...prev, arrivalLocation }));
      }

      await upsertAdminWorkLog("arrival", nowIso, arrivalLocation);
      void logTelegramEventClient({
        ...workLogTelegramEvent({
          mode: "arrival",
          workerId: personId,
          workerLogin: personLogin,
          workerName: displayName,
          date: sana,
          time: hhmm,
        }),
        sentAt: nowIso,
      });
      if (awardPoints && pointsWorkerId) {
        void awardPoint(pointsWorkerId, "keldi");
      }

      try {
        await addCollectionDocWithId("usta_yorijnoma", `${personId}_${today}`, {
          workerId: personId,
          login: personLogin,
          name: displayName,
          signatureDataUrl: log.arrivalSignature,
          completedAt: new Date().toISOString(),
          dateKey: today,
          documentTitle: USTA_YORIJNOMA_TITLE,
          personKind,
        });
      } catch (fbErr) {
        console.warn("Yo‘riqnoma saqlanmadi:", fbErr);
      }

      setLog((prev) => ({
        ...prev,
        arrivalComplete: true,
        arrivalLocation: arrivalLocation || prev.arrivalLocation,
      }));
      setPendingArrivalFile(null);
      setTelegramStatus(
        arrivalLocation
          ? "Kelish rasmi, imzo va aniq manzil botga yuborildi."
          : "Kelish rasmi va yo‘riqnoma imzosi botga yuborildi.",
      );
    } catch (error) {
      console.error(error);
      setTelegramStatus("Botga yuborilmadi. Qayta urinib ko‘ring.");
    } finally {
      setArrivalSubmitBusy(false);
    }
  };

  return (
    <>
      <section className="rounded-[1.375rem] border border-slate-200/85 bg-gradient-to-br from-white via-white to-slate-50/80 p-6 pb-40 shadow-soft-lg ring-1 ring-slate-900/[0.03] sm:p-8">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Ish vaqti
        </h2>

        <p className="mt-2 text-sm text-slate-600">
          Kelish va ketishda avval yuz surati olinadi. Imzo qo‘ygach GPS yoqiladi — Telegram
          guruhiga xarita pini va aniq manzil yuboriladi.
        </p>
        <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900">
          {clockText}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-white p-4">
            <p className="text-sm text-slate-500">Kelish vaqti</p>
            <p className="mt-2 text-xl font-bold">
              {arrivalMs ? formatTashkentTimeFromMs(arrivalMs) : "—"}
            </p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-sm text-slate-500">Ketish vaqti</p>
            <p className="mt-2 text-xl font-bold">
              {departureMs ? formatTashkentTimeFromMs(departureMs) : "—"}
            </p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-sm text-slate-500">Ishlagan vaqt</p>
            <p className="mt-2 text-xl font-bold">{durationText}</p>
          </div>
        </div>

        {log.arrivalLocation || log.departureLocation ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {log.arrivalLocation ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <WorkLocationDisplay location={log.arrivalLocation} label="Kelish joyi" />
              </div>
            ) : null}
            {log.departureLocation ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <WorkLocationDisplay location={log.departureLocation} label="Ketish joyi" />
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800">
          <span className="font-semibold text-slate-900">Bugun ishlagan vaqt:</span>{" "}
          {durationText}
        </div>

        {telegramStatus ? (
          <p className="mt-4 text-sm text-slate-700">{telegramStatus}</p>
        ) : null}

        {busy && processStatus ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-sky-300 border-t-sky-700" />
            <span className="flex-1 font-medium">{processStatus}</span>
            <button
              type="button"
              onClick={cancelBusy}
              className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-800"
            >
              Bekor qilish
            </button>
          </div>
        ) : null}

        {!log.dayOff && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              disabled={!canStartKeldi || busy}
              onClick={() => openPhotoModal("arrival")}
              className={`rounded-xl px-5 py-4 text-center font-bold ${
                canStartKeldi && !busy
                  ? "cursor-pointer bg-amber-400 text-slate-900 hover:brightness-105"
                  : "cursor-not-allowed bg-slate-300 text-slate-600"
              }`}
            >
              {busy && processingKind === "arrival"
                ? processStatus || "Jarayon davom etmoqda…"
                : log.arrivalComplete
                  ? "Bugun kelish qayd etilgan"
                  : arrivalDraft
                    ? "Rasm yuklandi — imzo qo‘ying"
                    : "Ishga keldim"}
            </button>
            <button
              type="button"
              disabled={!canEnd || busy}
              onClick={() => openPhotoModal("departure")}
              className={`rounded-xl px-5 py-4 text-center font-bold ${
                canEnd && !busy
                  ? "cursor-pointer bg-slate-800 text-white hover:bg-slate-900"
                  : "cursor-not-allowed bg-slate-300 text-slate-600"
              }`}
            >
              {busy && processingKind === "departure"
                ? processStatus || "Jarayon davom etmoqda…"
                : hasDeparture && departurePhotoOk
                  ? "Ketish qayd etilgan"
                  : hasDeparture && !departurePhotoOk
                    ? "Vaqt saqlangan — rasm qayta kerak"
                    : "Ketdim"}
            </button>
          </div>
        )}

        {arrivalDraft ? (
          <div className="mt-6 rounded-xl border border-brand-200 bg-brand-50/40 p-4 sm:p-5">
            <h3 className="text-lg font-semibold text-slate-900">{USTA_YORIJNOMA_TITLE}</h3>
            <p className="mt-1 text-sm text-slate-600">{USTA_YORIJNOMA_SUBTITLE}</p>

            <div className="mt-4 max-h-48 space-y-3 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
              {USTA_YORIJNOMA_SECTIONS.map((sec) => (
                <div key={sec.id}>
                  <p className="font-semibold text-slate-900">{sec.title}</p>
                  {sec.items?.length ? (
                    <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
                      {sec.items.map((item) => (
                        <li key={item.slice(0, 40)}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
              <input
                type="checkbox"
                checked={log.arrivalReadConfirmed}
                onChange={(e) =>
                  setLog((prev) => ({
                    ...prev,
                    arrivalReadConfirmed: e.target.checked,
                  }))
                }
                className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600"
              />
              <span className="text-sm text-slate-800">{USTA_YORIJNOMA_CONFIRM_TEXT}</span>
            </label>

            {arrivalPreview ? (
              <div className="mt-4">
                <p className="mb-2 text-sm font-semibold text-slate-800">Kelish rasmi</p>
                <img
                  src={arrivalPreview}
                  alt="Kelish"
                  className="aspect-[3/4] w-full max-w-[200px] rounded-xl object-cover"
                />
              </div>
            ) : null}

            <div className="mt-4">
              <p className="mb-2 text-sm font-semibold text-slate-800">Imzo qo‘ying</p>
              <p className="mb-3 text-xs text-slate-500">
                Imzo qo‘ygach «Saqlash» bosilganda GPS yoqiladi va aniq manzil aniqlanadi.
              </p>
              <SignaturePad
                value={log.arrivalSignature}
                onChange={(dataUrl) =>
                  setLog((prev) => ({ ...prev, arrivalSignature: dataUrl }))
                }
                onClear={() =>
                  setLog((prev) => ({
                    ...prev,
                    signatureClearCount: prev.signatureClearCount + 1,
                    arrivalSignature: "",
                  }))
                }
                disabled={!log.arrivalReadConfirmed || arrivalSubmitBusy}
                maxClears={MAX_SIGNATURE_CLEARS}
                clearCount={log.signatureClearCount}
                height={140}
              />
            </div>

            {log.arrivalLocation ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                <WorkLocationDisplay location={log.arrivalLocation} label="Aniq manzil" />
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void handleArrivalComplete()}
              disabled={
                arrivalSubmitBusy || !log.arrivalReadConfirmed || !log.arrivalSignature
              }
              className="mt-4 w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white shadow-md hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {arrivalSubmitBusy
                ? "GPS va manzil aniqlanmoqda…"
                : "Saqlash va botga yuborish (rasm + imzo + manzil)"}
            </button>
          </div>
        ) : null}

        {canDayOff && (
          <button
            type="button"
            onClick={() => setDayOffModalOpen(true)}
            className="mt-6 w-full rounded-xl border border-amber-400 bg-amber-50 px-5 py-4 text-center font-bold text-amber-900 transition hover:bg-amber-100"
          >
            Bugun dam olaman
          </button>
        )}

        {log.dayOff && (
          <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
            <p className="font-semibold">Dam olish kuni</p>
            <p className="mt-1 text-sm">{log.restMessage || "—"}</p>
          </div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {arrivalPreview && log.arrivalComplete ? (
            <div>
              <p className="mb-2 text-sm font-semibold">Kelish rasmi</p>
              <img
                src={arrivalPreview}
                alt="Kelish rasmi"
                className="aspect-[3/4] w-full max-w-xs rounded-xl object-cover"
              />
            </div>
          ) : null}
          {departurePreview ? (
            <div>
              <p className="mb-2 text-sm font-semibold">Ketish rasmi</p>
              <img
                src={departurePreview}
                alt="Ketish rasmi"
                className="aspect-[3/4] w-full max-w-xs rounded-xl object-cover"
              />
            </div>
          ) : null}
        </div>
      </section>

      <FaceCaptureModal
        open={faceCaptureOpen}
        title={photoTarget === "departure" ? "Ketish — yuz surati" : "Kelish — yuz surati"}
        onClose={() => {
          if (!busy) {
            setFaceCaptureOpen(false);
            setPhotoTarget(null);
          }
        }}
        onCapture={(payload) => void handleFaceCapture(payload)}
      />

      {dayOffModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900">Dam olish sababi</h3>
            <p className="mt-2 text-sm text-slate-600">Sababni kiriting (kamida 10 ta belgi)</p>
            <textarea
              value={restMessage}
              onChange={(e) => setRestMessage(e.target.value)}
              placeholder="Sabab yoki qisqa xabar"
              className="mt-4 w-full rounded-xl border border-amber-400 px-4 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-amber-300"
              rows={4}
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setDayOffModalOpen(false);
                  setRestMessage("");
                }}
                className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={() => void submitDayOff()}
                disabled={restMessage.trim().length < 10}
                className="flex-1 rounded-xl bg-amber-400 px-4 py-2.5 font-bold text-slate-900 disabled:opacity-50"
              >
                Tasdiqlash
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {overlayVisible && log.dayOff ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          style={{ backdropFilter: "blur(2px)" }}
        >
          <div className="max-w-lg rounded-2xl bg-white p-6 text-center shadow-2xl">
            <p className="text-2xl font-bold text-slate-900">Bugun dam olasiz 🌿</p>
            <p className="mt-3 text-sm text-slate-700">{log.restMessage}</p>
            <button
              type="button"
              onClick={() => setOverlayVisible(false)}
              className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Yopish
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
