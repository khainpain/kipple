import { afterEach, describe, expect, it } from "vitest";
import { buildIndex } from "./search";
import { NO_ALIASES, setAliases } from "./library";
import type { Card } from "./types";
import { T } from "../i18n";

const card = (id: number, tags: string[], action: "read_later" | "idea" = "idea"): Card => ({
  id,
  date: "2026-01-01",
  kind: "text",
  text: "",
  urls: [],
  hashtags: [],
  ai: { title: `card ${id}`, summary: "", topic: "Tech", tags, action, priority: 2, model: "m", at: "t" },
});

describe("search", () => {
  afterEach(() => setAliases(NO_ALIASES));
  it("finds cards by a tag name that was merged into another", () => {
    setAliases({ topics: {}, tags: { ии: "ai" } });
    const ix = buildIndex([card(1, ["ai"]), card(2, ["ии"]), card(3, ["food"])]);
    expect(ix.search("ии").map((h) => h.id).sort()).toEqual([1, 2]);
  });
  it("combines a subject with a status", () => {
    const ix = buildIndex([card(1, ["ai"], "read_later"), card(2, ["ai"]), card(3, ["food"], "read_later")]);
    const word = T.actions.read_later.split(" ")[0];
    expect(ix.search(`ai ${word}`).map((h) => h.id)).toEqual([1]);
  });
  it("treats ё and е as the same letter", () => {
    const ix = buildIndex([{ ...card(1, []), text: "Купить ёлку" }, { ...card(2, []), text: "Её документы" }, card(3, [])]);
    expect(ix.search("елка").map((h) => h.id)).toEqual([1]);
    expect(ix.search("ее").map((h) => h.id)).toEqual([2]);
  });
  it("finds other forms of a Russian word", () => {
    const ix = buildIndex([{ ...card(1, []), text: "Две кошки на окне" }, { ...card(2, []), text: "Гуляю с кошкой" }, { ...card(3, []), text: "Кошелёк" }]);
    expect(ix.search("кошка").map((h) => h.id).sort()).toEqual([1, 2]);
  });
  it("finds other forms of an English word", () => {
    const ix = buildIndex([{ ...card(1, []), text: "My study notes" }, { ...card(2, []), text: "Running shoes" }]);
    expect(ix.search("studies").map((h) => h.id)).toEqual([1]);
    expect(ix.search("run").map((h) => h.id)).toEqual([2]);
  });
  it("still finds a word while it is half typed", () => {
    const ix = buildIndex([{ ...card(1, []), text: "читающий человек" }, card(2, [])]);
    expect(ix.search("читающ").map((h) => h.id)).toEqual([1]);
    expect(ix.search("читают").map((h) => h.id)).toEqual([1]);
  });
  it("keeps a short query narrow", () => {
    const ix = buildIndex([{ ...card(1, []), text: "Новости про ии" }, { ...card(2, []), text: "Игра и история" }]);
    expect(ix.search("ии").map((h) => h.id)).toEqual([1]);
  });
});

