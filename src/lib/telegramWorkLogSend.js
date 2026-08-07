import { api } from "../api/http.js";
import { logTelegramEventClient } from "../telegram/telegramEventLog.js";
import {
  isClientTelegramConfigured,
  sendPhotoDirect,
  sendWorkGeoToGroup,
} from "../telegram/clientTelegram.js";
import { workLogTelegramEvent } from "../telegram/buildTelegramEvent.js";
import {
  enrichWorkLocationAddress,
  getTelegramShareLocation,
} from "./workLocation.js";
import { withTimeout } from "./asyncTimeout.js";

function buildWorkLogCaption(payload) {
  const mode = String(payload.mode || "").trim();
  const workerName = String(payload.workerName || "Usta").trim() || "Usta";
  const date = String(payload.date || "").trim();
  const time = String(payload.time || "").trim();
  const duration = String(payload.duration || "").trim();
  if (mode === "arrival") {
    return `✅ Ishga keldi\nUsta: ${workerName}\nVaqt: ${time}\nSana: ${date}`;
  }
  if (mode === "departure") {
    return `🏁 Ishdan ketdi\nUsta: ${workerName}\nVaqt: ${time}\nSana: ${date}\nIshlagan: ${duration || "—"}`;
  }
  return "";
}

function hasCoords(loc) {
  return (
    loc &&
    Number.isFinite(Number(loc.latitude)) &&
    Number.isFinite(Number(loc.longitude))
  );
}

/** Qurilma GPS koordinatasini manzil matniga boyitadi (qayta GPS so‘ramaydi). */
export async function finalizeWorkLocationForTelegram(existing) {
  if (hasCoords(existing)) {
    return enrichWorkLocationAddress(existing);
  }
  return getTelegramShareLocation();
}

/**
 * Rasm + Telegram geolokatsiyasi (xarita pini) guruhga yuboriladi.
 * 1) Qurilma GPS koordinatasi
 * 2) Bot sendPhoto — rasm
 * 3) Bot sendVenue/sendLocation — aniq xarita + manzil
 */
export async function sendWorkPhotoAndGeoToTelegram({ payload, file }) {
  const location = await withTimeout(
    finalizeWorkLocationForTelegram(payload.location),
    18_000,
    "Lokatsiyaga ruxsat berilmadi yoki GPS javob bermadi.",
  ).catch((err) => {
    console.warn("[attendance] location:", err?.message || err);
    return null;
  });
  const withLocation = { ...payload, location };

  let photoOk = false;
  let venueSent = false;

  try {
    const form = new FormData();
    form.append("mode", String(withLocation.mode || ""));
    form.append("workerId", String(withLocation.workerId || ""));
    form.append("workerLogin", String(withLocation.workerLogin || withLocation.login || ""));
    form.append("workerName", String(withLocation.workerName || ""));
    form.append("date", String(withLocation.date || ""));
    form.append("time", String(withLocation.time || ""));
    form.append("duration", String(withLocation.duration || ""));
    if (withLocation.location) {
      const loc = withLocation.location;
      form.append("locationJson", JSON.stringify(loc));
      form.append("latitude", String(loc.latitude));
      form.append("longitude", String(loc.longitude));
      form.append("accuracy", String(loc.accuracy ?? ""));
      if (loc.address) form.append("address", String(loc.address));
      form.append("locationSource", String(loc.source || "device"));
    }
    form.append("image", file, file.name || "work-log.jpg");

    const result = await withTimeout(
      api.postFormData("/api/telegram/work-log-photo", form),
      30_000,
      "Serverga rasm yuborish vaqti tugadi",
    );
    photoOk = true;
    venueSent = Boolean(result?.venueSent);
    if (result?.location && hasCoords(result.location)) {
      withLocation.location = result.location;
    }
  } catch (serverErr) {
    console.error("work-log-photo server xato, to‘g‘ridan Telegram:", serverErr);
    const caption = buildWorkLogCaption(withLocation);
    await withTimeout(
      sendPhotoDirect({
        caption,
        image: file,
        fileName: file?.name || "work-log.jpg",
      }),
      30_000,
      "Telegramga rasm yuborish vaqti tugadi",
    );
    photoOk = true;
    await logTelegramEventClient(workLogTelegramEvent(withLocation));
  }

  if (photoOk && withLocation.location && isClientTelegramConfigured() && !venueSent) {
    try {
      await withTimeout(
        sendWorkGeoToGroup({
          workerName: withLocation.workerName,
          mode: withLocation.mode,
          location: withLocation.location,
        }),
        15_000,
        "Telegram geo timeout",
      );
    } catch (geoErr) {
      console.warn("[attendance] geo send:", geoErr?.message || geoErr);
    }
  }

  return withLocation.location || null;
}
