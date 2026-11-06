import { describe, expect, it } from "vitest";
import type { Card } from "./types";
import { countDuplicateGroups, findDuplicates, groupDuplicates, isImportant, isUnsorted, normalizeUrl } from "./smart";

const card = (id: number, over: Partial<Card> = {}): Card => ({ id, date: "2026-01-01", kind: "text", text: "", urls: [], hashtags: [], ...over });
const ai = (priority: 1 | 2 | 3, topic = "AI", tags = ["llm"]) => ({ title: "", summary: "", topic, tags, action: "reference" as const, priority, model: "m", at: "t" });

describe("normalizeUrl", () => {
  it("drops scheme, www, tracking, anchor and trailing slash", () => {
    expect(normalizeUrl("https://www.example.com/a/?utm_source=tg&id=2#top")).toBe("example.com/a?id=2");
    expect(normalizeUrl("http://example.com/a")).toBe("example.com/a");
  });
  it("treats every form of a YouTube link as one video", () => {
    const v = "youtube.com/watch?v=abc123";
    expect(normalizeUrl("https://youtu.be/abc123?si=x")).toBe(v);
    expect(normalizeUrl("https://m.youtube.com/watch?v=abc123&t=5")).toBe(v);
    expect(normalizeUrl("https://youtube.com/shorts/abc123")).toBe(v);
  });
});

describe("findDuplicates", () => {
  it("groups the same link, file or long text; ignores short text", () => {
    const cards = [
      card(1, { urls: ["https://example.com/post?utm_medium=x"] }),
      card(2, { urls: ["http://www.example.com/post/"] }),
      card(3, { text: "ok" }),
      card(4, { text: "ok" }),
      card(5, { text: "Длинная одинаковая заметка про то, что надо сделать" }),
      card(6, { text: "длинная  одинаковая заметка про то, что надо сделать " }),
      card(7, { kind: "document", media: { fileName: "a.pdf", size: 100 } }),
      card(8, { kind: "document", media: { fileName: "A.pdf", size: 100 } }),
      card(9, { kind: "document", media: { fileName: "a.pdf", size: 101 } }),
    ];
    const d = findDuplicates(cards);
    expect([...d.keys()].sort()).toEqual([1, 2, 5, 6, 7, 8]);
    expect(countDuplicateGroups(cards, d)).toBe(3);
  });
  it("keeps each group together", () => {
    const cards = [card(1, { urls: ["https://a.com"] }), card(2, { urls: ["https://b.com"] }), card(3, { urls: ["https://a.com/"] }), card(4, { urls: ["https://b.com"] })];
    expect(groupDuplicates(cards, findDuplicates(cards)).map((c) => c.id)).toEqual([1, 3, 2, 4]);
  });
});

describe("smart lists", () => {
  it("important: pinned, or AI priority 1 unless unpinned", () => {
    expect(isImportant(card(1, { ai: ai(1) }))).toBe(true);
    expect(isImportant(card(1, { ai: ai(2) }))).toBe(false);
    expect(isImportant(card(1, { ai: ai(2), user: { pinned: true } }))).toBe(true);
    expect(isImportant(card(1, { ai: ai(1), user: { pinned: false } }))).toBe(false);
  });
  it("unsorted: no topic or no tags", () => {
    expect(isUnsorted(card(1))).toBe(true);
    expect(isUnsorted(card(1, { ai: ai(2, "AI", []) }))).toBe(true);
    expect(isUnsorted(card(1, { ai: ai(2) }))).toBe(false);
    expect(isUnsorted(card(1, { hashtags: ["x"], user: { topic: "Дом" } }))).toBe(false);
  });
});
