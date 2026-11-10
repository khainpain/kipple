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

/** The sync state (owner and edge albums live on TelegramSync too). */
export type TgSyncState = TelegramSync;

/** Kept small: only albums at page edges can continue on another page. */
const MAX_EDGE_ALBUMS = 20;

const visual = (c: Card) => c.kind === "photo" || c.kind === "video";

/** Card media (main + album) with the message id each piece belongs to. */
function parts(c: Card): Array<{ id: number; ref: MediaRef }> {
  const out: Array<{ id: number; ref: MediaRef }> = [];
  if (c.media) out.push({ id: c.id, ref: c.media });
  c.album?.forEach((ref, i) => {
    const id = c.albumIds?.[i];
    if (id !== undefined) out.push({ id, ref });
  });
  return out;
}

/**
 * Moves the album part `part` into `into`: its photos join the album (ordered by message id) and
 * its caption is taken when `into` has none. `into` keeps its id, so nothing tied to it is lost.
 */
function mergeAlbumPart(into: Card, part: Card) {
  const extra = [...(into.album ?? []).map((ref, i) => ({ id: into.albumIds?.[i], ref })), ...parts(part)]
    .filter((p): p is { id: number; ref: MediaRef } => p.id !== undefined && p.id !== into.id)
    .sort((a, b) => a.id - b.id);
  into.album = extra.map((p) => p.ref);
  into.albumIds = extra.map((p) => p.id);
  if (!into.text.trim() && part.text.trim()) {
    into.text = part.text;
    into.urls = part.urls;
    into.hashtags = part.hashtags;
    into.autoJunk = part.autoJunk;
  }
  if (part.sensitive) into.sensitive = true;
  into.forwardedFrom ??= part.forwardedFrom;
}

/** Cards for a page of messages plus the album (groupedId) each card belongs to. */
function pageCards(messages: SavedMessage[]): { cards: Card[]; groupOf: Map<number, string> } {
  const sorted = [...messages].sort((a, b) => a.id - b.id);
  const { cards: parsed } = parseExport({ name: T.importer.savedMessages, type: "saved_messages", messages: sorted.map(toRawMessage) });
  const webPhoto = new Set(sorted.filter((m) => m.webPhoto).map((m) => m.id));
  const groupOfMsg = new Map(sorted.filter((m) => m.groupedId).map((m) => [m.id, m.groupedId!]));
  // Telegram marks album members with a groupedId: merge by it (the parser only knows "same second").
  const cards: Card[] = [];
  const groupOf = new Map<number, string>();
  const byGroup = new Map<string, Card>();
  for (const c of parsed) {
    const g = groupOfMsg.get(c.id);
    const head = g !== undefined ? byGroup.get(g) : undefined;
    if (head && visual(head) && visual(c)) {
      mergeAlbumPart(head, c);
      continue;
    }
    if (g !== undefined && !head) byGroup.set(g, c);
    if (g !== undefined) groupOf.set(c.id, g);
    cards.push(c);
  }
  for (const c of cards) {
    if (c.kind === "link" && webPhoto.has(c.id)) c.preview = { inTelegram: true };
    for (const m of mediaOf(c)) m.ref.inTelegram = true;
  }
  return { cards, groupOf };
}

/** Cards for these messages (any order), albums merged, media marked as kept in Telegram. */
export function messagesToCards(messages: SavedMessage[]): Card[] {
  return pageCards(messages).cards;
}

/**
 * Adds one page's cards; album parts whose album already has a card (from a page read before)
 * join that card instead of making a second one. Remembers the albums at this page's edges.
 */
