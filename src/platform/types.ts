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
  /** The account has Telegram Premium: needed for tags in Saved Messages. */
  premium?: boolean;
}

/** The signed-in Telegram account, shown in the sidebar header. */
export interface TelegramAccount {
  /** Telegram user id. */
  id: number;
  name: string;
  username?: string | null;
  /** Small profile photo, JPEG bytes. */
  photo?: number[] | null;
}

export type SignInResult = { status: "ok"; name: string } | { status: "password"; hint?: string | null };

/** QR sign-in: a `tg://login?token=…` link to show until `expires` (unix seconds), or the outcome. */
export type QrResult = { status: "qr"; url: string; expires: number } | SignInResult;

/** One message from Saved Messages, as src-tauri/src/telegram.rs reads it. */
export interface SavedMessage {
  id: number;
  /** Unix seconds. */
  date: number;
  text: string;
  /** Links and hashtags; offsets count UTF-16 units, like JavaScript strings. */
  entities: Array<{ kind: "url" | "text_url" | "hashtag"; offset: number; length: number; url?: string | null }>;
  forwardedFrom?: string | null;
  groupedId?: string | null;
  /** Telegram made a link preview with a picture; savedPhotos downloads it like a photo. */
  webPhoto?: boolean;
  media?: {
    /** photo, video_file, animation, voice_message, video_message, audio_file, sticker, document, poll, location, contact */
    kind: string;
    width?: number | null;
    height?: number | null;
    mime?: string | null;
    size?: number | null;
    duration?: number | null;
    fileName?: string | null;
    emoji?: string | null;
    pollQuestion?: string | null;
    pollAnswers?: string[] | null;
    latitude?: number | null;
    longitude?: number | null;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
  } | null;
}

/**
 * What happened to one message: "ok", "same" (nothing to change), "full" (no room for more tags),
 * "missing" (the message is gone), "changed" (the id is another message now: another account),
 * "forwarded" or "not_editable" (hashtags couldn't be added). `applied`: Kipple's tags on it now.
 */
export interface TagResult {
  status: "ok" | "same" | "full" | "missing" | "changed" | "forwarded" | "not_editable";
  applied: string[];
}

export interface SavedPage {
  messages: SavedMessage[];
  /** Offset for the next (older) page; null when there is nothing more. */
  nextOffset: number | null;
  total: number | null;
}

/**
 * The user's own Telegram account over MTProto (desktop only). Errors are strings:
 * `FLOOD_WAIT:<seconds>` for rate limits, otherwise Telegram's error name.
 */
