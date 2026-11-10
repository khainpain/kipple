import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
const buildId = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "local").slice(0, 7);
// The site in production (getkipple.io/app/) is only the demo; Vercel previews and local builds
// keep the full browser build with import, for checking changes.
const webDemoOnly = process.env.VERCEL_ENV === "production";
// Same switch as the landing (kipple-site): until KIPPLE_DOWNLOAD=1, the demo banner points to the
// waitlist group in Telegram instead of /download.
const webDownload = process.env.KIPPLE_DOWNLOAD === "1";

// The browser build is a demo, not a page for search engines: the landing (getkipple.io) is.
// vercel.json also sends X-Robots-Tag: noindex for everything this deployment serves.
const noindex = {
  name: "kipple-noindex",
  transformIndexHtml: () => [{ tag: "meta", attrs: { name: "robots", content: "noindex" }, injectTo: "head" as const }],
};

// `vite build --mode web` makes the browser build (deployed to Vercel under /app/: the landing
// page's demo and quick UI checks);
// every other mode is the desktop app inside Tauri.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === "web" ? [noindex] : [])],
  // The browser build lives under /app/; the site root redirects to the landing page (getkipple.io),
  // which passes /app/ through to this deployment.
  base: mode === "web" ? "/app/" : "./",
  build: mode === "web" ? { outDir: "dist/app", emptyOutDir: true } : undefined,
  resolve: {
    alias: {
      "@platform": fileURLToPath(new URL(mode === "web" ? "./src/platform/web.ts" : "./src/platform/tauri.ts", import.meta.url)),
    },
  },
  define: { __BUILD_ID__: JSON.stringify(buildId), __WEB_DEMO_ONLY__: JSON.stringify(webDemoOnly), __WEB_DOWNLOAD__: JSON.stringify(webDownload) },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
