import type { Action, Card, EditEvent, Library, UserFields } from "./types";

/**
 * Merge a fresh import into the existing library: AI fields, link previews and user
 * edits survive, new messages are added, and cards missing from the new export are
 * kept but marked removed (they may have been deleted in Telegram).
 */
export function mergeImport(prev: Library | null, next: Omit<Library, "version">): Library {
  const old = new Map(prev?.cards.map((c) => [c.id, c]) ?? []);
  const seen = new Set<number>();
  const cards: Card[] = next.cards.map((c) => {
    seen.add(c.id);
    const o = old.get(c.id);
    if (!o) return c;
    const sameText = o.text === c.text;
    return {
      ...c,
      ai: sameText ? o.ai : undefined,
      link: o.link && c.urls[0] === o.link.url ? o.link : undefined,
      user: o.user,
    };
  });
  for (const o of prev?.cards ?? []) if (!seen.has(o.id)) cards.push({ ...o, removed: true });
  cards.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
  annotateContext(cards);
  return { version: 1, ...next, cards };
}

export function applyEdits(cards: Card[], events: EditEvent[]): Card[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  for (const ev of events) {
    const c = byId.get(ev.id);
    if (c) c.user = { ...c.user, ...ev.patch };
  }
  return cards;
}

export function effectiveAction(c: Card): Action | undefined {
  return c.user?.action ?? (c.autoJunk ? "junk" : c.ai?.action);
}

export function effectiveTags(c: Card): string[] {
  return c.user?.tags ?? [...new Set([...(c.ai?.tags ?? []), ...c.hashtags])];
}

export function effectiveTopic(c: Card): string | undefined {
  return c.user?.topic ?? c.ai?.topic;
}

export function effectiveTitle(c: Card): string {
  return c.user?.title ?? c.ai?.title ?? c.link?.title ?? "";
}

export type FilterKey = "all" | "links" | "photos" | "videos" | "docs" | "ideas" | "read_later" | "junk" | "sensitive";

export const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "Все" },
  { key: "links", label: "Ссылки" },
  { key: "photos", label: "Фото" },
  { key: "videos", label: "Видео" },
  { key: "docs", label: "Файлы" },
  { key: "ideas", label: "Идеи" },
  { key: "read_later", label: "Прочитать позже" },
  { key: "junk", label: "Мусор" },
  { key: "sensitive", label: "Чувствительное" },
];

export function matchesFilter(c: Card, f: FilterKey): boolean {
  const action = effectiveAction(c);
  if (f === "junk") return action === "junk";
  if (c.user?.hidden) return false;
  if (action === "junk") return false;
  switch (f) {
    case "all":
      return true;
    case "links":
      return c.kind === "link";
    case "photos":
      return c.kind === "photo";
    case "videos":
      return c.kind === "video" || c.kind === "animation" || c.kind === "video_note";
    case "docs":
      return c.kind === "document" || c.kind === "audio" || c.kind === "voice";
    case "ideas":
      return action === "idea";
    case "read_later":
      return action === "read_later";
    case "sensitive":
      return !!c.sensitive;
  }
}

export function makeEdit(id: number, patch: UserFields): EditEvent {
  return { t: new Date().toISOString(), id, patch };
}

const CONTEXT_WINDOW_MS = 3 * 60 * 1000;
const BATCH_MS = 10 * 1000;
const MEDIA_KINDS = new Set(["photo", "video", "animation", "document", "audio", "video_note"]);

function firstLine(c: Card): string | undefined {
  const t = c.user?.title || c.ai?.title || c.link?.title || c.text.split("\n").find((l) => l.trim());
  return t?.trim().slice(0, 100) || undefined;
}

/**
 * A caption often arrives as a separate message right before or after the photo.
 * For media without text, remember the text of the nearest such message (within a
 * few minutes) so the card has a name before, or instead of, any AI.
 */
export function annotateContext(cards: Card[]) {
  const sorted = [...cards].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
  const time = sorted.map((c) => Date.parse(c.date));
  const hasText = (c: Card) => !c.sensitive && !c.removed && !MEDIA_KINDS.has(c.kind) && !!firstLine(c);
  sorted.forEach((c, i) => {
    c.context = undefined;
    if (!MEDIA_KINDS.has(c.kind) || c.text.trim()) return;
    let best: { d: number; t: string } | undefined;
    for (const dir of [1, -1]) {
      for (let j = i + dir; j >= 0 && j < sorted.length; j += dir) {
        const d = Math.abs(time[j] - time[i]);
        if (d > CONTEXT_WINDOW_MS) break;
        const n = sorted[j];
        if (n.text.trim() && MEDIA_KINDS.has(n.kind)) {
          // Another captioned photo sent in the same batch: its caption fits this one too.
          if (n.kind === c.kind && d <= BATCH_MS && !n.sensitive && (!best || d < best.d)) best = { d, t: n.text.split("\n").find((l) => l.trim())!.trim().slice(0, 100) };
          break;
        }
        if (hasText(n)) {
          // Prefer the message after the photo on a tie: people usually send the picture first.
          if (!best || d < best.d || (d === best.d && dir === 1)) best = { d, t: firstLine(n)! };
          break;
        }
      }
    }
    c.context = best?.t;
  });
}
