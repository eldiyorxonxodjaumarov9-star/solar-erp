import { hasSentId, markSentId } from "./storage.js";
import { fetchLatestImage } from "./erpService.js";
import { sendPhotoToTelegram } from "./telegramService.js";
import cron from "node-cron";

let cronTask = null;
let cycleRunning = false;

/**
 * @param {{ token: string; groupId: string; erpApiUrl: string }} config
 */
export async function runCycle(config) {
  if (cycleRunning) {
    return;
  }
  cycleRunning = true;

  try {
    const { token, groupId, erpApiUrl } = config;

    if (!token || !groupId || !erpApiUrl) {
      console.error("CONFIG ERROR");
      return;
    }

    let latest;
    try {
      latest = await fetchLatestImage(erpApiUrl);
    } catch {
      console.error("ERP FAILED");
      return;
    }

    if (!latest) {
      return;
    }

    console.log(`FETCHED ID: ${latest.id}`);

    if (hasSentId(latest.id)) {
      console.log(`SKIPPED DUPLICATE: ${latest.id}`);
      return;
    }

    const caption = `Solar ERP\nID: ${latest.id}\nTime: ${new Date().toISOString()}`;

    try {
      await sendPhotoToTelegram({
        token,
        groupId,
        imageUrl: latest.image,
        caption,
      });
      markSentId(latest.id);
      console.log(`SENT SUCCESS: ${latest.id}`);
    } catch (error) {
      console.error("TELEGRAM FAILED:", error);
    }
  } finally {
    cycleRunning = false;
  }
}

/**
 * @param {{ token: string; groupId: string; erpApiUrl: string }} config
 */
export function startBot(config) {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
  }

  cronTask = cron.schedule("*/30 * * * * *", () => {
    void runCycle(config);
  });

  void runCycle(config);
}

export function stopBot() {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
  }
}
