import { T } from "../i18n";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { appDataDir } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { BaseDirectory, exists, mkdir, readFile, readTextFile, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { openPath, openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { joinPath, resolveInside, RUNNABLE, type HttpFetch, type Platform, type TelegramApi } from "./types";

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
  deleteCards: (items, whole, owner) => invoke("tg_delete_cards", { items, whole, owner: owner ?? null }),
  pinSaved: (id, date, pin) => invoke("tg_pin_saved", { id, date, pin }),
  backupStep: () => invoke("tg_backup_step"),
  backupInfo: () => invoke("tg_backup_info"),
  openBackup: (dir) => openPath(dir),
  savedPhotos: (ids) => invoke("tg_saved_photos", { ids }),
  forgetMedia: () => invoke("tg_forget_media"),
  ensureBoard: (prev, title, about) => invoke("tg_ensure_board", { channelId: prev?.channelId ?? null, accessHash: prev?.accessHash ?? null, title, about }),
  createTopic: (b, title, iconColor) => invoke("tg_create_topic", { channelId: b.channelId, accessHash: b.accessHash, title, iconColor: iconColor ?? null }),
  forward: (b, topicId, ids) => invoke("tg_forward", { channelId: b.channelId, accessHash: b.accessHash, topicId, ids }),
  tagsSetup: (titles) => invoke("tg_tags_setup", { titles }),
  tagsApply: (id, date, owner, add, remove, owned) => invoke("tg_tags_apply", { id, date, owner, add, remove, owned }),
  tagsHashtags: (id, date, owner, hashtags) => invoke("tg_tags_hashtags", { id, date, owner, hashtags }),
  sendNote: (b, topicId, replyTo, text, boldLen) => invoke("tg_send_note", { channelId: b.channelId, accessHash: b.accessHash, topicId, replyTo, text, boldLen }),
};

// App data lives in the app's own folder (on Windows: %APPDATA%\io.getkipple.app).
const base = { baseDir: BaseDirectory.AppData };

async function ensureDir() {
  if (!(await exists("", base))) await mkdir("", { ...base, recursive: true });
}

/** Where Telegram photos are kept (data dir/telegram-media); known shortly after start. */
let mediaRoot: string | undefined;
let mediaRootAsked: Promise<string> | undefined;
/** Asked on first use, not on import: tests import this module without Tauri around. */
function mediaRootReady(): Promise<string> {
  mediaRootAsked ??= appDataDir().then((d) => {
    const data = d.replace(/[\\/]+$/, "");
    mediaRoot = `${data}${data.includes("\\") ? "\\" : "/"}telegram-media`;
    return mediaRoot;
  }).catch((e: unknown) => {
    mediaRootAsked = undefined; // asked again next time
    throw e;
  });
  return mediaRootAsked;
}

/**
 * A card's file as an absolute path, only when it lies inside the export folder or among the
 * photos loaded from Telegram (telegram-media in the app's folder). Paths come from result.json,
 * which could name any file on the computer (`..`, absolute paths); those are refused.
 */
async function cardFile(sourceDir: string, rel: string): Promise<string> {
  const path = resolveInside([sourceDir, await mediaRootReady()], sourceDir, rel);
  if (!path) throw new Error("PATH_OUTSIDE_EXPORT");
  return path;
}

/** Same guard for pictures shown in the board. Before the media folder is known (the first moments
 *  after start) the asset protocol's own scope is the only limit. */
function mediaPath(sourceDir: string, rel: string): string | undefined {
  if (!mediaRoot) {
    mediaRootReady().catch(() => undefined);
    return joinPath(sourceDir, rel);
  }
  return resolveInside([sourceDir, mediaRoot], sourceDir, rel) ?? undefined;
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
  mediaUrl: (sourceDir, rel) => {
    const path = mediaPath(sourceDir, rel);
    return path ? convertFileSrc(path) : undefined;
  },
  readMedia: async (sourceDir, rel) => new Blob([await readFile(await cardFile(sourceDir, rel))]),
  openUrl: (url) => openUrl(url),
  async openFile(sourceDir, rel) {
    const path = await cardFile(sourceDir, rel);
    if (!RUNNABLE.test(path)) return openPath(path);
    await revealItemInDir(path);
    return "revealed";
  },
  httpFetch: tauriFetch as HttpFetch,
  previewFetch: (url, accept) => invoke("preview_fetch", { url, accept: accept ?? null }),
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
