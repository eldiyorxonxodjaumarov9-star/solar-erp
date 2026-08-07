/**
 * Desktop / Vite / API portlari — yagona manba.
 * PORT yoki VITE_API_PROXY_TARGET dan o‘qiydi.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, "..");

const envPath = path.join(PROJECT_ROOT, ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

/** Faqat shu faylda default; boshqa joyda hardcode qilmang. */
export const DEFAULT_API_PORT = "5000";
export const DEFAULT_VITE_PORT = "5173";
export const PACKAGED_API_PORT = "5150";

function portFromUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  try {
    const u = new URL(s.includes("://") ? s : `http://${s}`);
    if (u.port) return String(u.port);
    return u.protocol === "https:" ? "443" : "80";
  } catch {
    const m = s.match(/:(\d{2,5})\b/);
    return m ? m[1] : null;
  }
}

/**
 * Desktop API porti.
 * Preferensiya: DESKTOP_API_PORT → VITE_API_PROXY_TARGET → VITE_API_BASE_HTTP → PORT → default
 */
export function resolveDesktopApiPort(env = process.env) {
  const fromDesktop = String(env.DESKTOP_API_PORT || "").trim();
  if (fromDesktop) return fromDesktop;

  const fromProxy =
    portFromUrl(env.VITE_API_PROXY_TARGET) ||
    portFromUrl(env.VITE_API_BASE_HTTP);
  if (fromProxy) return fromProxy;

  const fromPort = String(env.PORT || "").trim();
  // desktop:prod / exe uchun 5150 — npm run desktop (dev) da chalkashmasin
  if (fromPort && fromPort !== PACKAGED_API_PORT) return fromPort;
  if (fromPort === PACKAGED_API_PORT && env.ELECTRON_SKIP_EMBEDDED_SERVER === "1" && !env.ELECTRON_DEV_URL) {
    return fromPort;
  }

  return DEFAULT_API_PORT;
}

export function resolveViteDevPort(env = process.env) {
  return String(env.VITE_DEV_PORT || DEFAULT_VITE_PORT).trim() || DEFAULT_VITE_PORT;
}

export function apiBaseUrl(port = resolveDesktopApiPort()) {
  return `http://127.0.0.1:${port}`;
}

export function supplyHealthUrl(port = resolveDesktopApiPort()) {
  return `${apiBaseUrl(port)}/api/supply/health`;
}
