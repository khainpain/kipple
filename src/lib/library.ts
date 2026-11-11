import type { Action, Card, EditEvent, Library, UserFields, UserPatch } from "./types";
import { linkText } from "./embeds";

/**
 * Merge a fresh import into the existing library: AI fields, link previews and user
 * edits survive, new messages are added, and cards missing from the new export are
 * kept but marked removed (they may have been deleted in Telegram).
 */
export function mergeImport(prev: Library | null, next: Omit<Library, "version">): Library {
  const old = new Map(prev?.cards.map((c) => [c.id, c]) ?? []);
  const seen = new Set<number>();
  const cards: Card[] = next.cards.map((c) => {
    seen.add(c.id);
    const o = old.get(c.id);
    if (!o) return c;
    const sameText = o.text === c.text;
    return {
      ...c,
      ai: sameText ? o.ai : undefined,
      link: o.link && c.urls[0] === o.link.url ? o.link : undefined,
      preview: c.preview ?? (c.urls[0] === o.urls[0] ? o.preview : undefined),
      user: o.user,
    };
  });
  // Messages newer than the export (loaded from Telegram after it was made) aren't missing from it, just later.
  const newest = next.cards.reduce((m, c) => Math.max(m, c.id), 0);
  for (const o of prev?.cards ?? []) if (!seen.has(o.id)) cards.push(o.id > newest ? o : { ...o, removed: true });
  cards.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
  annotateContext(cards);
  // Keep what the export doesn't carry: where Telegram loading stopped, and AI subgroups.
  return { version: 1, telegram: prev?.telegram, subgroups: prev?.subgroups, ...next, cards };
}

/** After a re-tag ends (or on the next launch if the app closed mid-run): cards it didn't redo get their old AI fields back. Returns whether any did. */
export function restorePrevAi(cards: Card[]): boolean {
  let restored = false;
  for (const c of cards) {
    if (!c.aiPrev) continue;
    if (!c.ai) {
      c.ai = c.aiPrev;
      restored = true;
    }
    delete c.aiPrev;
  }
  return restored;
}

/** The user's fields after a change; a null in the patch takes that field away. */
export function patchUser(user: UserFields | undefined, patch: UserPatch): UserFields {
  return Object.fromEntries(Object.entries({ ...user, ...patch }).filter(([, v]) => v !== null)) as UserFields;
}

/** Edits as lines of the edit log. They start on a fresh line, so a line torn by a crash doesn't swallow the next edit. */
export function editLines(events: EditEvent[]): string {
  return "\n" + events.map((ev) => JSON.stringify(ev) + "\n").join("");
}

export function parseEdits(text: string): EditEvent[] {
  const out: EditEvent[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // A torn line after a crash: ignore it.
    }
  }
  return out;
}

export function applyEdits(cards: Card[], events: EditEvent[]): Card[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  for (const ev of events) {
    const c = byId.get(ev.id);
    if (c) c.user = patchUser(c.user, ev.patch);
  }
  return cards;
}

/** A status set by hand, then the rule's junk guess, then the AI's. "Keep" on the cleanup screen overrules a guess of junk. */
export function effectiveAction(c: Card): Action | undefined {
  const guess = c.autoJunk && !c.user?.kept ? "junk" : c.ai?.action;
  return c.user?.action ?? (guess === "junk" && c.user?.kept ? undefined : guess);
}

/**
 * Merged topics and tags: each merged-away name points at the one it was merged into.
 * Applied when cards are read, so the AI's own fields stay as they were and a merge can be undone.
 */
export interface Aliases {
  topics: Record<string, string>;
  tags: Record<string, string>;
}

export const NO_ALIASES: Aliases = { topics: {}, tags: {} };
let aliases: Aliases = NO_ALIASES;

/** Set once settings are loaded and after every merge or split. */
export function setAliases(a: Aliases | undefined) {
  aliases = a ?? NO_ALIASES;
}

export function getAliases(): Aliases {
  return aliases;
}

/** Points every name in `from` at `to` (and whatever already pointed at them), without chains or loops. */
export function mergeAlias(map: Record<string, string>, from: string[], to: string): Record<string, string> {
  const gone = new Set(from.filter((f) => f !== to));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) if (k !== to) out[k] = gone.has(v) ? to : v;
  for (const f of gone) out[f] = to;
  return out;
}

const own = (m: Record<string, string>, k: string) => Object.prototype.hasOwnProperty.call(m, k);
/** The name a tag or topic is shown under after merges. */
export const tagName = (t: string) => (own(aliases.tags, t) ? aliases.tags[t] : t);
export const topicName = (t: string) => (own(aliases.topics, t) ? aliases.topics[t] : t);

