import type { Card } from "../lib/types";
import { effectiveAction, effectiveTitle, effectiveTopic, matchesFilter } from "../lib/library";

/** What the sidebar points at: a smart list, one topic, or cards without a topic. */
export type Scope =
  | { kind: "list"; key: "all" | "read_later" | "ideas" | "todo" | "junk" | "sensitive" }
  | { kind: "topic"; name: string }
  | { kind: "notopic" };

export type TypeKey = "links" | "photos" | "videos" | "docs" | "notes";
export type SortKey = "new" | "old" | "title" | "title_desc" | "priority";
export type ViewKey = "masonry" | "grid" | "list" | "headlines";

export const SMART_LISTS: Array<{ key: Extract<Scope, { kind: "list" }>["key"]; label: string; icon: string }> = [
  { key: "all", label: "Все карточки", icon: "all" },
  { key: "read_later", label: "Прочитать позже", icon: "clock" },
  { key: "ideas", label: "Идеи", icon: "bulb" },
  { key: "todo", label: "Сделать", icon: "check" },
];

export const TYPES: Array<{ key: TypeKey; label: string; icon: string }> = [
  { key: "links", label: "Ссылки", icon: "link" },
  { key: "photos", label: "Фото", icon: "photo" },
  { key: "videos", label: "Видео", icon: "video" },
  { key: "docs", label: "Файлы и аудио", icon: "file" },
  { key: "notes", label: "Заметки", icon: "text" },
];

export const VIEWS: Array<{ key: ViewKey; label: string; icon: string }> = [
  { key: "grid", label: "Сетка", icon: "grid" },
  { key: "masonry", label: "Плитка", icon: "masonry" },
  { key: "list", label: "Список", icon: "list" },
  { key: "headlines", label: "Заголовки", icon: "rows" },
];

/** Sort options for the sort menu; `short` is what the toolbar button shows. */
export const SORTS: Array<{ key: SortKey; label: string; short: string; icon: string }> = [
  { key: "new", label: "Сначала новые", short: "Новые", icon: "sortNew" },
  { key: "old", label: "Сначала старые", short: "Старые", icon: "sortOld" },
  { key: "title", label: "По названию (А–Я)", short: "А–Я", icon: "sortAz" },
  { key: "title_desc", label: "По названию (Я–А)", short: "Я–А", icon: "sortZa" },
  { key: "priority", label: "Сначала важные", short: "Важные", icon: "flag" },
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
  if (s.kind === "notopic") return "Без темы";
  if (s.key === "junk") return "Мусор";
  if (s.key === "sensitive") return "Чувствительное";
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
  const key = (c: Card) => (effectiveTitle(c) || c.text || c.link?.siteName || "").trim().toLocaleLowerCase("ru");
  return [...cards].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (!ka !== !kb) return ka ? -1 : 1; // untitled cards stay at the end either way
    return dir * ka.localeCompare(kb, "ru");
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
