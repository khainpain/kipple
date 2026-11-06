import { afterEach, describe, expect, it } from "vitest";
import { suggestMerges } from "./tidy";
import { effectiveTags, effectiveTopic, mergeAlias, NO_ALIASES, setAliases } from "./library";
import type { Card } from "./types";

const m = (o: Record<string, number>) => new Map(Object.entries(o));

describe("suggestMerges", () => {
  it("groups case, ё, hyphen, plural and typo variants; keeps the most used name", () => {
    const s = suggestMerges(m({ games: 10, game: 3, Game: 1, "game-dev": 2, gamedev: 5, ёлка: 1, елка: 4, игры: 6, игра: 2, javascript: 9, javascipt: 1, css: 5, js: 4 }));
    const by = Object.fromEntries(s.map((x) => [x.into, [...x.from].sort()]));
    expect(by.games).toEqual(["Game", "game"]);
    expect(by.gamedev).toEqual(["game-dev"]);
    expect(by.елка).toEqual(["ёлка"]);
    expect(by.игры).toEqual(["игра"]);
    expect(by.javascript).toEqual(["javascipt"]);
    expect(by.css).toBeUndefined();
    expect(s[0].into).toBe("games"); // most cards to change first
  });
  it("leaves short and unrelated names alone", () => {
    expect(suggestMerges(m({ ai: 3, ии: 2, ux: 1, ui: 1, design: 4, devops: 1 }))).toEqual([]);
  });
});

describe("aliases", () => {
  afterEach(() => setAliases(NO_ALIASES));
  const card: Card = { id: 1, date: "2026-01-01", kind: "text", text: "", urls: [], hashtags: ["ии"], ai: { title: "", summary: "", topic: "ИИ", tags: ["ai", "llm"], action: "idea", priority: 2, model: "m", at: "t" } };

  it("cards show merged names, without duplicates", () => {
    setAliases({ topics: { ИИ: "AI" }, tags: { ии: "ai" } });
    expect(effectiveTopic(card)).toBe("AI");
    expect(effectiveTags(card)).toEqual(["ai", "llm"]);
  });
  it("merging into a name repoints what pointed at the merged ones, no chains or self-loops", () => {
    let a = mergeAlias({}, ["ии", "a.i."], "ai");
    a = mergeAlias(a, ["ai"], "artificial intelligence");
    expect(a).toEqual({ ии: "artificial intelligence", "a.i.": "artificial intelligence", ai: "artificial intelligence" });
    a = mergeAlias(a, ["artificial intelligence"], "ai");
    expect(a).toEqual({ ии: "ai", "a.i.": "ai", "artificial intelligence": "ai" });
  });
});
