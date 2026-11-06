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
});
