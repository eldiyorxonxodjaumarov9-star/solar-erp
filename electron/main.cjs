/**
 * Electron: http://127.0.0.1:PORT/ — server.js (dist + api) ishlayotganda SPA va BrowserRouter ishlaydi.
 *
 * Qurilish (npm run desktop): tashqi procesda server — ELECTRON_SKIP_EMBEDDED_SERVER=1.
 * Paketlangan .exe: shu yerda spawn (ELECTRON_RUN_AS_NODE) — tashqi npm kerak emas.
 */
const path = require("path");
const { app, BrowserWindow, shell, globalShortcut } = require("electron");
const fs = require("fs");
const { pathToFileURL } = require("url");

// Windows’da ba’zan GPU oq/bo‘sh ekran beradi — Dev va packaged uchun barqarorroq
try {
  app.disableHardwareAcceleration();
} catch (_) {
  /* ignore */
}
app.commandLine.appendSwitch("disable-http-cache");

function appRootDir() {
  return path.join(__dirname, "..");
}

function loadEnvFromRoot() {
  const envPath = path.join(appRootDir(), ".env");
  if (!fs.existsSync(envPath)) return;
  try {
    require("dotenv").config({ path: envPath });
  } catch (_) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function getPort() {
  return String(process.env.PORT || "5150").trim();
}

function isDevUi() {
  return Boolean(String(process.env.ELECTRON_DEV_URL || "").trim());
}

let mainWindow = null;
let embeddedStopFn = null;

// Dev va o‘rnatilgan .exe bir-birini o‘chirmasligi uchun alohida userData
try {
  const folder = isDevUi() ? "SolarERP-dev" : "SolarERP";
  const desiredUserData = path.join(app.getPath("localAppData"), folder);
  app.setPath("userData", desiredUserData);
} catch (_) {
  /* ignore */
}

// Ensure only one instance uses IndexedDB / cache locks
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  console.error(
    "[solar-erp] Boshqa SolarERP oynasi ochiq. Avval uni yoping, keyin qayta urinib ko‘ring.",
  );
  try {
    app.quit();
  } catch (_) {
    /* ignore */
  }
  process.exit(0);
}

app.on("second-instance", () => {
  try {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  } catch (_) {
    /* ignore */
  }
});

function appendMainLog(line) {
  try {
    const logsDir = app.getPath("userData");
    fs.mkdirSync(logsDir, { recursive: true });
    const p = path.join(logsDir, "main.log");
    fs.appendFileSync(p, `[${new Date().toISOString()}] ${line}\n`);
  } catch (_) {
    /* ignore */
  }
}

function shouldEmbedServer() {
  return String(process.env.ELECTRON_SKIP_EMBEDDED_SERVER || "").trim() !== "1";
}

async function startEmbeddedServer() {
  if (!shouldEmbedServer()) return;
  const root = appRootDir();
  try {
    process.chdir(root);
  } catch (_) {
    /* ignore */
  }
  const serverEntry = path.join(root, "server.js");
  appendMainLog(`startEmbeddedServer import ${serverEntry}`);
  loadEnvFromRoot();
  const port = getPort();
  process.env.NODE_ENV = "production";
  process.env.SERVE_STATIC = "true";
  process.env.PORT = port;

  const mod = await import(pathToFileURL(serverEntry).href);
  if (typeof mod.startServer === "function") {
    mod.startServer({ port });
    appendMainLog("embedded startServer() ok");
  } else {
    appendMainLog("embedded startServer() missing");
  }
  embeddedStopFn =
    typeof mod.stopServer === "function" ? () => mod.stopServer() : null;
}

function stopEmbeddedServer() {
  try {
    if (embeddedStopFn) embeddedStopFn();
  } catch (_) {
    /* ignore */
  }
  embeddedStopFn = null;
}

function getDevUrl() {
  return String(process.env.ELECTRON_DEV_URL || "").trim();
}

function registerReloadShortcuts() {
  const hardReload = () => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.reloadIgnoringCache();
      }
    } catch (_) {
      /* ignore */
    }
  };
  try {
    globalShortcut.register("CommandOrControl+Shift+R", hardReload);
    globalShortcut.register("F5", hardReload);
  } catch (e) {
    appendMainLog(`shortcut register: ${e?.message || e}`);
  }
}

async function waitUntilUrlReady(url) {
  const deadline = Date.now() + 120000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok) return;
    } catch (_) {
      /* hali tayyor emas */
    }
    if (Date.now() > deadline) throw new Error("TIMEOUT");
    await new Promise((r) => setTimeout(r, 400));
  }
}
async function waitUntilServerReady(port) {
  const url = `http://127.0.0.1:${port}/status`;
  const deadline = Date.now() + 120000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok) return;
    } catch (_) {
      /* server hali tayyor emas */
    }
    if (Date.now() > deadline) throw new Error("TIMEOUT");
    await new Promise((r) => setTimeout(r, 400));
  }
}

function loadErrorHtml(errText, port) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>SolarERP</title></head>
<body style="font-family:system-ui;padding:24px;max-width:560px;line-height:1.5;background:#f8fafc;color:#1e293b">
<h1>Server tayyor emas</h1>
<p>${errText}</p>
<p>Agar rivojlantirish rejimidasiz:<br/><code style="background:#e2e8f0;padding:2px 6px;border-radius:6px">npm run desktop</code> ishlating.</p>
<p><kbd>Ctrl+Shift+R</kbd> yoki <kbd>F5</kbd> — qattiq yangilash.</p>
</body></html>`,
  )}`;
}

