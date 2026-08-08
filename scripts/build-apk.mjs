/**
 * CMD: `npm run apk` yoki `npm run android` — bir xil.
 * vite build + cap sync android + gradle assembleDebug
 * → dist-apk/SolarERP.apk va loyiha ildizida SolarERP-last.apk
 */
import { execSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const androidDir = join(root, "android");
const outDir = join(root, "dist-apk");
const isWin = process.platform === "win32";
const gradlew = isWin ? "gradlew.bat" : "./gradlew";

function hasGradleWrapperDist(gradleHome, distName) {
  const distRoot = join(gradleHome, "wrapper", "dists", distName);
  if (!existsSync(distRoot)) return false;
  try {
    for (const hashDir of readdirSync(distRoot, { withFileTypes: true })) {
      if (!hashDir.isDirectory()) continue;
      if (existsSync(join(distRoot, hashDir.name, `${distName}.zip.ok`))) return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Sandbox temp o‘rniga tizimdagi Gradle cache (gradle-8.14.3 allaqachon yuklangan). */
function resolveGradleUserHome() {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const defaultGradle = home ? join(home, ".gradle") : "";
  if (defaultGradle && hasGradleWrapperDist(defaultGradle, "gradle-8.14.3-all")) {
    return defaultGradle;
  }

  const fromEnv = (process.env.GRADLE_USER_HOME || "").trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  if (defaultGradle && existsSync(defaultGradle)) return defaultGradle;
  return fromEnv || defaultGradle;
}

const gradleUserHome = resolveGradleUserHome();

mkdirSync(outDir, { recursive: true });

function normalizeJavaHome(raw) {
  if (raw == null || typeof raw !== "string") return "";
  let s = raw.trim().replace(/^["']+|["']+$/g, "");
  while (s.endsWith("\\") || s.endsWith("/")) s = s.slice(0, -1).trim();
  return s;
}

function javaExe(javaHome) {
  return join(javaHome, "bin", isWin ? "java.exe" : "java");
}

function isValidJavaHome(dir) {
  return typeof dir === "string" && dir.length > 0 && existsSync(javaExe(dir));
}

/**
 * 1) JAVA_HOME / JDK_HOME (siz qo‘ygan) — qo‘sh tirnoq va oxiridagi \ tuzatiladi.
 * 2) Bo‘sh bo‘lsa: Windowsda Android Studio jbr va odatiy JDK papkalari.
 */
function resolveJavaHome() {
  const envCandidates = [
    normalizeJavaHome(process.env.JAVA_HOME),
    normalizeJavaHome(process.env.JDK_HOME),
  ].filter(Boolean);
  for (const jh of envCandidates) {
    if (isValidJavaHome(jh)) return { path: jh, fromEnv: true };
  }

  if (!isWin) {
    try {
      const out = execSync("/usr/libexec/java_home", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (isValidJavaHome(out)) return { path: out, fromEnv: false };
    } catch {
      /* ignore */
    }
    return null;
  }

  const pf = process.env.ProgramFiles || "C:\\Program Files";
  const pfx86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const local = process.env.LocalAppData || "";

  const fixed = [
    join(pf, "Android", "Android Studio", "jbr"),
    join(pf, "Android", "Android Studio", "jre"),
    join(pfx86, "Android", "Android Studio", "jbr"),
    join(local, "Programs", "Android", "Android Studio", "jbr"),
  ];
  for (const jh of fixed) {
    if (isValidJavaHome(jh)) return { path: jh, fromEnv: false };
  }

  const scanRoots = [
    join(pf, "Java"),
    join(pf, "Eclipse Adoptium"),
    join(pfx86, "Eclipse Adoptium"),
    join(pf, "Microsoft"),
    join(pf, "Amazon Corretto"),
  ];
  for (const base of scanRoots) {
    if (!existsSync(base)) continue;
    let names;
    try {
      names = readdirSync(base, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      continue;
    }
    names.sort();
    for (const name of names) {
      const jh = join(base, name);
      if (isValidJavaHome(jh)) return { path: jh, fromEnv: false };
    }
  }

  return null;
}

function failNoJava() {
  const raw = process.env.JAVA_HOME || "";
  console.error("\n[apk] JDK topilmadi (JAVA_HOME ichida bin\\java yo‘q yoki bo‘sh).");
  if (raw.trim())
    console.error("    Hozirgi JAVA_HOME (tuzatilmagan):", JSON.stringify(raw));
  console.error("    Terminalni yopib qayta oching yoki yo‘lni tekshiring, keyin: npm run apk\n");
  process.exit(1);
}

function run(cmd, cwd, extraEnv = {}) {
  execSync(cmd, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    shell: isWin,
  });
}

/** Telefonda «yangilash» uchun versionCode har safar oshadi (bir xil imzo — debug APK). */
function nextVersionCode(rootDir) {
  const counterFile = join(rootDir, "android", ".apk-version-code");
  let n = 1;
  if (existsSync(counterFile)) {
    const parsed = parseInt(readFileSync(counterFile, "utf8").trim(), 10);
    if (Number.isFinite(parsed) && parsed >= 1) n = parsed;
  }
  n += 1;
  writeFileSync(counterFile, `${n}\n`, "utf8");
  return n;
}

try {
  const resolved = resolveJavaHome();
  if (!resolved) failNoJava();
  const { path: javaHome, fromEnv } = resolved;
  console.log(
    "[apk] JAVA_HOME:",
    javaHome,
    fromEnv ? "(JAVA_HOME/JDK_HOME)" : "(avto-topilgan)",
  );

  console.log("[apk] 1/3 vite build…");
  let androidApi = (
    process.env.VITE_ANDROID_API_BASE ||
    process.env.VITE_API_BASE ||
    ""
  )
    .trim()
    .replace(/\/+$/, "");
  if (!androidApi) {
    try {
      const prodEnv = readFileSync(join(root, ".env.production"), "utf8");
      const m =
        prodEnv.match(/^VITE_ANDROID_API_BASE=(.+)$/m) ||
        prodEnv.match(/^VITE_API_BASE=(.+)$/m);
      androidApi = (m?.[1] || "").trim().replace(/\/+$/, "");
    } catch {
      /* ignore */
    }
  }
  console.log("[apk] ANDROID API BASE:", androidApi || "(MISSING — APK Taminot ishlamaydi!)");
  if (
    !androidApi ||
    /127\.0\.0\.1|localhost|192\.168\.|:\s*5000\b/i.test(androidApi)
  ) {
    console.error(
      "[apk] Production APK uchun VITE_ANDROID_API_BASE=http://77.237.237.94 bo‘lishi shart.",
    );
    process.exit(1);
  }
  if (!/^https?:\/\/77\.237\.237\.94\/?$/i.test(androidApi)) {
    console.warn(
      "[apk] Diqqat: ANDROID API BASE VPS IP emas:",
      androidApi,
      "— tavsiya: http://77.237.237.94",
    );
  }
  run("npm run build", root, {
    VITE_API_BASE_HTTP: "",
    VITE_ANDROID_API_BASE: androidApi,
    VITE_API_BASE: androidApi,
    VITE_NATIVE_API_BASE: androidApi,
  });

  console.log("[apk] 2/4 gradle clean + cap sync…");
  run(`${gradlew} clean`, androidDir, {
    JAVA_HOME: javaHome,
    GRADLE_USER_HOME: gradleUserHome,
  });
  run("npx cap sync android", root);

  const versionCode = nextVersionCode(root);
  const versionName = `1.0.${versionCode}`;
  console.log(
    `[apk] Android versionCode=${versionCode} versionName=${versionName} (telefonda eski APK ustidan yangilanadi)`,
  );

  const gradleEnv = {
    JAVA_HOME: javaHome,
    GRADLE_USER_HOME: gradleUserHome,
  };
  console.log("[apk] GRADLE_USER_HOME:", gradleUserHome);

  console.log("[apk] 3/4 gradle assembleDebug…");
  run(`${gradlew} assembleDebug`, androidDir, {
    ...gradleEnv,
    SOLARERP_VERSION_CODE: String(versionCode),
    SOLARERP_VERSION_NAME: versionName,
  });

  const built = join(androidDir, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
  if (!existsSync(built)) {
    console.error("[apk] Xato: APK fayli topilmadi:", built);
    process.exit(1);
  }

  const out = join(outDir, "SolarERP.apk");
  const outRoot = join(root, "SolarERP-last.apk");
  copyFileSync(built, out);
  copyFileSync(built, outRoot);
  for (const legacy of ["BU-YERDA-APK.txt", "JAVA_HOME_KERAK.txt"]) {
    const p = join(outDir, legacy);
    if (existsSync(p)) unlinkSync(p);
  }
  console.log("\n[apk] Tayyor (ikki joyda bir xil fayl):");
  console.log("   ", out);
  console.log("   ", outRoot);
  console.log(`      Versiya: ${versionName} (${versionCode})`);
  console.log("      Telefonda: shu APK ni oching / o‘rnating.\n");
} catch (e) {
  console.error("\n[apk] Build to‘xtadi — SolarERP.apk yozilmadi. CMD dagi xato qatorlarini ko‘ring.");
  if (e && typeof e === "object" && "status" in e) {
    console.error("    Chiqish kodi:", e.status);
  } else if (e instanceof Error) {
    console.error("    ", e.message);
  }
  process.exit(1);
}
