// Everything the UI needs from the outside world. The desktop app (Tauri) and the
// browser build (for quick UI checks on Vercel) each implement this; vite.config.ts
// picks one at build time through the "@platform" alias.

/** A Telegram export the user picked: its folder name and a way to read files inside it. */
export interface ExportSource {
  dir: string;
  readText(rel: string): Promise<string>;
}

export interface AvailableUpdate {
  version: string;
  notes?: string;
  /** Downloads, installs and restarts the app. */
  install(onProgress?: (percent: number | null) => void): Promise<void>;
}

/** fetch() plus Tauri's connectTimeout option, ignored in the browser. */
export type HttpFetch = (url: string, init?: RequestInit & { connectTimeout?: number }) => Promise<Response>;

export interface TelegramStatus {
  hasApi: boolean;
  builtInApi: boolean;
  /** The user saved their own api_id / api_hash in Settings → Advanced. */
  customApi: boolean;
  authorized: boolean;
  name?: string | null;
}

export type SignInResult = { status: "ok"; name: string } | { status: "password"; hint?: string | null };

/**
 * The user's own Telegram account over MTProto (desktop only). Errors are strings:
 * `FLOOD_WAIT:<seconds>` for rate limits, otherwise Telegram's error name.
 */
export interface TelegramApi {
  status(): Promise<TelegramStatus>;
  /** The user's own api_id / api_hash from my.telegram.org (Settings → Advanced); wins over the built-in key. */
  setApi(apiId: string, apiHash: string): Promise<void>;
  /** Forgets the user's own key and goes back to the one built into the app. */
  clearApi(): Promise<void>;
  requestCode(phone: string): Promise<void>;
  signIn(code: string): Promise<SignInResult>;
  checkPassword(password: string): Promise<SignInResult>;
  logout(): Promise<void>;
  ensureBoard(prev: { channelId: number; accessHash: string } | null, title: string, about: string): Promise<{ channelId: number; accessHash: string; created: boolean }>;
  createTopic(board: { channelId: number; accessHash: string }, title: string, iconColor?: number): Promise<number>;
  /** Returns the new message ids; empty when the originals no longer exist in Saved Messages. */
  forward(board: { channelId: number; accessHash: string }, topicId: number, ids: number[]): Promise<number[]>;
  sendNote(board: { channelId: number; accessHash: string }, topicId: number, replyTo: number, text: string, boldLen: number): Promise<number>;
}

export interface Platform {
  kind: "desktop" | "web";
  /** Whether link previews can be loaded (the browser build goes through its Vercel function). */
  canFetchLinks: boolean;
  /** Small app data files: library.json, edits.jsonl, settings.json. */
  data: {
    exists(name: string): Promise<boolean>;
    read(name: string): Promise<string>;
    /** Replaces the whole file without risking a half-written one. */
    write(name: string, data: string): Promise<void>;
    append(name: string, data: string): Promise<void>;
  };
  secrets: {
    get(name: string): Promise<string | null>;
    set(name: string, value: string): Promise<void>;
    delete(name: string): Promise<void>;
  };
  pickExport(): Promise<ExportSource | null>;
  mediaUrl(sourceDir: string, rel: string): string | undefined;
  /** A file of the export as bytes: for PDF and text previews, and for photos the user lets the AI name. */
  readMedia(sourceDir: string, rel: string): Promise<Blob>;
  openUrl(url: string): Promise<void>;
  openFile(sourceDir: string, rel: string): Promise<void>;
  /** Asks where to save (desktop) or downloads (web). Returns where it went, or null if cancelled. */
  saveTextFile(defaultName: string, filter: { name: string; ext: string }, content: string): Promise<string | null>;
  httpFetch: HttpFetch;
  appVersion(): Promise<string>;
  checkUpdate(): Promise<AvailableUpdate | null>;
  /** Matches the native title bar to the app theme; null follows the OS. Desktop only. */
  setWindowTheme?(theme: "light" | "dark" | null): Promise<void>;
  /** Sending the sorted library back to Telegram; only the desktop app can log in to Telegram. */
  telegram?: TelegramApi;
}

export function joinPath(dir: string, rel: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  const trimmed = dir.replace(/[\\/]+$/, "");
  return `${trimmed}${sep}${rel.replace(/[\\/]+/g, sep)}`;
}
