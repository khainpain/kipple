// The whole vocabulary of the anonymous usage statistics, shared by the app (src/lib/telemetry.ts)
// and the server (api/ping.ts), which drops anything not listed here. Nothing in it can carry
// text from the library: every value is one of a fixed set.
//
// An event is counted on the device and sent as a number in the next daily ping, e.g.
// { "import_completed:direct": 1, "search_used": 7 }.

export const EVENTS = {
  /** First launch after installing (not after updating from a version without statistics). */
  app_first_launch: [],
  tg_signin_started: [],
  tg_signin_completed: [],
  tg_signin_failed: [],
  /** Library loaded: straight from Telegram or from an export folder. */
  import_completed: ["direct", "export_json"],
  import_failed: ["direct", "export_json"],
  ai_consent_answered: ["yes", "no"],
  ai_run_completed: ["builtin", "own"],
  ai_quota_hit: [],
  search_used: [],
  topic_filtered: [],
  card_opened: [],
  item_edited: ["tag", "topic", "status", "other"],
  export_completed: ["md", "csv"],
  update_installed: [],
  /** Imported something and came back on another day within the first 7 days. Sent once. */
  activated: [],
} as const satisfies Record<string, readonly string[]>;

export type EventName = keyof typeof EVENTS;
export type EventValue<E extends EventName> = (typeof EVENTS)[E][number];

/** "name" or "name:value", as the ping's `events` keys are written. */
export function eventKey(name: string, value?: string): string | null {
  const values = (EVENTS as Record<string, readonly string[]>)[name];
  if (!values) return null;
  if (!values.length) return value === undefined ? name : null;
  return value !== undefined && values.includes(value) ? `${name}:${value}` : null;
}

export const AGE_BUCKETS = ["0", "1", "2-6", "7-13", "14-29", "30+"] as const;
export type AgeBucket = (typeof AGE_BUCKETS)[number];

export function ageBucket(days: number): AgeBucket {
  if (days <= 0) return "0";
  if (days === 1) return "1";
  if (days < 7) return "2-6";
  if (days < 14) return "7-13";
  if (days < 30) return "14-29";
  return "30+";
}

export const LIBRARY_BUCKETS = ["0", "1-99", "100-999", "1k-5k", "5k+"] as const;
export type LibraryBucket = (typeof LIBRARY_BUCKETS)[number];

export function libraryBucket(n: number): LibraryBucket {
  if (n <= 0) return "0";
  if (n < 100) return "1-99";
  if (n < 1000) return "100-999";
  if (n < 5000) return "1k-5k";
  return "5k+";
}

export const OS = ["windows", "macos", "linux", "other"] as const;
export const LANGS = ["ru", "en"] as const;
export const AI_MODES = ["off", "builtin", "own"] as const;
/** Updates from before statistics existed have no install date: their cohort is "legacy". */
export const LEGACY_COHORT = "legacy";

/** The one request the app makes for statistics, at most once a day. */
export interface Ping {
  /** App version, e.g. "0.1.16". */
  v: string;
  os: (typeof OS)[number];
  lang: (typeof LANGS)[number];
  /** ISO week of the install, e.g. "2026-W45", or "legacy". */
  cohort: string;
  age: AgeBucket;
  library: LibraryBucket;
  ai: (typeof AI_MODES)[number];
  /** First ping in this ISO week: counts the install once toward weekly actives. */
  week: boolean;
  /** Event counts since the last ping that went through. */
  events: Record<string, number>;
}

/** ISO 8601 week of a date, "2026-W45" (UTC). */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}