export interface TelegramApi {
  status(): Promise<TelegramStatus>;
  /** Who is signed in (name, @username, avatar), or null. */
  account(): Promise<TelegramAccount | null>;
  /** The user's own api_id / api_hash from my.telegram.org (Settings → Advanced); wins over the built-in key. */
  setApi(apiId: string, apiHash: string): Promise<void>;
  /** Forgets the user's own key and goes back to the one built into the app. */
  clearApi(): Promise<void>;
  requestCode(phone: string): Promise<void>;
  signIn(code: string): Promise<SignInResult>;
  checkPassword(password: string): Promise<SignInResult>;
  /**
   * QR sign-in. Call about every 1.5 s while the code is on screen: returns the current code
   * (a new one once it expires) or, after the phone confirmed it, the sign-in result.
   * A "password" result continues with checkPassword().
   */
  qrPoll(): Promise<QrResult>;
  /** Stops QR sign-in (switched to the phone number or left the screen). */
  qrCancel(): Promise<void>;
  logout(): Promise<void>;
  /** Up to 100 Saved Messages older than offsetId (0: from the newest) and newer than minId. */
  savedPage(offsetId: number, minId: number): Promise<SavedPage>;
  /**
   * Posts `text` in Saved Messages as a reply to message `id`. Returns the reply's id and a tg://
   * link that opens Saved Messages (null when the account has neither username nor phone), and
   * the account's user id (null when it couldn't be read). Rejects with "NO_ORIGINAL" when the
   * original is gone.
   */
  quoteSaved(id: number, text: string): Promise<{ id: number; open: string | null; owner: number | null }>;
  /** Deletes these messages from Saved Messages, on all devices. Rejects with "OTHER_ACCOUNT"
   *  (and deletes nothing) when the signed-in account isn't `owner`. */
  deleteSaved(ids: number[], owner: number): Promise<void>;
  /**
   * Deletes these messages of the user's cards from Saved Messages, on all devices (up to 100).
   * Each is checked first: still there, in the signed-in account's Saved Messages, with this
   * date; and copied to the local backup. "deleted", "missing" (gone already) or "changed"
   * (another message has this id) per message; nothing is deleted if the backup fails.
   */
  deleteCards(items: Array<{ id: number; date: number }>): Promise<Array<{ id: number; status: "deleted" | "missing" | "changed" }>>;
  /** Pins (or unpins) a Saved Message after the same check as deleteCards. Silent: no notification. */
  pinSaved(id: number, date: number, pin: boolean): Promise<"ok" | "missing" | "changed">;
  /**
   * Copies one page of Saved Messages that aren't in the local backup yet into it (the whole
   * history on the first run, then only newer messages). Call until `done`. The backup only grows.
   */
  backupStep(): Promise<{ done: boolean; saved: number }>;
  /** The backup folder and how many messages it holds. */
  backupInfo(): Promise<{ dir: string; messages: number }>;
  /** Opens the backup folder in the file manager. */
  openBackup(dir: string): Promise<void>;
  /** Downloads these messages' photos into the app's folder; returns absolute paths. Skips ones already there. */
  /** Photos of these messages, or the pictures of their link previews. */
  savedPhotos(ids: number[]): Promise<Array<{ id: number; path: string }>>;
  /** Deletes the downloaded photos. */
  forgetMedia(): Promise<void>;
  ensureBoard(prev: { channelId: number; accessHash: string } | null, title: string, about: string): Promise<{ channelId: number; accessHash: string; created: boolean }>;
  createTopic(board: { channelId: number; accessHash: string }, title: string, iconColor?: number): Promise<number>;
  /** Returns the new message ids; empty when the originals no longer exist in Saved Messages. */
  forward(board: { channelId: number; accessHash: string }, topicId: number, ids: number[]): Promise<number[]>;
  /**
   * Gives each of these tags a Telegram tag in Saved Messages (an existing one with that name, or
   * a free emoji named after it). Premium only: without it `tags` is empty. `owner` is the
   * signed-in account, to pass to tagsApply / tagsHashtags.
   */
  tagsSetup(titles: string[]): Promise<{ premium: boolean; owner: number; tags: Array<{ title: string; reaction: string }> }>;
  /**
   * Puts Telegram tags (reactions from tagsSetup) on a Saved Message and takes `remove` off,
   * keeping the user's own. `owned`: the tags Kipple put there before; any other tag already on
   * the message is the user's and never counts as Kipple's in `applied`.
   */
  tagsApply(id: number, date: number, owner: number, add: string[], remove: string[], owned: string[]): Promise<TagResult>;
  /** Adds hashtags to the end of the user's own Saved Message (backed up first). */
  tagsHashtags(id: number, date: number, owner: number, hashtags: string[]): Promise<TagResult>;
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
  httpFetch: HttpFetch;
  appVersion(): Promise<string>;
  checkUpdate(): Promise<AvailableUpdate | null>;
  /** Matches the native title bar to the app theme; null follows the OS. Desktop only. */
  setWindowTheme?(theme: "light" | "dark" | null): Promise<void>;
  /** Sending the sorted library back to Telegram; only the desktop app can log in to Telegram. */
  telegram?: TelegramApi;
}

export function joinPath(dir: string, rel: string): string {
  // Photos loaded straight from Telegram are stored with absolute paths.
  if (/^([a-zA-Z]:[\\/]|\/|\\\\)/.test(rel) || !dir) return rel;
  const sep = dir.includes("\\") ? "\\" : "/";
  const trimmed = dir.replace(/[\\/]+$/, "");
  return `${trimmed}${sep}${rel.replace(/[\\/]+/g, sep)}`;
}
