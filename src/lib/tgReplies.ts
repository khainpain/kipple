import { T } from "../i18n";
import { en } from "../i18n/en";
import { ru } from "../i18n/ru";
import type { SavedMessage, TelegramApi } from "../platform/types";

/**
 * "Open in Telegram". Telegram can't link to a message inside Saved Messages (desktop apps only
 * follow message links in channels), so Kipple posts a short reply to the original there and
 * opens the chat: a tap on the reply's quote jumps to the original. The reply is a helper and
 * is deleted after a while (Settings → Telegram), or kept if the user prefers to delete it.
 */

/** Every helper reply starts with this, whatever the language: such messages never become cards. */
export const REPLY_MARK = "↑ Kipple";

export type ReplyCleanup = "1m" | "1h" | "never";
export const REPLY_CLEANUPS: ReplyCleanup[] = ["1m", "1h", "never"];
export const DEFAULT_REPLY_CLEANUP: ReplyCleanup = "1m";

const DELAY: Record<ReplyCleanup, number | null> = { "1m": 60_000, "1h": 3_600_000, never: null };

/** A helper reply waiting to be deleted (kept in telegram-replies.json). */
export interface PendingReply {
  id: number;
  /** The Telegram user id of the account that posted it. Message ids are per account, so a reply
   *  is deleted only while that account is signed in (checked again in tg_delete_saved). */
  owner: number;
  /** When to delete it, ISO time. */
  at: string;
}

/** Keeps only well-formed entries of a stored list (a damaged file must not delete or loop). */
export function validReplies(list: unknown): PendingReply[] {
  if (!Array.isArray(list)) return [];
  return list.filter(
    (p): p is PendingReply =>
      !!p && Number.isInteger(p.id) && Number.isInteger(p.owner) && typeof p.at === "string" && !Number.isNaN(Date.parse(p.at)),
  );
}

/** Kipple's mark in the reply (a plain Unicode emoji: custom ones need a sticker set and Premium). */
const REPLY_EMOJI = "🗂️";

export const replyText = () => `${REPLY_MARK} ${REPLY_EMOJI} · ${T.telegram.replyHint}`;

export function isKippleReply(text: string | undefined): boolean {
  return !!text?.startsWith(REPLY_MARK);
}

/** Exactly what Kipple posts, in either language, with or without the emoji (older versions). */
const EXACT = new Set(
  [ru, en].flatMap((d) => [`${REPLY_MARK} · ${d.telegram.replyHint}`, `${REPLY_MARK} ${REPLY_EMOJI} · ${d.telegram.replyHint}`]),
);

/**
 * Helper replies among loaded messages: left in Saved Messages when the app was closed before
 * their deletion, or posted by an older version. These get deleted, so only exactly Kipple's text,
 * not forwarded, without media: a note of the user's that merely starts with the mark stays.
 */
export function leftoverReplies(messages: Array<Pick<SavedMessage, "id" | "text" | "forwardedFrom" | "media">>): number[] {
  return messages.filter((m) => EXACT.has(m.text) && !m.forwardedFrom && !m.media).map((m) => m.id);
}

/** The pending list with these leftovers added (replies already waiting keep their time), or unchanged when replies are kept. */
export function scheduleLeftovers(list: PendingReply[], ids: number[], owner: number, now: Date, cleanup: ReplyCleanup): PendingReply[] {
  const fresh = ids.filter((id) => !list.some((p) => p.id === id && p.owner === owner));
  if (!fresh.length || DELAY[cleanup] === null) return list;
  return fresh.reduce((l, id) => scheduleReply(l, id, owner, now, cleanup), list);
}

/**
 * On start: looks for helper replies still in Saved Messages (the app was closed before their
 * deletion, or an older version failed to delete them) and schedules them like new ones.
 * Returns how many were added. Replies the user keeps ("never") aren't looked for at all.
 */
export async function findLeftovers(deps: {
  tg: Pick<TelegramApi, "findReplies">;
  update: (change: (list: PendingReply[]) => PendingReply[]) => Promise<unknown>;
  cleanup: ReplyCleanup;
  now: Date;
}): Promise<number> {
  if (DELAY[deps.cleanup] === null) return 0;
  const { owner, messages } = await deps.tg.findReplies();
  const ids = leftoverReplies(messages);
  let added = 0;
  if (ids.length)
    await deps.update((list) => {
      const next = scheduleLeftovers(list, ids, owner, deps.now, deps.cleanup);
      added = next.length - list.length;
      return next;
    });
  return added;
}

/** The pending list with this reply added, or unchanged when replies are kept. */
export function scheduleReply(list: PendingReply[], id: number, owner: number, now: Date, cleanup: ReplyCleanup): PendingReply[] {
  const delay = DELAY[cleanup] ?? null;
  if (delay === null) return list;
  return [...list.filter((p) => !(p.id === id && p.owner === owner)), { id, owner, at: new Date(now.getTime() + delay).toISOString() }];
}

/** Replies due now, grouped by the account that posted them. */
export function dueReplies(list: PendingReply[], now: Date): Map<number, number[]> {
  const t = now.getTime();
  const due = new Map<number, number[]>();
  for (const p of list) if (Date.parse(p.at) <= t) due.set(p.owner, [...(due.get(p.owner) ?? []), p.id]);
  return due;
}

/** The list without these replies of this account. */
export function withoutReplies(list: PendingReply[], owner: number, ids: number[]): PendingReply[] {
  return list.filter((p) => !(p.owner === owner && ids.includes(p.id)));
}

/** Milliseconds until the next reply is due, or null when nothing is waiting. */
export function nextDue(list: PendingReply[], now: Date): number | null {
  if (!list.length) return null;
  const first = Math.min(...list.map((p) => Date.parse(p.at)));
  return Math.max(0, first - now.getTime());
}
