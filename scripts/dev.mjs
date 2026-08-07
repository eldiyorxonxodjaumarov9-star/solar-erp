import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viteJs = path.join(root, "node_modules", "vite", "bin", "vite.js");

function runNode(scriptArgs) {
  return spawn(process.execPath, scriptArgs, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
}

const vite = runNode([viteJs]);
const backend = runNode(["server.js"]);
const children = [vite, backend];

let cascadeStop = false;

function stopOthers(failedCode) {
  if (cascadeStop) return;
  cascadeStop = true;
  for (const c of children) {
    if (!c.killed) c.kill("SIGTERM");
  }
  if (typeof failedCode === "number" && failedCode !== 0) {
    process.exitCode = failedCode;
  }
}

process.once("SIGINT", () => stopOthers(0));
process.once("SIGTERM", () => stopOthers(0));

let pending = children.length;

for (const child of children) {
  child.on("exit", (code, signal) => {
    const failed =
      (typeof code === "number" && code !== 0) ||
      (code === null && typeof signal === "string");
    if (failed && !cascadeStop) {
      stopOthers(typeof code === "number" ? code : 1);
    }
    pending -= 1;
    if (pending === 0) {
      process.exit(process.exitCode ?? 0);
    }
  });
}
