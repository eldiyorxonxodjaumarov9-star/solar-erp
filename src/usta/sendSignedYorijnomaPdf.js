import { api } from "../api/http.js";
import { logTelegramEventClient } from "../telegram/telegramEventLog.js";
import { yorijnomaTelegramEvent } from "../telegram/buildTelegramEvent.js";
import { sendYorijnomaToTelegramDirect } from "../telegram/clientTelegram.js";
import {
  blobToBase64,
  buildYorijnomaPdfBlob,
} from "./yorijnomaPdfExport.js";

/**
 * Imzolangan yo'riqnomani PDF qilib botga yuboradi.
 */
export async function sendSignedYorijnomaPdf({
  workerId = "",
  workerLogin = "",
  workerName = "Usta",
  signature = "",
  completedAt = "",
}) {
  const pdfBlob = await buildYorijnomaPdfBlob({
    workerName,
    workerLogin,
    workerId,
    signatureDataUrl: signature,
    completedAt: completedAt || new Date().toISOString(),
  });
  const pdfBase64 = await blobToBase64(pdfBlob);

  const payload = {
    workerId,
    workerLogin,
    workerName,
    signature,
    pdfBase64,
    completedAt: completedAt || new Date().toISOString(),
  };

  try {
    await api.post("/api/telegram/yorijnoma", payload);
  } catch (serverErr) {
    console.error("yorijnoma server orqali yuborilmadi, to'g'ridan urinilmoqda:", serverErr);
    await sendYorijnomaToTelegramDirect({
      name: workerName,
      login: workerLogin,
      workerId,
      signature,
      pdfBlob,
      completedAt: payload.completedAt,
    });
    await logTelegramEventClient(yorijnomaTelegramEvent(payload));
  }
}
