// Anonymous usage statistics: turns a ping from the app (src/lib/telemetry.ts) into increments of
// daily and weekly totals. Only totals are stored, no single ping, and never the IP address.
// Every field is checked against the fixed lists in src/lib/telemetryEvents.ts; a ping with
// anything else in it is refused whole.

import { AGE_BUCKETS, AI_MODES, eventKey, isoWeek, LANGS, LEGACY_COHORT, LIBRARY_BUCKETS, OS, type Ping } from "../../src/lib/telemetryEvents";

/** Totals are kept for about 13 months. */
export const STATS_TTL = 400 * 86_400;
export const MAX_PING_BYTES = 4096;

type Cmd = (string | number)[];

const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/** The ping, checked, or null if anything in it is not what the app sends. */
export function parsePing(body: unknown): Ping | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const allowed = new Set(["v", "os", "lang", "cohort", "age", "library", "ai", "week", "events"]);
  if (Object.keys(b).some((k) => !allowed.has(k))) return null;
  if (typeof b.v !== "string" || !/^(\d{1,3}\.\d{1,3}\.\d{1,4})?$/.test(b.v)) return null;
  if (!oneOf(OS, b.os) || !oneOf(LANGS, b.lang) || !oneOf(AGE_BUCKETS, b.age) || !oneOf(LIBRARY_BUCKETS, b.library) || !oneOf(AI_MODES, b.ai)) return null;
  if (typeof b.cohort !== "string" || !(b.cohort === LEGACY_COHORT || /^20\d\d-W\d\d$/.test(b.cohort))) return null;
  if (typeof b.week !== "boolean") return null;
  if (!b.events || typeof b.events !== "object" || Array.isArray(b.events)) return null;
  const events: Record<string, number> = {};
  for (const [k, n] of Object.entries(b.events as Record<string, unknown>)) {
    const [name, value] = k.split(":");
    if (eventKey(name, value) !== k) return null;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 999) return null;
    events[k] = n;
  }
  return { v: b.v, os: b.os, lang: b.lang, cohort: b.cohort, age: b.age, library: b.library, ai: b.ai, week: b.week, events };
}

/** Redis commands that add one ping to today's and (once a week per install) this week's totals. */
export function pingCommands(p: Ping, now = new Date()): Cmd[] {
  const day = `kt:d:${now.toISOString().slice(0, 10)}`;
  const week = `kt:w:${isoWeek(now)}`;
  const dims = [`cohort:${p.cohort}|${p.age}`, `os:${p.os}`, `lang:${p.lang}`, `ai:${p.ai}`, `lib:${p.library}`, ...(p.v ? [`v:${p.v}`] : [])];
  const cmds: Cmd[] = [["HINCRBY", day, "active", 1], ...dims.map((f) => ["HINCRBY", day, f, 1])];
  for (const [k, n] of Object.entries(p.events)) cmds.push(["HINCRBY", day, `e:${k}`, n]);
  cmds.push(["EXPIRE", day, STATS_TTL]);
  if (p.week) {
    cmds.push(["HINCRBY", week, "active", 1], ...dims.map((f) => ["HINCRBY", week, f, 1]), ["EXPIRE", week, STATS_TTL]);
  }
  return cmds;
}

/** Where the landing page's download button was clicked from (?src=, set from utm_source). */
export function downloadSource(raw: string | null): string {
  const s = (raw ?? "").toLowerCase().trim();
  return /^[a-z0-9_-]{1,32}$/.test(s) ? s : "direct";
}

export function downloadCommands(src: string, now = new Date()): Cmd[] {
  const day = `kt:dl:${now.toISOString().slice(0, 10)}`;
  return [["HINCRBY", day, src, 1], ["HINCRBY", day, "total", 1], ["EXPIRE", day, STATS_TTL]];
}
