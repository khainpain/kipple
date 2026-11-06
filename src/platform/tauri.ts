import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { open, save } from "@tauri-apps/plugin-dialog";
import { BaseDirectory, exists, mkdir, readFile, readTextFile, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { joinPath, type HttpFetch, type Platform } from "./types";

// App data lives in the app's own folder (on Windows: %APPDATA%\com.khainpain.savedboard).
const base = { baseDir: BaseDirectory.AppData };

async function ensureDir() {
  if (!(await exists("", base))) await mkdir("", { ...base, recursive: true });
}

export const platform: Platform = {
  kind: "desktop",
  canFetchLinks: true,
  data: {
    exists: (name) => exists(name, base),
    read: (name) => readTextFile(name, base),
    async write(name, data) {
      // Write to a temp file and rename, so a crash mid-write never corrupts the library.
      await ensureDir();
      const tmp = `${name}.tmp`;
      await writeTextFile(tmp, data, base);
      await rename(tmp, name, { oldPathBaseDir: BaseDirectory.AppData, newPathBaseDir: BaseDirectory.AppData });
    },
    async append(name, data) {
      await ensureDir();
      await writeTextFile(name, data, { ...base, append: true });
    },
  },
  // Stored in the OS credential store (Windows Credential Manager, macOS Keychain), never in a file.
  secrets: {
    get: (name) => invoke<string | null>("get_secret", { name }),
    set: (name, value) => invoke<void>("set_secret", { name, value }),
    delete: (name) => invoke<void>("delete_secret", { name }),
  },
  async pickExport() {
    const dir = await open({ directory: true, title: "Папка экспорта Telegram (с файлом result.json)" });
    if (typeof dir !== "string") return null;
    return { dir, readText: (rel) => readTextFile(joinPath(dir, rel)) };
  },
  mediaUrl: (sourceDir, rel) => convertFileSrc(joinPath(sourceDir, rel)),
  readMedia: async (sourceDir, rel) => new Blob([await readFile(joinPath(sourceDir, rel))]),
  openUrl: (url) => openUrl(url),
  openFile: (sourceDir, rel) => openPath(joinPath(sourceDir, rel)),
  async saveTextFile(defaultName, filter, content) {
    const path = await save({ title: "Экспорт карточек", defaultPath: defaultName, filters: [{ name: filter.name, extensions: [filter.ext] }] });
    if (!path) return null;
    await writeTextFile(path, content);
    return path;
  },
  httpFetch: tauriFetch as HttpFetch,
  appVersion: () => getVersion(),
  async checkUpdate() {
    const update = await check();
    if (!update) return null;
    return {
      version: update.version,
      notes: update.body,
      async install(onProgress) {
        let total = 0;
        let got = 0;
        await update.downloadAndInstall((ev) => {
          if (ev.event === "Started") total = ev.data.contentLength ?? 0;
          if (ev.event === "Progress") {
            got += ev.data.chunkLength;
            onProgress?.(total ? Math.round((got / total) * 100) : null);
          }
        });
        await relaunch();
      },
    };
  },
};
