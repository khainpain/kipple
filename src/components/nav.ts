import { ACTIONS, type Action, type Card } from "../lib/types";
import { T, compareText, locale } from "../i18n";
import { effectiveAction, effectiveTitle, effectiveTopic, matchesFilter } from "../lib/library";
import { isImportant, isRecent, isUnsorted } from "../lib/smart";
import { FEATURES } from "../lib/features";

export type ListKey = "all" | "important" | "read_later" | "ideas" | "reference" | "todo" | "junk" | "sensitive" | "recent" | "unsorted" | "duplicates";

/** What the sidebar points at: the overview, the cleanup screen, a smart list, one topic, or cards without a topic. */
export type Scope = { kind: "home" } | { kind: "cleanup" } | { kind: "list"; key: ListKey } | { kind: "topic"; name: string } | { kind: "notopic" };

export type TypeKey = "links" | "photos" | "videos" | "docs" | "audio" | "notes";
export type SortKey = "new" | "old" | "title" | "title_desc" | "priority";
export type ViewKey = "masonry" | "grid" | "list" | "headlines";
export type OpenMode = "center" | "side" | "full";

/** How a card opens, like Notion's peek modes. Labels are getters so they follow the interface language. */
export const OPEN_MODES: Array<{ key: OpenMode; label: string; icon: string }> = [
  { key: "center", get label() { return T.nav.openCenter; }, icon: "peekCenter" },
  { key: "side", get label() { return T.nav.openSide; }, icon: "peekSide" },
  { key: "full", get label() { return T.nav.openFull; }, icon: "peekFull" },
];

export const SMART_LISTS: Array<{ key: ListKey; label: string; icon: string }> = [
  { key: "all", get label() { return T.nav.all; }, icon: "all" },
  { key: "important", get label() { return T.nav.important; }, icon: "star" },
  ...(FEATURES.statuses
    ? [
        { key: "read_later" as const, get label() { return T.nav.readLater; }, icon: "clock" },
        { key: "ideas" as const, get label() { return T.nav.ideas; }, icon: "bulb" },
        { key: "reference" as const, get label() { return T.nav.reference; }, icon: "bookmark" },
        { key: "todo" as const, get label() { return T.nav.todo; }, icon: "check" },
      ]
    : []),
];

export const TYPES: Array<{ key: TypeKey; label: string; icon: string }> = [
  { key: "links", get label() { return T.nav.links; }, icon: "link" },
  { key: "photos", get label() { return T.nav.photos; }, icon: "photo" },
  { key: "videos", get label() { return T.nav.videos; }, icon: "video" },
  { key: "docs", get label() { return T.nav.docs; }, icon: "file" },
  { key: "audio", get label() { return T.nav.audio; }, icon: "music" },
  { key: "notes", get label() { return T.nav.notes; }, icon: "text" },
];

export const VIEWS: Array<{ key: ViewKey; label: string; icon: string }> = [
  { key: "grid", get label() { return T.nav.viewGrid; }, icon: "grid" },
  { key: "masonry", get label() { return T.nav.viewMasonry; }, icon: "masonry" },
  { key: "list", get label() { return T.nav.viewList; }, icon: "list" },
  { key: "headlines", get label() { return T.nav.viewHeadlines; }, icon: "rows" },
];

/** Parts of a card that the view menu can hide. The title is always shown in headlines. */
export type CardField = "cover" | "title" | "excerpt" | "tags" | "info";

/** Which fields each view offers to hide, in menu order. */
export const VIEW_FIELDS: Record<ViewKey, CardField[]> = {
  grid: ["cover", "title", "excerpt", "tags", "info"],
  masonry: ["cover", "title", "excerpt", "tags", "info"],
  list: ["cover", "title", "excerpt", "tags", "info"],
  headlines: ["tags", "info"],
};

/** How cards look: hidden fields per view and which side the list cover sits on. */
export type CardLook = { hidden: Record<ViewKey, CardField[]>; coverSide: "left" | "right" };

/** Every field shown, cover on the left: the look while the views menu is frozen. */
export const NO_LOOK: CardLook = { hidden: { grid: [], masonry: [], list: [], headlines: [] }, coverSide: "left" };

export function loadLook(): CardLook {
  const hidden = {} as Record<ViewKey, CardField[]>;
  for (const v of Object.keys(VIEW_FIELDS) as ViewKey[]) {
    let raw = "";
    try {
      raw = localStorage.getItem(`sb.hide.${v}`) ?? "";
    } catch {
      /* preferences are a convenience only */
    }
    const ok = raw.split(",").filter((f): f is CardField => (VIEW_FIELDS[v] as string[]).includes(f));
    // Never both cover and title: the card would be blank.
    hidden[v] = ok.includes("cover") && ok.includes("title") ? ok.filter((f) => f !== "title") : ok;
  }
  return { hidden, coverSide: loadPref("coverSide", ["left", "right"] as const, "left") };
}

export function saveLook(look: CardLook) {
  for (const v of Object.keys(look.hidden) as ViewKey[]) savePref(`hide.${v}`, look.hidden[v].join(","));
  savePref("coverSide", look.coverSide);
}

