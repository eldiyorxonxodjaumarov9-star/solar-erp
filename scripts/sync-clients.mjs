/**
 * Desktop (.exe) va APK ni bir xil frontend bilan yig‘ish.
 *
 * npm run sync:clients              — build + APK + desktop exe
 * npm run sync:clients -- --apk      — faqat APK
 * npm run sync:clients -- --desktop  — faqat desktop exe
 * npm run sync:clients -- --deploy   — avval VPS, keyin ikkala klient
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const args = new Set(process.argv.slice(2));
const deploy = args.has("--deploy");
const apkOnly = args.has("--apk");
const desktopOnly = args.has("--desktop");
const buildApk = !desktopOnly || apkOnly;
const buildDesktop = !apkOnly || desktopOnly;
if (!apkOnly && !desktopOnly) {
  /* default: both */
}

function run(cmd, label) {
  console.log(`\n[sync] ${label}\n    ${cmd}\n`);
  execSync(cmd, { cwd: root, stdio: "inherit", shell: true });
}

async function main() {
  console.log("=== SolarERP: Desktop + APK sinxron yig‘ish ===\n");

  if (deploy) {
    if (!existsSync(join(root, ".env.deploy"))) {
      console.warn(
        "[sync] .env.deploy yo‘q — VPS deploy o‘tkazib yuborildi. Namuna: .env.deploy.example",
      );
    } else {
      run("npm run deploy:vps", "VPS server yangilash (APK uchun API)");
    }
  }

  run("npm run build", "Umumiy frontend build (desktop va APK bir xil)");

  if (buildApk) {
    run("npm run apk", "Android APK");
  }

  if (buildDesktop) {
    run("npm run desktop:exe", "Windows desktop (.exe)");
  }

  console.log("\n✅ Tayyor — desktop va APK bir xil versiyadan yig‘ildi.");
  if (buildApk) {
    console.log("   APK: dist-apk/SolarERP.apk va SolarERP-last.apk");
  }
  if (buildDesktop) {
    console.log("   Desktop: desktop-dist/ papkasi");
  }
  if (!deploy) {
    console.log(
      "\n   APK telefonda VPS bilan ishlashi uchun: npm run sync:clients -- --deploy",
    );
  }
}

main().catch((e) => {
  console.error("[sync] Xato:", e?.message || e);
  process.exit(1);
});
