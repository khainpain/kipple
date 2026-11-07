import { T } from "../i18n";

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

export const replyText = () => `${REPLY_MARK} · ${T.telegram.replyHint}`;

export function isKippleReply(text: string | undefined): boolean {
  return !!text?.startsWith(REPLY_MARK);
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
