import { platform } from "@platform";
import type { EditEvent, Library } from "./types";
import { annotateContext, applyEdits } from "./library";

const { exists, read, write: atomicWrite, append } = platform.data;
const LIBRARY = "library.json";
const EDITS = "edits.jsonl";
const SETTINGS = "settings.json";

export interface Settings {
  aiEnabled: boolean;
  fetchLinks: boolean;
  /** Send downscaled copies of uncaptioned photos to the AI to name them. Off unless the user turns it on. */
  aiImages: boolean;
}

export const DEFAULT_SETTINGS: Settings = { aiEnabled: true, fetchLinks: true, aiImages: false };

export async function loadLibrary(): Promise<Library | null> {
  if (!(await exists(LIBRARY))) return null;
  const lib = JSON.parse(await read(LIBRARY)) as Library | null;
  if (!lib?.cards) return null;
  applyEdits(lib.cards, await loadEdits());
  annotateContext(lib.cards);
  return lib;
}

/** Saves imported data and AI results. User edits are stripped: they live in the edit log. */
export async function saveLibrary(lib: Library) {
  const cards = lib.cards.map(({ user: _user, context: _context, ...rest }) => rest);
  await atomicWrite(LIBRARY, JSON.stringify({ ...lib, cards }));
}

export async function loadEdits(): Promise<EditEvent[]> {
  if (!(await exists(EDITS))) return [];
  const text = await read(EDITS);
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
  await append(EDITS, JSON.stringify(ev) + "\n");
}

export async function loadSettings(): Promise<Settings> {
  if (!(await exists(SETTINGS))) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...JSON.parse(await read(SETTINGS)) };
}

export async function saveSettings(s: Settings) {
  await atomicWrite(SETTINGS, JSON.stringify(s));
}

export async function wipeAll() {
  await atomicWrite(LIBRARY, "null");
  await atomicWrite(EDITS, "");
}