export function effectiveTags(c: Card): string[] {
  return [...new Set((c.user?.tags ?? [...(c.ai?.tags ?? []), ...c.hashtags]).map(tagName))];
}

export function effectiveTopic(c: Card): string | undefined {
  const t = c.user?.topic ?? c.ai?.topic;
  return t ? topicName(t) : t;
}

/**
 * Topics the user made by hand (settings.topics). They show even with no cards in them, the AI
 * is told to use them first, and only the user can rename or delete them.
 */
let ownTopics: string[] = [];

export function setOwnTopics(t: string[] | undefined) {
  ownTopics = t ?? [];
}

/** The user's own topics as shown now (after merges), without repeats. */
export function getOwnTopics(): string[] {
  return [...new Set(ownTopics.map(topicName).filter(Boolean))];
}

/** The same name in another case, so "дизайн" and "Дизайн" don't become two topics. */
export function findTopic(names: Iterable<string>, name: string): string | undefined {
  const lower = name.trim().toLocaleLowerCase();
  for (const n of names) if (n.toLocaleLowerCase() === lower) return n;
  return undefined;
}

export function effectiveTitle(c: Card): string {
  return c.user?.title ?? c.ai?.title ?? linkText(c.link).title ?? "";
}

export type FilterKey = "all" | "links" | "photos" | "videos" | "docs" | "audio" | "ideas" | "reference" | "read_later" | "junk" | "sensitive";

export function matchesFilter(c: Card, f: FilterKey): boolean {
  const action = effectiveAction(c);
  if (f === "junk") return action === "junk";
  if (c.user?.hidden) return false;
  if (action === "junk") return false;
  switch (f) {
    case "all":
      return true;
    case "links":
      return c.kind === "link";
    case "photos":
      return c.kind === "photo";
    case "videos":
      return c.kind === "video" || c.kind === "animation" || c.kind === "video_note";
    case "docs":
      return c.kind === "document";
    case "audio":
      return c.kind === "audio" || c.kind === "voice";
    case "ideas":
      return action === "idea";
    case "reference":
      return action === "reference";
    case "read_later":
      return action === "read_later";
    case "sensitive":
      return !!c.sensitive;
  }
}

export function makeEdit(id: number, patch: UserPatch): EditEvent {
  return { t: new Date().toISOString(), id, patch };
}

const CONTEXT_WINDOW_MS = 3 * 60 * 1000;
const BATCH_MS = 10 * 1000;
const MEDIA_KINDS = new Set(["photo", "video", "animation", "document", "audio", "video_note"]);

function firstLine(c: Card): string | undefined {
  const t = c.user?.title || c.ai?.title || linkText(c.link).title || c.text.split("\n").find((l) => l.trim());
  return t?.trim().slice(0, 100) || undefined;
}

/**
 * A caption often arrives as a separate message right before or after the photo.
 * For media without text, remember the text of the nearest such message (within a
 * few minutes) so the card has a name before, or instead of, any AI.
 */
export function annotateContext(cards: Card[]) {
  const sorted = [...cards].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
  const time = sorted.map((c) => Date.parse(c.date));
  const hasText = (c: Card) => !c.sensitive && !c.removed && !MEDIA_KINDS.has(c.kind) && !!firstLine(c);
  sorted.forEach((c, i) => {
    c.context = undefined;
    if (!MEDIA_KINDS.has(c.kind) || c.text.trim()) return;
    let best: { d: number; t: string } | undefined;
    for (const dir of [1, -1]) {
      for (let j = i + dir; j >= 0 && j < sorted.length; j += dir) {
        const d = Math.abs(time[j] - time[i]);
        if (d > CONTEXT_WINDOW_MS) break;
        const n = sorted[j];
        if (n.text.trim() && MEDIA_KINDS.has(n.kind)) {
          // Another captioned photo sent in the same batch: its caption fits this one too.
          if (n.kind === c.kind && d <= BATCH_MS && !n.sensitive && (!best || d < best.d)) best = { d, t: n.text.split("\n").find((l) => l.trim())!.trim().slice(0, 100) };
          break;
        }
        if (hasText(n)) {
          // Prefer the message after the photo on a tie: people usually send the picture first.
          if (!best || d < best.d || (d === best.d && dir === 1)) best = { d, t: firstLine(n)! };
          break;
        }
      }
    }
    c.context = best?.t;
  });
}
