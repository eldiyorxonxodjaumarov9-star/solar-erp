/**
 * Windows/Linux: portni band qilgan jarayonni to‘xtatadi.
 * node scripts/kill-port.mjs 5150
 */
import { execSync } from "node:child_process";

const port = Number(process.argv[2] || 5150);
if (!port) {
  console.error("Port kerak: node scripts/kill-port.mjs 5150");
  process.exit(1);
}

const isWin = process.platform === "win32";

try {
  if (isWin) {
    const out = execSync(`netstat -ano | findstr ":${port}"`, { encoding: "utf8" });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes("LISTENING")) continue;
      const parts = line.trim().split(/\s+/);
      const pid = Number(parts[parts.length - 1]);
      if (pid > 0) pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
        console.log(`[kill-port] PID ${pid} to‘xtatildi (port ${port})`);
      } catch {
        /* ignore */
      }
    }
    if (!pids.size) console.log(`[kill-port] Port ${port} bo‘sh`);
  } else {
    execSync(`fuser -k ${port}/tcp`, { stdio: "ignore" });
    console.log(`[kill-port] Port ${port} tozalandi`);
  }
} catch {
  console.log(`[kill-port] Port ${port} bo‘sh yoki topilmadi`);
}
