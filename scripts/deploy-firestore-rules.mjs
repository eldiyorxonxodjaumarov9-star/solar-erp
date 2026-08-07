/**
 * Firestore rules deploy — bir martalik `firebase login` kerak.
 *
 * PowerShell:
 *   firebase login
 *   npm run deploy:firebase-rules
 *
 * Yoki Firebase Console (login shart emas):
 *   https://console.firebase.google.com/project/solar-erp-51870/firestore/rules
 *   firestore.rules mazmunini nusxalab Publish bosing.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rulesPath = path.join(__dirname, "..", "firestore.rules");

console.log(`
=== Firestore rules deploy ===

Muammo: "Missing or insufficient permissions" — Firebase Cloud'da eski qoidalar.
Yechim: yangi firestore.rules ni Publish qiling.

USUL 1 — Firebase Console (eng oson):
  1) https://console.firebase.google.com/project/solar-erp-51870/firestore/rules
  2) Rules oynasida hamma matnni o'chiring
  3) Quyidagi fayl mazmunini joylashtiring: firestore.rules
  4) "Publish" bosing
  5) Authentication → Sign-in method → Anonymous → Enabled bo'lsin

USUL 2 — CLI:
  firebase login
  npm run deploy:firebase-rules
`);

try {
  execSync("firebase deploy --only firestore:rules --project solar-erp-51870", {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
  });
  console.log("\n✅ Firestore rules yangilandi.");
} catch {
  console.log("\n⚠️ CLI deploy ishlamadi — yuqoridagi Console usulidan foydalaning.");
  if (fs.existsSync(rulesPath)) {
    console.log("\n--- firestore.rules (nusxalash uchun) ---\n");
    console.log(fs.readFileSync(rulesPath, "utf8"));
  }
}
