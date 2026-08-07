/**
 * Desktop dev: backend → supply health → Vite → Electron.
 * Backend crash → avtomatik restart (Electron yopilmaydi).
 * Ctrl+C → graceful shutdown, exit 0.
 *
 * npm run desktop
 */
import { spawn, execFileSync, execSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { existsSync } from "node:fs";
import {
  PROJECT_ROOT,
  apiBaseUrl,
  resolveDesktopApiPort,
  resolveViteDevPort,
  supplyHealthUrl,
} from "./desktop-config.mjs";

const require = createRequire(import.meta.url);
const electronPath = require("electron");

const root = PROJECT_ROOT;
const API_PORT = resolveDesktopApiPort();
const VITE_PORT = resolveViteDevPort();
const LOCAL_API = apiBaseUrl(API_PORT);
const DEV_URL = `http://127.0.0.1:${VITE_PORT}`;
const HEALTH_URL = supplyHealthUrl(API_PORT);
const STATUS_URL = `${LOCAL_API}/status`;

const BACKEND_READY_MS = 30_000;
const VITE_READY_MS = 30_000;
const BACKEND_RESTART_DELAY_MS = 2000;
const HEALTH_POLL_MS = 400;
const MONITOR_MS = 4000;

const viteJs = path.join(root, "node_modules", "vite", "bin", "vite.js");

/** @type {import('node:child_process').ChildProcess | null} */
let backend = null;
/** @type {import('node:child_process').ChildProcess | null} */
let vite = null;
/** @type {import('node:child_process').ChildProcess | null} */
let electron = null;

let ownedBackend = false;
let stopping = false;
let backendRestartTimer = null;
let monitorTimer = null;
let healthFailStreak = 0;

function log(...args) {
  console.log("[desktop]", ...args);
}

function logErr(...args) {
  console.error("[desktop]", ...args);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchOk(url, timeoutMs = 2500) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

async function waitReady(url, ms, label) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await fetchOk(url)) {
      log(`${label} tayyor: ${url}`);
      return true;
    }
    await sleep(HEALTH_POLL_MS);
  }
  throw new Error(`${label} timeout (${Math.round(ms / 1000)}s): ${url}`);
}

function killPidTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
    } else {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

function killPackagedSolarErp() {
  if (process.platform !== "win32") return;
  try {
    execSync("taskkill /IM SolarERP.exe /F", { stdio: "ignore" });
    log("O‘rnatilgan SolarERP.exe yopildi (dev conflict)");
  } catch {
    /* yo‘q */
  }
}

function freeVitePort() {
  const killScript = path.join(root, "scripts", "kill-port.mjs");
  try {
    execFileSync(process.execPath, [killScript, VITE_PORT], {
      cwd: root,
      stdio: "inherit",
    });
  } catch {
    /* ignore */
  }
}

function childEnv(extra = {}) {
  return {
    ...process.env,
    PORT: API_PORT,
    VITE_API_PROXY_TARGET: LOCAL_API,
    VITE_API_BASE_HTTP: LOCAL_API,
    ...extra,
  };
}

function spawnNode(args, env = {}) {
  return spawn(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
    env: childEnv(env),
    windowsHide: true,
  });
}

function spawnElectronProc() {
  return spawn(electronPath, ["."], {
    cwd: root,
    stdio: "inherit",
    env: childEnv({
      ELECTRON_SKIP_EMBEDDED_SERVER: "1",
      ELECTRON_DEV_URL: DEV_URL,
    }),
    windowsHide: false,
  });
}

function clearBackendRestart() {
  if (backendRestartTimer) {
    clearTimeout(backendRestartTimer);
    backendRestartTimer = null;
  }
}

function scheduleBackendRestart(reason) {
  if (stopping || !ownedBackend) return;
  clearBackendRestart();
  logErr(`Backend qayta ishga tushadi (${BACKEND_RESTART_DELAY_MS}ms): ${reason}`);
  backendRestartTimer = setTimeout(() => {
    backendRestartTimer = null;
    if (stopping) return;
    startOwnedBackend(`restart: ${reason}`);
  }, BACKEND_RESTART_DELAY_MS);
}

function startOwnedBackend(reason = "start") {
  if (stopping) return;
  if (backend && !backend.killed && backend.exitCode == null) {
    try {
      killPidTree(backend.pid);
    } catch {
      /* ignore */
    }
  }

  log(`Backend start (${reason}) → PORT=${API_PORT}`);
  ownedBackend = true;
  backend = spawnNode(["server.js"], { NODE_ENV: "development" });
  backend.on("exit", (code, signal) => {
    const c = typeof code === "number" ? code : signal || "?";
    logErr(`Backend to‘xtadi (kod/signal: ${c})`);
    backend = null;
    if (!stopping && ownedBackend) {
      scheduleBackendRestart(`exit ${c}`);
    }
  });
}

