import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import {
  DEFAULT_API_PORT,
  DEFAULT_VITE_PORT,
} from "./scripts/desktop-config.mjs";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiPort =
    String(env.PORT || process.env.PORT || DEFAULT_API_PORT).trim() ||
    DEFAULT_API_PORT;
  const proxyTarget =
    String(env.VITE_API_PROXY_TARGET || process.env.VITE_API_PROXY_TARGET || "")
      .trim()
      .replace(/\/+$/, "") || `http://127.0.0.1:${apiPort}`;

  return {
    plugins: [react()],
    server: {
      port: Number(env.VITE_DEV_PORT || process.env.VITE_DEV_PORT || DEFAULT_VITE_PORT),
      strictPort: true,
      host: "127.0.0.1",
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/status": {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
