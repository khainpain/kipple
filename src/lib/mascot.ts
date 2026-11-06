// The welcome-screen mascot's easter eggs: quick clicks in a row make it do a salto (7th)
// and then get angry (13th). Pure logic, so it can be tested without timers or a DOM.

export const SALTO_AT = 7;
export const ANGRY_AT = 13;
/** A longer pause between clicks starts the count again. */
export const CLICK_GAP_MS = 1500;
export const ANGRY_MS = 2600;
export const SALTO_MS = 1100;

export interface TapState {
  count: number;
  last: number;
  /** Clicks are ignored until this time (while it is angry). */
  angryUntil: number;
}

export type TapEffect = "none" | "salto" | "angry";

export const INITIAL_TAPS: TapState = { count: 0, last: -Infinity, angryUntil: -Infinity };

export function tapMascot(s: TapState, now: number): { state: TapState; effect: TapEffect } {
  if (now < s.angryUntil) return { state: s, effect: "none" };
  const count = now - s.last > CLICK_GAP_MS ? 1 : s.count + 1;
  if (count >= ANGRY_AT) return { state: { count: 0, last: now, angryUntil: now + ANGRY_MS }, effect: "angry" };
  return { state: { count, last: now, angryUntil: s.angryUntil }, effect: count === SALTO_AT ? "salto" : "none" };
}
