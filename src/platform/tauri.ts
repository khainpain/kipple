import { T } from "../i18n";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import { BaseDirectory, exists, mkdir, readFile, readTextFile, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { joinPath, type HttpFetch, type Platform, type TelegramApi } from "./types";

// Telegram over MTProto lives in src-tauri/src/telegram.rs; these are thin wrappers around its commands.
const telegram: TelegramApi = {
  status: () => invoke("tg_status"),
  account: () => invoke("tg_account"),
  setApi: (apiId, apiHash) => invoke("tg_set_api", { apiId, apiHash }),
  clearApi: () => invoke("tg_clear_api"),
  requestCode: (phone) => invoke("tg_request_code", { phone }),
  signIn: (code) => invoke("tg_sign_in", { code }),
  checkPassword: (password) => invoke("tg_check_password", { password }),
  qrPoll: () => invoke("tg_qr_poll"),
  qrCancel: () => invoke("tg_qr_cancel"),
  logout: () => invoke("tg_logout"),
  savedPage: (offsetId, minId) => invoke("tg_saved_page", { offsetId, minId }),
  quoteSaved: (id, text) => invoke("tg_quote_saved", { id, text }),
  deleteSaved: (ids, owner) => invoke("tg_delete_saved", { ids, owner }),
  savedPhotos: (ids) => invoke("tg_saved_photos", { ids }),
  forgetMedia: () => invoke("tg_forget_media"),
  ensureBoard: (prev, title, about) => invoke("tg_ensure_board", { channelId: prev?.channelId ?? null, accessHash: prev?.accessHash ?? null, title, about }),
  createTopic: (b, title, iconColor) => invoke("tg_create_topic", { channelId: b.channelId, accessHash: b.accessHash, title, iconColor: iconColor ?? null }),
  forward: (b, topicId, ids) => invoke("tg_forward", { channelId: b.channelId, accessHash: b.accessHash, topicId, ids }),
  sendNote: (b, topicId, replyTo, text, boldLen) => invoke("tg_send_note", { channelId: b.channelId, accessHash: b.accessHash, topicId, replyTo, text, boldLen }),
};

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
    const dir = await open({ directory: true, title: T.importer.pickTitle });
    if (typeof dir !== "string") return null;
    return { dir, readText: (rel) => readTextFile(joinPath(dir, rel)) };
  },
  mediaUrl: (sourceDir, rel) => convertFileSrc(joinPath(sourceDir, rel)),
  readMedia: async (sourceDir, rel) => new Blob([await readFile(joinPath(sourceDir, rel))]),
  openUrl: (url) => openUrl(url),
  openFile: (sourceDir, rel) => openPath(joinPath(sourceDir, rel)),
  async saveTextFile(defaultName, filter, content) {
    const path = await save({ title: T.importer.saveTitle, defaultPath: defaultName, filters: [{ name: filter.name, extensions: [filter.ext] }] });
    if (!path) return null;
    await writeTextFile(path, content);
    return path;
  },
  httpFetch: tauriFetch as HttpFetch,
  telegram,
  appVersion: () => getVersion(),
  setWindowTheme: (theme) => getCurrentWindow().setTheme(theme),
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
