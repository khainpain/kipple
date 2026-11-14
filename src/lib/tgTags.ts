// "Tags to Telegram": puts the library's tags on the original messages in Saved Messages, so
// they are there in Telegram too. Only from the user's button, one message at a time.
//
// Two ways (src-tauri/src/telegram.rs, "Kipple tags in Saved Messages"):
// - "tags": Telegram's own tags in Saved Messages (an emoji with a name). Premium only, and
//   Telegram allows a few per message, so each message gets its first few tags out of the
//   library's most used ones. Changing a card's tags later moves them on the next run.
// - "hashtags": "#tag" words added to the end of the user's own messages. Forwarded messages
//   can't be edited, so they are skipped. Hashtags are only added, never taken out again.
//
// What was done is kept in telegram-tags.json, so a later run only touches cards that changed.
import type { TelegramApi } from "../platform/types";
import { effectiveTags } from "./library";
import { hashtag, retrying, sleepFor } from "./telegram";
import { compareText } from "../i18n";
import type { Card } from "./types";

export type TagMode = "tags" | "hashtags";

/** The library's most used tags that become Telegram tags; Telegram has a limited set of emoji for them. */
export const MAX_TG_TAGS = 50;
/** Telegram tags per message (Telegram's limit for Premium). */
export const TAGS_PER_MESSAGE = 3;

export interface TagSyncState {
  /** The account the tags went to; a different one starts over. */
  owner?: number;
  /** Card id → the Telegram tags Kipple put on its message (tag names and their reactions). */
  tags: Record<string, { titles: string[]; reactions: string[] }>;
  /** Card id → hashtags Kipple added to its message. */
  hashtags: Record<string, string[]>;
  /** Tags that got no Telegram tag on the last run (out of emoji, or sharing one): the dialog doesn't count them. */
  unusable?: string[];
}

export const emptyTagSyncState = (): TagSyncState => ({ tags: {}, hashtags: {} });

/** Cards whose messages are in play: not gone from Saved Messages, not hidden by the user. */
const pool = (cards: Card[]) => cards.filter((c) => !c.removed && !c.user?.hidden);

/** The most used tags, most used first: the ones that get a Telegram tag. */
export function topTags(cards: Card[], max = MAX_TG_TAGS): string[] {
  const counts = new Map<string, number>();
  for (const c of pool(cards)) for (const t of effectiveTags(c)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || compareText(a[0], b[0]))
    .slice(0, max)
    .map(([t]) => t);
}

/**
 * Tags to give a Telegram tag: the most used ones, plus those already put on messages, so a tag
 * that drops out of the top doesn't come off messages that have it.
 */
export function syncTitles(cards: Card[], state: TagSyncState): string[] {
  return [...new Set([...topTags(cards), ...Object.values(state.tags).flatMap((t) => t.titles)])];
}

