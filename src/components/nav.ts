import type { Card } from "../lib/types";
import { effectiveAction, effectiveTitle, effectiveTopic, matchesFilter } from "../lib/library";

/** What the sidebar points at: a smart list, one topic, or cards without a topic. */
export type Scope =
  | { kind: "list"; key: "all" | "read_later" | "ideas" | "todo" | "junk" | "sensitive" }
  | { kind: "topic"; name: string }
  | { kind: "notopic" };

export type TypeKey = "links" | "photos" | "videos" | "docs" | "notes";
export type SortKey = "new" | "old" | "title";
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
  { key: "masonry", label: "Плитка", icon: "masonry" },
  { key: "grid", label: "Сетка", icon: "grid" },
  { key: "list", label: "Список", icon: "list" },
  { key: "headlines", label: "Заголовки", icon: "rows" },
];

export const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "new", label: "Сначала новые" },
  { key: "old", label: "Сначала старые" },
  { key: "title", label: "По названию" },
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
  const key = (c: Card) => (effectiveTitle(c) || c.text || c.link?.siteName || "").trim().toLocaleLowerCase("ru");
  return [...cards].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (!ka !== !kb) return ka ? -1 : 1;
    return ka.localeCompare(kb, "ru");
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
