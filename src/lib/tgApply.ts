// "Apply to Telegram": carries what the user sorted out in Kipple back to Saved Messages.
// Only from the user's button. Two parts here (tags live in tgTags.ts):
// - junk: messages the user sent to junk are deleted from Saved Messages (Rust copies each one
//   to the local backup first and checks it's the card's message);
// - important: important cards are pinned; ones Kipple pinned and that are no longer important
//   are unpinned. Pins the user made in Telegram are never touched.
//
// Which pins are Kipple's is kept in telegram-pins.json.
import type { TelegramApi } from "../platform/types";
import { effectiveAction } from "./library";
import { isImportant } from "./smart";
import { retrying, sleepFor } from "./telegram";
import type { Card } from "./types";

export interface PinState {
  /** The account the pins went to; a different one starts over. */
  owner?: number;
  /** Card ids whose messages Kipple pinned. */
  pinned: number[];
}

export const emptyPinState = (): PinState => ({ pinned: [] });

const unix = (c: Card) => Math.round(Date.parse(c.date) / 1000);

export interface DeleteItem {
  cardId: number;
  /** The card's message and the rest of its album. */
  ids: number[];
  /** Unix seconds: the message's date, checked before it's deleted. */
  date: number;
}

/** Cards the user sent to junk themselves. A guess by the rules or the AI is never deleted. */
export function deletePlan(cards: Card[]): DeleteItem[] {
  return cards
    .filter((c) => !c.removed && c.user?.action === "junk")
    .map((c) => ({ cardId: c.id, ids: [c.id, ...(c.albumIds ?? [])], date: unix(c) }));
}

export interface PinItem {
  cardId: number;
  date: number;
  pin: boolean;
}

/** Important cards to pin, and cards Kipple pinned before that aren't important any more. */
export function pinPlan(cards: Card[], state: PinState): PinItem[] {
  const had = new Set(state.pinned);
  const items: PinItem[] = [];
  for (const c of cards) {
    const want = !c.removed && isImportant(c) && effectiveAction(c) !== "junk";
    if (want !== had.has(c.id)) items.push({ cardId: c.id, date: unix(c), pin: want });
  }
  return items;
}

export interface ApplyOptions {
  deleteJunk: boolean;
  pins: boolean;
}

export interface ApplyProgress {
  done: number;
  total: number;
  deleted: number;
  pinned: number;
  unpinned: number;
  /** Left as they were: gone, another message under that id, or Telegram refused. */
  skipped: number;
  waitSeconds?: number;
}

export interface ApplyDeps {
  tg: Pick<TelegramApi, "deleteCards" | "pinSaved" | "account">;
  /** The Telegram account the library was loaded from (Library.telegram.owner), when known. */
  owner?: number;
  /** Saves the library after cards were marked removed. */
  saveCards: () => Promise<void>;
  savePins: (s: PinState) => Promise<void>;
  onProgress: (p: ApplyProgress) => void;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  baseDelayMs?: number;
}

/** Telegram deletes up to 100 messages per call (an album has at most 10). */
const BATCH = 100;

export async function applyToTelegram(cards: Card[], state: PinState, opts: ApplyOptions, deps: ApplyDeps): Promise<ApplyProgress> {
  const { tg, signal, onProgress } = deps;
  const sleep = deps.sleep ?? sleepFor;
  let delay = deps.baseDelayMs ?? 1200;
  const progress: ApplyProgress = { done: 0, total: 0, deleted: 0, pinned: 0, unpinned: 0, skipped: 0 };
  const call = retrying({
    signal,
    sleep,
    onWait: (secs) => onProgress(secs === undefined ? { ...progress } : { ...progress, waitSeconds: secs }),
    onFlood: () => (delay = Math.min(Math.round(delay * 1.5), 8000)),
  });

  const deletes = opts.deleteJunk ? deletePlan(cards) : [];
  let pins: PinItem[] = [];
  if (opts.pins) {
    const me = await call(() => tg.account());
    if (!me?.id) throw new Error("NO_ACCOUNT");
    if (state.owner !== undefined && state.owner !== me.id) Object.assign(state, emptyPinState());
    state.owner = me.id;
    pins = pinPlan(cards, state);
  }
  progress.total = deletes.length + pins.length;
  onProgress({ ...progress });

  const byId = new Map(cards.map((c) => [c.id, c]));
  for (let i = 0; i < deletes.length && !signal?.aborted; ) {
    // An album goes alone and whole (all its messages or none); single messages up to 100 a call.
    const whole = deletes[i].ids.length > 1;
    const batch: DeleteItem[] = [deletes[i++]];
    while (!whole && i < deletes.length && deletes[i].ids.length === 1 && batch.length < BATCH) batch.push(deletes[i++]);
    const res = await call(() => tg.deleteCards(batch.flatMap((d) => d.ids.map((id) => ({ id, date: d.date }))), whole, deps.owner));
    const status = new Map(res.map((r) => [r.id, r.status]));
    for (const d of batch) {
      // A card counts as deleted only when every one of its messages is gone. "missing" too: a
      // call retried after a lost answer finds the messages it just deleted gone already.
      if (d.ids.every((id) => status.get(id) === "deleted" || status.get(id) === "missing")) {
        byId.get(d.cardId)!.removed = true;
        progress.deleted++;
      } else progress.skipped++;
      progress.done++;
    }
    // Report first: the messages are gone in Telegram even if saving the library fails next.
    onProgress({ ...progress });
    await deps.saveCards();
    await sleep(delay, signal);
  }

  for (const p of pins) {
    if (signal?.aborted) break;
    const status = await call(() => tg.pinSaved(p.cardId, p.date, p.pin));
    if (status === "ok") {
      if (p.pin) progress.pinned++;
      else progress.unpinned++;
    } else if (status !== "same") progress.skipped++;
    // Only a pin Kipple made is Kipple's: "same" on pinning means the user pinned it in Telegram.
    // "changed" (another message has this id now) and "refused" are tried again next time.
    if (p.pin && status === "ok") state.pinned = [...state.pinned, p.cardId];
    else if (!p.pin && status !== "changed" && status !== "refused") state.pinned = state.pinned.filter((id) => id !== p.cardId);
    progress.done++;
    onProgress({ ...progress });
    await deps.savePins(state);
    await sleep(delay, signal);
  }
  return progress;
}
