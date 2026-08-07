/**
 * VPS ga server yangilash (SSH + SFTP + pm2 restart).
 *
 * .env.deploy fayl yarating:
 *   VPS_HOST=77.237.237.94
 *   VPS_USER=root
 *   VPS_PASSWORD=your_password
 *   VPS_PATH=/root/solar-erp
 *
 * Ishga tushirish: npm run deploy:vps
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
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
const VPS_PATH = (process.env.VPS_PATH || envFile.VPS_PATH || "/root/solar-erp").replace(/\/+$/, "");

const UPLOAD_FILES = [
  "server.js",
  "ecosystem.config.cjs",
  "package.json",
  "package-lock.json",
  "bot.js",
  "telegramService.js",
  "storage.js",
];

/** VPS server ishlashi uchun papkalar (rekursiv). */
const UPLOAD_DIRS = [
  "dist",
  "server",
  "shared",
  "data/supply",
  "src/photos",
  "src/activity",
  "src/lib",
];

function sftpMkdirP(sftp, remoteDir) {
  const parts = remoteDir.split("/").filter(Boolean);
  let current = remoteDir.startsWith("/") ? "" : "";
  return parts.reduce((chain, part) => {
    return chain.then(
      () =>
        new Promise((resolve, reject) => {
          current += `/${part}`;
          sftp.mkdir(current, (err) => {
            if (err && err.code !== 4) return reject(err);
            resolve();
          });
        }),
    );
  }, Promise.resolve());
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
        if (code !== 0) {
          reject(new Error(errOut || out || `Exit ${code}: ${cmd}`));
          return;
        }
        resolve(out.trim());
      });
    });
  });
}

async function verifySupply() {
  const url = `http://${VPS_HOST}/api/supply/health`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  return { status: res.status, text: text.slice(0, 500) };
}

async function main() {
  if (!VPS_PASSWORD) {
    console.error(`
❌ VPS parol topilmadi.

Deploy skripti SSH orqali ${VPS_USER}@${VPS_HOST} ga ulanadi.
Buning uchun parol kerak — hozir faqat namuna fayl bor (.env.deploy.example).

QADAMLAR (PowerShell):

  1) cd D:\\solar-erp
  2) Copy-Item .env.deploy.example .env.deploy
  3) notepad .env.deploy
     → VPS_PASSWORD= qatoriga VPS (root) parolini yozing
     → VPS_PATH= to‘g‘ri papka bo‘lsa tekshiring (masalan /root/solar-erp)
  4) npm run deploy:vps

Yoki bir martalik (parolni o‘zingiz qo‘ying):
  $env:VPS_PASSWORD="VPS_parolingiz"; npm run deploy:vps
`);
    process.exit(1);
  }

  console.log(`Deploy: ${VPS_USER}@${VPS_HOST}:${VPS_PATH}`);

  console.log("Mahalliy build (APK va desktop bilan bir xil dist)…");
  execSync("npm run build", { cwd: root, stdio: "inherit", shell: true });

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

    for (const rel of UPLOAD_FILES) {
      const local = path.join(root, rel);
      if (!fs.existsSync(local)) {
        console.warn("Skip (yo‘q):", rel);
        continue;
      }
      const remote = `${VPS_PATH}/${rel.replace(/\\/g, "/")}`;
      await sftpMkdirP(sftp, path.posix.dirname(remote));
      console.log("Upload:", rel);
      await sftpPut(sftp, local, remote);
    }

    async function uploadDir(localDir, remoteDir) {
      if (!fs.existsSync(localDir)) {
        console.warn("Skip papka (yo‘q):", path.relative(root, localDir));
        return;
      }
      await sftpMkdirP(sftp, remoteDir);
      for (const name of fs.readdirSync(localDir)) {
        const lp = path.join(localDir, name);
        const rp = `${remoteDir}/${name}`;
        if (fs.statSync(lp).isDirectory()) {
          await uploadDir(lp, rp);
        } else {
          console.log("Upload:", path.relative(root, lp).replace(/\\/g, "/"));
          await sftpPut(sftp, lp, rp);
        }
      }
    }

    for (const rel of UPLOAD_DIRS) {
      const localDir = path.join(root, rel);
      const remoteDir = `${VPS_PATH}/${rel.replace(/\\/g, "/")}`;
      console.log(`Upload papka: ${rel}/`);
      await uploadDir(localDir, remoteDir);
    }

    console.log("npm install (agar kerak bo‘lsa)…");
    try {
      await exec(
        conn,
        `cd ${VPS_PATH} && npm install --omit=dev 2>&1 | tail -5`,
      );
    } catch (e) {
      console.warn("npm install ogohlantirish:", e.message || e);
    }

    console.log("PM2 restart…");
    const pm2Out = await exec(
      conn,
      `cd ${VPS_PATH} && (pm2 restart solar-erp 2>/dev/null || pm2 start ecosystem.config.cjs) && pm2 save 2>/dev/null; pm2 list`,
    );
    console.log(pm2Out);

    console.log("Tekshiruv: /api/supply/health …");
    await new Promise((r) => setTimeout(r, 2500));
    const check = await verifySupply();
    console.log(`${check.status}: ${check.text}`);
    if (check.status !== 200) {
      console.error("⚠️ Supply endpoint ishlamayapti — VPS_PATH yoki pm2 nomini tekshiring.");
      process.exit(1);
    }
    console.log("✅ VPS yangilandi — Supply API ishlayapti.");
  } finally {
    conn.end();
  }
}

main().catch((e) => {
  console.error("Deploy xato:", e.message || e);
  process.exit(1);
});
