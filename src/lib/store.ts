import { BaseDirectory, exists, mkdir, readTextFile, writeTextFile, rename } from "@tauri-apps/plugin-fs";
import type { EditEvent, Library } from "./types";
import { applyEdits } from "./library";

// Everything lives in the app's own data folder (on Windows: %APPDATA%\com.khainpain.savedboard).
const base = { baseDir: BaseDirectory.AppData };
const LIBRARY = "library.json";
const EDITS = "edits.jsonl";
const SETTINGS = "settings.json";

export interface Settings {
  aiEnabled: boolean;
  fetchLinks: boolean;
}

export const DEFAULT_SETTINGS: Settings = { aiEnabled: true, fetchLinks: true };

async function ensureDir() {
  if (!(await exists("", base))) await mkdir("", { ...base, recursive: true });
}

/** Write to a temp file and rename, so a crash mid-write never corrupts the library. */
async function atomicWrite(name: string, data: string) {
  await ensureDir();
  const tmp = `${name}.tmp`;
  await writeTextFile(tmp, data, base);
  await rename(tmp, name, { oldPathBaseDir: BaseDirectory.AppData, newPathBaseDir: BaseDirectory.AppData });
}

export async function loadLibrary(): Promise<Library | null> {
  if (!(await exists(LIBRARY, base))) return null;
  const lib = JSON.parse(await readTextFile(LIBRARY, base)) as Library | null;
  if (!lib?.cards) return null;
  applyEdits(lib.cards, await loadEdits());
  return lib;
}

/** Saves imported data and AI results. User edits are stripped: they live in the edit log. */
export async function saveLibrary(lib: Library) {
  const cards = lib.cards.map(({ user: _user, ...rest }) => rest);
  await atomicWrite(LIBRARY, JSON.stringify({ ...lib, cards }));
}

export async function loadEdits(): Promise<EditEvent[]> {
  if (!(await exists(EDITS, base))) return [];
  const text = await readTextFile(EDITS, base);
  const out: EditEvent[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // A torn last line after a crash: ignore it.
    }
  }
  return out;
}

export async function appendEdit(ev: EditEvent) {
  await ensureDir();
  await writeTextFile(EDITS, JSON.stringify(ev) + "\n", { ...base, append: true });
}

export async function loadSettings(): Promise<Settings> {
  if (!(await exists(SETTINGS, base))) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...JSON.parse(await readTextFile(SETTINGS, base)) };
}

export async function saveSettings(s: Settings) {
  await atomicWrite(SETTINGS, JSON.stringify(s));
}

export async function wipeAll() {
  await atomicWrite(LIBRARY, "null");
  await atomicWrite(EDITS, "");
}
