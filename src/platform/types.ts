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

export interface Platform {
  kind: "desktop" | "web";
  /** Link previews need cross-origin requests, which browsers block. */
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
  openUrl(url: string): Promise<void>;
  openFile(sourceDir: string, rel: string): Promise<void>;
  /** Asks where to save (desktop) or downloads (web). Returns where it went, or null if cancelled. */
  saveTextFile(defaultName: string, filter: { name: string; ext: string }, content: string): Promise<string | null>;
  httpFetch: HttpFetch;
  appVersion(): Promise<string>;
  checkUpdate(): Promise<AvailableUpdate | null>;
}

export function joinPath(dir: string, rel: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  const trimmed = dir.replace(/[\\/]+$/, "");
  return `${trimmed}${sep}${rel.replace(/[\\/]+/g, sep)}`;
}
