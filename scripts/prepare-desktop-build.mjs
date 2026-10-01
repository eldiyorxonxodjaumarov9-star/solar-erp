/**
 * Desktop .exe yig‘ishdan oldin: native modullar (better-sqlite3) + .env / data tayyorlash.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { desktopPublicEnv } from './desktop-public-env.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "data");
const envSrc = join(root, ".env");
const envDst = join(root, "desktop-build.env");

mkdirSync(dataDir, { recursive: true });

function killPackagedAppLocks() {
  if (process.platform !== "win32") return;
  // Faqat paketlangan ilova — barcha node.exe ni o‘chirmang (build o‘zini o‘ldiradi).
  try {
    execSync("taskkill /IM SolarERP.exe /F", { stdio: "ignore" });
    console.log("[desktop] SolarERP.exe to‘xtatildi");
  } catch {
    /* ishlamayotgan bo‘lishi mumkin */
  }
}

killPackagedAppLocks();

function writeDesktopEnv() {
  const productionEnv=join(root,'.env.production');
  const source=readFileSync(envSrc,'utf8')+'\n'+(existsSync(productionEnv)?readFileSync(productionEnv,'utf8'):'');
  writeFileSync(envDst,desktopPublicEnv(source),'utf8');
}

if (existsSync(envSrc)) {
  writeDesktopEnv();
  console.log("[desktop] .env → desktop-build.env (PORT=5150)");
} else {
  throw new Error('Desktop release public HTTPS config missing; server credentials must not be packaged.');
}

console.log("[desktop] better-sqlite3 — Electron uchun qayta yig‘ilmoqda…");
try {
  execSync("npx --yes @electron/rebuild -f -w better-sqlite3", {
    cwd: root,
    stdio: "inherit",
  });
} catch (e) {
  console.warn("[desktop] electron-rebuild ogohlantirish:", e?.message || e);
}

console.log("[desktop] better-sqlite3 — Node.js (npm run desktop) uchun tiklanmoqda…");
try {
  execSync("npm rebuild better-sqlite3", { cwd: root, stdio: "inherit" });
} catch (e) {
  console.warn("[desktop] npm rebuild ogohlantirish:", e?.message || e);
}

console.log("[desktop] Tayyor — electron-builder ishga tushiriladi");
