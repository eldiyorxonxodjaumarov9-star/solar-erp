/**
 * Faqat Supply API + data/supply ni VPS ga yuklash.
 * $env:VPS_PASSWORD="..."; node scripts/deploy-supply-vps.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "ssh2";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnvDeploy() {
  const envPath = path.join(root, ".env.deploy");
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

const envFile = loadEnvDeploy();
const VPS_HOST = process.env.VPS_HOST || envFile.VPS_HOST || "77.237.237.94";
const VPS_USER = process.env.VPS_USER || envFile.VPS_USER || "root";
const VPS_PASSWORD = process.env.VPS_PASSWORD || envFile.VPS_PASSWORD || "";
const VPS_PATH = (process.env.VPS_PATH || envFile.VPS_PATH || "/root/solar-erp").replace(
  /\/+$/,
  "",
);

const FILES = ["server.js", "package.json", "package-lock.json"];
const DIRS = ["server", "data/supply"];

function sftpMkdirP(sftp, remoteDir) {
  const parts = remoteDir.split("/").filter(Boolean);
  let current = "";
  return parts.reduce(
    (chain, part) =>
      chain.then(
        () =>
          new Promise((resolve, reject) => {
            current += `/${part}`;
            sftp.mkdir(current, (err) => {
              if (err && err.code !== 4) return reject(err);
              resolve();
            });
          }),
      ),
    Promise.resolve(),
  );
}

function sftpPut(sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, (err) => (err ? reject(err) : resolve()));
  });
}

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      let errOut = "";
      stream.on("data", (d) => {
        out += d.toString();
      });
      stream.stderr.on("data", (d) => {
        errOut += d.toString();
      });
      stream.on("close", (code) => {
        if (code !== 0) reject(new Error(errOut || out || `Exit ${code}`));
        else resolve(out.trim());
      });
    });
  });
}

async function uploadDir(sftp, localDir, remoteDir) {
  if (!fs.existsSync(localDir)) return;
  await sftpMkdirP(sftp, remoteDir);
  for (const name of fs.readdirSync(localDir)) {
    if (name === "history.json") continue;
    const lp = path.join(localDir, name);
    const rp = `${remoteDir}/${name}`;
    if (fs.statSync(lp).isDirectory()) await uploadDir(sftp, lp, rp);
    else {
      console.log("Upload:", path.relative(root, lp));
      await sftpPut(sftp, lp, rp);
    }
  }
}

async function main() {
  if (!VPS_PASSWORD) {
    console.error("VPS_PASSWORD kerak (.env.deploy yoki $env:VPS_PASSWORD)");
    process.exit(1);
  }
  console.log(`Supply deploy → ${VPS_USER}@${VPS_HOST}:${VPS_PATH}`);
  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn
      .on("ready", resolve)
      .on("error", reject)
      .connect({
        host: VPS_HOST,
        port: 22,
        username: VPS_USER,
        password: VPS_PASSWORD,
        readyTimeout: 20000,
      });
  });

  try {
    const sftp = await new Promise((resolve, reject) => {
      conn.sftp((err, s) => (err ? reject(err) : resolve(s)));
    });

    for (const rel of FILES) {
      const local = path.join(root, rel);
      if (!fs.existsSync(local)) continue;
      const remote = `${VPS_PATH}/${rel}`;
      console.log("Upload:", rel);
      await sftpPut(sftp, local, remote);
    }
    for (const rel of DIRS) {
      console.log(`Upload papka: ${rel}/`);
      await uploadDir(sftp, path.join(root, rel), `${VPS_PATH}/${rel}`);
    }

    console.log("npm install better-sqlite3 (agar kerak)…");
    try {
      await exec(
        conn,
        `cd ${VPS_PATH} && npm install better-sqlite3 --omit=dev 2>&1 | tail -8`,
      );
    } catch (e) {
      console.warn(e.message);
    }

    console.log("PM2 restart…");
    console.log(
      await exec(
        conn,
        `cd ${VPS_PATH} && (pm2 restart solar-erp 2>/dev/null || pm2 restart all) && pm2 save 2>/dev/null; sleep 2; curl -sS http://127.0.0.1:5000/api/supply/health || curl -sS http://127.0.0.1/api/supply/health || true`,
      ),
    );
  } finally {
    conn.end();
  }

  await new Promise((r) => setTimeout(r, 2000));
  const res = await fetch(`http://${VPS_HOST}/api/supply/health`, {
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  console.log(`Public health ${res.status}:`, text.slice(0, 400));
  if (res.status !== 200) process.exit(1);
  console.log("✅ Supply VPS’da tayyor");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
