// Browser build: the same UI with the desktop pieces swapped out, so a change can be
// checked by opening a link instead of installing the app. Data stays in this browser
// (IndexedDB); photos are read from the folder the user picks and live only until reload.
import { joinPath, type Platform } from "./types";

const DB = "saved-board";
const STORE = "files";

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const getFile = (name: string) => tx<string | undefined>("readonly", (s) => s.get(name));
const putFile = (name: string, data: string) => tx("readwrite", (s) => s.put(data, name)).then(() => undefined);

// Files of the export folder picked in this tab, keyed by path relative to that folder.
const media = new Map<string, File>();
const objectUrls = new Map<string, string>();
const key = (rel: string) => rel.replace(/\\/g, "/").replace(/^\.?\//, "");

function pickFolder(): Promise<File[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.webkitdirectory = true;
    input.multiple = true;
    input.onchange = () => resolve(input.files ? Array.from(input.files) : null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

const SECRET_PREFIX = "secret:";

export const platform: Platform = {
  kind: "web",
  canFetchLinks: true,
  data: {
    exists: async (name) => (await getFile(name)) !== undefined,
    read: async (name) => (await getFile(name)) ?? "",
    write: putFile,
    append: async (name, data) => putFile(name, ((await getFile(name)) ?? "") + data),
  },
  // Kept in this browser's localStorage: fine for a test build, the desktop app uses the OS credential store.
  secrets: {
    get: async (name) => localStorage.getItem(SECRET_PREFIX + name),
    set: async (name, value) => localStorage.setItem(SECRET_PREFIX + name, value),
    delete: async (name) => localStorage.removeItem(SECRET_PREFIX + name),
  },
  async pickExport() {
    const files = await pickFolder();
    if (!files?.length) return null;
    const dir = files[0].webkitRelativePath.split("/")[0] || "export";
    for (const u of objectUrls.values()) URL.revokeObjectURL(u);
    objectUrls.clear();
    media.clear();
    for (const f of files) media.set(f.webkitRelativePath.split("/").slice(1).join("/"), f);
    return {
      dir,
      async readText(rel) {
        const f = media.get(key(rel));
        if (!f) throw new Error(`Нет файла ${rel}`);
        return f.text();
      },
    };
  },
  mediaUrl(_sourceDir, rel) {
    if (rel.startsWith("data:")) return rel; // demo data
    const k = key(rel);
    const cached = objectUrls.get(k);
    if (cached) return cached;
    const f = media.get(k);
    if (!f) return undefined;
    const url = URL.createObjectURL(f);
    objectUrls.set(k, url);
    return url;
  },
  async readMedia(_sourceDir, rel) {
    if (rel.startsWith("data:")) return (await fetch(rel)).blob();
    const f = media.get(key(rel));
    if (!f) throw new Error(`Файл ${rel} недоступен: выбери папку экспорта ещё раз.`);
    return f;
  },
  async openUrl(url) {
    window.open(url, "_blank", "noopener");
  },
  async openFile(sourceDir, rel) {
    const url = platform.mediaUrl(sourceDir, rel);
    if (url) window.open(url, "_blank", "noopener");
    else alert(`Файл ${joinPath(sourceDir, rel)} недоступен: выбери папку экспорта ещё раз.`);
  },
  async saveTextFile(defaultName, _filter, content) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    a.download = defaultName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    return `«Загрузки» (${defaultName})`;
  },
  // Browsers block reading other sites, so pages and pictures for previews go through
  // api/fetch.ts, a small function deployed next to this build on Vercel. It only gets the link.
  httpFetch: (url, init) => fetch(`/api/fetch?url=${encodeURIComponent(url)}`, { signal: init?.signal }),
  appVersion: async () => `web ${__BUILD_ID__}`,
  checkUpdate: async () => null,
};
