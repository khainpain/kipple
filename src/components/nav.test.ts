import { describe, expect, it } from "vitest";
import { sortCards } from "./nav";
import type { Card } from "../lib/types";

const card = (id: number, text: string, priority?: 1 | 2 | 3): Card => ({
  id,
  date: `2026-01-${String(30 - id).padStart(2, "0")}`,
  kind: "text",
  text,
  urls: [],
  hashtags: [],
  ai: priority ? { title: "", summary: "", topic: "", tags: [], action: "reference", priority, model: "m", at: "t" } : undefined,
});

// Library order is newest first.
const cards = [card(1, "Бета", 3), card(2, ""), card(3, "альфа", 1), card(4, "Гамма")];
const ids = (cs: Card[]) => cs.map((c) => c.id);

describe("sortCards", () => {
  it("by date", () => {
    expect(ids(sortCards(cards, "new"))).toEqual([1, 2, 3, 4]);
    expect(ids(sortCards(cards, "old"))).toEqual([4, 3, 2, 1]);
  });
  it("by name both ways, untitled last", () => {
    expect(ids(sortCards(cards, "title"))).toEqual([3, 1, 4, 2]);
    expect(ids(sortCards(cards, "title_desc"))).toEqual([4, 1, 3, 2]);
  });
  it("by priority, unmarked last, newest first within a group", () => {
    expect(ids(sortCards(cards, "priority"))).toEqual([3, 1, 2, 4]);
  });
});
