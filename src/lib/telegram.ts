// "Send to Telegram": lays the sorted library out in a private group with topics.
// Each card's original message is forwarded from Saved Messages into the topic of its
// theme, followed by a short reply with the title, summary and hashtags.
//
// The Telegram calls themselves are in src-tauri/src/telegram.rs. This file decides what
// goes where, paces the sending, and remembers what was already sent so a stopped run
// continues where it left off and later runs only send new saves.
import type { TelegramApi } from "../platform/types";
import { effectiveAction, effectiveTags, effectiveTitle, effectiveTopic } from "./library";
import { actionLabel, type Card } from "./types";
import { T, compareText } from "../i18n";
import { en } from "../i18n/en";
import { ru } from "../i18n/ru";

export const BOARD_TITLE = "Saved Board";
export const boardAbout = () => T.telegram.boardAbout(BOARD_TITLE);
/**
 * The catch-all topic. Once a group has one, it is reused whatever the interface language
 * is now, so switching languages doesn't split it in two.
 */
export function otherTopic(state?: BoardState): string {
  for (const t of [ru.telegram.otherTopic, en.telegram.otherTopic]) if (state && t in state.topics) return t;
  return T.telegram.otherTopic;
}
/** More themes than this and the smallest ones go to the catch-all topic, so the topic list stays usable. */
export const MAX_TOPICS = 40;
// Telegram only accepts these topic icon colours.
const TOPIC_COLORS = [0x6fb9f0, 0xffd67e, 0xcb86db, 0x8eee98, 0xff93b2, 0xfb6f5f];

export interface BoardRef {
  channelId: number;
  accessHash: string;
}

/** What was already sent; saved as telegram.json next to the library. */
export interface BoardState {
  board?: BoardRef & { createdAt: string };
  /** Topic title → topic id in the group. */
  topics: Record<string, number>;
  /** Card id → id of its forwarded message in the group. */
  sent: Record<string, number>;
  /** Cards whose original message is gone from Saved Messages. */
  missing: number[];
}

export const emptyBoardState = (): BoardState => ({ topics: {}, sent: {}, missing: [] });

export interface SendOptions {
  includeJunk: boolean;
  includeSensitive: boolean;
}

export interface PlanItem {
  cardId: number;
  /** The card's message plus the rest of its album. */
  msgIds: number[];
  topic: string;
  /** Reply under the forwarded message; empty when there's nothing to add. */
  note: string;
  /** Length of the bold title at the start of `note`, in UTF-16 units. */
  boldLen: number;
}

export function eligible(c: Card, opts: SendOptions): boolean {
  if (c.removed || c.user?.hidden) return false;
  if (!opts.includeSensitive && c.sensitive) return false;
  if (!opts.includeJunk && effectiveAction(c) === "junk") return false;
  return true;
}

/** "Read later" → "#read_later"; null when nothing usable is left. */
export function hashtag(s: string): string | null {
  const t = s
    .toLowerCase()
    .trim()
    .replace(/[\s\-–—/.,:+&]+/g, "_")
    .replace(/[^\p{L}\p{N}_]/gu, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  if (!t || /^[\d_]+$/.test(t)) return null;
  return `#${t}`;
}

export function noteFor(c: Card): { note: string; boldLen: number } {
  const title = effectiveTitle(c).trim();
  const summary = c.ai?.summary?.trim() ?? "";
  const own = new Set(c.hashtags.map((h) => hashtag(h)));
  const tags = new Set<string>();
  for (const t of effectiveTags(c)) {
    const h = hashtag(t);
    if (h && !own.has(h)) tags.add(h); // tags already in the message text would just repeat
  }
  const action = effectiveAction(c);
  if (action) {
    const h = hashtag(actionLabel(action));
    if (h) tags.add(h);
  }
  const parts: string[] = [];
  if (summary && summary !== title) parts.push(summary);
  if (c.user?.note?.trim()) parts.push(`${T.telegram.noteLabel}: ${c.user.note.trim()}`);
  if (tags.size) parts.push([...tags].join(" "));
  if (!title && !parts.length) return { note: "", boldLen: 0 };
  const note = (title ? [title, ...parts] : parts).join("\n");
  return { note: note.slice(0, 4000), boldLen: title.length };
}

/** Which topic titles get their own topic: those already in the group plus the biggest themes. */
export function chooseTopics(cards: Card[], state: BoardState, max = MAX_TOPICS): Set<string> {
  const counts = new Map<string, number>();
  for (const c of cards) {
    const t = cleanTopic(effectiveTopic(c));
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const keep = new Set(Object.keys(state.topics));
  for (const [t] of [...counts.entries()].sort((a, b) => b[1] - a[1] || compareText(a[0], b[0]))) {
    if (keep.size >= max) break;
    keep.add(t);
  }
  return keep;
}

function cleanTopic(t: string | undefined): string {
  const s = (t ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  return s ? s[0].toUpperCase() + s.slice(1) : "";
}

/** Everything still to send, oldest first so each topic reads in the order things were saved. */
export function buildPlan(cards: Card[], state: BoardState, opts: SendOptions): PlanItem[] {
  const pool = cards.filter((c) => eligible(c, opts));
  const topics = chooseTopics(pool, state);
  const missing = new Set(state.missing);
  const other = otherTopic(state);
  return pool
    .filter((c) => !(String(c.id) in state.sent) && !missing.has(c.id))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id))
    .map((c) => {
      const t = cleanTopic(effectiveTopic(c));
      return {
        cardId: c.id,
        msgIds: [c.id, ...(c.albumIds ?? [])],
        topic: t && topics.has(t) ? t : other,
        ...noteFor(c),
      };
    });
}

export interface SendProgress {
  done: number;
  total: number;
  /** Originals no longer in Saved Messages. */
  missing: number;
  /** Set while waiting out a Telegram rate limit. */
  waitSeconds?: number;
}

export class TelegramAuthError extends Error {}

const sleepFor = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });

