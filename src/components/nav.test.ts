import { describe, expect, it } from "vitest";
import { PANEL_WIDTH, cardKey, clampPanelWidth, matchesSource, matchesType, sortCards } from "./nav";
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

describe("clampPanelWidth", () => {
  it("keeps the wanted width inside the safe zone", () => {
    expect(clampPanelWidth(500, 1400)).toBe(500);
    expect(clampPanelWidth(100, 1400)).toBe(PANEL_WIDTH.min);
    expect(clampPanelWidth(5000, 3000)).toBe(PANEL_WIDTH.max);
  });
  it("leaves the board its minimum", () => {
    expect(clampPanelWidth(900, 1000)).toBe(1000 - PANEL_WIDTH.minBoard);
  });
  it("never goes below the panel minimum, even in a tiny window", () => {
    expect(clampPanelWidth(500, 500)).toBe(PANEL_WIDTH.min);
  });
});

describe("cardKey", () => {
  const key = (code: string, key = "", mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) =>
    cardKey({ code, key, ctrlKey: false, metaKey: false, altKey: false, ...mods });
  it("reads physical keys, so the Russian layout works too", () => {
    expect(key("KeyI", "ш")).toEqual({ kind: "pin" });
    expect(key("Digit1", "1")).toEqual({ kind: "action", action: "read_later" });
    expect(key("Numpad4", "4")).toEqual({ kind: "action", action: "todo" });
    expect(key("Delete", "Delete")).toEqual({ kind: "action", action: "junk" });
  });
  it("leaves other keys and shortcuts alone", () => {
    expect(key("Digit5", "5")).toBeNull();
    expect(key("KeyJ", "j")).toBeNull();
    expect(key("KeyI", "i", { ctrlKey: true })).toBeNull();
    expect(key("Digit1", "1", { altKey: true })).toBeNull();
  });
});

describe("matchesSource", () => {
  const from = (name?: string): Card => ({ ...card(9, "x"), forwardedFrom: name });
  it("matches the exact channel name, not a part of it", () => {
    expect(matchesSource(from("IT"), "IT")).toBe(true);
    expect(matchesSource(from("IT-Новости"), "IT")).toBe(false);
    expect(matchesSource(from(undefined), "IT")).toBe(false);
    expect(matchesSource(from(undefined), null)).toBe(true);
  });
});

describe("matchesType", () => {
  const of = (kind: Card["kind"]): Card => ({ ...card(9, "x"), kind });
  it("puts voice messages and audio under Audio, not Files", () => {
    expect(matchesType(of("voice"), "audio")).toBe(true);
    expect(matchesType(of("audio"), "audio")).toBe(true);
    expect(matchesType(of("audio"), "docs")).toBe(false);
    expect(matchesType(of("document"), "docs")).toBe(true);
  });
});
