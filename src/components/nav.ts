import type { Card } from "../lib/types";
import { T, compareText, locale } from "../i18n";
import { effectiveAction, effectiveTitle, effectiveTopic, matchesFilter } from "../lib/library";

/** What the sidebar points at: a smart list, one topic, or cards without a topic. */
export type Scope =
  | { kind: "list"; key: "all" | "read_later" | "ideas" | "todo" | "junk" | "sensitive" }
  | { kind: "topic"; name: string }
  | { kind: "notopic" };

export type TypeKey = "links" | "photos" | "videos" | "docs" | "notes";
export type SortKey = "new" | "old" | "title" | "title_desc" | "priority";
export type ViewKey = "masonry" | "grid" | "list" | "headlines";
export type OpenMode = "center" | "side" | "full";

/** How a card opens, like Notion's peek modes. Labels are getters so they follow the interface language. */
export const OPEN_MODES: Array<{ key: OpenMode; label: string; icon: string }> = [
  { key: "center", get label() { return T.nav.openCenter; }, icon: "peekCenter" },
  { key: "side", get label() { return T.nav.openSide; }, icon: "peekSide" },
  { key: "full", get label() { return T.nav.openFull; }, icon: "peekFull" },
];

export const SMART_LISTS: Array<{ key: Extract<Scope, { kind: "list" }>["key"]; label: string; icon: string }> = [
  { key: "all", get label() { return T.nav.all; }, icon: "all" },
  { key: "read_later", get label() { return T.nav.readLater; }, icon: "clock" },
  { key: "ideas", get label() { return T.nav.ideas; }, icon: "bulb" },
  { key: "todo", get label() { return T.nav.todo; }, icon: "check" },
];

export const TYPES: Array<{ key: TypeKey; label: string; icon: string }> = [
  { key: "links", get label() { return T.nav.links; }, icon: "link" },
  { key: "photos", get label() { return T.nav.photos; }, icon: "photo" },
  { key: "videos", get label() { return T.nav.videos; }, icon: "video" },
  { key: "docs", get label() { return T.nav.docs; }, icon: "file" },
  { key: "notes", get label() { return T.nav.notes; }, icon: "text" },
];

export const VIEWS: Array<{ key: ViewKey; label: string; icon: string }> = [
  { key: "grid", get label() { return T.nav.viewGrid; }, icon: "grid" },
  { key: "masonry", get label() { return T.nav.viewMasonry; }, icon: "masonry" },
  { key: "list", get label() { return T.nav.viewList; }, icon: "list" },
  { key: "headlines", get label() { return T.nav.viewHeadlines; }, icon: "rows" },
];

/** Sort options for the sort menu; `short` is what the toolbar button shows. */
export const SORTS: Array<{ key: SortKey; label: string; short: string; icon: string }> = [
  { key: "new", get label() { return T.nav.sortNew; }, get short() { return T.nav.sortNewShort; }, icon: "sortNew" },
  { key: "old", get label() { return T.nav.sortOld; }, get short() { return T.nav.sortOldShort; }, icon: "sortOld" },
  { key: "title", get label() { return T.nav.sortTitle; }, get short() { return T.nav.sortTitleShort; }, icon: "sortAz" },
  { key: "title_desc", get label() { return T.nav.sortTitleDesc; }, get short() { return T.nav.sortTitleDescShort; }, icon: "sortZa" },
  { key: "priority", get label() { return T.nav.sortPriority; }, get short() { return T.nav.sortPriorityShort; }, icon: "flag" },
];

export function matchesScope(c: Card, s: Scope): boolean {
  if (s.kind === "list") {
    if (s.key === "todo") return matchesFilter(c, "all") && effectiveAction(c) === "todo";
    return matchesFilter(c, s.key);
  }
  if (!matchesFilter(c, "all")) return false;
  const t = effectiveTopic(c);
  return s.kind === "topic" ? t === s.name : !t;
}

export function matchesType(c: Card, t: TypeKey | null): boolean {
  if (!t) return true;
  if (t === "notes") return c.kind === "text" || c.kind === "poll" || c.kind === "location" || c.kind === "contact";
  return matchesFilter(c, t);
}

export function sameScope(a: Scope, b: Scope): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "list" && b.kind === "list") return a.key === b.key;
  if (a.kind === "topic" && b.kind === "topic") return a.name === b.name;
  return true;
}

export function scopeTitle(s: Scope): string {
  if (s.kind === "topic") return s.name;
  if (s.kind === "notopic") return T.nav.noTopic;
  if (s.key === "junk") return T.nav.junk;
  if (s.key === "sensitive") return T.nav.sensitive;
  return SMART_LISTS.find((x) => x.key === s.key)?.label ?? "";
}

export function sortCards(cards: Card[], sort: SortKey): Card[] {
  if (sort === "new") return cards; // the library is stored newest first
  if (sort === "old") return [...cards].reverse();
  if (sort === "priority") {
    // AI priority 1 (important) first; cards without AI markup go last; newest first inside a group.
    const p = (c: Card) => c.ai?.priority ?? 4;
    return cards.map((c, i) => [c, i] as const).sort((a, b) => p(a[0]) - p(b[0]) || a[1] - b[1]).map(([c]) => c);
  }
  const dir = sort === "title_desc" ? -1 : 1;
  const key = (c: Card) => (effectiveTitle(c) || c.text || c.link?.siteName || "").trim().toLocaleLowerCase(locale());
  return [...cards].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (!ka !== !kb) return ka ? -1 : 1; // untitled cards stay at the end either way
    return dir * compareText(ka, kb);
  });
}

/** Stable soft hue per string, used for covers of cards without an image. */
export function hueOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function loadPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(`sb.${key}`) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: string) {
  try {
    localStorage.setItem(`sb.${key}`, value);
  } catch {
    /* preferences are a convenience only */
  }
}
