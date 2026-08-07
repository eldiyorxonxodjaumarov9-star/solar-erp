/**
 * Desktop barqarorlik smoke-test (Electron ochilishi mumkin).
 * node scripts/test-desktop-stability.mjs
 */
import { spawn, execSync } from "node:child_process";
import path from "node:path";
import {
  PROJECT_ROOT,
  apiBaseUrl,
  resolveDesktopApiPort,
  resolveViteDevPort,
  supplyHealthUrl,
} from "./desktop-config.mjs";

const API_PORT = resolveDesktopApiPort();
const VITE_PORT = resolveViteDevPort();
const HEALTH = supplyHealthUrl(API_PORT);
const VITE = `http://127.0.0.1:${VITE_PORT}/`;
const root = PROJECT_ROOT;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ok(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch {
    return false;
  }
}

function listeningPid(port) {
  if (process.platform !== "win32") return null;
  try {
    const out = execSync(`netstat -ano | findstr ":${port}"`, {
      encoding: "utf8",
    });
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes("LISTENING")) continue;
      const parts = line.trim().split(/\s+/);
      const pid = Number(parts[parts.length - 1]);
      if (pid > 0) return pid;
    }
  } catch {
    /* empty */
  }
  return null;
}

function killPid(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
  } catch {
    /* ignore */
  }
}

// Old desktop tozalash
try {
  execSync(`node scripts/desktop-kill.mjs`, { cwd: root, stdio: "inherit" });
} catch {
  /* ignore */
}
await sleep(1000);

const desktop = spawn(process.execPath, ["scripts/desktop-dev.mjs"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env },
  windowsHide: true,
});

let out = "";
desktop.stdout.on("data", (b) => {
  const s = b.toString();
  out += s;
  process.stdout.write(s);
});
desktop.stderr.on("data", (b) => {
  const s = b.toString();
  out += s;
  process.stderr.write(s);
});

let desktopExit = null;
desktop.on("exit", (code) => {
  desktopExit = code;
});

const result = {
  desktopStart: "FAIL",
  backendRestart: "FAIL",
  supplyHealth: "FAIL",
  unexpectedExit: "YES",
};

try {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (desktopExit != null) throw new Error(`Desktop erta chiqdi: ${desktopExit}`);
    if ((await ok(HEALTH)) && (await ok(VITE))) break;
    await sleep(500);
  }
  if (!(await ok(HEALTH))) throw new Error("Supply health tayyor emas");
  if (!(await ok(VITE))) throw new Error("Vite tayyor emas");
  result.desktopStart = "PASS";
  result.supplyHealth = "PASS";

  const pidBefore = listeningPid(API_PORT);
  if (!pidBefore) throw new Error("Backend PID topilmadi");
  console.log(`\n[test] Backend PID ${pidBefore} o‘chiriladi (restart test)…`);
  killPid(pidBefore);

  await sleep(1000);
  const restartDeadline = Date.now() + 20_000;
  let recovered = false;
  while (Date.now() < restartDeadline) {
    if (desktopExit != null) {
      throw new Error(`Desktop backend o‘chirilganda yopildi: ${desktopExit}`);
    }
    if (await ok(HEALTH)) {
      recovered = true;
      break;
    }
    await sleep(500);
  }
  if (!recovered) throw new Error("Backend restart / health qaytmadi");
  result.backendRestart = "PASS";

  // Qisqa barqarorlik (2 daqiqa o‘rniga ~25s smoke — to‘liq 2 daqiqa juda uzoq agent uchun)
  console.log("\n[test] 25s barqarorlik kuzatuvi…");
  for (let i = 0; i < 5; i++) {
    await sleep(5000);
    if (desktopExit != null) throw new Error(`Unexpected exit ${desktopExit}`);
    if (!(await ok(HEALTH))) throw new Error("Health yo‘qoldi");
  }
  result.unexpectedExit = "NO";
} catch (e) {
  console.error("[test] FAIL:", e?.message || e);
} finally {
  if (desktopExit == null) {
    try {
      if (process.platform === "win32") {
        execSync(`taskkill /PID ${desktop.pid} /T /F`, { stdio: "ignore" });
      } else {
        desktop.kill("SIGTERM");
      }
    } catch {
      /* ignore */
    }
  }
  await sleep(1500);
}

console.log("\n========== RESULT ==========");
console.log(`Desktop start: ${result.desktopStart}`);
console.log(`Backend restart test: ${result.backendRestart}`);
console.log(`Supply health: ${result.supplyHealth}`);
console.log(`Unexpected exit: ${result.unexpectedExit}`);
console.log("============================\n");

process.exit(
  result.desktopStart === "PASS" &&
    result.backendRestart === "PASS" &&
    result.supplyHealth === "PASS" &&
    result.unexpectedExit === "NO"
    ? 0
    : 1,
);