const isRpcName = (msg: string) => /^[A-Z][A-Z0-9_]+$/.test(msg);

export interface SendDeps {
  tg: TelegramApi;
  save: (s: BoardState) => Promise<void>;
  onProgress: (p: SendProgress) => void;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Pause between cards; grows after each rate limit. */
  baseDelayMs?: number;
}

/**
 * Sends the plan, saving progress after every card. Rate limits are waited out (the UI
 * shows the pause); a stopped or crashed run resumes from the saved state next time.
 */
export async function sendToTelegram(cards: Card[], state: BoardState, opts: SendOptions, deps: SendDeps): Promise<SendProgress> {
  const { tg, save, onProgress, signal } = deps;
  const sleep = deps.sleep ?? sleepFor;
  let delay = deps.baseDelayMs ?? 1500;
  const progress: SendProgress = { done: 0, total: 0, missing: 0 };

  async function call<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (e) {
        const msg = String(e instanceof Error ? e.message : e);
        const flood = /^FLOOD_WAIT:(\d+)/.exec(msg);
        if (flood && !signal?.aborted) {
          const secs = Number(flood[1]);
          onProgress({ ...progress, waitSeconds: secs });
          await sleep(secs * 1000 + 1000, signal);
          onProgress({ ...progress });
          delay = Math.min(Math.round(delay * 1.5), 8000);
          continue;
        }
        if (/AUTH_KEY|SESSION_REVOKED|USER_DEACTIVATED|^NO_API$/.test(msg)) throw new TelegramAuthError(msg);
        // Network hiccups (not Telegram error names) get a few retries.
        if (!isRpcName(msg) && attempt < 3 && !signal?.aborted) {
          await sleep(5000 * (attempt + 1), signal);
          continue;
        }
        throw e;
      }
    }
  }

  const board = await call(() => tg.ensureBoard(state.board ?? null, BOARD_TITLE, boardAbout()));
  if (board.created || !state.board) {
    // A new group (first run, or the old one was deleted): everything goes again.
    Object.assign(state, emptyBoardState(), { board: { channelId: board.channelId, accessHash: board.accessHash, createdAt: new Date().toISOString() } });
    await save(state);
  }
  const ref: BoardRef = { channelId: board.channelId, accessHash: board.accessHash };

  const plan = buildPlan(cards, state, opts);
  progress.total = plan.length;
  onProgress({ ...progress });

  async function topicId(title: string): Promise<number> {
    const known = state.topics[title];
    if (known) return known;
    const color = TOPIC_COLORS[Object.keys(state.topics).length % TOPIC_COLORS.length];
    const id = await call(() => tg.createTopic(ref, title, color));
    state.topics[title] = id;
    await save(state);
    return id;
  }

  for (const item of plan) {
    if (signal?.aborted) break;
    let topic = await topicId(item.topic);
    let ids: number[];
    try {
      ids = await call(() => tg.forward(ref, topic, item.msgIds));
    } catch (e) {
      // The topic was deleted or closed in Telegram: make a fresh one and try once more.
      if (!/TOPIC/.test(String(e))) throw e;
      delete state.topics[item.topic];
      topic = await topicId(item.topic);
      ids = await call(() => tg.forward(ref, topic, item.msgIds));
    }

    if (!ids.length) {
      state.missing.push(item.cardId);
      progress.missing++;
    } else {
      state.sent[String(item.cardId)] = ids[0];
      if (item.note) {
        await sleep(400, signal);
        try {
          await call(() => tg.sendNote(ref, topic, ids[0], item.note, item.boldLen));
        } catch (e) {
          if (e instanceof TelegramAuthError) throw e;
          console.warn("note failed", item.cardId, e); // the message itself is there; don't stop over a note
        }
      }
    }
    progress.done++;
    await save(state);
    onProgress({ ...progress });
    await sleep(delay, signal);
  }
  return progress;
}

/** Human text for errors from the Telegram commands. */
export function telegramErrorText(e: unknown): string {
  const msg = String(e instanceof Error ? e.message : e);
  const L = T.telegram;
  const flood = /^FLOOD_WAIT:(\d+)/.exec(msg);
  if (flood) return L.errFlood(Number(flood[1]));
  const known: Array<[RegExp, string]> = [
    [/^NO_API$/, L.errNoApi],
    [/^API_INVALID$|API_ID_INVALID|API_ID_PUBLISHED_FLOOD/, L.errApiInvalid],
    [/PHONE_NUMBER_INVALID/, L.errPhoneInvalid],
    [/PHONE_NUMBER_BANNED/, L.errPhoneBanned],
    [/PHONE_CODE_INVALID/, L.errCodeInvalid],
    [/PHONE_CODE_EXPIRED/, L.errCodeExpired],
    [/PHONE_CODE_EMPTY|NO_CODE_REQUESTED/, L.errNoCode],
    [/PASSWORD_HASH_INVALID/, L.errPassword],
    [/SIGN_UP_REQUIRED/, L.errSignUp],
    [/AUTH_TOKEN_(EXPIRED|INVALID|ALREADY_ACCEPTED)|QR_MIGRATE_LOOP/, L.errQrExpired],
    [/AUTH_KEY|SESSION_REVOKED/, L.errSession],
    [/CHANNELS_TOO_MUCH/, L.errTooMany],
  ];
  for (const [re, text] of known) if (re.test(msg)) return text;
  return L.errOther(msg);
}
