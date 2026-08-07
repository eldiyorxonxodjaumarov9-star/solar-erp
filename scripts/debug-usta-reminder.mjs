import dotenv from "dotenv";
dotenv.config();
import { fetchReminderFirestoreData } from "../server/firebaseServer.js";
import { getMasterUploadsForDate } from "../server/masterDailyUploads.js";
import {
  getPendingMasterNames,
  mergeUploadStatus,
} from "../server/masterReminderStatus.js";
import { instantToTashkentYMD, tashkentTodayYMD } from "../src/photos/tashkentTime.js";

const today = tashkentTodayYMD();
const firestoreData = await fetchReminderFirestoreData({ bypassCache: true });
const { workers, stagePhotos, activityLogs } = firestoreData;
const tracked = getMasterUploadsForDate();
const pending = await getPendingMasterNames("midday", firestoreData);
const statusMap = mergeUploadStatus(workers, stagePhotos, activityLogs, tracked);

console.log("Bugun (Toshkent):", today);
console.log("Firestore workers:", workers.length);
console.log("Activity logs:", activityLogs.length);
console.log("Server tracked:", Object.keys(tracked).length);
console.log("Pending midday (login):", pending.length, "->", pending.join(", ") || "(bo'sh)");
console.log("");

for (const status of statusMap.values()) {
  const isPending = pending.includes(status.login);
  console.log(
    [
      isPendingMidday ? "[KUTILMOQDA]" : "[OK]",
      `login: ${status.login}`,
      `| kirdi: ${status.loggedIn ? "ha" : "yo'q"}`,
      `| keldi: ${status.arrival ? "ha" : "yo'q"}`,
      `| ketdi: ${status.departure ? "ha" : "yo'q"}`,
      `| bosqich: ${status.stage ? "ha" : "yo'q"}`,
    ].join(" "),
  );
}
