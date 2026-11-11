import type { Card, UserPatch } from "./types";
import { effectiveAction, effectiveTopic } from "./library";
import { domainOf } from "./rules";
import { dupeKey, findDuplicates, groupDuplicates } from "./smart";

/**
 * "First cleanup": what the archive is made of, as piles that take one decision each. Everything
 * is worked out on the device from the cards as they are now, so after a new load the screen
 * shows only what is still unsorted. A decision is an edit to the user's own fields and nothing else.
 */

/** A channel or a site becomes a pile from this many cards. */
export const CHANNEL_MIN = 5;
/** "Old" is anything saved longer ago than this. */
export const OLD_YEARS = 2;

export type PileKind = "junk" | "dupes" | "channel" | "site" | "photos" | "videos" | "files" | "audio" | "old" | "notes" | "rest";

export interface Pile {
  /** Stable while the pile exists: the kind, plus the channel or site. */
  key: string;
  kind: PileKind;
  /** The channel or the site. */
  name?: string;
  cards: Card[];
}

export interface Breakdown {
  /** Every card still in the library. */
  total: number;
  /** Year of the oldest card. */
  since?: number;
  /** Already decided: sent to Junk, in a topic, or kept as is (also whatever the person already worked on by hand). */
  sorted: { kept: number; topics: number; junk: number };
  /** Look like passwords or keys: never in a pile, shown as a line of their own. */
  sensitive: number;
  /** In the order to show; a card is in one pile only, the first that fits. */
  piles: Pile[];
}

/** Media without a caption, by the filter it has on the board. */
const TYPE_PILE: Partial<Record<Card["kind"], PileKind>> = { photo: "photos", video: "videos", animation: "videos", video_note: "videos", document: "files", voice: "audio", audio: "audio" };
const TYPE_ORDER: PileKind[] = ["photos", "videos", "files", "audio"];

/** Takes out of `pool` the groups of at least CHANNEL_MIN cards with the same name, biggest first. */
function takeGroups(pool: Card[], kind: "channel" | "site", nameOf: (c: Card) => string | undefined): { piles: Pile[]; rest: Card[] } {
  const groups = new Map<string, Card[]>();
  for (const c of pool) {
    const name = nameOf(c);
    if (!name) continue;
    const g = groups.get(name);
    if (g) g.push(c);
    else groups.set(name, [c]);
  }
  const big = [...groups].filter(([, g]) => g.length >= CHANNEL_MIN).sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1));
  const taken = new Set(big.flatMap(([, g]) => g));
  return { piles: big.map(([name, cards]) => ({ key: `${kind === "channel" ? "ch" : "site"}:${name}`, kind, name, cards })), rest: pool.filter((c) => !taken.has(c)) };
}

export function breakdown(cards: Card[], now = Date.now()): Breakdown {
  const sorted = { kept: 0, topics: 0, junk: 0 };
  let total = 0;
  let sensitive = 0;
  let oldest = "";
  const junk: Card[] = [];
  let pool: Card[] = [];
  for (const c of cards) {
    if (c.removed) continue;
    total++;
    if (!oldest || c.date < oldest) oldest = c.date;
    const u = c.user;
    if (u?.action === "junk") sorted.junk++;
    // Anything sensitive is never offered in bulk.
    else if (c.sensitive) sensitive++;
    // Junk that a rule or the AI guessed waits for a yes or no.
    else if (effectiveAction(c) === "junk") junk.push(c);
    else if (effectiveTopic(c)) sorted.topics++;
    // Anything the person did to a card by hand is a decision too: a pile sent to junk must not take it along.
    else if (u?.kept || u?.hidden || u?.action || u?.pinned || u?.note?.trim() || u?.tags?.length || u?.title?.trim()) sorted.kept++;
    else pool.push(c);
  }

  const piles: Pile[] = [];
  const add = (kind: PileKind, cs: Card[]) => cs.length && piles.push({ key: kind, kind, cards: cs });
  const take = (kind: PileKind, fits: (c: Card) => boolean) => {
    add(kind, pool.filter(fits));
    pool = pool.filter((c) => !fits(c));
  };

  add("junk", junk);
  const dupes = findDuplicates(pool);
  add("dupes", groupDuplicates(pool, dupes));
  pool = pool.filter((c) => !dupes.has(c.id));
  for (const [kind, nameOf] of [
    ["channel", (c: Card) => c.forwardedFrom],
    ["site", (c: Card) => (c.urls[0] ? domainOf(c.urls[0]) : undefined)],
  ] as const) {
    const g = takeGroups(pool, kind, nameOf);
    piles.push(...g.piles);
    pool = g.rest;
  }
  for (const kind of TYPE_ORDER) take(kind, (c) => TYPE_PILE[c.kind] === kind && !c.text.trim());
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - OLD_YEARS);
  const before = cutoff.toISOString();
  take("old", (c) => c.date < before);
  take("notes", (c) => c.kind === "text" && c.urls.length === 0 && !c.forwardedFrom);
  add("rest", pool);

  const year = oldest ? new Date(oldest).getFullYear() : NaN;
  return { total, since: Number.isFinite(year) ? year : undefined, sorted, sensitive, piles };
}

