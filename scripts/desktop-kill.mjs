/**
 * Desktop portlarni tozalash — desktop-config dan port oladi.
 * node scripts/desktop-kill.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PACKAGED_API_PORT,
  PROJECT_ROOT,
  resolveDesktopApiPort,
  resolveViteDevPort,
} from "./desktop-config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const killScript = path.join(__dirname, "kill-port.mjs");
const ports = [
  PACKAGED_API_PORT,
  resolveDesktopApiPort(),
  resolveViteDevPort(),
];

for (const port of [...new Set(ports)]) {
  spawnSync(process.execPath, [killScript, String(port)], {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
  });
}
