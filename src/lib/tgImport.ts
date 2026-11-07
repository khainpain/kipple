import { T } from "../i18n";
import type { SavedMessage, TelegramApi } from "../platform/types";
import { parseExport, type RawMessage } from "./parser";
import { annotateContext } from "./library";
import type { Card, Library, MediaRef, TelegramSync } from "./types";

/**
 * Loading Saved Messages straight from Telegram, instead of a Telegram Desktop export.
 *
 * Messages come newest first, 100 per page. Each one is turned into the same shape as a
 * message in the export's result.json, so the cards are exactly the ones a file import makes.
 * Progress is saved as it goes (Library.telegram), so a closed app carries on where it stopped,
 * and the next run only reads what's new. Photos are downloaded afterwards, in small batches.
 */

type Entity = { type: string; text: string; href?: string };

/** Splits the text into the export's text_entities: plain runs plus links and hashtags. */
export function textEntities(m: Pick<SavedMessage, "text" | "entities">): Entity[] {
  const out: Entity[] = [];
  let at = 0;
  const ents = [...m.entities].sort((a, b) => a.offset - b.offset);
  for (const e of ents) {
    if (e.offset < at || e.length <= 0) continue; // overlapping or empty
    if (e.offset > at) out.push({ type: "plain", text: m.text.slice(at, e.offset) });
    const text = m.text.slice(e.offset, e.offset + e.length);
    if (e.kind === "text_url") out.push({ type: "text_link", text, href: e.url ?? undefined });
    else out.push({ type: e.kind === "url" ? "link" : "hashtag", text });
    at = e.offset + e.length;
  }
  if (at < m.text.length) out.push({ type: "plain", text: m.text.slice(at) });
  return out;
}

const undef = <V>(v: V | null | undefined): V | undefined => v ?? undefined;

/** One message in the shape of Telegram Desktop's result.json, for the export parser. */
export function toRawMessage(m: SavedMessage): RawMessage {
  const raw: RawMessage = {
    id: m.id,
    type: "message",
    date_unixtime: String(m.date),
    text: m.text,
    text_entities: textEntities(m),
    forwarded_from: undef(m.forwardedFrom),
  };
  const md = m.media;
  if (!md) return raw;
  switch (md.kind) {
    case "photo":
      // No path yet: the photo is downloaded after the messages.
      return { ...raw, photo: "", width: undef(md.width), height: undef(md.height) };
    case "poll":
      return { ...raw, poll: { question: undef(md.pollQuestion), answers: (md.pollAnswers ?? []).map((text) => ({ text })) } };
    case "location":
      return { ...raw, location_information: { latitude: undef(md.latitude), longitude: undef(md.longitude) } };
    case "contact":
      return { ...raw, contact_information: { first_name: undef(md.firstName), last_name: undef(md.lastName), phone_number: undef(md.phone) } };
    default:
      return {
        ...raw,
        media_type: md.kind,
        file_name: undef(md.fileName),
        file_size: undef(md.size),
        mime_type: undef(md.mime),
        width: undef(md.width),
        height: undef(md.height),
        duration_seconds: md.duration != null ? Math.round(md.duration) : undefined,
        sticker_emoji: undef(md.emoji),
      };
  }
}

/** Cards for these messages (any order), albums merged, media marked as kept in Telegram. */
export function messagesToCards(messages: SavedMessage[]): Card[] {
  const sorted = [...messages].sort((a, b) => a.id - b.id);
  const { cards } = parseExport({ name: T.importer.savedMessages, type: "saved_messages", messages: sorted.map(toRawMessage) });
  const webPhoto = new Set(sorted.filter((m) => m.webPhoto).map((m) => m.id));
  for (const c of cards) {
    if (c.kind === "link" && webPhoto.has(c.id)) c.preview = { inTelegram: true };
    for (const m of mediaOf(c)) m.ref.inTelegram = true;
  }
  return cards;
}

/** A card's media with the message id each piece came from (an album holds several). */
function mediaOf(c: Card): Array<{ id: number; ref: MediaRef }> {
  const out: Array<{ id: number; ref: MediaRef }> = [];
  if (c.media) out.push({ id: c.id, ref: c.media });
  else if (c.preview) out.push({ id: c.id, ref: c.preview });
  c.album?.forEach((ref, i) => {
    const id = c.albumIds?.[i];
    if (id !== undefined) out.push({ id, ref });
  });
  return out;
}

/** Adds cards the library doesn't have yet. Unlike a file import, nothing is marked removed. */
export function addCards(lib: Library, cards: Card[]): number {
  const known = new Set(lib.cards.flatMap((c) => [c.id, ...(c.albumIds ?? [])]));
  const fresh = cards.filter((c) => !known.has(c.id));
  if (!fresh.length) return 0;
  lib.cards = [...lib.cards, ...fresh].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
  annotateContext(lib.cards);
  return fresh.length;
}

/** The newest message id in the library, so a library made from an export only loads what's newer. */
export function newestId(lib: Library): number {
  let max = 0;
  for (const c of lib.cards) for (const id of [c.id, ...(c.albumIds ?? [])]) if (id > max) max = id;
  return max;
}

