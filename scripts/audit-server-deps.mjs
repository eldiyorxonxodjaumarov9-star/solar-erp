import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const alreadyInPrev = new Set(
  [
    "server.js",
    "bot.js",
    "storage.js",
    "telegramService.js",
    "ecosystem.config.cjs",
    "shared/dailyAttendanceReport.js",
    "shared/telegramEventTypes.js",
    "shared/firebasePublicConfig.js",
    "shared/buildTelegramMessage.js",
    "shared/telegramMessageTypes.js",
    "server/reports/dailyAttendanceTelegram.js",
    "server/telegramAttendanceLog.js",
    "server/firebaseServer.js",
    "server/db/store.js",
    "server/routes/reportsApi.js",
    "server/telegramEventLog.js",
    "server/telegramMessageStore.js",
    "server/telegramMessageFirestore.js",
    "src/photos/tashkentTime.js",
  ].map((p) => p.replace(/\\/g, "/")),
);

const IMPORT_RE =
  /(?:import\s+(?:[^'"`]+?\s+from\s+)?|export\s+(?:[^'"`]+?\s+from\s+)?|require\s*\(\s*)['"`](\.[^'"`]+)['"`]/g;
const EXT_CANDIDATES = [
  "",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  "/index.js",
  "/index.mjs",
  "/index.cjs",
];

function resolveLocal(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const ext of EXT_CANDIDATES) {
    const p = base + ext;
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function toRel(abs) {
  return path.relative(root, abs).split(path.sep).join("/");
}

const entryPoints = [
  path.join(root, "server.js"),
  path.join(root, "bot.js"),
];

const queue = [...entryPoints];
const visited = new Set();
const resolved = new Set();
const missing = [];

while (queue.length) {
  const file = queue.shift();
  const rel = toRel(file);
  if (visited.has(rel)) continue;
  visited.add(rel);
  if (!fs.existsSync(file)) {
    missing.push({ from: "(entry)", spec: rel, reason: "entry missing" });
    continue;
  }
  resolved.add(rel);
  const text = fs.readFileSync(file, "utf8");
  let m;
  const re = new RegExp(IMPORT_RE.source, "g");
  while ((m = re.exec(text))) {
    const spec = m[1];
    if (!spec.startsWith(".")) continue;
    const abs = resolveLocal(file, spec);
    if (!abs) {
      missing.push({ from: rel, spec, reason: "unresolved" });
      continue;
    }
    const childRel = toRel(abs);
    if (!visited.has(childRel)) queue.push(abs);
  }
}

const neededExtra = [...resolved]
  .filter((f) => f !== "server.js" && !alreadyInPrev.has(f))
  .sort();
const allNeeded = [...resolved].sort();

const out = {
  totalResolved: allNeeded.length,
  allNeeded,
  extraNeeded: neededExtra,
  missing,
  monthlyReportIncluded: allNeeded.includes("src/lib/monthlyReport.js"),
};

fs.writeFileSync(
  path.join(root, "vps-dep-audit.json"),
  JSON.stringify(out, null, 2),
  "utf8",
);
console.log(JSON.stringify(out, null, 2));