async function ensureBackend() {
  if (await fetchOk(HEALTH_URL)) {
    log(`Mavjud Supply API ishlatiladi (health 200): ${HEALTH_URL}`);
    ownedBackend = false;
    backend = null;
    return;
  }

  // Port band / eski server (masalan supply routesiz) — health 200 bo‘lmasa tozalaymiz
  const killScript = path.join(root, "scripts", "kill-port.mjs");
  try {
    if (await fetchOk(STATUS_URL)) {
      log(`Port ${API_PORT} band, lekin supply health yo‘q — eski backend almashtiriladi`);
    } else {
      log(`Port ${API_PORT} health bermadi — eski process tozalanadi (agar bo‘lsa)`);
    }
    execFileSync(process.execPath, [killScript, API_PORT], {
      cwd: root,
      stdio: "inherit",
    });
    await sleep(800);
  } catch {
    /* ignore */
  }

  startOwnedBackend("initial");
  await waitReady(HEALTH_URL, BACKEND_READY_MS, "Supply health");
}

function startVite() {
  if (!existsSync(viteJs)) {
    throw new Error(`vite topilmadi: ${viteJs}`);
  }
  freeVitePort();
  log(`Vite start → ${DEV_URL} (proxy ${LOCAL_API})`);
  vite = spawnNode(
    [viteJs, "--host", "127.0.0.1", "--port", VITE_PORT, "--strictPort"],
    {},
  );
  vite.on("exit", (code, signal) => {
    const c = typeof code === "number" ? code : signal || "?";
    logErr(`Vite to‘xtadi (kod/signal: ${c}) — Electron ochiq qoladi`);
    vite = null;
    if (!stopping) {
      // Vite restart (Electronni yopmasdan)
      setTimeout(() => {
        if (stopping || vite) return;
        try {
          startVite();
        } catch (e) {
          logErr("Vite restart xato:", e?.message || e);
        }
      }, BACKEND_RESTART_DELAY_MS);
    }
  });
}

function startMonitor() {
  if (monitorTimer) clearInterval(monitorTimer);
  monitorTimer = setInterval(async () => {
    if (stopping) return;
    const ok = await fetchOk(HEALTH_URL, 2000);
    if (ok) {
      healthFailStreak = 0;
      return;
    }
    healthFailStreak += 1;
    logErr(`Supply health yo‘qoldi (streak=${healthFailStreak})`);

    if (!ownedBackend) {
      log("Tashqi backend yo‘qoldi — owned backend start");
      startOwnedBackend("adopt after external lost");
      return;
    }

    if (!backend || backend.exitCode != null) {
      scheduleBackendRestart("health lost + process down");
      return;
    }

    // Process tirik, lekin health o‘lik — hung backend
    if (healthFailStreak >= 2) {
      logErr("Backend hung — majburiy restart");
      try {
        killPidTree(backend.pid);
      } catch {
        /* ignore */
      }
      scheduleBackendRestart("hung process");
    }
  }, MONITOR_MS);
}

function stopAll(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  clearBackendRestart();
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
  log("Graceful shutdown…");

  for (const child of [electron, vite, backend]) {
    if (child?.pid) killPidTree(child.pid);
  }
  electron = null;
  vite = null;
  backend = null;

  // Exit 0 — normal yopilish (Ctrl+C / oynani yopish)
  setTimeout(() => process.exit(exitCode === 1 ? 0 : exitCode ?? 0), 200);
}

function onSignal(sig) {
  log(`${sig} — to‘xtatilmoqda`);
  stopAll(0);
}

process.on("SIGINT", () => onSignal("SIGINT"));
process.on("SIGTERM", () => onSignal("SIGTERM"));
process.on("uncaughtException", (err) => {
  logErr("uncaughtException:", err?.stack || err);
  // Desktopni sababsiz yopmang — faqat log
});
process.on("unhandledRejection", (err) => {
  logErr("unhandledRejection:", err);
});

if (!electronPath || !existsSync(String(electronPath))) {
  logErr("electron topilmadi. npm install qiling.");
  process.exit(1);
}

console.log("\n[desktop] Dev rejim — build kerak emas. Ctrl+Shift+R = yangilash\n");
log(`API_BASE=${LOCAL_API}`);
log(`VITE=${DEV_URL}`);
log(`Supply health=${HEALTH_URL}`);

killPackagedSolarErp();

try {
  // a) backend (yoki mavjud health)
  await ensureBackend();

  // b) health allaqachon kutildi ensureBackend ichida; qayta tekshir
  if (!(await fetchOk(HEALTH_URL))) {
    await waitReady(HEALTH_URL, BACKEND_READY_MS, "Supply health");
  }

  // c–d) Vite
  startVite();
  await waitReady(`${DEV_URL}/`, VITE_READY_MS, "Vite");
  await sleep(500);

  // e) Electron
  log("Electron start…");
  electron = spawnElectronProc();
  electron.on("exit", (code) => {
    log(
      `Electron yopildi (kod: ${typeof code === "number" ? code : "?"}) — desktop to‘xtaydi`,
    );
    stopAll(0);
  });

  startMonitor();

  console.log(`\n[desktop] Ochildi: ${DEV_URL}`);
  console.log(`[desktop] API_BASE=${LOCAL_API}`);
  console.log(`[desktop] Supply health: ${HEALTH_URL}`);
  console.log("[desktop] Backend crash → avtomatik restart (Electron ochiq qoladi)");
  console.log("[desktop] Ctrl+C — graceful shutdown (exit 0)\n");
} catch (e) {
  logErr(e?.message || e);
  stopAll(0);
  // Start muvaffaqiyatsiz — foydalanuvchiga 1 emas, lekin jarayon tugashi kerak
  process.exitCode = 0;
  process.exit(0);
}