/** Photos (and link preview pictures) that still need downloading. */
export function pendingPhotos(lib: Library): number[] {
  const skip = new Set(lib.telegram?.noPhoto ?? []);
  const ids: number[] = [];
  for (const c of lib.cards) {
    if (!(c.kind === "photo" || (c.kind === "link" && c.preview)) || c.removed) continue;
    for (const { id, ref } of mediaOf(c)) if (!ref.path && !ref.missing && !skip.has(id)) ids.push(id);
  }
  return ids;
}

export interface SyncProgress {
  phase: "messages" | "photos";
  done: number;
  total: number;
}

export interface SyncDeps {
  tg: Pick<TelegramApi, "savedPage" | "savedPhotos">;
  /** Saves the library; called every few pages and photo batches. */
  save(lib: Library): Promise<void>;
  onProgress(p: SyncProgress): void;
  /** Called after cards were added or photos arrived, to redraw. */
  onChange(): void;
  signal: AbortSignal;
  /** For tests. */
  sleep?: (ms: number) => Promise<void>;
}

const PAGES_PER_SAVE = 5;
const PHOTO_BATCH = 10;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Runs a Telegram call, waiting out FLOOD_WAIT up to a few times. */
async function withFloodWait<R>(fn: () => Promise<R>, deps: SyncDeps): Promise<R> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const flood = /^FLOOD_WAIT:(\d+)/.exec(String(e));
      if (!flood || attempt >= 3 || deps.signal.aborted) throw e;
      await (deps.sleep ?? wait)(Number(flood[1]) * 1000 + 500);
    }
  }
}

/**
 * Reads new Saved Messages into the library (in place), then downloads their photos.
 * Returns how many cards were added. Stopping (signal) keeps what's done so far.
 */
export async function syncSaved(lib: Library, deps: SyncDeps): Promise<{ added: number; photos: number }> {
  const sync: TelegramSync = lib.telegram ?? { top: newestId(lib) };
  lib.telegram = sync;
  let added = 0;
  let pages = 0;
  let done = 0;
  let total = 0;
  let cursor = sync.cursor ?? 0;
  while (!deps.signal.aborted) {
    let page;
    try {
      page = await withFloodWait(() => deps.tg.savedPage(cursor, sync.top), deps);
    } catch (e) {
      await deps.save(lib).catch(() => undefined); // keep what came in; the next run carries on from `cursor`
      throw e;
    }
    if (page.nextOffset == null || page.nextOffset <= sync.top) {
      // Read everything down to `top`: the pass is complete.
      added += addCards(lib, messagesToCards(page.messages));
      sync.top = Math.max(sync.top, sync.passTop ?? 0, ...page.messages.map((m) => m.id));
      sync.cursor = undefined;
      sync.passTop = undefined;
      await deps.save(lib);
      deps.onChange();
      break;
    }
    if (cursor === 0 && page.total) total = page.total;
    sync.passTop = Math.max(sync.passTop ?? 0, ...page.messages.map((m) => m.id));
    added += addCards(lib, messagesToCards(page.messages));
    done += page.messages.length;
    cursor = page.nextOffset;
    sync.cursor = cursor;
    deps.onProgress({ phase: "messages", done, total: Math.max(total, done) });
    deps.onChange();
    if (++pages % PAGES_PER_SAVE === 0) await deps.save(lib);
  }
  if (deps.signal.aborted) {
    await deps.save(lib);
    return { added, photos: 0 };
  }

  const todo = pendingPhotos(lib);
  let photos = 0;
  if (todo.length) {
    const refs = new Map<number, MediaRef>();
    for (const c of lib.cards) for (const { id, ref } of mediaOf(c)) refs.set(id, ref);
    deps.onProgress({ phase: "photos", done: 0, total: todo.length });
    for (let i = 0; i < todo.length && !deps.signal.aborted; i += PHOTO_BATCH) {
      const batch = todo.slice(i, i + PHOTO_BATCH);
      const got = await withFloodWait(() => deps.tg.savedPhotos(batch), deps);
      const ok = new Set<number>();
      for (const { id, path } of got) {
        const ref = refs.get(id);
        if (ref) ref.path = path;
        ok.add(id);
      }
      const gone = batch.filter((id) => !ok.has(id));
      if (gone.length) sync.noPhoto = [...(sync.noPhoto ?? []), ...gone];
      photos += got.length;
      deps.onProgress({ phase: "photos", done: Math.min(i + PHOTO_BATCH, todo.length), total: todo.length });
      deps.onChange();
      if ((i / PHOTO_BATCH) % 3 === 2) await deps.save(lib);
    }
    await deps.save(lib);
  }
  return { added, photos };
}

/** An empty library to fill from Telegram. */
export function emptyTelegramLibrary(): Library {
  return { version: 1, chatName: T.importer.savedMessages, sourceDir: "", importedAt: new Date().toISOString(), cards: [], telegram: { top: 0 } };
}