/** What the dialog counts with: the tags to sync, without those that got no Telegram tag last time. */
export function likelyUsable(cards: Card[], state: TagSyncState): Set<string> {
  const skip = new Set(state.unusable ?? []);
  return new Set(syncTitles(cards, state).filter((t) => !skip.has(t)));
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export interface TagItem {
  cardId: number;
  /** Unix seconds: the message's date, checked before it's changed. */
  date: number;
  /** Telegram tags the message should have (tag names), or hashtags to add. */
  want: string[];
}

/** Telegram tags each card should have now, for the cards where that differs from what was put there before. */
export function tagPlan(cards: Card[], state: TagSyncState, usable: Set<string>): TagItem[] {
  const items: TagItem[] = [];
  for (const c of pool(cards)) {
    const want = effectiveTags(c).filter((t) => usable.has(t)).slice(0, TAGS_PER_MESSAGE);
    const had = state.tags[String(c.id)]?.titles ?? [];
    if (!sameSet(want, had)) items.push({ cardId: c.id, date: unix(c), want });
  }
  return items.sort(oldestFirst);
}

/** Messages that can't have a caption, so hashtags have nowhere to go. */
const NO_CAPTION = new Set<Card["kind"]>(["sticker", "video_note", "poll", "location", "contact"]);

/** Hashtags still to add to each card's own message. */
export function hashtagPlan(cards: Card[], state: TagSyncState): TagItem[] {
  const items: TagItem[] = [];
  for (const c of pool(cards)) {
    if (c.forwardedFrom) continue; // Telegram doesn't let anyone edit a forwarded message
    if (NO_CAPTION.has(c.kind)) continue;
    if (c.sensitive) continue; // looks like a password or a card number: leave the message alone
    const have = new Set([...c.hashtags.map((h) => hashtag(h)), ...(state.hashtags[String(c.id)] ?? [])].map((h) => h?.toLowerCase()));
    const want = [...new Set(effectiveTags(c).map(hashtag))].filter((h): h is string => !!h && !have.has(h.toLowerCase()));
    if (want.length) items.push({ cardId: c.id, date: unix(c), want });
  }
  return items.sort(oldestFirst);
}

const unix = (c: Card) => Math.round(Date.parse(c.date) / 1000);
const oldestFirst = (a: TagItem, b: TagItem) => a.date - b.date || a.cardId - b.cardId;

export interface TagProgress {
  done: number;
  total: number;
  /** Messages left as they were: forwarded, gone, no room, or Telegram wouldn't take the edit. */
  skipped: number;
  /** Set while waiting out a Telegram rate limit. */
  waitSeconds?: number;
}

export interface TagDeps {
  tg: TelegramApi;
  save: (s: TagSyncState) => Promise<void>;
  onProgress: (p: TagProgress) => void;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Pause between messages; grows after each rate limit. */
  baseDelayMs?: number;
}

/** Thrown when Telegram tags were asked for but the account has no Premium. */
export class NoPremiumError extends Error {}

/**
 * Puts the tags on the messages, saving progress after each one. Rate limits are waited out;
 * a stopped run picks up where it left off next time.
 */
export async function syncTags(cards: Card[], state: TagSyncState, mode: TagMode, deps: TagDeps): Promise<TagProgress> {
  const { tg, save, onProgress, signal } = deps;
  const sleep = deps.sleep ?? sleepFor;
  let delay = deps.baseDelayMs ?? 1200;
  const progress: TagProgress = { done: 0, total: 0, skipped: 0 };
  const call = retrying({
    signal,
    sleep,
    onWait: (secs) => onProgress(secs === undefined ? { ...progress } : { ...progress, waitSeconds: secs }),
    onFlood: () => (delay = Math.min(Math.round(delay * 1.5), 8000)),
  });

  const titles = mode === "tags" ? syncTitles(cards, state) : [];
  const setup = await call(() => tg.tagsSetup(titles));
  if (mode === "tags" && !setup.premium) throw new NoPremiumError();
  if (state.owner !== undefined && state.owner !== setup.owner) Object.assign(state, emptyTagSyncState());
  state.owner = setup.owner;

  // Two tags cut to the same 12 characters share an emoji: only the first takes a slot.
  const reactionOf = new Map<string, string>();
  for (const t of setup.tags) if (![...reactionOf.values()].includes(t.reaction)) reactionOf.set(t.title, t.reaction);
  if (mode === "tags") state.unusable = titles.filter((t) => !reactionOf.has(t));
  const plan = mode === "tags" ? tagPlan(cards, state, new Set(reactionOf.keys())) : hashtagPlan(cards, state);
  progress.total = plan.length;
  onProgress({ ...progress });

  for (const item of plan) {
    if (signal?.aborted) break;
    const key = String(item.cardId);
    if (mode === "tags") {
      const add = item.want.map((t) => reactionOf.get(t)!);
      const before = state.tags[key]?.reactions ?? [];
      const res = await call(() => tg.tagsApply(item.cardId, item.date, setup.owner, add, before.filter((r) => !add.includes(r)), before));
      // Another account's message: try again next time. Gone, refused or full: not until the card changes.
      const failed = res.status === "changed";
      if (res.status !== "ok" && res.status !== "same") progress.skipped++;
      if (!failed) {
        // Even with no room for all of them, the card isn't retried until its tags change.
        if (item.want.length || res.applied.length) state.tags[key] = { titles: item.want, reactions: res.applied };
        else delete state.tags[key];
      }
    } else {
      const res = await call(() => tg.tagsHashtags(item.cardId, item.date, setup.owner, item.want));
      if (res.status === "ok" || res.status === "same") {
        // "same": the text has them already; either way they don't need adding again.
        state.hashtags[key] = [...new Set([...(state.hashtags[key] ?? []), ...item.want])];
      } else {
        progress.skipped++;
        // A message that can't take hashtags won't later either; don't ask again for these.
        if (res.status !== "changed") state.hashtags[key] = [...new Set([...(state.hashtags[key] ?? []), ...item.want])];
      }
    }
    progress.done++;
    await save(state);
    onProgress({ ...progress });
    await sleep(delay, signal);
  }
  return progress;
}
