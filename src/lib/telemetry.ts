// Anonymous usage statistics (desktop only; on unless turned off in Settings or on the start screen).
//
// Nothing here identifies a person or an install: there is no id, the server keeps no IP address
// and only adds the numbers to daily totals (api/ping.ts). Events are counted on the device and go
// out at most once a day as one small request; the exact request is shown in Settings. No text
// from the library (messages, titles, links, topics, tags) is ever part of it: every value is one
// of a fixed set (src/lib/telemetryEvents.ts).
//
// The install date stays on the device; the ping carries only its ISO week and a rough age, which
// is enough to see how many installs are still in use after 2 weeks.

import { platform } from "@platform";
import { PROXY_BASE } from "./ai";
import {
  ageBucket,
  eventKey,
  isoWeek,
  LEGACY_COHORT,
  libraryBucket,
  type AI_MODES,
  type EventName,
  type EventValue,
  type Ping,
} from "./telemetryEvents";

const FILE = "telemetry.json";
const DAY = 86_400_000;
/** Most of one event counted between two pings, so a stuck loop can't send nonsense. */
const MAX_COUNT = 999;

interface State {
  /** UTC date of the first launch with statistics, YYYY-MM-DD. */
  installedAt: string;
  cohort: string;
  /** Counts waiting for the next ping. */
  counts: Record<string, number>;
  /** UTC date of the last ping that went through. */
  lastSent?: string;
  /** ISO week of the last ping that went through. */
  lastWeek?: string;
  /** Days the app was open, only kept for the first week (for `activated`). */
  activeDays: string[];
  imported?: boolean;
  activated?: boolean;
  /** App version at the last launch, to count updates. */
  version?: string;
}

export interface PingContext {
  libraryCount: number;
  ai: (typeof AI_MODES)[number];
  lang: string;
}

let state: State | null = null;
let enabled = false;
/** The demo is a sandbox: nothing done in it is counted. */
let suspended = false;
let context: () => PingContext = () => ({ libraryCount: 0, ai: "off", lang: "en" });
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let sending = false;

const today = (now = new Date()) => now.toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
export const telemetryEndpoint = () => new URL(PROXY_BASE).origin + "/api/ping";

/** Only the desktop app sends statistics; the browser demo is counted by the site's page analytics. */
export const telemetrySupported = () => platform.kind === "desktop";

/**
 * Loads (or starts) the local state. `hadLibrary`: a library was already there, so this is an
 * update from a version without statistics, not a new install. Returns true for such an update
 * the first time, so the app can say once that statistics are now sent.
 */
export async function initTelemetry(opts: { enabled: boolean; hadLibrary: boolean; context: () => PingContext }): Promise<boolean> {
  context = opts.context;
  enabled = opts.enabled && telemetrySupported();
  if (!telemetrySupported()) return false;
  let firstAfterUpdate = false;
  try {
    if (await platform.data.exists(FILE)) state = JSON.parse(await platform.data.read(FILE)) as State;
  } catch {
    state = null;
  }
  if (!state?.installedAt) {
    const d = today();
    state = {
      installedAt: d,
      cohort: opts.hadLibrary ? LEGACY_COHORT : isoWeek(new Date()),
      counts: {},
      activeDays: [],
      imported: opts.hadLibrary,
    };
    if (!opts.hadLibrary && enabled) state.counts.app_first_launch = 1;
    firstAfterUpdate = opts.hadLibrary;
  }
  const v = await platform.appVersion().catch(() => "");
  if (v && state.version !== v) {
    if (state.version) track("update_installed");
    state.version = v;
  }
  save(true);
  noteActiveDay();
  return firstAfterUpdate;
}

export function setTelemetryEnabled(on: boolean) {
  enabled = on && telemetrySupported();
  // Turned off: what was counted and not sent yet is dropped, not sent later.
  if (!enabled && state && Object.keys(state.counts).length) {
    state.counts = {};
    save();
  }
}

export function setTelemetrySuspended(on: boolean) {
  suspended = on;
}

/** Counts one event for the next ping. Values outside the fixed list are ignored. */
export function track<E extends EventName>(name: E, value?: EventValue<E>) {
  if (!enabled || suspended || !state) return;
  const key = eventKey(name, value);
  if (!key) return;
  state.counts[key] = Math.min(MAX_COUNT, (state.counts[key] ?? 0) + 1);
  save();
}

/** Something was imported: together with a later day of use this makes the install "activated". */
export function markImported() {
  if (!state || suspended) return;
  if (!state.imported) {
    state.imported = true;
    save();
  }
  checkActivated();
}

function noteActiveDay() {
  if (!state) return;
  const d = today();
  if (daysBetween(state.installedAt, d) < 7 && !state.activeDays.includes(d)) {
    state.activeDays = [...state.activeDays, d];
    save();
  }
  checkActivated();
}

function checkActivated() {
  if (!state || state.activated || !state.imported || state.cohort === LEGACY_COHORT) return;
  if (state.activeDays.length < 2 || daysBetween(state.installedAt, today()) >= 7) return;
  state.activated = true;
  if (enabled) state.counts.activated = 1;
  save();
}

/** The request the next ping would send, as shown in Settings. */
export function pingPreview(now = new Date()): Ping | null {
  if (!state) return null;
  const c = context();
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  return {
    v: "",
    os: /Windows/i.test(ua) ? "windows" : /Mac/i.test(ua) ? "macos" : /Linux/i.test(ua) ? "linux" : "other",
    lang: c.lang === "ru" ? "ru" : "en",
    cohort: state.cohort,
    age: ageBucket(daysBetween(state.installedAt, today(now))),
    library: libraryBucket(c.libraryCount),
    ai: c.ai,
    week: state.lastWeek !== isoWeek(now),
    events: { ...state.counts },
  };
}

/** Sends today's ping if it hasn't gone out yet. Quiet on failure: the counts wait for the next try. */
export async function maybeSendPing(): Promise<void> {
  if (!enabled || !state || sending) return;
  noteActiveDay();
  const now = new Date();
  if (state.lastSent === today(now)) return;
  const ping = pingPreview(now);
  if (!ping) return;
  sending = true;
  try {
    ping.v = await platform.appVersion().catch(() => "");
    const res = await platform.httpFetch(telemetryEndpoint(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ping),
      connectTimeout: 5000,
    });
    if (!res.ok) return;
    // Counted while the request was out stays for the next ping.
    for (const [k, n] of Object.entries(ping.events)) {
      const left = (state.counts[k] ?? 0) - n;
      if (left > 0) state.counts[k] = left;
      else delete state.counts[k];
    }
    state.lastSent = today(now);
    state.lastWeek = isoWeek(now);
    save(true);
  } catch {
    /* offline or the server is down: try again later */
  } finally {
    sending = false;
  }
}

function save(now = false) {
  if (saveTimer) clearTimeout(saveTimer);
  const write = () => {
    saveTimer = null;
    if (state) void platform.data.write(FILE, JSON.stringify(state)).catch(() => undefined);
  };
  if (now) write();
  else saveTimer = setTimeout(write, 1000);
}

/** For tests. */
export function _resetTelemetry() {
  state = null;
  enabled = false;
  suspended = false;
  sending = false;
}