function addPage(lib: Library, sync: TgSyncState, messages: SavedMessage[]): number {
  const { cards, groupOf } = pageCards(messages);
  const albums = sync.albums ?? {};
  const fresh: Card[] = [];
  let merged = false;
  for (const c of cards) {
    const g = groupOf.get(c.id);
    const known = g !== undefined && albums[g] !== undefined ? lib.cards.find((x) => x.id === albums[g]) : undefined;
    const ids = [c.id, ...(c.albumIds ?? [])];
    if (known && known.id !== c.id && visual(known) && visual(c) && !ids.some((id) => id === known.id || known.albumIds?.includes(id))) {
      mergeAlbumPart(known, c);
      merged = true;
    } else fresh.push(c);
  }
  const added = addCards(lib, fresh);
  if (merged && !added) annotateContext(lib.cards);
  // An album cut by a page boundary has a message at this page's lowest or highest id.
  const ids = messages.map((m) => m.id);
  for (const edge of ids.length ? [Math.min(...ids), Math.max(...ids)] : []) {
    const g = messages.find((m) => m.id === edge)?.groupedId;
    if (!g) continue;
    const card = lib.cards.find((x) => x.id === edge || x.albumIds?.includes(edge));
    if (!card) continue;
    delete albums[g];
    albums[g] = card.id;
  }
  const keys = Object.keys(albums);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_EDGE_ALBUMS))) delete albums[k];
  if (Object.keys(albums).length) sync.albums = albums;
  return added;
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
async function withFloodWait<R>(fn: () => Promise<R>, deps: Pick<SyncDeps, "signal" | "sleep">): Promise<R> {
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
 * Brings the local backup of Saved Messages up to date (src-tauri telegram.rs, "Local backup"):
 * the whole history on the first run, then only newer messages. Returns how many were written.
 * Errors are thrown; stopping (signal) keeps what's done, and the next run carries on.
 */
export async function backupSaved(deps: { tg: Pick<TelegramApi, "backupStep">; signal: AbortSignal; sleep?: (ms: number) => Promise<void> }): Promise<number> {
  let saved = 0;
  while (!deps.signal.aborted) {
    const step = await withFloodWait(() => deps.tg.backupStep(), deps);
    saved += step.saved;
    if (step.done) break;
  }
  return saved;
}

/**
 * Reads new Saved Messages into the library (in place), then downloads their photos.
 * Returns how many cards were added. Stopping (signal) keeps what's done so far.
 * Throws OTHER_ACCOUNT_LIBRARY when another Telegram account than the one this library was
 * loaded from is signed in (nothing is changed then).
 */
export async function syncSaved(lib: Library, deps: SyncDeps): Promise<{ added: number; photos: number }> {
  const sync: TgSyncState = lib.telegram ?? { top: newestId(lib) };
  lib.telegram = sync;
  let added = 0;
  let pages = 0;
  let done = 0;
  let total = 0;
  let cursor = sync.cursor ?? 0;
  let ownerChecked = false;
  while (!deps.signal.aborted) {
    let page;
    try {
      page = await withFloodWait(() => deps.tg.savedPage(cursor, sync.top), deps);
    } catch (e) {
      await deps.save(lib).catch(() => undefined); // keep what came in; the next run carries on from `cursor`
      throw e;
    }
    // Which account this is couldn't be read: don't add anything that might be another account's.
    if (!ownerChecked && page.owner == null && sync.owner != null) throw new Error("NO_ACCOUNT");
    if (!ownerChecked && page.owner != null) {
      ownerChecked = true;
      if (sync.owner != null && sync.owner !== page.owner) {
        // This board was loaded from another account, and message ids are per account: mixing
        // the two would skip or mislabel messages. Nothing is changed; the user decides.
        throw new Error("OTHER_ACCOUNT_LIBRARY");
      }
      sync.owner = page.owner;
    }
    if (page.nextOffset == null || page.nextOffset <= sync.top) {
      // Read everything down to `top`: the pass is complete.
      added += addPage(lib, sync, page.messages);
      sync.top = Math.max(sync.top, sync.passTop ?? 0, ...page.messages.map((m) => m.id));
      sync.cursor = undefined;
      sync.passTop = undefined;
      await deps.save(lib);
      deps.onChange();
      break;
    }
    if (cursor === 0 && page.total) total = page.total;
    sync.passTop = Math.max(sync.passTop ?? 0, ...page.messages.map((m) => m.id));
    // The oldest album on the page may go on in the next page: read it again with that page, so
    // the whole album becomes one card with its photos in order and the first one as the cover.
    const oldest = page.messages.reduce<SavedMessage | undefined>((m, x) => (!m || x.id < m.id ? x : m), undefined);
    const held = oldest?.groupedId ? page.messages.filter((m) => m.groupedId === oldest.groupedId) : [];
    const again = held.length ? Math.max(...held.map((m) => m.id)) + 1 : 0;
    // Only when that moves on (a page that is all one album, or the same album again, is taken as it is).
    const hold = held.length > 0 && held.length < page.messages.length && (cursor === 0 || again < cursor);
    const keep = hold ? page.messages.filter((m) => !held.includes(m)) : page.messages;
    added += addPage(lib, sync, keep);
    done += keep.length;
    cursor = hold ? again : page.nextOffset;
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
        ok.add(id);
        if (!path) continue; // failed this time: not "no photo", tried again on the next load
        const ref = refs.get(id);
        if (ref) ref.path = path;
        photos++;
      }
      const gone = batch.filter((id) => !ok.has(id));
      if (gone.length) sync.noPhoto = [...(sync.noPhoto ?? []), ...gone];
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