export type Decision = "keep" | "topic" | "junk" | "keepOne";

/** Cards to change and what to write to them. */
export interface PileEdit {
  ids: number[];
  patch: UserPatch;
}

const fullness = (c: Card) => c.text.trim().length;

/** Of each group of copies, all but the one to keep: the one with the most text, else the earliest. */
function extraCopies(cards: Card[]): Card[] {
  const groups = new Map<string, Card[]>();
  for (const c of cards) {
    const k = dupeKey(c);
    if (!k) continue;
    const g = groups.get(k);
    if (g) g.push(c);
    else groups.set(k, [c]);
  }
  const keep = new Set<Card>();
  for (const g of groups.values()) keep.add(g.reduce((best, c) => (fullness(c) > fullness(best) || (fullness(c) === fullness(best) && (c.date < best.date || (c.date === best.date && c.id < best.id))) ? c : best)));
  return cards.filter((c) => !keep.has(c));
}

/** What a decision about a pile writes. Nothing here reaches Telegram: junk is a mark inside Kipple. */
export function decide(pile: Pile, how: Decision, topic?: string): PileEdit[] {
  const all = pile.cards.map((c) => c.id);
  let edit: PileEdit | undefined;
  if (how === "keep") edit = { ids: all, patch: { kept: true } };
  else if (how === "junk") edit = { ids: all, patch: { action: "junk" } };
  else if (how === "topic") edit = topic?.trim() ? { ids: all, patch: { topic: topic.trim() } } : undefined;
  else if (pile.kind === "dupes") edit = { ids: extraCopies(pile.cards).map((c) => c.id), patch: { action: "junk" } };
  return edit?.ids.length ? [edit] : [];
}

/** A decision as the screen remembers it for Undo: what it wrote, and what puts that back. */
export interface Done {
  edits: PileEdit[];
  back: PileEdit[];
}

/** The edits that put back what `edits` are about to change; taken before they are applied. */
export function restore(cards: Card[], edits: PileEdit[]): PileEdit[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const out = new Map<string, PileEdit>();
  for (const e of edits) {
    for (const id of e.ids) {
      const user = byId.get(id)?.user;
      const patch = Object.fromEntries(Object.keys(e.patch).map((k) => [k, user?.[k as keyof UserPatch] ?? null])) as UserPatch;
      const key = JSON.stringify(patch);
      const same = out.get(key);
      if (same) same.ids.push(id);
      else out.set(key, { ids: [id], patch });
    }
  }
  return [...out.values()];
}

/** Undo of a decision, without the cards that were changed again since: a later choice on the board stays. */
export function takeBack(cards: Card[], done: Done): PileEdit[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const asLeft = new Set<number>();
  for (const e of done.edits) {
    const keys = Object.keys(e.patch) as (keyof UserPatch)[];
    for (const id of e.ids) if (keys.every((k) => byId.get(id)?.user?.[k] === e.patch[k])) asLeft.add(id);
  }
  return done.back.map((e) => ({ ...e, ids: e.ids.filter((id) => asLeft.has(id)) })).filter((e) => e.ids.length);
}