/** Whether a field may be switched off now (cover and title can't both be off). */
export function canHide(hidden: CardField[], f: CardField): boolean {
  if (f === "cover") return !hidden.includes("title");
  if (f === "title") return !hidden.includes("cover");
  return true;
}

/** Sort options for the sort menu; `short` is what the toolbar button shows. */
export const SORTS: Array<{ key: SortKey; label: string; short: string; icon: string }> = [
  { key: "new", get label() { return T.nav.sortNew; }, get short() { return T.nav.sortNewShort; }, icon: "sortNew" },
  { key: "old", get label() { return T.nav.sortOld; }, get short() { return T.nav.sortOldShort; }, icon: "sortOld" },
  { key: "title", get label() { return T.nav.sortTitle; }, get short() { return T.nav.sortTitleShort; }, icon: "sortAz" },
  { key: "title_desc", get label() { return T.nav.sortTitleDesc; }, get short() { return T.nav.sortTitleDescShort; }, icon: "sortZa" },
  { key: "priority", get label() { return T.nav.sortPriority; }, get short() { return T.nav.sortPriorityShort; }, icon: "flag" },
];

/** Lists reached from the overview rather than the sidebar. */
const MORE_LISTS: Partial<Record<ListKey, () => string>> = {
  junk: () => T.nav.junk,
  sensitive: () => T.nav.sensitive,
  recent: () => T.nav.recent,
  unsorted: () => T.nav.unsorted,
  duplicates: () => T.nav.duplicates,
};

/** `dupes` (from findDuplicates) is needed only for the duplicates list. */
export function matchesScope(c: Card, s: Scope, dupes?: Map<number, string>): boolean {
  if (s.kind === "home" || s.kind === "cleanup") return matchesFilter(c, "all");
  if (s.kind === "list") {
    switch (s.key) {
      case "todo":
        return matchesFilter(c, "all") && effectiveAction(c) === "todo";
      case "important":
        return matchesFilter(c, "all") && isImportant(c);
      case "recent":
        return matchesFilter(c, "all") && isRecent(c);
      case "unsorted":
        return matchesFilter(c, "all") && isUnsorted(c);
      case "duplicates":
        return matchesFilter(c, "all") && !!dupes?.has(c.id);
      default:
        return matchesFilter(c, s.key);
    }
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
  if (s.kind === "home") return T.nav.home;
  if (s.kind === "cleanup") return T.cleanup.title;
  return MORE_LISTS[s.key]?.() ?? SMART_LISTS.find((x) => x.key === s.key)?.label ?? "";
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

/**
 * Width of the card panel when it opens on the side. The user drags its left edge;
 * these are the "safe zones" it can't cross so the board and the sidebar stay usable.
 */
export const PANEL_WIDTH = {
  /** What the panel starts at, and what a double click on the edge brings it back to. */
  default: 420,
  /** Narrower than this and the header buttons and the fields wrap badly. */
  min: 320,
  /** Wider than this is better served by the "full window" mode. */
  max: 960,
  /** The board keeps at least this much: a card column and a toolbar that still reads. */
  minBoard: 440,
  /** Step for the arrow keys on the focused edge. */
  step: 24,
} as const;

/**
 * Clamps a wanted panel width to the safe zone. `room` is the width shared by the board
 * and the panel (the window minus the sidebar). When there's too little room for both,
 * the panel keeps its minimum and the board gives way.
 */
export function clampPanelWidth(wanted: number, room: number): number {
  const max = Math.min(PANEL_WIDTH.max, room - PANEL_WIDTH.minBoard);
  return Math.round(Math.max(PANEL_WIDTH.min, Math.min(wanted, max)));
}

export function loadPanelWidth(): number {
  try {
    const v = Number(localStorage.getItem("sb.panelWidth"));
    return Number.isFinite(v) && v >= PANEL_WIDTH.min && v <= PANEL_WIDTH.max ? v : PANEL_WIDTH.default;
  } catch {
    return PANEL_WIDTH.default;
  }
}

/**
 * Keys that sort the open card: I toggles important, 1-4 set a status (in the order of the status
 * menu), Delete sends it to junk. Read by physical key, so they work on the Russian layout too.
 */
export type CardKey = { kind: "pin" } | { kind: "action"; action: Action };

/** Hint shown next to each status in the menu. */
export const ACTION_KEYS: Record<Action, string> = { read_later: "1", idea: "2", reference: "3", todo: "4", junk: "Del" };

export function cardKey(e: { code: string; key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): CardKey | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === "Delete") return { kind: "action", action: "junk" };
  if (e.code === "KeyI") return { kind: "pin" };
  const digit = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
  return digit ? { kind: "action", action: ACTIONS[Number(digit[1]) - 1] } : null;
}

/** Cards forwarded from this channel or person, matched by the exact name (not a search). */
export function matchesSource(c: Card, source: string | null): boolean {
  return !source || c.forwardedFrom === source;
}