function createMainWindow(loadUrlOrData, port) {
  const devUrl = getDevUrl();
  appendMainLog(`createMainWindow(${String(loadUrlOrData).slice(0, 120)})`);

  // Kamera / mikrofon / geolokatsiya ruxsatlari (Ish vaqti «Keldim»)
  try {
    const ses = require("electron").session.defaultSession;
    ses.setPermissionRequestHandler((_wc, permission, callback) => {
      const allow = [
        "media",
        "mediaKeySystem",
        "geolocation",
        "notifications",
        "clipboard-sanitized-write",
      ].includes(permission);
      appendMainLog(`permission ${permission} → ${allow ? "allow" : "deny"}`);
      callback(allow);
    });
    ses.setPermissionCheckHandler((_wc, permission) => {
      return ["media", "geolocation", "notifications"].includes(permission);
    });
  } catch (e) {
    appendMainLog(`permission handler: ${e?.message || e}`);
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: "SolarERP",
    show: true,
    backgroundColor: "#f1f5f9",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Dev (Vite) da false — modul/HMR ishlashi uchun
      webSecurity: !devUrl,
      spellcheck: false,
    },
  });
  mainWindow.once("ready-to-show", () => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      }
    } catch (_) {
      /* ignore */
    }
  });
  setTimeout(() => {
    try {
      if (mainWindow && !mainWindow.isVisible()) mainWindow.show();
    } catch (_) {
      /* ignore */
    }
  }, 2500);

  mainWindow.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    if (level >= 2) {
      console.error(`[renderer] ${message} (${sourceId}:${line})`);
      appendMainLog(`console[${level}] ${message}`);
    }
  });

  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error(`[solar-erp] did-fail-load ${code} ${desc} ${url}`);
    appendMainLog(`did-fail-load code=${code} desc=${desc} url=${url}`);
    if (code !== -3 && devUrl) {
      setTimeout(() => {
        try {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.loadURL(devUrl.replace(/\/?$/, "/"));
          }
        } catch (_) {
          /* ignore */
        }
      }, 1500);
    }
  });

  let rootRetry = 0;
  mainWindow.webContents.on("did-finish-load", () => {
    appendMainLog("did-finish-load");
    // Bo‘sh #root — modul yuklanmagan; bir marta qayta urinish
    void mainWindow.webContents
      .executeJavaScript(
        `(() => {
          const r = document.getElementById('root');
          return !!(r && r.childElementCount > 0);
        })()`,
      )
      .then((hasUi) => {
        appendMainLog(`root-has-ui=${hasUi}`);
        if (!hasUi && rootRetry < 2 && devUrl) {
          rootRetry += 1;
          console.warn(
            `[solar-erp] UI bo‘sh — qayta yuklash (${rootRetry}/2)…`,
          );
          setTimeout(() => {
            try {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.reloadIgnoringCache();
              }
            } catch (_) {
              /* ignore */
            }
          }, 800);
        }
      })
      .catch(() => {});
  });
  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    appendMainLog(
      `render-process-gone reason=${details?.reason} exitCode=${details?.exitCode}`,
    );
  });
  mainWindow.on("closed", () => {
    appendMainLog("mainWindow closed");
    mainWindow = null;
  });
  if (typeof loadUrlOrData === "string" && loadUrlOrData.startsWith("data:")) {
    mainWindow.loadURL(loadUrlOrData);
  } else {
    const url =
      loadUrlOrData && !loadUrlOrData.startsWith("data:")
        ? loadUrlOrData.replace(/\/?$/, "/")
        : `http://127.0.0.1:${port}/`;
    mainWindow.loadURL(url);
  }

  if (
    devUrl &&
    String(process.env.ELECTRON_OPEN_DEVTOOLS || "").trim() === "1"
  ) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  registerReloadShortcuts();
}

app.whenReady().then(async () => {
  appendMainLog("app.whenReady()");
  app.on("child-process-gone", (_e, details) => {
    appendMainLog(
      `child-process-gone type=${details?.type} reason=${details?.reason} exitCode=${details?.exitCode}`,
    );
  });
  try {
    loadEnvFromRoot();
    const port = getPort();
    const devUrl = getDevUrl();
    if (devUrl) {
      appendMainLog(`dev mode ${devUrl}`);
      await startEmbeddedServer();
      await waitUntilUrlReady(devUrl);
      createMainWindow(devUrl, port);
    } else {
      await startEmbeddedServer();
      appendMainLog("startEmbeddedServer() ok");
      await waitUntilServerReady(port);
      appendMainLog("waitUntilServerReady() ok");
      createMainWindow(`http://127.0.0.1:${port}/`, port);
    }
  } catch (e) {
    const port = getPort();
    const msg = e instanceof Error ? e.message : String(e || "Xatolik");
    console.error("[solar-erp] server kutilmaganda:", msg);
    appendMainLog(`startup error: ${msg}`);
    createMainWindow(loadErrorHtml(`Port ${port}: ${msg}`, port), port);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const port = getPort();
      const devUrl = getDevUrl();
      void createMainWindow(devUrl || `http://127.0.0.1:${port}/`, port);
    }
  });
});

app.on("window-all-closed", () => {
  appendMainLog("window-all-closed");
  if (process.platform !== "darwin") {
    stopEmbeddedServer();
    app.quit();
  }
});

app.on("before-quit", () => {
  appendMainLog("before-quit");
  try {
    globalShortcut.unregisterAll();
  } catch (_) {
    /* ignore */
  }
  stopEmbeddedServer();
});
